import _ from 'lodash';
import rewiremock from 'rewiremock/node';
import {createSandbox} from 'sinon';

/**
 * @template {Record<string,any>} Overrides
 * @param {any} value
 * @returns {value is MockGetter<Overrides>}
 */
function isMockGetter(value) {
  return _.isFunction(value);
}

/**
 * Initialize mocks for unit tests.  Returns mocked module, mock objects and sandbox.
 *
 * Registers mock modules for various external deps by default.
 *
 * Don't forget to call `sandbox.restore()` in your `afterEach`!
 * @template Target
 * @template {Record<string,any>} [Overrides={}]
 * @param {ModuleGetter<Target>} loader - Function that loads the module under test
 * @param {Overrides|MockGetter<Overrides>} [overrides] - Function that returns a `Record` of mock module names to mock modules
 */
export function initMocks(loader, overrides = /** @type {Overrides} */ ({})) {
  const sandbox = createSandbox();

  const MockAppiumChromedriverPrototype = {
    start: sandbox.stub(),
    proxyReq: sandbox.stub(),
    jwproxy: {
      proxyCommand: sandbox.stub(),
    },
    sendCommand: sandbox.stub().resolves(),
  };

  const MockAsyncbox = {retryInterval: sandbox.stub().resolves()};

  const MockGetPort = sandbox.stub().resolves(1234);

  const MockGot = sandbox.stub().resolves({body: {result: {value: 'test'}}});

  const MockTizenRemotePrototype = {
    hasToken: sandbox.stub().resolves(true),
    getToken: sandbox.stub().resolves(),
    text: sandbox.stub().resolves(),
    click: sandbox.stub().resolves(),
  };

  /**
   * a module with named exports
   */
  const MockTizenRemote = {
    TizenRemote: _.constant(MockTizenRemotePrototype),
    Keys: {
      ENTER: 'KEY_ENTER',
    },
  };

  /**
   * a module where we're using its default export
   */
  const MockAppiumChromedriver = MockAppiumChromedriverPrototype;

  const baseOverrides = {
    'appium-chromedriver': _.constant(MockAppiumChromedriverPrototype),
    asyncbox: MockAsyncbox,
    'get-port': MockGetPort,
    got: MockGot,
    '@headspinio/tizen-remote': MockTizenRemote,
  };

  /**
   * this is the module we're rewiring
   * @type {Target}
   */
  const target = rewiremock.proxy(loader, (r) =>
    isMockGetter(overrides) ? {...baseOverrides, ...overrides(r)} : {...baseOverrides, ...overrides}
  );

  return {
    target,
    sandbox,
    mocks: {
      MockAppiumChromedriver,
      MockAsyncbox,
      MockGetPort,
      MockGot,
      MockTizenRemote,
    },
  };
}

/**
 * A function that returns a module. Typically it just returns the result of `require(something)`
 * @template Target
 * @callback ModuleGetter
 * @returns {Target}
 */

/**
 * A function which returns a `Record` of mock module names to mock modules
 *
 * See the typedef for {@linkcode rewiremock.proxy}
 * @template {Record<string,any>} Overrides
 * @callback MockGetter
 * @param {ReturnTypeWithArgs<typeof rewiremock, [string]>} r
 * @returns {Overrides}
 */

/**
 * rewiremock does not export its types, and we need its `AnyModuleMock`, which is only accessible via
 * the return type of `rewiremock()`, _but_ that function has 2 overloads, so that's what this is for.
 * @see https://stackoverflow.com/questions/52760509/typescript-returntype-of-overloaded-function
 * @template {(...args: any[]) => any} T
 * @template ARGS_T
 * @typedef {Extract<T extends { (...args: infer A1): infer R1; (...args: infer A2): infer R2; (...args: infer A3): infer R3; } ? [A1, R1] | [A2, R2] | [A3, R3] : T extends { (...args: infer A1): infer R1; (...args: infer A2): infer R2; } ? [A1, R1] | [A2, R2] : T extends { (...args: infer A1): infer R1; } ? [A1, R1] : never, [ARGS_T, any]>[1]} ReturnTypeWithArgs
 */
