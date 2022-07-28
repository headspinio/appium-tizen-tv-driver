/* eslint-disable promise/no-native */

import {EventEmitter} from 'events';
import {promisify} from 'node:util';
import WebSocket from 'ws';
import debug from 'debug';
import delay from 'delay';
import pRetry from 'p-retry';
import {Keys} from './keys';

export {Keys};

/**
 * This tricks TS into typing the events and associated data in {@linkcode TizenRemote}.
 *
 * See {@linkcode TizenRemoteInstance}
 * @internal
 */
function createdTypedEmitterClass() {
  return /** @type { {new(): TizenRemoteInstance} } */ (/** @type {unknown} */ (EventEmitter));
}

/**
 * Codes received when a connection to a WSS fails.
 * @see https://www.rfc-editor.org/rfc/rfc6455.html#section-7.4.1
 * @enum {string}
 */
export const BadCode = /** @type {const} */ ({
  1002: 'Protocol Error',
  1003: 'Invalid Data Type',
  1005: 'No Status',
  1006: 'Abnormal Closure',
  1007: 'Invalid Message Data Type',
  1008: 'Policy Violation',
  1009: 'Message Too Big',
  1010: 'Mandatory Extension Missing',
  1011: 'Unexpected Condition',
  1015: 'TLS Handshake Failure',
});

/**
 * @internal
 * @param {any} code
 * @returns {code is BadCode}
 */
function isKnownBadCode(code) {
  return code in BadCode;
}

/**
 * Constant values, defaults, etc.
 */
export const constants = /** @type {const} */ ({
  API_PATH_V2: '/api/v2/channels/samsung.remote.control',
  DEFAULT_HANDSHAKE_TIMEOUT: 1000,
  DEFAULT_HANDSHAKE_RETRIES: 2,
  DEFAULT_AUTO_RECONNECT: true,
  DEFAULT_PORT: 8001,
  DEFAULT_SSL: false,
  COMMAND_METHOD: 'ms.remote.control',
  COMMAND_PARAMS_OPTION: 'false',
  COMMAND_PARAMS_TYPE_OF_REMOTE: 'SendRemoteKey',
});

/**
 * Events emitted by {@linkcode TizenRemote}.
 * @enum {keyof TizenRemoteEventData}
 * @event
 */
export const Event = /** @type { Record<string,keyof TizenRemoteEventData> } */ ({
  CONNECT: 'connect',
  CONNECTING: 'connecting',
  DISCONNECT: 'disconnect',
  DISCONNECTING: 'disconnecting',
  ERROR: 'error',
  RETRY: 'retry',
});

/**
 * @enum {KeyCommandType}
 * @group Constants
 */
export const KeyCmd = /** @type {Record<string,KeyCommandType>} */ ({
  PRESS: 'Press',
  CLICK: 'Click',
  RELEASE: 'Release',
});

/**
 * Events emitted by a {@linkcode WebSocket}.
 * @enum {string}
 * @event
 */
export const WsEvent = /** @type {const} */ ({
  CONNECT: 'connect',
  CLOSE: 'close',
  ERROR: 'error',
  OPEN: 'open',
});

/**
 * Represents a connection to a Tizen web socket server.
 */
export class TizenRemote extends createdTypedEmitterClass() {
  /**
   * IP or hostname of the Tizen device
   * @type {string}
   */
  #host;

  /**
   * Websocket port on Tizen device
   * @type {number}
   */
  #port;

  /**
   * Application ID
   * @type {string}
   */
  #name;

  /**
   * Super secret access token
   * @type {string}
   */
  #token;

  /**
   * Use SSL?
   * @type {boolean}
   */
  #ssl;

  /**
   * Full URL to WS server
   * @type {URL}
   */
  #url;

  /**
   * {@linkcode WebSocket} instance
   * @type {WebSocket|undefined}
   */
  #ws;

  /**
   * Number of times to retry connection/handshake
   * @type {number}
   */
  #handshakeRetries;

  /**
   * Whether or not to automatically reconnect when disconnected unexpectedly
   * @type {boolean}
   */
  #autoReconnect;

  /**
   * How long to wait for a handshake to complete
   * @type {number}
   */
  #handshakeTimeout;

  /**
   * It's `debug`
   * @type {debug.Debugger}
   */
  #debug;

