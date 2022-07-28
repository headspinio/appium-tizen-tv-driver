/* eslint-disable promise/no-native */

import {createSandbox} from 'sinon';
import getPort from 'get-port';
import {TestWSServer} from './server';
import unexpected from 'unexpected';
import {constants, Event, Keys, TizenRemote} from '../../lib/index';
import d from 'debug';
import unexpectedSinon from 'unexpected-sinon';
import unexpectedEventEmitter from 'unexpected-eventemitter';

const debug = d('tizen-remote:test:e2e:ws');

const expect = unexpected.clone().use(unexpectedSinon).use(unexpectedEventEmitter);

describe('websocket behavior', function () {
  const HOST = '127.0.0.1';

  /** @type {TestWSServer} */
  let server;

  /** @type {number} */
  let port;

  /** @type {TizenRemote} */
  let remote;

  /** @type {sinon.SinonSandbox} */
  let sandbox;

  /** @type {import('../../lib').TizenRemoteOptions} */
  let remoteOpts;

  beforeEach(async function () {
    sandbox = createSandbox();
    port = await getPort();
    server = new TestWSServer({
      host: HOST,
      port,
      path: constants.API_PATH_V2,
    });
    remoteOpts = {
      host: HOST,
      port,
      name: 'test',
      token: 'hoboken',
    };
    server.once('listening', () => {
      server.on('connection', (ws, req) => {
        ws.on('message', (data) => {
          debug(
            'Message received from %s:%d: %s',
            req.socket.remoteAddress,
            req.socket.remotePort,
            data
          );
        });
      });
    });
  });

  afterEach(async function () {
    sandbox.restore();
    if (remote) {
      try {
        debug('[CLEANUP] Disconnecting from remote attached to %s:%d', HOST, port);
        await remote.disconnect();
      } catch {}
    }
    debug('[CLEANUP] Stopping server listening on %s:%d', HOST, port);
    await server.stop();
  });

  it('should connect', async function () {
    remote = new TizenRemote(remoteOpts);
    await remote.connect();
    expect(remote.isConnected, 'to be true');
  });

  describe('connection behavior', function () {
    describe('when connection fails', function () {
      beforeEach(async function () {
        // stop the currently-listening server entirely
        await server.stop();
      });

      describe('when given an explicit number of retries', function () {
        it('should retry an explicit number of times', async function () {
          this.timeout('5s');
          remote = new TizenRemote(remoteOpts);

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
      remote = new TizenRemote(remoteOpts);
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
              debug('[RETRY] %d', attempt);
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
          remote = new TizenRemote({...remoteOpts, autoReconnect: false});
        });

        it('should not attempt reconnect', async function () {
          this.timeout('5s');
          await remote.connect();

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
      remote = new TizenRemote(remoteOpts);
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
      it('should send the data as JSON', async function () {
        this.timeout('5s');

        // I can simplify this. I just didn't.
        return await expect(
          new Promise((resolve, reject) => {
            server.on('connection', (sock) => {
              sock.on('message', (data) => {
                try {
                  resolve(String(data));
                } catch (err) {
                  reject(err);
                }
              });
            });
            remote
              .connect()
              .then(() => remote.send({foo: 'bar'}))
              .catch(reject);
          }),
          'to be fulfilled with',
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
    });

    describe('keypress behavior', function () {
      it('should send a click command', async function () {
        this.timeout('5s');

        return await expect(
          new Promise((resolve, reject) => {
            server.on('connection', (sock) => {
              sock.on('message', (data) => {
                try {
                  resolve(JSON.parse(String(data)));
                } catch (err) {
                  reject(err);
                }
              });
            });
            remote
              .connect()
              .then(() => remote.click(Keys.ENTER))
              .catch(reject);
          }),
          'to be fulfilled with',
          {
            method: 'ms.remote.control',
            params: {
              Cmd: 'Click',
              DataOfCmd: 'KEY_ENTER',
              Option: 'false',
              TypeOfRemote: 'SendRemoteKey',
            },
          }
        );
      });
    });
  });
});
