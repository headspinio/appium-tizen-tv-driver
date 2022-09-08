import {BaseDriver} from 'appium/driver';
import B from 'bluebird';
import {retryInterval} from 'asyncbox';
import {desiredCapConstraints} from './desired-caps';
import {Keys, TizenRemote} from '@headspinio/tizen-remote';
import {AsyncScripts, SyncScripts} from './scripts';

const RC_TEXT_STRAT = 'rc';
const PROXY_TEXT_STRAT = 'proxy';
const SEND_KEYS_STRATS = [RC_TEXT_STRAT, PROXY_TEXT_STRAT];

import {tizenInstall, tizenUninstall, tizenRun} from './cli/tizen';
import {
  debugApp,
  forwardPort,
  removeForwardedPort,
  connectDevice,
  disconnectDevice,
} from './cli/sdb';
import Chromedriver from 'appium-chromedriver';
import getPort from 'get-port';
import log from './logger';
import got from 'got';
import {getKeyData, isRcKeyCode} from './keymap';

const BROWSER_APP_ID = 'org.tizen.browser';
const DEFAULT_APP_LAUNCH_COOLDOWN = 3000;
/** @type {Pick<TizenTVDriverCaps, 'appLaunchCooldown' | 'rcMode'>} */
const DEFAULT_CAPS = {
  appLaunchCooldown: DEFAULT_APP_LAUNCH_COOLDOWN,
  rcMode: 'js',
};
export const RC_MODE_JS = 'js';
export const RC_MODE_REMOTE = 'remote';
export const DEFAULT_KEYPRESS_DELAY = 200;
export const DEFAULT_LONG_KEYPRESS_DELAY = 1000;

/**
 * @type {import('@appium/types').RouteMatcher[]}
 */
const NO_PROXY = [
  ['POST', new RegExp('^/session/[^/]+/appium')],
  ['GET', new RegExp('^/session/[^/]+/appium')],
  ['POST', new RegExp('^/session/[^/]+/element/[^/]+/value')],
  ['POST', new RegExp('^/session/[^/]+/execute')],
];

export const RC_PORT = 8002;
export const RC_NAME = 'Appium';
export const RC_OPTS = {
  port: RC_PORT,
  name: RC_NAME,
};

/**
 * @extends {BaseDriver}
 */
class TizenTVDriver extends BaseDriver {
  static executeMethodMap = Object.freeze({
    'tizen: pressKey': Object.freeze({
      command: 'pressKey',
      params: {required: ['key']},
    }),
    'tizen: longPressKey': Object.freeze({
      command: 'longPressKey',
      params: {required: ['key'], optional: ['duration']},
    }),
  });

  /** @type {TizenRemote|undefined} */
  #remote;

  /** @type {number[]} */
  #forwardedPorts;

  /** @type {string[]} */
  locatorStrategies;

  /** @type {import('@appium/types').Constraints} */
  #desiredCapConstraints;

  get desiredCapConstraints() {
    return this.#desiredCapConstraints;;
  }

  /** @type {boolean} */
  #jwpProxyActive;

  /**
   * @type {import('@appium/types').RouteMatcher[]}
   */
  #jwpProxyAvoid;

  /**
   *
   * @param {any} [opts]
   * @param {boolean} [shouldValidateCaps]
   */
  constructor(opts = {}, shouldValidateCaps = true) {
    super(opts, shouldValidateCaps);

    this.locatorStrategies = [
      // TODO define tizen locator strategies
    ];

    this.#desiredCapConstraints = desiredCapConstraints;
    this.#jwpProxyActive = false;
    this.#jwpProxyAvoid = [...NO_PROXY];

    this.#forwardedPorts = [];
  }

  /**
   *
   * @param {any} value
   * @returns {value is ScriptId}
   */
  static isExecuteScript(value) {
    return value in TizenTVDriver.executeMethodMap;
  }

