import {BaseDriver} from 'appium/driver';
import B from 'bluebird';
import {retryInterval} from 'asyncbox';
import {desiredCapConstraints} from './desired-caps';
import {Keys, TizenRemote} from '@headspinio/tizen-remote';
import {AsyncScripts, SyncScripts} from './scripts';

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

/**
 * RegEx to check if a `deviceAddress` cap contains a device name & port
 */
const DEVICE_ADDR_IN_DEVICE_NAME_REGEX = /^(.+):\d+/;

/**
 * Constant for "rc" text input mode, which uses the Tizen Remote Control API
 */
export const TEXT_STRATEGY_REMOTE = 'rc';

/**
 * Constant for "proxy" text input mode, which uses Chromedriver
 */
export const TEXT_STRATEGY_PROXY = 'proxy';

/**
 * Constant for "js" RC mode, which uses Chromedriver to mimic keypressed
 */
export const RC_MODE_JS = 'js';

/**
 * Constant for "remote" RC mode, which uses the Tizen Remote Control API
 */

export const RC_MODE_REMOTE = 'remote';
/**
 * Platform name of this Driver.  Defined in `package.json`
 */

export const PLATFORM_NAME = 'TizenTV';
/**
 * Default duration of a "regular" keypress in ms.
 */

export const DEFAULT_KEYPRESS_DELAY = 200;

/**
 * Default duration of a "long" keypress in ms.
 */
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

/**
 * Port of websocket server on device; used in "remote" RC mode.
 */
export const RC_PORT = 8002;

/**
 * "Name"
 */
