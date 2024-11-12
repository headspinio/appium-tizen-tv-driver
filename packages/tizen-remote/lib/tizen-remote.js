import {strongbox} from '@appium/strongbox';
import {Env} from '@humanwhocodes/env';
import debug from 'debug';
import delay from 'delay';
import _ from 'lodash';
import {EventEmitter} from 'node:events';
import {formatWithOptions, promisify} from 'node:util';
import pRetry from 'p-retry';
import WebSocket from 'ws';
import {KeyCommand, TextCommand} from './command';
import {Keys} from './keys';
import got from 'got';

export {Keys};

const format = _.partial(formatWithOptions, {depth: null, colors: true});

/**
 * This tricks TS into typing the events and associated data in {@linkcode TizenRemote}
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
 * @group Constants
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
 * Constant values, defaults, etc.
 * @group Constants
 */
export const constants = /** @type {const} */ ({
  /**
   * Path on the Tizen device to the WS server
   */
  API_PATH_V2: '/api/v2/channels/samsung.remote.control',

  /**
   * Timeout for initial handshake to the Tizen device (in ms)
   */
  DEFAULT_HANDSHAKE_TIMEOUT: 1000,

  /**
   * Number of times to retry a failed connection
   */
  DEFAULT_HANDSHAKE_RETRIES: 2,

  /**
   * If `true`, automatically attempt to reconnect when connection fails
   */
  DEFAULT_AUTO_RECONNECT: true,

  /**
   * Wait this long to get a new token (in ms).
   */
  DEFAULT_TOKEN_TIMEOUT: 40000,

  /**
   * Default port on the Tizen device to connect to
   */
  DEFAULT_PORT: 8002,

  /**
   * Use SSL when connecting to the Tizen device
   */
  DEFAULT_SSL: true,

  /**
   * Default client name (before encoding to base64)
   */
  DEFAULT_NAME: 'Appium',

  /**
   * The `Method` property in msg payload when sending commands to the Tizen device
   */
  COMMAND_METHOD: 'ms.remote.control',

  /**
   * The `timeout` property in msg payload when sending commands to the Tizen device
   *
   * This could occur when the given api token was valid but needs a fresh token?
   */
  COMMAND_TIMEOUT: 'ms.channel.timeOut',

  /**
   * The `Event` property in msg payload when requesting a token
   *
   * Likewise the `event` property in a message payload when receiving the new token
   */
  TOKEN_EVENT: 'ms.channel.connect',

  /**
   * I don't know, but it goes in the command payload and it's always `'false'`.
   */
  COMMAND_PARAMS_OPTION: 'false',

  /**
   * Value of the `TypeOfRemote` property in the command payload
   */
  COMMAND_PARAMS_TYPE_OF_REMOTE: 'SendRemoteKey',

  /**
   * Basename of the token cache file
   */
  TOKEN_CACHE_BASENAME: 'token-cache',

  /**
   * Lockfile filename
   */
  TOKEN_CACHE_LOCKFILE_NAME: 'token-cache.lock',

  /**
   * Default value of `persistToken` option
   */
  DEFAULT_PERSIST_TOKEN: true,

  /**
   * Namespace for various usages
   */
  NS: 'tizen-remote',
});

/**
 * Events emitted by {@linkcode TizenRemote}.
 * @event
 */
export const Event = /** @type {const} */ ({
  CONNECT: 'connect',
  CONNECTING: 'connecting',
  DISCONNECT: 'disconnect',
  DISCONNECTING: 'disconnecting',
  ERROR: 'error',
  RETRY: 'retry',
  TOKEN: 'token',
  SENT: 'sent',
});

/**
 * Valid types of keypresses which can be sent in the msg command payload
 * @group Constants
 */
export const KeyCmd = /** @type {const} */ ({
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
  MESSAGE: 'message',
});

/**
 * Type guard for {@link BadCode}.
 * @internal
 * @param {any} code
 * @returns {code is keyof BadCode}
 */
function isKnownBadCode(code) {
  return code in BadCode;
}

/**
 * Type guard for incoming messages
 * @internal
 * @param {any} msg
 * @returns {msg is NewTokenMessage}
 */
function isTokenMessage(msg) {
  return Boolean(msg?.event === constants.TOKEN_EVENT && msg?.data?.token);
}

