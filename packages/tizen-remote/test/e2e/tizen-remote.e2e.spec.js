/* eslint-disable promise/no-native */

/**
 * This test suite checks the interaction of the lib with a WebSocket server.
 *
 * If the following env variables are present, the test suite will use them:
 *
 * - `TEST_TIZEN_REMOTE_HOST`: The host of the WebSocket server.
 * - `TEST_TIZEN_REMOTE_PORT`: The port of the WebSocket server.
 *
 * If the above env variables are _not_ present, a mock server will be started on a random port.
 *
 * This is optional:
 *
 * - `TEST_TIZEN_REMOTE_TOKEN`: The token to use for the WebSocket server
 *
 * Tokens are associated with "names", and the default name in this module is `Appium`.
 *
 * @module
 */

import {createSandbox} from 'sinon';
import getPort from 'get-port';
import {TestWSServer} from './server';
import unexpected from 'unexpected';
import {constants, Event, KeyCmd, Keys, TizenRemote} from '../../lib/tizen-remote';
import d from 'debug';
import unexpectedSinon from 'unexpected-sinon';
import unexpectedEventEmitter from 'unexpected-eventemitter';
import {Env} from '@humanwhocodes/env';
import {promises as fs} from 'node:fs';

const env = new Env();

const HOST = /** @type {string} */ (env.get('TEST_TIZEN_REMOTE_HOST', '127.0.0.1'));
const PORT = env.get('TEST_TIZEN_REMOTE_PORT');
const TOKEN = env.get('TEST_TIZEN_REMOTE_TOKEN');

const debug = d('tizen-remote:test:e2e:ws');

const expect = unexpected.clone().use(unexpectedSinon).use(unexpectedEventEmitter);

