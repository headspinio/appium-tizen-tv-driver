import {EventEmitter} from 'node:events';
import {createSandbox} from 'sinon';
import unexpected from 'unexpected';
import unexpectedSinon from 'unexpected-sinon';
import unexpectedEventEmitter from 'unexpected-eventemitter';
import rewiremock from 'rewiremock/node';

const expect = unexpected.clone().use(unexpectedSinon).use(unexpectedEventEmitter);

describe('TizenRemote', function () {
  /**
   * @type {sinon.SinonSandbox}
   */
  let sandbox;

  /** @type {typeof import('../../lib/tizen-remote').TizenRemote} */
  let TizenRemote;

  /** @type {typeof import('../../lib/tizen-remote').WsEvent} */
  let WsEvent;

  /** @type {typeof import('../../lib/tizen-remote').Event} */
  let Event;

  /** @type {typeof import('../../lib/tizen-remote').constants} */
  let constants;

  /** @type { {get: sinon.SinonStub}} */
  let mockEnv;

  /** @type {InstanceType<MockWebSocket>} */
  let mockWs;

  /** @type { {Strongbox: typeof import('@appium/strongbox').Strongbox, strongbox: sinon.SinonStubbedMember<typeof import('@appium/strongbox').strongbox>, BaseItem: typeof import('@appium/strongbox').BaseItem}} */
  let MockStrongbox;

  /** @type {new (url: string, opts?: import('ws').ClientOptions) => EventEmitter & {close: () => void, send: (msg: string, done: ((err?: Error) => void)) => void}} */
  let MockWebSocket;

  /** @type {sinon.SinonStubbedInstance<import('@appium/strongbox').BaseItem<string>>} */
  let mockItem;

  /** @type {sinon.SinonStubbedInstance<import('@appium/strongbox').Strongbox>} */
  let mockStrongbox;

  beforeEach(function () {
    sandbox = createSandbox();

    mockEnv = {get: sandbox.stub()};

    MockWebSocket = class MockWebSocket extends EventEmitter {
      /**
       * @param {string} url
       * @param {import('ws').ClientOptions} [opts]
       */
      constructor(url, opts) {
        super();
        this.url = url;
        this.opts = opts;
        this.readyState = MockWebSocket.CONNECTING;

        this.close = sandbox.stub().callsFake(() => {
          // this happens synchronously
          this.readyState = MockWebSocket.CLOSING;
          setTimeout(() => {
            this.readyState = MockWebSocket.CLOSED;
            this.emit(WsEvent.CLOSE);
          });
        });

        this.send = sandbox.stub().callsFake((msg, done) => {
          setTimeout(() => {
            done();
            setTimeout(() => {
              this.emit(
                WsEvent.MESSAGE,
                JSON.stringify({event: constants.TOKEN_EVENT, data: {token: 'server-token'}})
              );
            });
          });
        });

        this.init();

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        mockWs = this;
      }

      init() {
        setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this.emit(WsEvent.OPEN);
        });
      }

      // copied from WebSocket impl
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
    };

    MockStrongbox = /** @type {any} */ ({});
    ({TizenRemote, WsEvent, Event, constants} = rewiremock.proxy(
      () => require('../../lib/tizen-remote'),
      (r) => ({
        '@humanwhocodes/env': {
          Env: sandbox.stub().returns(mockEnv),
        },
        ws: MockWebSocket,
        'node:fs/promises': r.mockThrough().dynamic(),
        '@appium/strongbox': r
          .mockThrough((prop, value) => {
            if (prop === 'strongbox') {
              MockStrongbox.strongbox = /** @type {typeof MockStrongbox.strongbox} */ (
                sandbox.stub().callsFake(() => {
                  mockStrongbox = sandbox.createStubInstance(MockStrongbox.Strongbox);
                  mockItem = sandbox.createStubInstance(MockStrongbox.BaseItem);
                  Object.defineProperty(mockItem, 'value', {
                    get() {
                      return 'mock-token';
                    },
                    configurable: true
                  });
                  mockStrongbox.createItem.resolves(mockItem);
                  mockStrongbox.createItemWithValue.resolves(mockItem);
                  return mockStrongbox;
                })
              );
              return MockStrongbox.strongbox;
            }
            MockStrongbox[/** @type {keyof typeof MockStrongbox} */ (prop)] = value;
            return value;
          })
          .dynamic(),
      })
    )); // this allows us to change the mock behavior on-the-fly)
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('constructor', function () {
    describe('when not provided a "token" prop in options', function () {
      it('should read the TIZEN_REMOTE_TOKEN env var', function () {
        new TizenRemote('my-host');
        expect(mockEnv.get, 'to have a call satisfying', ['TIZEN_REMOTE_TOKEN']);
      });
    });

    describe('when provided a "token" prop in options', function () {
      it('should not read the TIZEN_REMOTE_TOKEN env var', function () {
        new TizenRemote('my-host', {token: 'foo'});
        expect(mockEnv.get, 'was not called');
      });
    });

    describe('when not provided a "host" parameter', function () {
      it('should throw', function () {
        // @ts-expect-error
        expect(() => new TizenRemote(), 'to throw', /"host" parameter is required/);
      });
    });

    describe('when "port" prop in options is 8002', function () {
      it('should create a URL with the "wss" scheme', function () {
        const remote = new TizenRemote('host', {port: 8002});
        expect(remote.url, 'to start with', 'wss://host');
      });
    });

    describe('when "port" prop in options is not 8002', function () {
      it('should create a URL with the "ws" scheme', function () {
        const remote = new TizenRemote('host', {port: 8080});
        expect(remote.url, 'to start with', 'ws://host');
      });

      describe('when the "ssl" prop in options is true', function () {
        it('should create a URL with the "wss" scheme', function () {
          const remote = new TizenRemote('host', {port: 8080, ssl: true});
          expect(remote.url, 'to start with', 'wss://host');
        });
      });
    });
  });

  describe('instance method', function () {
    /** @type {import('../../lib/tizen-remote').TizenRemote} */
    let remote;

    beforeEach(function () {
      remote = new TizenRemote('host', {handshakeRetries: 0});
    });

    describe('connect()', function () {
      describe('when connection is successful', function () {
        it('should emit CONNECTING event', async function () {
          await expect(() => remote.connect(), 'to emit from', remote, Event.CONNECTING);
        });

        it('should emit CONNECT event', async function () {
          await expect(() => remote.connect(), 'to emit from', remote, Event.CONNECT);
        });

        describe('when a token is needed', function () {
          describe('when token persistence is enabled', function () {
            it('should initialize the token cache', async function () {
              await remote.connect();
              expect(mockStrongbox.createItem, 'was called once');
            });

            describe('when token cache get is a hit', function () {
              it('should retrieve a token from the cache', async function () {
                await remote.connect();
                expect(mockStrongbox.createItem, 'to have a call satisfying', ['host']);
                expect(remote.token, 'to be', mockItem.value);
              });
            });

            describe('when token cache get is a miss', function () {
              beforeEach(function () {
                sandbox.replaceGetter(mockItem, 'value', () => undefined);
              });

              it('should attempt to retrieve the token from the device', async function () {
                await expect(
                  () => remote.connect(),
                  'to emit from',
                  remote,
                  Event.TOKEN,
                  'server-token'
                );
              });

              it('should write the resulting token to the cache', async function () {
                await remote.connect();
                expect(mockItem.write, 'to have a call satisfying', [
                  'server-token'
                ]);
              });
            });
          });

          describe('when token persistence is disabled', function () {
            beforeEach(function () {
              remote = new TizenRemote('host', {persistToken: false});
            });
            it('should attempt to retrieve the token from the device', async function () {
              await expect(() => remote.connect(), 'to emit from', remote, Event.TOKEN);
            });
          });
        });

        describe('when a token is not needed', function () {
          beforeEach(function () {
            remote = new TizenRemote('host', {token: 'user-token'});
          });
          it('should not emit TOKEN event', async function () {
            await expect(() => remote.connect(), 'not to emit from', remote, Event.TOKEN);
          });
        });
      });

      describe('when retrying failed connections is disabled', function () {
        beforeEach(function () {
          remote = new TizenRemote('host', {handshakeRetries: 0});
        });

        describe('when connection fails', function () {
          beforeEach(function () {
            MockWebSocket.prototype.init = sandbox.stub().callsFake(
              /** @this {InstanceType<MockWebSocket>} */
              function () {
                setTimeout(() => {
                  this.emit(WsEvent.ERROR, new Error('connection failed'));
                });
              }
            );
          });

          it('should reject', async function () {
            await expect(() => remote.connect(), 'to be rejected with', /giving up/);
          });
        });
      });
    });

    describe('disconnect()', function () {
      describe('when not connected', function () {
        it('should not emit DISCONNECTING event', async function () {
          await expect(() => remote.disconnect(), 'not to emit from', remote, Event.DISCONNECTING);
        });
      });

      describe('when connected', function () {
        beforeEach(async function () {
          await remote.connect();
        });

        it('should emit DISCONNECTING event', async function () {
          await expect(() => remote.disconnect(), 'to emit from', remote, Event.DISCONNECTING);
        });

        it('should not leak event listeners', async function () {
          await remote.disconnect();
          expect(mockWs.eventNames(), 'to equal', []);
        });

        describe('when called repeatedly', function () {
          it('should not leak event listeners', async function () {
            await Promise.all([remote.disconnect(), remote.disconnect(), remote.disconnect()]);
            expect(mockWs.eventNames(), 'to equal', []);
          });

          it('should only attempt to disconnect once', async function () {
            await Promise.all([remote.disconnect(), remote.disconnect(), remote.disconnect()]);
            expect(mockWs.close, 'was called once');
          });
        });

        describe('when disconnection "fails"', function () {
          beforeEach(function () {
            mockWs.close = sandbox.stub().callsFake(() => {
              setTimeout(() => {
                mockWs.emit(WsEvent.ERROR, new Error('oh no'));
              });
            });
          });
          it('should reject', async function () {
            await expect(remote.disconnect(), 'to be rejected with error satisfying', /oh no/);
          });

          it('should not leak event listeners', async function () {
            try {
              await remote.disconnect();
            } catch {
            } finally {
              expect(mockWs.eventNames(), 'to equal', []);
            }
          });
        });
      });
    });

    describe('unsetToken()', function () {
      describe('when token persistence is enabled', function () {
        it('should remove the token from the cache', async function () {
          await remote.unsetToken();
          expect(mockItem.clear, 'was called once');
        });
      });

      describe('when token persistence is enabled', function () {
        beforeEach(function () {
          remote = new TizenRemote('host', {persistToken: false});
        });

        it('should not touch the cache', async function () {
          await remote.unsetToken();
          expect(mockItem.clear, 'was not called');
        });
      });
    });
  });
});