  /**
   * When set, is actively listening to the {@linkcode WsEvent.CLOSE} event
   * to track unexpected disconnections.
   */
  /** @type {undefined | ((code: number, reason: Buffer) => Promise<void>)} */
  #activeCloseListener;

  /**
   * @param {TizenRemoteOptions} opts
   */
  constructor(opts) {
    super();
    this.#host = opts.host;
    this.#port = opts.port ?? constants.DEFAULT_PORT;
    this.#name = opts.name ?? '@headspinio/tizen-remote';
    this.#debug = debug(`tizen-remote [${this.#name}]`);
    this.#token = opts.token;
    this.#ssl = opts.ssl !== undefined ? Boolean(opts.ssl) : constants.DEFAULT_SSL;
    this.#url = this.#computeUrl();
    this.#autoReconnect =
      opts.autoReconnect !== undefined
        ? Boolean(opts.autoReconnect)
        : constants.DEFAULT_AUTO_RECONNECT;
    this.#handshakeTimeout = opts.handshakeTimeout ?? constants.DEFAULT_HANDSHAKE_TIMEOUT;
    this.#handshakeRetries = opts.handshakeRetries ?? constants.DEFAULT_HANDSHAKE_RETRIES;
  }

  #computeUrl() {
    const url = new URL(
      `${this.#ssl ? 'wss' : 'ws'}://${this.#host}:${this.#port}${constants.API_PATH_V2}`
    );
    url.searchParams.set('name', this.#name);
    url.searchParams.set('token', this.#token);
    this.#debug('Computed URL: %s', url);
    return url;
  }

  /**
   * Computed URL of the Tizen web socket server.
   */
  get url() {
    return this.#url.toString();
  }

  /**
   * Send JSON-serializable data to the Tizen web socket server.
   *
   * This is low-level, and you probably want something else.
   * @param {any} data
   * @param {SendOptions} [opts]
   * @returns {Promise<void>}
   */
  async send(data, {noConnect = false} = {}) {
    let ws = this.#ws;
    /** @type {string} */
    let payload;
    if (!this.#ws) {
      if (noConnect) {
        try {
          payload = JSON.stringify(data);
        } catch {
          payload = '(not serializable)';
        }
        throw new Error(`Disconnected; cannot send message: ${payload}`);
      }
      this.#debug('Disconnected when attempting to send; attempting connection...');
      ws = await this.connect();
    }
    try {
      payload = JSON.stringify(data);
      this.#debug('Sending: %O', data);
    } catch (err) {
      const error = /** @type {TypeError} */ (err);
      throw new TypeError(`Cannot serialize data to JSON: ${error.message}`);
    }
    const send = /** @type {(data: any) => Promise<void>} */ (
      promisify(/** @type {WebSocket} */ (ws).send).bind(this.#ws)
    );
    await send(payload);
  }

  /**
   * Execute a "click" on the remote
   * @param {KeyCode} key
   */
  async click(key) {
    await this.send(new KeyCommand(KeyCmd.CLICK, key));
  }

  /**
   * Execute a "press" ("keydown") on the remote
   * @param {KeyCode} key
   */
  async press(key) {
    await this.send(new KeyCommand(KeyCmd.PRESS, key));
  }

  /**
   * Execute a "release" ("keyup") on the remote
   * @param {KeyCode} key
   */
  async release(key) {
    await this.send(new KeyCommand(KeyCmd.PRESS, key));
  }

  /**
   * Execute a "long" press on the remote
   * @param {KeyCode} key
   */
  async longPress(key, ms = 1000) {
    await this.send(new KeyCommand(KeyCmd.PRESS, key));
    await delay(ms);
    await this.send(new KeyCommand(KeyCmd.RELEASE, key));
  }

  /**
   *
   * @param {string} str
   */
  async text(str) {
    await this.send(new TextCommand(str));
  }

  /**
   * Connect to the Tizen web socket server.
   * @returns {Promise<WebSocket>}
   */
  async connect() {
    // the default behavior of pRetry is to use an exponential backoff, so
    // that's what we are using
    try {
      const ws = await pRetry(
        (attempt) => {
          this.#debug('Connecting to %s (attempt %d)...', this.#url, attempt);
          return /** @type {Promise<WebSocket>} */ (
            new Promise((resolve, reject) => {
              this.emit(Event.CONNECTING);

              if (attempt > 1) {
                this.emit(Event.RETRY, attempt);
              }

              const ws = new WebSocket(this.#url, {handshakeTimeout: this.#handshakeTimeout})
                .once(WsEvent.OPEN, () => {
                  this.#debug('Connected to %s', this.#url);
                  resolve(ws);
                })
                .once(WsEvent.ERROR, (err) => {
                  reject(err);
                });
            })
          );
        },
        {
          // note that if this function throws, no more retries will be attempted.
          onFailedAttempt: (err) => {
            this.#debug(
              'Connection attempt %d (%d remain) failed: %s',
              err.attemptNumber,
              err.retriesLeft,
              err.message
            );
            if (!err.retriesLeft) {
              throw new Error(
                `Cannot connect to ${this.#url} in ${err.attemptNumber} attempt(s); giving up`
              );
            }
          },
          retries: this.#handshakeRetries,
        }
      );

      // I _think_ it's OK to just overwrite this if it exists,
      // since the EE it's listening on should be GC'd
      this.#activeCloseListener = this.#closeListener.bind(this);

      this.#ws = ws.once(WsEvent.CLOSE, this.#activeCloseListener);

      this.emit(Event.CONNECT, ws);

      return ws;
    } catch (err) {
      this.emit(Event.ERROR, /** @type {Error} */ (err));
      throw err;
    }
  }

  /**
   * `true` if we have an active WS connection
   */
  get isConnected() {
    return Boolean(this.#ws?.readyState === WebSocket.OPEN);
  }

  /**
   * `true` if we are not connected to the server
   */
  get isDisconnected() {
    return Boolean(this.#ws?.readyState === WebSocket.CLOSED);
  }

  /**
   * `true` if we've issued a manual disconnection
   */
  get isDisconnecting() {
    return Boolean(this.#ws?.readyState === WebSocket.CLOSING);
  }

  /**
   * `true` if we are currently attempting to connect to the server.
   */
  get isConnecting() {
    return Boolean(this.#ws?.readyState === WebSocket.CONNECTING);
  }

  /**
   * This is the definition of a listener for the {@linkcode WsEvent#CLOSE} event
   * which handles unexpected disconnections.
   *
   * When listening, this method will be bound to this instance.
   *
   * Note: `reason` mostly seems to be an empty `Buffer`. If someone sees it actually
   * contain any information, please [tell us](https://github.com/headspinio/appium-tizen-tv-driver/issues/new).
   * @param {number} code - Disconnection code; see {@linkcode BadCode}
   * @param {Buffer} reason - Disconnection reason
   */
  async #closeListener(code, reason) {
    this.emit(Event.DISCONNECT, {code, reason});
    if (isKnownBadCode(code)) {
      this.#debug('Received "%s" (%d)', BadCode[code], code);
      if (this.#autoReconnect) {
        try {
          await this.connect();
        } catch (err) {
          this.emit(Event.ERROR, /** @type {Error} */ (err));
        }
      } else {
        this.emit(
          Event.ERROR,
          new Error(`Socket disconnected; ${BadCode[code]}: ${reason || '(no reason provided)'}`)
        );
      }
    }
  }

  /**
   * Disconnect from the WS server.
   *
   * If not connected, this method does nothing.  If disconnection
   * already in progress, the `Promise` will fulfill upon disconnection.
   * @returns {Promise<void>}
   */
  async disconnect() {
    return await new Promise((resolve, reject) => {
      if (this.#ws) {
        if (this.isDisconnected) {
          resolve();
          return;
        }

        // disconnecting already in progress; easiest to just
        // wait for our own event.
        if (this.isDisconnecting) {
          this.once(Event.DISCONNECT, () => {
            resolve();
          });
          return;
        }

        this.emit(Event.DISCONNECTING);

        this.#ws
          .once(WsEvent.CLOSE, () => {
            this.#debug('Closed connection to server %s', this.#url);
            this.emit(Event.DISCONNECT);
            resolve();
          })
          .once(WsEvent.ERROR, (err) => {
            // XXX: rejection here might not be appropriate
            reject(err);
          });

        // this ensures that we don't attempt to automatically reconnect,
        // since we requested the disconnection ourselves.
        if (this.#activeCloseListener) {
          this.#ws.removeListener(WsEvent.CLOSE, this.#activeCloseListener);
        }

        this.#ws.close();
        return;
      }
      resolve();
    });
  }
}

class KeyCommand {
  method = constants.COMMAND_METHOD;

  /** @type {TizenRemoteCommandParams<KeyCommandType, KeyCode>} */
  params;

  /**
   * @param {KeyCommandType} cmd
   * @param {KeyCode} data
   */
  constructor(cmd, data) {
    this.params = {
      Cmd: cmd,
      DataOfCmd: data,
      Option: constants.COMMAND_PARAMS_OPTION,
      TypeOfRemote: 'SendRemoteKey',
    };
  }
}

class TextCommand {
  method = constants.COMMAND_METHOD;

  /** @type {TizenRemoteCommandParams<string, 'base64'>} */
  params;

  /**
   * Original text
   * @type {string}
   */
  text;

  /**
   * @param {string} text
   */
  constructor(text) {
    this.text = text;
    this.params = {
      Cmd: Buffer.from(text).toString('base64'),
      DataOfCmd: 'base64',
      Option: constants.COMMAND_PARAMS_OPTION,
      TypeOfRemote: 'SendRemoteKey',
    };
  }
}

/**
 * A key of {@linkcode Keys}.
 * @typedef {keyof typeof Keys} Key
 */

/**
 * Options for {@linkcode TizenRemote#constructor}.
 * @group Options
 * @typedef TizenRemoteOptions
 * @property {string} host - Hostname or IP address of the Tizen device
 * @property {string} token - Remote control token
 * @property {number} [port=8001] - Port of the Tizen device's WS server
 * @property {string} [name] - Name of this "virtual remote control"
 * @property {boolean} [ssl] - Whether to use SSL
 * @property {number} [handshakeTimeout] - Timeout for the initial handshake
 * @property {number} [handshakeRetries] - Number of retries for the initial handshake
 * @property {boolean} [autoReconnect] - Whether to automatically reconnect on disconnection
 */

/**
 * Types for event data emitted by a {@linkcode TizenRemote} instance.
 *
 * The keys of this type correspond to {@linkcode Event Events}.
 * @typedef TizenRemoteEventData
 * @property {WebSocket} connect - Emitted when connected to WS server
 * @property {void} connecting - Emitted when connecting to WS server
 * @property {Error} error - Emitted when an error occurs
 * @property {void|{code:number, reason:Buffer}} disconnect - Emitted when disconnected from WS server; `void` if disconnected manually
 * @property {void} disconnecting - Emitted when disconnecting manually
 * @property {number} retry - Emitted if retrying a connection
 * @event
 */

/**
 * @typedef {import('strict-event-emitter-types').StrictEventEmitter<EventEmitter, TizenRemoteEventData>} TizenRemoteInstance
 * @internal
 */

/**
 * A named key constant as recognized by the Tizen remote WS server looks like this.
 * @typedef {import('type-fest').ValueOf<Keys>} KeyCode
 * @group Message Data
 */

/**
 * A "keypress" type event. Used by {@linkcode TizenRemoteCommandParams#DataOfCmd}.
 * @typedef {'Press' | 'Click' | 'Release'} KeyCommandType
 * @group Message Data
 */

/**
 * @typedef {import('type-fest').LiteralUnion<KeyCommandType, string>} TizenRemoteCommandParamsCmd
 */

/**
 * @typedef {'SendRemoteKey'|'SendRemoteText'} TizenRemoteCommandType
 */

/**
 * Internal object within {@linkcode TizenRemoteCommand}.
 * @template {TizenRemoteCommandParamsCmd} Cmd
 * @template {KeyCode | 'base64'} Data
 * @typedef TizenRemoteCommandParams
 * @property {Cmd} Cmd
 * @property {Data} DataOfCmd
 * @property {'false'} Option
 * @property {TizenRemoteCommandType} TypeOfRemote
 * @group Message Data
 */

// /**
//  * This is the shape of a message object sent to the Tizen remote WS server.
//  * @template {TizenRemoteCommandParamsCmd} Cmd
//  * @template {TizenRemoteCommandParamsDataOfCmd<K>} Data
//  * @template {Key | 'base64'} K
//  * @typedef TizenRemoteCommand
//  * @property {'ms.remote.control'} method
//  * @property {TizenRemoteCommandParams<Cmd, Data, K>} params
//  * @group Message Data
//  */

/**
 * Options for {@linkcode TizenRemote#send} and its ilk
 * @group Options
 * @typedef SendOptions
 * @property {boolean} [noConnect] - If `true`, do not attempt to connect if disconnected.
 */