describe('websocket behavior', function () {
  /** @type {TestWSServer} */
  let server;

  /** @type {number} */
  let port;

  /** @type {TizenRemote} */
  let remote;

  /** @type {sinon.SinonSandbox} */
  let sandbox;

  /** @type {import('../../lib/types').TizenRemoteOptions} */
  let remoteOpts;

  /** @type {string|undefined} */
  let token;

  /**
   * Connects, gets a token, disconnects.
   * @param {number} port
   * @returns {Promise<string|undefined>}
   */
  async function getInitialToken(port) {
    const remote = new TizenRemote(HOST, {
      port,
    });
    try {
      return await remote.getToken();
    } finally {
      await remote.disconnect();
    }
  }

  before(async function () {
    // if PORT is set, we have some server running already.
    if (PORT) {
      this.timeout('1m');
      port = Number(PORT);
      if (TOKEN) {
        token = TOKEN;
      } else {
        debug('[SETUP] Getting token from %s:%d; this may be slow...', HOST, port);
        token = await getInitialToken(port);
        debug('[SETUP] Got token: %s', token);
      }
    } else {
      this.timeout('10s');
      port = await getPort();
      if (TOKEN) {

        token = TOKEN;
      } else {
        server = new TestWSServer({
          host: HOST,
          port,
          path: constants.API_PATH_V2,
        });
        try {
          debug('[SETUP] Getting token from %s:%d...', HOST, port);
          token = await getInitialToken(port);
          debug('[SETUP] Got token: %s', token);
        } finally {
          await server.stop();
        }
      }
    }
  });

  beforeEach(function () {
    sandbox = createSandbox();
    if (!PORT) {
      server = new TestWSServer({
        host: HOST,
        port,
        path: constants.API_PATH_V2,
      });
    }
    remoteOpts = {
      port,
      token,
    };
  });

  afterEach(async function () {
    sandbox.restore();
    if (remote?.isConnected) {
      try {
        debug('[CLEANUP] Disconnecting from remote attached to %s:%d', HOST, port);
        await remote.disconnect();
      } catch {}
    }
    if (server) {
      debug('[CLEANUP] Stopping server listening on %s:%d', HOST, port);
      try {
        await server.stop();
      } catch {}
    }
  });

  it('should connect', async function () {
    remote = new TizenRemote(HOST, remoteOpts);
    await remote.connect();
    expect(remote.isConnected, 'to be true');
  });

  describe('connection behavior', function () {
    describe('token negotiation', function () {
      describe('when persistence is disabled', function() {
        beforeEach(function() {
          remoteOpts.persistToken = false;
        });
        describe('when the remote has no token', function () {
          beforeEach(function () {
            if (!server) {
              return this.skip();
            }
            remoteOpts.token = undefined;
            remote = new TizenRemote(HOST, remoteOpts);
          });

          it('should request a token from the server', async function () {
            return await expect(() => remote.connect(), 'to emit from', remote, Event.TOKEN);
          });

          describe('when the request time exceeds "tokenTimeout"', function () {
            beforeEach(function () {
              remoteOpts.tokenTimeout = 1;
              remote = new TizenRemote(HOST, remoteOpts);
            });
            it('should reject', async function () {
              return await expect(
                () => remote.connect(),
                'to be rejected with error satisfying',
                /did not receive token in 1ms/i
              );
            });
          });
        });
        describe('when the remote has a token', function () {
          beforeEach(function () {
            remote = new TizenRemote(HOST, remoteOpts);
          });
          it('should not request a token from the server', async function () {
            return await expect(remote.connect(), 'not to emit from', remote, Event.TOKEN);
          });
        });
      });
    });

    describe('when connection fails', function () {
      beforeEach(async function () {
        if (!server) {
          // TODO: figure out how to test this when we do not have a mock server
          return this.skip();
        }
        // stop the currently-listening server entirely
        await server.stop();
      });

      describe('when given an explicit number of retries', function () {
        it('should retry an explicit number of times', async function () {
          this.timeout('5s');
          remote = new TizenRemote(HOST, remoteOpts);

          // use sinon here, as unexpected-eventemitter cannot currently assert
          // an event was emitted more than once
          const stub = sandbox.stub();
          remote.on(Event.CONNECTING, stub);
          await expect(remote.connect(), 'to be rejected with error satisfying', /giving up/i);
          expect(stub, 'was called thrice');
        });
      });
    });
  });

  describe('disconnection behavior', function () {
    beforeEach(function () {
      remote = new TizenRemote(HOST, remoteOpts);
    });

    describe('when connected', function () {
      it('should fulfill', async function () {
        await remote.connect();
        return expect(remote.disconnect(), 'to be fulfilled');
      });
    });

    describe('when disconnected', function () {
      it('should fulfill', async function () {
        await remote.connect();
        await remote.disconnect();
        return expect(remote.disconnect(), 'to be fulfilled');
      });
    });

    describe('when never connected', function () {
      it('should fulfill', function () {
        return expect(remote.disconnect(), 'to be fulfilled');
      });
    });

    describe('when already disconnecting', function () {
      it('should fulfill', async function () {
        await remote.connect();
        return expect(Promise.all([remote.disconnect(), remote.disconnect()]), 'to be fulfilled');
      });
    });

    describe('when unexpectedly disconnected', function () {
      beforeEach(function () {
        if (!server) {
          // TODO: figure out how to test this when we do not have a mock server
          return this.skip();
        }
      });

      describe('when auto-reconnect is enabled', function () {
        it('should auto-reconnect', async function () {
          this.timeout('5s');
          await remote.connect();
          return new Promise((resolve) => {
            remote.once(Event.DISCONNECT, () => {
              remote.on(Event.CONNECT, () => {
                resolve();
              });
            });
            for (const client of server.clients) {
              client.terminate();
            }
          });
        });

        describe('when the server is unreachable', function () {
          it('should auto-reconnect with retries', async function () {
            this.timeout('10s');
            remote.on(Event.RETRY, (attempt) => {
              debug('[RETRY] Attempt %d', attempt);
            });
            await remote.connect();
            return new Promise((resolve) => {
              remote.once(Event.DISCONNECT, () => {
                remote.on(Event.ERROR, () => {
                  resolve();
                });
              });
              server.stop();
            });
          });
        });
      });

      describe('when auto-reconnect is disabled', function () {
        beforeEach(function () {
          remote = new TizenRemote(HOST, {...remoteOpts, autoReconnect: false});
        });

        it('should not attempt reconnect', async function () {
          this.timeout('5s');
          await remote.connect();

          // devour any error events; these are expected
          remote.on(Event.ERROR, () => {});
          return expect(
            new Promise((resolve) => {
              remote.once(Event.DISCONNECT, resolve);
              for (const client of server.clients) {
                client.terminate();
              }
            }),
            'not to emit from',
            remote,
            Event.CONNECTING
          );
        });
      });
    });
  });

  describe('messaging behavior', function () {
    beforeEach(function () {
      remote = new TizenRemote(HOST, remoteOpts);
    });

    describe('when disconnected', function () {
      it('should attempt to connect', async function () {
        return await expect(remote.send('ping'), 'to emit from', remote, Event.CONNECT);
      });

      describe('when "noConnect" option is set', function () {
        it('should reject', async function () {
          return await expect(
            remote.send('ping', {noConnect: true}),
            'to be rejected with error satisfying',
            /cannot send message: "ping"/i
          );
        });
      });
    });

    describe('when connected', function () {
      beforeEach(async function () {
        await remote.connect();
      });

      it('should send the data as JSON', async function () {
        await expect(
          remote.send({foo: 'bar'}),
          'to emit from',
          remote,
          Event.SENT,
          '{"foo":"bar"}'
        );
      });

      describe('when the data cannot be serialized to JSON', function () {
        it('should reject', async function () {
          const bad = {};
          bad.bad = bad;
          return await expect(
            remote.send(bad),
            'to be rejected with error satisfying',
            /circular/i
          );
        });
      });

      describe('when the server emits a "new token" message unprompted', function() {
        beforeEach(function() {
          if (!server) {
            return this.skip();
          }
        });

        it('should update the token', async function() {
          // the new token _must_ be different than the old token!
          const newToken = String(Date.now());

          await /** @type {Promise<void>} */(new Promise((resolve, reject) => {
            remote.once(Event.TOKEN, (token) => {
              try {
                expect(token, 'to be', newToken);
                expect(remote.token, 'to be', newToken);
                resolve();
              } catch (err) {
                reject(err);
              }
            });

            server.broadcast({
              data: {
                token: newToken
              },
              event: constants.TOKEN_EVENT
            });
          }));

          const token = await fs.readFile(/** @type {string} */(remote.tokenCachePath), 'utf8');
          expect(token, 'to equal', newToken);
        });
      });

      describe('keypress behavior', function () {
        it('should send a click command', async function () {
          const data = JSON.stringify({
            method: constants.COMMAND_METHOD,
            params: {
              Cmd: KeyCmd.CLICK,
              DataOfCmd: Keys.ENTER,
              Option: constants.COMMAND_PARAMS_OPTION,
              TypeOfRemote: 'SendRemoteKey',
            },
          });
          await expect(remote.click(Keys.ENTER), 'to emit from', remote, Event.SENT, data);
        });
      });

      describe('send text behavior', function() {
        it('should send text to an input field', async function() {
          const data = JSON.stringify({
            method: constants.COMMAND_METHOD,
            params: {
              Cmd: Buffer.from('wayne').toString('base64'),
              DataOfCmd: 'base64',
              Option: constants.COMMAND_PARAMS_OPTION,
              TypeOfRemote: 'SendInputString',
            },
          });
          await expect(remote.text('wayne'), 'to emit from', remote, Event.SENT, data);
        });
      });
    });
  });
});