/**
 * Type guard for incoming messages
 * @internal
 * @param {any} msg
 * @returns {msg is NewTokenMessage}
 */
function isCommandTimeout(msg) {
  return Boolean(msg?.event === constants.COMMAND_TIMEOUT);
}

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
   * @defaultValue See {@linkcode constants.DEFAULT_PORT}
   */
  #port;

  /**
   * Client identifier; a base64-encoded string of the `host`.
   *
   * This is used in communication with the device.
   *
   * @type {string}
   */
  #id;

  /**
   * Super secret access token.
   *
   * Typically this is a `string` of eight (8) integers.  If `undefined`, we will either retrieve it from the
   * environment or request one from the Tizen device.
   * @type {string|undefined}
   */
  #token;

  /**
   * Use SSL?
   *
   * If the port is `8002`, this will be automatically set to `true`.
   * @type {boolean}
   * @defaultValue See {@linkcode constants.DEFAULT_SSL}
   */
  #ssl;

  /**
   * {@linkcode WebSocket} instance
   * @type {WebSocket|undefined}
   */
  #ws;

  /**
   * Number of times to retry connection/handshake
   * @type {number}
   * @defaultValue See {@linkcode constants.DEFAULT_HANDSHAKE_RETRIES}
   */
  #handshakeRetries;

  /**
   * Whether or not to automatically reconnect when disconnected unexpectedly
   * @type {boolean}
   * @defaultValue See {@linkcode constants.DEFAULT_AUTO_RECONNECT}
   */
  #autoReconnect;

  /**
   * How long to wait for a handshake to complete
   * @type {number}
   * @defaultValue See {@linkcode constants.DEFAULT_HANDSHAKE_TIMEOUT}
   */
  #handshakeTimeout;

  /**
   * It's `debug`
   * @type {debug.Debugger}
   */
  #debugger;

  /**
   * How long to wait to receive a token from the Tizen device
   * @type {number}
   * @defaultValue See {@linkcode constants.DEFAULT_TOKEN_TIMEOUT}
   */
  #tokenTimeout;

  /**
   * Tracks listeners that we've added to the {@linkcode WebSocket} instance.
   *
   * We can remove them later to avoid leaking EE listeners.
   * @type {Map<WsEvent,Set<(...args: any[]) => void>>}
   */
  #listeners = new Map();

  /**
   * Token cache object.
   *
   * Will remain `undefined` if token persistence is disabled
   * @type {import('@appium/strongbox').Item<string>|undefined}
   */
  #tokenCache;

  /**
   * If the target device supports token.
   * @type {boolean | undefined}
   */
  #tokenSupportCache;

  /**
   * Whether or not to persist tokens to the cache
   * @type {boolean}
   */
  #persistToken;

  /**
   * Store for the token
   * @type {import('@appium/strongbox').Strongbox}
   */
  #strongbox;

  /**
   * @param {string} host - IP or hostname of the Tizen device
   * @param {TizenRemoteOptions} [opts]
   */
  constructor(host, opts = {}) {
    super();

    if (!host) {
      throw new TypeError('"host" parameter is required');
    }

    const env = new Env();

    //  The strongbox suffix is default value, "-nodejs". Please do not modify it.
    this.#strongbox = strongbox(constants.NS);

    this.#host = host;
    this.#port = Number(opts.port ?? constants.DEFAULT_PORT);
    this.#persistToken = Boolean(opts.persistToken ?? constants.DEFAULT_PERSIST_TOKEN);
    // note: if this is unset, we will attempt to get a token from the fs cache,
    // and if _that_ fails, we'll go ahead and ask the device for one.
    this.#token = opts.token ?? env.get('TIZEN_REMOTE_TOKEN');
    this.#id = Buffer.from(this.#host).toString('base64');
    if (opts.debug) {
      debug.enable(`${constants.NS}*`);
    }
    this.#debugger = debug(`${constants.NS} [${this.#host}]`);

    // automatically set ssl flag if port is 8002 and no `ssl` opt is explicitly set
    this.#ssl = opts.ssl !== undefined ? Boolean(opts.ssl) : this.#port === 8002;
    this.#autoReconnect =
      opts.autoReconnect !== undefined
        ? Boolean(opts.autoReconnect)
        : constants.DEFAULT_AUTO_RECONNECT;
    this.#handshakeTimeout = opts.handshakeTimeout ?? constants.DEFAULT_HANDSHAKE_TIMEOUT;
    this.#handshakeRetries = opts.handshakeRetries ?? constants.DEFAULT_HANDSHAKE_RETRIES;
    this.#tokenTimeout = opts.tokenTimeout ?? constants.DEFAULT_TOKEN_TIMEOUT;

    this.#tokenSupportCache = undefined;
  }

  /**
   * When run via devtools, `debug` seems to delegate to `console` (??), which does not
   * share Node's `printf`-like API.  This forces the issue.
   * @param {...any} args
   */
  #debug(...args) {
    this.#debugger(format(...args));
  }

  /**
   * Computed URL of the Tizen device's websocket endpoint
   */
  get #url() {
    const url = new URL(
      `${this.#ssl ? 'wss' : 'ws'}://${this.#host}:${this.#port}${constants.API_PATH_V2}`
    );
    url.searchParams.set('name', this.#id);
    if (this.#token) {
      url.searchParams.set('token', this.#token);
    }
    return url;
  }

  /**
   * Just returns the client name (which is a base64-encoded string).
   */
  get base64Name() {
    return this.#id;
  }

  /**
   * Computed URL of the Tizen device's websocket endpoint (as a string)
   */
  get url() {
    return this.#url.toString();
    }

  /**
   * Return True if the target device has 'TokenAuthSupport' param for the api/v2 endpoint.
   * No 'TokenAuthSupport' indicates the device does not require "token".
   * @returns {Promise<boolean>}
   */
  async isTokenSupportedDevice() {
    if (_.isBoolean(this.#tokenSupportCache)) {
      return this.#tokenSupportCache;
    }
    try {
      const deviceData = await got.get(`http://${this.#host}:8001/api/v2/`).json();
      this.#tokenSupportCache = this._getDeviceSupportsTokens(deviceData) === 'true';
      return this.#tokenSupportCache;
    } catch {
      // defaults to true for newer TVs.
      return true;
    }
  }
  /**
   * Private. Accessible for testing
   * @param {any} jsonBody
   * @returns {'true'|'false'|undefined}
   */
  _getDeviceSupportsTokens(jsonBody) {
    return jsonBody?.device?.TokenAuthSupport;
  }

  /**
   * Unsets token.
   *
   * If token cache persistence is enabled, this will remove it from the cache as well.
   */
  async unsetToken() {
    if (this.#persistToken) {
      const cache = await this.#getTokenCache();
      await cache.clear();
    }
    this.#token = undefined;
    this.#debug('Unset token for host %s', this.#host);
  }

  /**
   * Resolves `true` if a token is set or the cache contains a token
   * @returns {Promise<boolean>}
   */
  async hasToken() {
    let result = false;
    if (this.#token) {
      this.#debug('Token is set (%s)', this.#token);
      result = true;
    } else if (this.#persistToken) {
      const cache = await this.#getTokenCache();
      result = Boolean(cache.value);
      if (result) {
        this.#debug('Found token in cache (%s)', cache.value);
      }
    }
    if (!result) {
      this.#debug('No token found in memory or cache');
    }
    return result;
  }

  /**
   * Initializes the token cache; otherwise returns the existing cache.
   *
   * Aditionally, any future writes to the cache must be wrapped in the lock.
   * @returns {Promise<import('@appium/strongbox').Item<string>>}
   * @privateRemarks Do not call `#hasToken()` from here, as it will cause an infinite stack
   */
  async #getTokenCache() {
    if (this.#tokenCache) {
      return this.#tokenCache;
    }
    if (this.#token) {
      this.#tokenCache = await this.#strongbox.createItemWithValue(this.#host, this.#token);
    } else {
      this.#tokenCache = await this.#strongbox.createItem(this.#host);
      this.#token = this.#tokenCache.value;
    }

    return this.#tokenCache;
  }

  /**
   * Reads token (if available) from the token cache in the filesystem
   *
   * If `#persistToken` is false, this will _always_ return `undefined`.
   * @returns {Promise<string|undefined>}
   */
  async readToken() {
    if (this.#persistToken) {
      const cache = await this.#getTokenCache();
      return await cache.read();
    }
  }

  /**
   * Writes token to the token cache in the filesystem.
   *
   * If `#persistToken` is false, this will _never_ write to the cache.
   * @param {string} token
   * @returns {Promise<void>}
   */
  async writeToken(token) {
    if (this.#persistToken) {
      const cache = await this.#getTokenCache();
      await cache.write(token);
    }
    this.#token = token;
  }

  /**
   * Send JSON-serializable data to the Tizen web socket server.
   *
   * This is low-level, and you probably want something else.
   * @param {any} data
   * @param {NoConnectOption & NoTokenOption} opts
   * @returns {Promise<void>}
   */
  async send(data, {noConnect = false, noToken = false} = {}) {
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
      // connect() assigns this.#ws if it was successful, so we
      // don't need to do so here.
      await this.connect({noToken});
    }
    try {
      payload = JSON.stringify(data);
      this.#debug('Sending: %O', data);
    } catch (err) {
      const error = /** @type {TypeError} */ (err);
      throw new TypeError(`Cannot serialize data to JSON: ${error.message}`);
    }
    const send = /** @type {(data: any) => Promise<void>} */ (
      promisify(/** @type {WebSocket} */ (this.#ws).send).bind(this.#ws)
    );
    await send(payload);
    this.emit(Event.SENT, payload);
  }

  /**
   * Send JSON-serializable data to the Tizen web socket server.
   *
   * This is low-level, and you probably want something else.
   * @template T
   * @param {string} channel
   * @param {any} data
   * @param {SendRequestOptions} opts
   * @returns {Promise<T>}
   */
  async sendRequest(channel, data, {noConnect = false, noToken = false, timeout} = {}) {
    /** @type {string} */
    let payload;
    /** @type {WebSocket} */
    let ws;
    if (this.#ws) {
      ws = this.#ws;
    } else {
      if (noConnect) {
        throw new Error(`Disconnected; cannot send message: ${data}`);
      }
      this.#debug('Not connected; attempting connection...');
      ws = await this.connect({noToken});
    }

    try {
      payload = JSON.stringify(data);
    } catch (err) {
      throw new Error(`Unable to serialize data to JSON: ${/** @type {Error} */ (err).message}`);
    }

    const send = /** @type {(data: any) => Promise<void>} */ (promisify(ws.send).bind(this.#ws));

    this.#debug('Sending request on channel %s: %O', channel, data);
    await send(payload);

    return await new Promise((resolve, reject) => {
      /** @type {NodeJS.Timeout|undefined} */
      let timer;

      if (timeout !== undefined) {
        timer = setTimeout(() => {
          this.#offWs(WsEvent.MESSAGE, listener);
          reject(new Error(`Did not receive token in ${timeout}ms`));
        }, timeout);
      }

      /** @param {import('ws').RawData} data */
      const listener = (data) => {
        try {
          const resData = JSON.parse(data.toString());
          if (resData.event === channel) {
            this.#offWs(WsEvent.MESSAGE, listener);
            clearTimeout(timer);
            resolve(resData);
          }
        } catch {
          this.#debug('Failed to parse JSON from raw response: %O', data);
          // if we can't parse the data, it's not something we're interested in
        }
      };
      this.#onWs(WsEvent.MESSAGE, listener);
    });
  }

  /**
   * Listen for an event on the WebSocket instance one or more times.
   *
   * Defaults to "more times"
   * @template {(...args: any[]) => void} Listener
   * @param {WsEvent} event
   * @param {Listener} listener
   * @param {{ context?: any, once?: boolean }} opts
   * @returns {Listener}
   */
  #listenWs(event, listener, {context, once = false} = {}) {
    if (!this.#ws) {
      throw new Error('Failed to establish the websocket connection to the TV device. The rcToken was invalid or might need to be refreshed.');
    }

    const method = once ? this.#ws.once : this.#ws.on;
    const listeners = this.#listeners.get(event) ?? new Set();
    this.#listeners.set(event, listeners);
    if (context) {
      /** @type {Listener} */
      let boundListener;
      if (once) {
        boundListener = /** @type {Listener} */ (
          (...args) => {
            try {
              listener.apply(context, args);
            } finally {
              // remove the listener if it's a one-time listener
              listeners.delete(boundListener);
            }
          }
        );
      } else {
        boundListener = /** @type {Listener} */ (listener.bind(context));
      }
      listeners.add(boundListener);
      method.call(this.#ws, event, boundListener);
      return boundListener;
    }
    listeners.add(listener);
    method.call(this.#ws, event, listener);
    return listener;
  }

  /**
   * Listen for WebSocket event multiple times
   * @template {(...args: any[]) => void} Listener
   * @param {WsEvent} event
   * @param {Listener} listener
   * @param {{ context?: any }} opts
   * @returns {Listener}
   */
  #onWs(event, listener, {context} = {}) {
    return this.#listenWs(event, listener, {context});
  }

  /**
   * Listen for WebSocket event once.
   * @template {(...args: any[]) => void} Listener
   * @param {WsEvent} event
   * @param {Listener} listener
   * @param {{ context?: any }} opts
   * @returns {Listener}
   */
  #onceWs(event, listener, {context} = {}) {
    return this.#listenWs(event, listener, {context, once: true});
  }

  /**
   *
   * @template {(...args: any[]) => void} Listener
   * @param {WsEvent} event
   * @param {Listener} listener
   * @returns {void}
   */
  #offWs(event, listener) {
    if (this.#ws) {
      let foundListener = Boolean(this.#listeners.get(event)?.has(listener));
      if (foundListener) {
        this.#ws.removeListener(event, listener);
        this.#listeners.get(event)?.delete(listener);
      }
    }
  }

  /**
   * Execute a "click" on the remote
   * @param {RcKeyCode} key
   */
  async click(key) {
    await this.send(new KeyCommand(KeyCmd.CLICK, key));
  }

  /**
   * Execute a "press" ("keydown") on the remote
   * @param {RcKeyCode} key
   */
  async press(key) {
    await this.send(new KeyCommand(KeyCmd.PRESS, key));
  }

  /**
   * Execute a "release" ("keyup") on the remote
   * @param {RcKeyCode} key
   */
  async release(key) {
    await this.send(new KeyCommand(KeyCmd.RELEASE, key));
  }

  /**
   * Execute a "long" press on the remote
   * @param {RcKeyCode} key
   */
  async longPress(key, ms = 1000) {
    await this.send(new KeyCommand(KeyCmd.PRESS, key));
    await delay(ms);
    await this.send(new KeyCommand(KeyCmd.RELEASE, key));
  }

  /**
   * Gets a new token from the Tizen device (if none exists).
   *
   * If a new token must be requested, expect to wait _at least_ thirty (30) seconds.
   * @param {NoConnectOption & {force?: boolean}} opts
   * @returns {Promise<string | undefined>}
   */
  async getToken({noConnect = false, force = false} = {}) {
    if (!force) {
      if (this.#token) {
        return this.#token;
      }
      const token = await this.readToken();
      if (token) {
        this.#debug('Read token from cache: %s', token);
        return token;
      }
    }
    this.#debug('Requesting new token; please wait...');
    // temporarily disable the "new token" listener, which can happen at any time.
    // if we don't do this, it'll fire twice.
    this.#offWs(WsEvent.MESSAGE, this.#updateTokenListener);
    try {
      const res = await this.sendRequest(
        constants.TOKEN_EVENT,
        new KeyCommand(KeyCmd.CLICK, Keys.HOME),
        {noConnect, noToken: true, timeout: this.#tokenTimeout}
      );
      if (isTokenMessage(res)) {
        const {token} = res.data;
        this.#debug('Received message w/ token: %s', token);
        await this.writeToken(token);
        this.emit(Event.TOKEN, token);
        return token;
      }
      if (!(await this.isTokenSupportedDevice())) {
        throw new Error(`The device does not support token or it could not get token; server responded with: ${format('%O', res)}`);
      }
      this.#debug('The device may not support token as old model.');
      return;
    } finally {
      this.#onWs(WsEvent.MESSAGE, this.#updateTokenListener, {context: this});
    }
  }

  /**
   * Send some text
   * @param {string} str
   */
  async text(str) {
    await this.send(new TextCommand(str));
  }

  /**
   * Connect to the Tizen web socket server.
   * @param {ConnectOptions} opts - Options
   * @returns {Promise<WebSocket>}
   */
  async connect({noToken = false} = {}) {
    if (!this.#token && !noToken) {
      let token = await this.readToken();
      if (token) {
        this.#token = token;
      }
    } else if (this.#token) {
      await this.writeToken(this.#token);
    }

    // the default behavior of pRetry is to use an exponential backoff, so
    // that's what we are using
    const ws = await pRetry(
      (attempt) => {
        this.#debug('Connecting to %s (attempt %d)...', this.#url, attempt);
        return /** @type {Promise<WebSocket>} */ (
          new Promise((resolve, reject) => {
            this.emit(Event.CONNECTING);

            if (attempt > 1) {
              this.emit(Event.RETRY, attempt);
            }

            // The following two listeners would normally be handled by
            // `#onceWs`, but since we don't yet _have_ a `#ws` property,
            // we don't want to use them due to the complexity involved in
            // trying to fake it.

            /**
             * Called if handshake fails.
             *
             * Must remove `WsEvent.ERROR` listener to avoid leaks.
             * @param {Error} err
             */
            const errListener = (err) => {
              ws.removeListener(WsEvent.OPEN, openListener);
              reject(err);
            };

            /**
             * Called if handshake succeeds
             *
             * **Must** remove `WsEvent.ERROR` listener to avoid leaks.
             */
            const openListener = () => {
              this.#debug('Connected to %s', this.#url);
              ws.removeListener(WsEvent.ERROR, errListener);
              resolve(ws);
            };

            const ws = new WebSocket(this.#url, {
              handshakeTimeout: this.#handshakeTimeout,
              rejectUnauthorized: false,
            })
              .once(WsEvent.OPEN, openListener)
              .once(WsEvent.ERROR, errListener);
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
            return Promise.reject(
              new Error(
                `Cannot connect to ${this.#url} in ${err.attemptNumber} attempt(s); giving up`
              )
            );
          }
        },
        retries: this.#handshakeRetries,
      }
    );

    this.#ws = ws;

    this.#onceWs(WsEvent.CLOSE, this.#closeListener, {context: this});
    this.#onWs(WsEvent.MESSAGE, this.#debugListener, {context: this});
    this.#onWs(WsEvent.MESSAGE, this.#updateTokenListener, {context: this});

    if (!this.#token && !noToken) {
      this.#debug('Requesting new token; waiting %d...', this.#tokenTimeout / 1000);
      this.#token = await this.getToken();
      this.#debug('Received token: %s', this.#token);
    }

    this.emit(Event.CONNECT, ws);

    return ws;
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
   * Path to the token cache file, if any
   * @type {string|undefined}
   */
  get tokenCachePath() {
    return this.#tokenCache?.id;
  }

  /**
   * Current token, if any
   * @type {string|undefined}
   */
  get token() {
    return this.#token;
  }

  /**
   * A listener that emits received messages in the debug log
   * @param {import('ws').RawData} data
   * @param {boolean} isBinary
   */
  #debugListener(data, isBinary) {
    if (isBinary) {
      this.#debug('Received binary message: %o', data);
    } else {
      try {
        const resData = JSON.parse(data.toString());
        this.#debug('Received message: %o', resData);
      } catch {}
    }
  }

  /**
   * Listener for unprompted token update msgs from the server.
   * @param {import('ws').RawData} data
   * @param {boolean} isBinary
   */
  async #updateTokenListener(data, isBinary) {
    if (isBinary) {
      return;
    }
    try {
      const msg = JSON.parse(data.toString());
      if (isTokenMessage(msg)) {
        const {token} = msg.data;
        if (token !== this.#token) {
          this.#debug('Received updated token: %s', token);
          this.#token = token;
          await this.writeToken(token);
          this.emit(Event.TOKEN, token);
        } else {
          this.#debug('Warning: received token update, but token (%s) is unchanged', this.#token);
        }
      } else if (isCommandTimeout(msg)) {
        this.#debug('Received ms.channel.timeOut message. The token (%s) might need a fresh one. ' +
          'Unset the token to start from a fresh token. Please complete the device paring if needed.', this.#token);
        this.unsetToken();
      }
    } catch (err) {
      this.#debug('Warning: could not parse message: %s', err);
    }
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
    try {
      return await new Promise((resolve, reject) => {
        // nothing to do!
        if (!this.#ws || this.isDisconnected) {
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

        // we may have a "close" listener for auto-reconnect, so
        // we need to remove it before attempting disconnection.
        const closeListeners = this.#listeners.get(WsEvent.CLOSE);
        if (closeListeners) {
          for (const listener of closeListeners) {
            this.#ws.removeListener(WsEvent.CLOSE, listener);
          }
          closeListeners.clear();
        }

        this.#onceWs(WsEvent.CLOSE, () => {
          this.#debug('Closed connection to server %s', this.#url);
          this.emit(Event.DISCONNECT);
          resolve();
        });
        this.#onceWs(WsEvent.ERROR, (err) => {
          reject(err);
        });
        this.#ws.close();
      });
    } finally {
      // remove any listeners we may have created.
      for (const [event, listeners] of this.#listeners) {
        for (const listener of listeners) {
          this.#ws?.removeListener(event, listener);
        }
      }
      this.#listeners.clear();
    }
  }
}