  /**
   * @param {W3CCapabilities} w3cCapabilities1
   * @param {W3CCapabilities} [w3cCapabilities2]
   * @param {W3CCapabilities} [w3cCapabilities3]
   * @param {DriverData[]} [driverData]
   * @returns {Promise<[string, any]>}
   */
  async createSession(w3cCapabilities1, w3cCapabilities2, w3cCapabilities3, driverData) {
    let [sessionId, capabilities] = /** @type {[string, TizenTVDriverCaps]} */(await super.createSession(
      w3cCapabilities1,
      w3cCapabilities2,
      w3cCapabilities3,
      driverData
    ));
    const caps = {...DEFAULT_CAPS, ...capabilities};

    if (caps.rcMode === 'remote' && !caps.rcToken) {
      throw new TypeError('Capability "rcToken" required when "rcMode" is "remote"');
    }

    if (caps.rcMode === RC_MODE_REMOTE) {
      this.#remote = new TizenRemote(caps.deviceAddress, {
        ...RC_OPTS,
        token: caps.rcToken,
      });
    }

    if (!caps.useOpenDebugPort) {
      if (caps.powerCyclePostUrl && caps.fullReset) {
        // first disconnect the device if connected
        await disconnectDevice(caps);
        // power cycle the TV and reconnect sdb
        log.info(`Power cycling device`);
        await got.post(caps.powerCyclePostUrl);
        log.info(`Waiting for device to be ready...`);
        // TODO shouldn't be hard-coded, maybe there's something we can ping
        await B.delay(30000); // wait for tv to restart
        await retryInterval(3, 2000, connectDevice, caps);
      }

      if (caps.app) {
        if (!caps.appPackage) {
          // TODO extract appPackage from app if user did not include it, so we don't need to require
          // it
          throw new Error('For now, the appPackage capability is required');
        }
        if (!caps.noReset) {
          await tizenUninstall(caps);
        }
        // XXX this is for typescript
        await tizenInstall({...caps, app: caps.app});
      } else if (!(caps.powerCyclePostUrl && caps.fullReset)) {
        // if the user wants to run an existing app, it might already be running and therefore we
        // can't start it. But if we launch another app, it will kill any already-running app. So
        // launch the browser. Of course we don't need to do this if we already power cycled the
        // TV.
        await tizenRun({appPackage: BROWSER_APP_ID, udid: caps.udid});
      }
    }

    try {
      const localDebugPort = await this.setupDebugger(caps);

      await this.startChromedriver({
        debuggerPort: localDebugPort,
        executable: /** @type {string} */(caps.chromedriverExecutable),
      });

      if (!caps.noReset) {
        log.info('Waiting for app launch to take effect');
        await B.delay(/** @type {number} */(caps.appLaunchCooldown));
        log.info('Clearing app local storage & reloading...');
        await this.executeChromedriverScript(SyncScripts.reset);
        log.info('Waiting for app launch to take effect again post-reload');
        await B.delay(/** @type {number} */(caps.appLaunchCooldown));
      }
      return [sessionId, caps];
    } catch (e) {
      await this.cleanUpPorts();
      throw e;
    }
  }

  /**
   *
   * @param {TizenTVDriverCaps} caps
   * @returns {Promise<number>}
   */
  async setupDebugger(caps) {
    const remoteDebugPort = caps.useOpenDebugPort || (await debugApp(caps));
    const localDebugPort = await getPort();
    log.info(`Chose local port ${localDebugPort} for remote debug communication`);
    await forwardPort({
      udid: caps.udid,
      remotePort: remoteDebugPort,
      localPort: localDebugPort,
    });
    this.#forwardedPorts.push(localDebugPort);
    return localDebugPort;
  }

  /**
   *
   * @param {StartChromedriverOptions} opts
   */
  async startChromedriver({debuggerPort, executable}) {
    this.chromedriver = new Chromedriver({
      port: await getPort(),
      executable,
    });

    const debuggerAddress = `127.0.0.1:${debuggerPort}`;

    await this.chromedriver.start({
      'goog:chromeOptions': {
        debuggerAddress,
      },
    });
    this.proxyReqRes = this.chromedriver.proxyReq.bind(this.chromedriver);
    this.proxyCommand = this.chromedriver.jwproxy.proxyCommand.bind(this.chromedriver);
    this.#jwpProxyActive = true;
  }

  /**
   * Given a script of {@linkcode ScriptId} or some arbitrary JS, figure out
   * which it is and run it.
   *
   * @template [TArg=any]
   * @template [TReturn=unknown]
   * @template {import('type-fest').LiteralUnion<ScriptId, string>} [S=string]
   * @param {S} script
   * @param {S extends ScriptId ? [Record<string,any>] : TArg[]} args
   * @returns {Promise<S extends ScriptId ? import('type-fest').AsyncReturnType<ExecuteMethod<S>> : {value: TReturn}>}
   */
  async execute(script, args) {
    if (TizenTVDriver.isExecuteScript(script)) {
      log.debug(`Calling script "${script}" with arg ${JSON.stringify(args[0])}`);
      return await this.executeMethod(script, [args[0]]);
    }
    return await /** @type {Promise<S extends ScriptId ? import('type-fest').AsyncReturnType<ExecuteMethod<S>> : {value: TReturn}>} */ (
      this.executeChromedriverScript(script, args)
    );
  }

  /**
   * Execute some arbitrary JS via Chromedriver.
   * @template [TReturn=any]
   * @template [TArg=any]
   * @param {((...args: any[]) => TReturn)|string} script
   * @param {TArg[]} [args]
   * @returns {Promise<{value: TReturn}>}
   */
  async executeChromedriverScript(script, args = []) {
    return await this.#executeChromedriverScript('/execute/sync', script, args);
  }

  /**
   * Execute some arbitrary JS via Chromedriver.
   * @template [TReturn=unknown]
   * @template [TArg=any]
   * @param {string} endpointPath - Relative path of the endpoint URL
   * @param {((...args: any[]) => TReturn)|string} script
   * @param {TArg[]} [args]
   * @returns {Promise<{value: TReturn}>}
   */
  async #executeChromedriverScript(endpointPath, script, args = []) {
    const wrappedScript =
      typeof script === 'string' ? script : `return (${script}).apply(null, arguments)`;
    return await this.chromedriver.sendCommand(endpointPath, 'POST', {
      script: wrappedScript,
      args,
    });
  }

  /**
   * Execute some arbitrary JS via Chromedriver.
   * @template [TReturn=unknown]
   * @template [TArg=any]
   * @param {((...args: any[]) => TReturn)|string} script
   * @param {TArg[]} [args]
   * @returns {Promise<{value: TReturn}>}
   */
  async executeChromedriverAsyncScript(script, args = []) {
    return await this.#executeChromedriverScript('/execute/async', script, args);
  }

  async deleteSession() {
    if (this.chromedriver) {
      log.debug('Terminating app under test');
      try {
        await this.executeChromedriverScript(SyncScripts.exit);
      } catch (err) {
        log.warn(err);
      }
      log.debug(`Stopping chromedriver`);
      // stop listening for the stopped state event
      this.chromedriver.removeAllListeners(Chromedriver.EVENT_CHANGED);
      try {
        await this.chromedriver.stop();
      } catch (err) {
        log.warn(`Error stopping Chromedriver: ${/** @type {Error} */ (err).message}`);
      }
      this.chromedriver = null;
    }

    if (this.#remote) {
      await this.#remote.disconnect();
      this.#remote = undefined;
    }
    await this.cleanUpPorts();
    return await super.deleteSession();
  }

  async cleanUpPorts() {
    log.info(`Cleaning up any ports which have been forwarded`);
    for (const localPort of this.#forwardedPorts) {
      await removeForwardedPort({udid: /** @type {string} */(this.opts.udid), localPort});
    }
  }

  proxyActive() {
    return this.#jwpProxyActive;
  }

  getProxyAvoidList() {
    return this.#jwpProxyAvoid;
  }

  canProxy() {
    return true;
  }

  /**
   *
   * @param {RcKeyCode} rcKeyCode
   */
  async pressKey(rcKeyCode) {
    if (!isRcKeyCode(rcKeyCode)) {
      throw new TypeError(`Invalid key code: ${rcKeyCode}`);
    }
    if (this.#remote) {
      log.debug(`Clicking key ${rcKeyCode} via remote`);
      return await this.#pressKeyRemote(this.#remote, rcKeyCode);
    }
    log.debug(`Clicking key ${rcKeyCode} via Chromedriver`);
    return await this.#pressKeyJs(rcKeyCode);
  }

  /**
   * Mimics a keypress via {@linkcode document.dispatchEvent}.
   * @param {RcKeyCode} rcKeyCode
   * @param {number} [duration]
   */
  async #pressKeyJs(rcKeyCode, duration = DEFAULT_KEYPRESS_DELAY) {
    const {code, key} = getKeyData(rcKeyCode);
    if (!code && !key) {
      throw new Error(`Invalid key code: ${rcKeyCode}`);
    }
    return await this.executeChromedriverAsyncScript(AsyncScripts.pressKey, [
      code,
      key,
      duration,
    ]);
  }

  /**
   * Mimics a keypress via Tizen Remote API.
   * @param {TizenRemote} remote
   * @param {RcKeyCode} key
   */
  async #pressKeyRemote(remote, key) {
    return await remote.click(key);
  }

  /**
   * Mimics a long keypress via Tizen Remote API
   * @param {TizenRemote} remote
   * @param {RcKeyCode} rcKeyCode
   * @param {number} [duration]
   */
  async #longPressKeyRemote(remote, rcKeyCode, duration = 1000) {
    await remote.press(rcKeyCode);
    await B.delay(duration);
    await remote.release(rcKeyCode);
  }

  /**
   *
   * @param {RcKeyCode} key
   * @param {number} [duration]
   */
  async longPressKey(key, duration = DEFAULT_LONG_KEYPRESS_DELAY) {
    if (this.#remote) {
      return await this.#longPressKeyRemote(this.#remote, key, duration);
    }
    return await this.#pressKeyJs(key, duration);
  }

  /**
   * Sets the value of a text input box
   * @param {string} text
   * @param {string} elId
   * @returns
   */
  async setValue(text, elId) {
    if (!SEND_KEYS_STRATS.includes(this.opts.sendKeysStrategy)) {
      throw new Error(
        `Attempted to send keys with invalid sendKeysStrategy ` +
          `'${this.opts.sendKeysStrategy}'. It should be one of: ` +
          JSON.stringify(SEND_KEYS_STRATS)
      );
    }

    if (this.opts.sendKeysStrategy === RC_TEXT_STRAT) {
      if (Array.isArray(text)) {
        text = text.join('');
      }
      await B.delay(800);
      if (this.#remote) {
        await this.#remote.text(text);
      }
      await this.pressKey(Keys.ENTER);
      await B.delay(800);
      return;
    }

    return await this.proxyCommand(`/element/${elId}/value`, 'POST', {text});
  }
}