export const RC_NAME = 'Appium';
export const RC_OPTS = {
  port: RC_PORT,
  name: RC_NAME,
};

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

  /** @type {boolean} */
  #jwpProxyActive;

  /** @type {import('@appium/types').RouteMatcher[]} */
  #jwpProxyAvoid;

  /** @type {Chromedriver|undefined} */
  #chromedriver;

  /**
   *
   * @param {ServerArgs} [opts]
   * @param {boolean} [shouldValidateCaps]
   */
  constructor(opts = /** @type {ServerArgs} */ ({}), shouldValidateCaps = true) {
    super(opts, shouldValidateCaps);

    this.locatorStrategies = [
      // TODO define tizen locator strategies
    ];

    this.desiredCapConstraints = desiredCapConstraints;
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
    let [sessionId, capabilities] = /** @type {[string, TizenTVDriverUserCaps]} */ (
      await super.createSession(w3cCapabilities1, w3cCapabilities2, w3cCapabilities3, driverData)
    );

    /** @type {TizenTVDriverUserCaps} */
    const tempCaps = {...DEFAULT_CAPS, ...capabilities};

    // if we have what looks like server address information in the deviceName, spread it out
    // through the udid and deviceAddress capabilities
    if (!tempCaps.deviceAddress || !tempCaps.udid) {
      log.info(`No udid and/or deviceAddress provided; attempting to derive from deviceName "${tempCaps.deviceName}"`);
      const matches = tempCaps.deviceName.match(DEVICE_ADDR_IN_DEVICE_NAME_REGEX);
      if (matches?.length) {
        if (!tempCaps.deviceAddress) {
          tempCaps.deviceAddress = matches[1];
          log.debug(`Setting deviceAddress to "${tempCaps.deviceAddress}"`);
        }
        if (!tempCaps.udid) {
          tempCaps.udid = tempCaps.deviceName;
          log.debug(`Setting udid to "${tempCaps.udid}"`);
        }
      }
    }

    // now we need to ensure that, one way or another, those capabilities were sent in
    if (!tempCaps.udid) {
      throw new Error(
        `The 'appium:udid' capability is required, or 'appium:deviceName' must ` +
          `look like <host>:<port>`
      );
    }

    if (!tempCaps.deviceAddress) {
      throw new Error(
        `The 'appium:deviceAddress' capability is required, or 'appium:deviceName' ` +
          `must look like <host>:<port>`
      );
    }

    const caps = /** @type {TizenTVDriverCaps} */ (tempCaps);

    // XXX: remote setup _may_ need to happen after the power-cycling business below.
    if (caps.rcMode === RC_MODE_REMOTE) {
      this.#remote = new TizenRemote(caps.deviceAddress, {
        ...RC_OPTS,
        token: caps.rcToken,
      });
      // we need to establish a valid token BEFORE chromedriver connects,
      // or we will be booted out of the app once the "approval" modal dialog closes.
      // while the token may not be passed thru caps, it may be in the
      // environment or in a cache.
      if (caps.resetRcToken || !(await this.#remote.hasToken())) {
        log.info('Requesting new token; please wait...');
        await this.#remote.getToken({force: Boolean(caps.resetRcToken)});
      }
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
        executable: /** @type {string} */ (caps.chromedriverExecutable),
      });

      if (!caps.noReset) {
        log.info('Waiting for app launch to take effect');
        await B.delay(/** @type {number} */ (caps.appLaunchCooldown));
        log.info('Clearing app local storage & reloading...');
        await this.executeChromedriverScript(SyncScripts.reset);
        log.info('Waiting for app launch to take effect again post-reload');
        await B.delay(/** @type {number} */ (caps.appLaunchCooldown));
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
    this.#chromedriver = new Chromedriver({
      port: await getPort(),
      executable,
    });

    const debuggerAddress = `127.0.0.1:${debuggerPort}`;

    await this.#chromedriver.start({
      'goog:chromeOptions': {
        debuggerAddress,
      },
    });
    this.proxyReqRes = this.#chromedriver.proxyReq.bind(this.#chromedriver);
    this.proxyCommand = this.#chromedriver.jwproxy.proxyCommand.bind(this.#chromedriver.jwproxy);
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
      const methodArgs = /** @type {[Record<string,any>]} */ (args);
      return await this.executeMethod(script, [methodArgs[0]]);
    }
    return await /** @type {Promise<S extends ScriptId ? import('type-fest').AsyncReturnType<ExecuteMethod<S>> : {value: TReturn}>} */ (
      this.executeChromedriverScript(script, /** @type {TArg[]} */ (args))
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
    return await this.#chromedriver.sendCommand(endpointPath, 'POST', {
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
    if (this.#chromedriver) {
      log.debug('Terminating app under test');
      try {
        await this.executeChromedriverScript(SyncScripts.exit);
      } catch (err) {
        log.warn(err);
      }
      log.debug(`Stopping chromedriver`);
      // stop listening for the stopped state event
      this.#chromedriver.removeAllListeners(Chromedriver.EVENT_CHANGED);
      try {
        await this.#chromedriver.stop();
      } catch (err) {
        log.warn(`Error stopping Chromedriver: ${/** @type {Error} */ (err).message}`);
      }
      this.#chromedriver = undefined;
    }

    await this.#disconnectRemote();
    await this.cleanUpPorts();
    return await super.deleteSession();
  }

  /**
   * If we're in "remote" RC mode, disconnect from the remote server.
   *
   * Eats errors; they are emitted to the logger
   */
  async #disconnectRemote() {
    if (this.#isRemoteRcMode) {
      try {
        await /** @type {TizenRemote} */ (this.#remote).disconnect();
      } catch (err) {
        log.warn(`Error disconnecting remote: ${/** @type {Error} */ (err).message}`);
      }
      this.#remote = undefined;
    }
  }

  async cleanUpPorts() {
    log.info(`Cleaning up any ports which have been forwarded`);
    for (const localPort of this.#forwardedPorts) {
      await removeForwardedPort({udid: /** @type {string} */ (this.opts.udid), localPort});
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
   * This will be `true` if we are in "remote" RC mode _and_ have instantiated a
   * {@linkcode TizenRemote} instance.
   *
   * This getter is not sufficient to determine whether `this.#remote` is defined
   * and cannot be used as a type guard.
   */
  get #isRemoteRcMode() {
    return Boolean(this.opts.rcMode === RC_MODE_REMOTE && this.#remote);
  }

  /**
   * Press a key on the remote control.
   *
   * Referenced in {@linkcode TizenTVDriver.executeMethodMap}
   * @param {RcKeyCode} rcKeyCode
   * @returns {Promise<void>}
   */
  async pressKey(rcKeyCode) {
    if (!isRcKeyCode(rcKeyCode)) {
      throw new TypeError(`Invalid key code: ${rcKeyCode}`);
    }
    if (this.#isRemoteRcMode) {
      log.debug(`Clicking key ${rcKeyCode} via remote`);
      return await this.#pressKeyRemote(rcKeyCode);
    }
    log.debug(`Clicking key ${rcKeyCode} via Chromedriver`);
    await this.#pressKeyJs(rcKeyCode);
  }

  /**
   * Mimics a keypress via {@linkcode document.dispatchEvent}.
   *
   * Also handles "long presses"
   * @param {RcKeyCode} rcKeyCode
   * @param {number} [duration]
   * @returns {Promise<void>}
   */
  async #pressKeyJs(rcKeyCode, duration = DEFAULT_KEYPRESS_DELAY) {
    const {code, key} = getKeyData(rcKeyCode);
    if (!code && !key) {
      throw new Error(`Invalid/unknown key code: ${rcKeyCode}`);
    }
    await this.executeChromedriverAsyncScript(AsyncScripts.pressKey, [code, key, duration]);
  }

  /**
   * Mimics a keypress via Tizen Remote API.
   * @param {RcKeyCode} key
   * @returns {Promise<void>}
   */
  async #pressKeyRemote(key) {
    if (!this.#isRemoteRcMode) {
      throw new TypeError(`Must be in "remote" RC mode to use this method`);
    }
    await /** @type {TizenRemote} */ (this.#remote).click(key);
  }

  /**
   * Mimics a long keypress via Tizen Remote API
   * @param {RcKeyCode} rcKeyCode
   * @param {number} [duration]
   * @returns {Promise<void>}
   */
  async #longPressKeyRemote(rcKeyCode, duration = 1000) {
    if (!this.#isRemoteRcMode) {
      throw new TypeError(`Must be in "remote" RC mode to use this method`);
    }
    const remote = /** @type {TizenRemote} */ (this.#remote);
    await remote.press(rcKeyCode);
    await B.delay(duration);
    await remote.release(rcKeyCode);
  }

  /**
   * "Long press" a key with an optional duration.
   *
   * Default duration is {@linkcode DEFAULT_LONG_KEYPRESS_DELAY}.
   * @param {RcKeyCode} key
   * @param {number} [duration]
   * @returns {Promise<void>}
   */
  async longPressKey(key, duration = DEFAULT_LONG_KEYPRESS_DELAY) {
    if (this.#isRemoteRcMode) {
      return await this.#longPressKeyRemote(key, duration);
    }
    await this.#pressKeyJs(key, duration);
  }

  /**
   * Sets the value of a text input box
   * @param {string} text
   * @param {string} elId
   * @returns
   */
  async setValue(text, elId) {
    if (
      this.opts.sendKeysStrategy !== TEXT_STRATEGY_PROXY &&
      this.opts.sendKeysStrategy !== TEXT_STRATEGY_REMOTE
    ) {
      throw new TypeError(
        `Attempted to send keys with invalid sendKeysStrategy ` +
          `'${this.opts.sendKeysStrategy}'. It should be one of: ` +
          `${TEXT_STRATEGY_PROXY} or ${TEXT_STRATEGY_REMOTE}`
      );
    }

    if (this.#isRemoteRcMode && this.opts.sendKeysStrategy === TEXT_STRATEGY_REMOTE) {
      if (Array.isArray(text)) {
        text = text.join('');
      }
      await /** @type {TizenRemote} */ (this.#remote).text(text);
      await this.pressKey(Keys.ENTER);
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
 * @typedef {import('@appium/types').W3CCapabilities<BaseTizenTVDriverCaps>} TizenTVDriverW3CCaps
 * @typedef {typeof RC_MODE_JS | typeof RC_MODE_REMOTE} RcMode
 * @typedef {typeof TizenTVDriver.executeMethodMap} TizenTVDriverExecuteMethodMap
 */

/**
 * This is {@linkcode TizenTVDriverCaps} with optional {@linkcode BaseTizenTVDriverCaps.udid} and {@linkcode BaseTizenTVDriverCaps.deviceAddress}. These can be
 * derived from `deviceName`.
 * @typedef {import('type-fest').SetOptional<TizenTVDriverCaps, 'udid'|'deviceAddress'>} TizenTVDriverUserCaps
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
 * @property {string} appPackage
 * @property {string} deviceName
 * @property {string} udid
 * @property {string} deviceAddress
 * @property {boolean} [isDeviceApiSsl]
 * @property {number} [useOpenDebugPort]
 * @property {string} [powerCyclePostUrl]
 * @property {string} [rcToken]
 * @property {string} [sendKeysStrategy]
 * @property {RcMode} [rcMode]
 * @property {number} [appLaunchCooldown]
 * @property {boolean} [resetRcToken]
 */

/**
 * Given object `T` and namespace `NS`, return a new object with keys namespaced by `${NS}:`.
 * @template {Record<string,any>} T
 * @template {string} [NS='appium']
 * @typedef {{[K in keyof T as (K extends 'platformName' ? `${K}` : `${NS}:${K & string}`)]: T[K]}} NamespacedObject
 */

/**
 * @typedef {import('@appium/types').Capabilities} Capabilities
 * @typedef {import('@headspinio/tizen-remote').RcKeyCode} RcKeyCode
 * @typedef {import('@appium/types').DriverData} DriverData
 * @typedef {import('@appium/types').W3CCapabilities} W3CCapabilities
 * @typedef {import('@appium/types').ServerArgs} ServerArgs
 */