/**
 * A key of {@linkcode Keys}.
 * @typedef {keyof typeof Keys} Key
 * @group Utility
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
 * @property {string} token - Emitted when a new token is received
 * @property {string} sent - Emitted when a message has successfully been sent
 * @event
 */

/**
 * @typedef {import('strict-event-emitter-types').StrictEventEmitter<EventEmitter, TizenRemoteEventData>} TizenRemoteInstance
 * @group Utility
 */

/**
 * A named key constant as recognized by the Tizen remote WS server looks like this.
 * @typedef {import('type-fest').ValueOf<Keys>} RcKeyCode
 * @group Message Data
 */

/**
 * A "keypress" type event. Used by {@linkcode TizenRemoteCommandParams.DataOfCmd}.
 * @typedef {'Press' | 'Click' | 'Release'} KeyCommandType
 * @group Message Data
 */

/**
 * Potential value for {@linkcode TizenRemoteCommandParams.Cmd}.
 * @group Message Data
 * @typedef {import('type-fest').LiteralUnion<KeyCommandType, string>} TizenRemoteCommandParamsCmd
 */

/**
 * The potential values for {@linkcode TizenRemoteCommandParams.TypeOfRemote}.
 * @group Message Data
 * @typedef {'SendRemoteKey'|'SendInputString'} TizenRemoteCommandType
 */