export {TizenTVDriver, Keys};
export default TizenTVDriver;

/**
 * @typedef {keyof TizenTVDriverExecuteMethodMap} ScriptId
 * @typedef {BaseTizenTVDriverCaps & Capabilities} TizenTVDriverCaps
 * @typedef {import('@appium/types').AppiumW3CCapabilities & NamespacedObject<BaseTizenTVDriverCaps>} TizenTVDriverW3CCaps
 * @typedef {typeof RC_MODE_JS | typeof RC_MODE_REMOTE} RcMode
 * @typedef {typeof TizenTVDriver.executeMethodMap} TizenTVDriverExecuteMethodMap
 */

/**
 * @typedef StartChromedriverOptions
 * @property {string} executable
 * @property {number} debuggerPort
 */

/**
 * Lookup a method by its script ID.
 * @template {ScriptId} S
 * @typedef {TizenTVDriver[TizenTVDriverExecuteMethodMap[S]['command']]} ExecuteMethod
 */

/**
 * {@linkcode TizenTVDriver}-specific caps
 * @typedef BaseTizenTVDriverCaps
 * @property {string} chromedriverExecutable
 * @property {string} udid
 * @property {string} appPackage
 * @property {string} deviceName
 * @property {string} deviceAddress
 * @property {boolean} [isDeviceApiSsl]
 * @property {number} [useOpenDebugPort]
 * @property {string} [powerCyclePostUrl]
 * @property {string} [rcToken]
 * @property {string} [sendKeysStrategy]
 * @property {RcMode} [rcMode]
 * @property {number} [appLaunchCooldown]
 */

/**
 * Given object `T` and namespace `NS`, return a new object with keys namespaced by `${NS}:`.
 * @template {Record<string,any>} T
 * @template {string} [NS='appium']
 * @typedef {{[K in keyof T as `${NS}:${K & string}`]: T[K]}} NamespacedObject
 */


 /**
 * @typedef {import('@appium/types').Capabilities} Capabilities
 * @typedef {import('@headspinio/tizen-remote').RcKeyCode} RcKeyCode
 * @typedef {import('@appium/types').DriverData} DriverData
 * @typedef {import('@appium/types').W3CCapabilities} W3CCapabilities
 */