/**
 * Internal object within {@linkcode TizenRemoteCommand}.
 * @template {TizenRemoteCommandParamsCmd} Cmd
 * @template {RcKeyCode | 'base64'} Data
 * @typedef TizenRemoteCommandParams
 * @property {Cmd} Cmd
 * @property {Data} DataOfCmd
 * @property {'false'} Option
 * @property {TizenRemoteCommandType} TypeOfRemote
 * @group Message Data
 */

/**
 * An object having a `noConnect` property. Used by various options
 * @typedef NoConnectOption
 * @property {boolean} [noConnect] - If `true`, do not automatically attempt to connect if disconnected
 * @group Utility
 */

/**
 * An object having a `noToken` property. Used by various options
 * @typedef NoTokenOption
 * @property {boolean} [noToken] - If `true`, do not automatically attempt to get a token if one is unset.
 * @group Utility
 */

/**
 * Options for {@linkcode TizenRemote.connect}.
 * @group Options
 * @typedef {NoTokenOption} ConnectOptions
 */

/**
 * Options for {@linkcode TizenRemote.send} and {@linkcode TizenRemote.sendRequest}.
 * @group Options
 * @typedef {NoTokenOption & NoConnectOption} SendOptions
 */

/**
 * Options for {@linkcode TizenRemote.getToken}.
 * @group Options
 * @typedef {NoConnectOption} GetTokenOptions
 */

/**
 * An object having a `timeout` property; used by various options.
 * @group Utility
 * @typedef TimeoutOption
 * @property {number} [timeout] - Timeout for the request (ms)
 */

/**
 * Options for {@linkcode TizenRemote.sendRequest}.
 * @group Options
 * @typedef {NoTokenOption & NoConnectOption & TimeoutOption} SendRequestOptions
 */

/**
 * @internal
 * @typedef NewTokenMessage
 * @property {typeof constants.TOKEN_EVENT} event
 * @property {WithToken} data
 */

/**
 * @internal
 * @typedef WithToken
 * @property {string} token
 */

/**
 * The shape of the on-disk token cache
 * @internal
 * @typedef {Record<string,WithToken>} TokenCache
 */

/**
 * @typedef {import('./types').TizenRemoteOptions} TizenRemoteOptions
 */
