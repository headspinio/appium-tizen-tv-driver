import {Keys, TizenRemote} from '@headspinio/tizen-remote';
import Chromedriver from 'appium-chromedriver';
import {BaseDriver, errors} from 'appium/driver';
import {retryInterval} from 'asyncbox';
import B from 'bluebird';
import getPort from 'get-port';
import got from 'got';
import _ from 'lodash';
import {
  connectDevice,
  debugApp,
  disconnectDevice,
  forwardPort,
  listApps,
  removeForwardedPort,
} from './cli/sdb';
import {tizenInstall, tizenRun, tizenUninstall} from './cli/tizen';
import {desiredCapConstraints} from './desired-caps';
import {getKeyData, isRcKeyCode} from './keymap';
import log from './logger';
import {AsyncScripts, SyncScripts} from './scripts';

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
 * A security flag to enable chromedriver auto download feature
 */
const CHROMEDRIVER_AUTODOWNLOAD_FEATURE = 'chromedriver_autodownload';

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
 * We wait this many ms for the `KeyboardEvent` to propagate from the websocket
 * API to the AUT
 */
export const DEFAULT_RC_KEYPRESS_COOLDOWN = 750;

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

/**
 * Returns `true` if `value` is a positive integer
 * @param {any} value
 * @returns {value is number}
 */
const isPositiveInteger = _.overEvery([_.isNumber, _.isSafeInteger, _.partialRight(_.gt, 0)]);

/**
 * @extends {BaseDriver<import('./desired-caps').TizenTVDriverCapConstraints>}
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
    'tizen: listApps': Object.freeze({
      command: 'tizentvListApps',
      params: {},
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

  /** @type {number} */
  #rcKeypressCooldown = DEFAULT_RC_KEYPRESS_COOLDOWN;

  /**
   *
   * @param {DriverOpts<TizenTVDriverCapConstraints>} [opts]
   * @param {boolean} [shouldValidateCaps]
   */
  constructor(
    opts = /** @type {DriverOpts<TizenTVDriverCapConstraints>} */ ({}),
    shouldValidateCaps = true
  ) {
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
   * @returns {value is keyof typeof TizenTVDriver.executeMethodMap}
   */
  static isExecuteScript(value) {
    return value in TizenTVDriver.executeMethodMap;
  }

  /**
   * @param {W3CTizenTVDriverCaps} w3cCapabilities1
   * @param {W3CTizenTVDriverCaps} [w3cCapabilities2]
   * @param {W3CTizenTVDriverCaps} [w3cCapabilities3]
   * @param {DriverData[]} [driverData]
   * @override
   * @returns {Promise<[string, TizenTVDriverCaps]>}
   */
  async createSession(w3cCapabilities1, w3cCapabilities2, w3cCapabilities3, driverData) {
    let [sessionId, capabilities] = /** @type {[string, TizenTVDriverCaps]} */ (
      await super.createSession(w3cCapabilities1, w3cCapabilities2, w3cCapabilities3, driverData)
    );

    /** @type {TizenTVDriverCaps} */
    const tempCaps = {...DEFAULT_CAPS, ...capabilities};

    // if we have what looks like server address information in the deviceName, spread it out
    // through the udid and deviceAddress capabilities
    if (!tempCaps.deviceAddress || !tempCaps.udid) {
      log.info(
        `No udid and/or deviceAddress provided; attempting to derive from deviceName "${tempCaps.deviceName}"`
      );
      const matches = tempCaps.deviceName?.match(DEVICE_ADDR_IN_DEVICE_NAME_REGEX);
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

      throw new errors.SessionNotCreatedError(
        `The 'appium:udid' capability is required, or 'appium:deviceName' must ` +
          `look like <host>:<port>`
      );
    }

    if (!tempCaps.deviceAddress) {
      throw new errors.SessionNotCreatedError(
        `The 'appium:deviceAddress' capability is required, or 'appium:deviceName' ` +
          `must look like <host>:<port>`
      );
    }

    const caps = /** @type {StrictTizenTVDriverCaps} */ (tempCaps);

    if (caps.rcOnly && caps.rcMode !== RC_MODE_REMOTE) {
      log.info(`The rcMode capability was not set to remote but we are in rcOnly mode, so ` +
               `forcing it to remote`);
      caps.rcMode = this.opts.rcMode = RC_MODE_REMOTE;
    }

    // XXX: remote setup _may_ need to happen after the power-cycling business below.
    if (caps.rcMode === RC_MODE_REMOTE) {
      log.debug(`Received rcKeypressCooldown of type ${typeof caps.rcKeypressCooldown}`);
      if (caps.rcKeypressCooldown !== undefined && !isPositiveInteger(caps.rcKeypressCooldown)) {
        throw new errors.SessionNotCreatedError('appium:rcKeypressCooldown must be a positive integer');
      }
      this.#rcKeypressCooldown = caps.rcKeypressCooldown ?? DEFAULT_RC_KEYPRESS_COOLDOWN;
      this.#remote = new TizenRemote(caps.deviceAddress, {
        ...RC_OPTS,
        token: caps.rcToken,
        debug: Boolean(caps.rcDebugLog),
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
          throw new errors.SessionNotCreatedError('For now, the appPackage capability is required');
        }
        if (!caps.noReset) {
          await tizenUninstall(
            /** @type {import('type-fest').SetRequired<typeof caps, 'appPackage'>} */ (caps)
          );
        }
        // XXX this is for typescript
        await tizenInstall({...caps, app: caps.app});
      } else if (!(caps.powerCyclePostUrl && caps.fullReset) && !caps.rcOnly) {
        // if the user wants to run an existing app, it might already be running and therefore we
        // can't start it. But if we launch another app, it will kill any already-running app. So
        // launch the browser. Of course we don't need to do this if we already power cycled the
        // TV, or if we're in rcOnly mode.
        await tizenRun({appPackage: BROWSER_APP_ID, udid: caps.udid});
      }
    }

    if (caps.appPackage) {
      let installedPackages;
      try {
        installedPackages = (await this.tizentvListApps()).map((installedApp) => installedApp.appPackage);
      } catch (e) {
        log.info(`An error '${e.message}' occurred during checking ${caps.appPackage} existence on the device, ` +
          `but it may be ignorable. Proceeding the app installation.`);
      }
      if (_.isArray(installedPackages) && !installedPackages.includes(caps.appPackage)) {
        throw new errors.SessionNotCreatedError(`${caps.appPackage} does not exist on the device.`);
      }
    }

    try {
      if (caps.rcOnly) {
        log.info(`RC-only mode requested, will not launch app in debug mode`);
        if (caps.appPackage) {
          await tizenRun({appPackage: caps.appPackage, udid: caps.udid});
        } else {
          log.info(`No app package provided, will not launch any apps`);
        }
        return [sessionId, caps];
      }

      const localDebugPort = await this.setupDebugger(caps);

      if (!_.isString(caps.chromedriverExecutable) && !_.isString(caps.chromedriverExecutableDir)) {
        throw new errors.InvalidArgumentError(`appium:chromedriverExecutable or appium:chromedriverExecutableDir is required`);
      }

      log.info(`isAutodownloadEnabled: ${this.#isChromedriverAutodownloadEnabled()}`);

      // dummy
      const details = {
        "Browser": "Chrome/63.0.3239.0",
        "Protocol-Version": "1.2",
        "User-Agent": "Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 TV Safari/537.36",
        "V8-Version": "6.3.294",
        "WebKit-Version": "537.36 (@0ced44f6f658d59a57d436f1a95308d722d235e9)",
        "webSocketDebuggerUrl": "ws://localhost:34305/devtools/browser/8e7e7ced-8e21-495f-8dfe-48bfb6800b6b"
      }

      // TODO:
      // chromedriverExecutableDir or chromedriverExecutable is required.
      await this.startChromedriver({
        debuggerPort: localDebugPort,
        executable: /** @type {string} */ (caps.chromedriverExecutable),
        executableDir: /** @type {string} */ (caps.chromedriverExecutableDir),
        isAutodownloadEnabled: /** @type {Boolean} */ (this.#isChromedriverAutodownloadEnabled()),
        // @ts-ignore
        details: details,
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
   * @param {StrictTizenTVDriverCaps} caps
   * @returns {Promise<number>}
   */
  async setupDebugger(caps) {
    const remoteDebugPort =
      caps.useOpenDebugPort ||
      (await debugApp(
        /** @type {import('type-fest').SetRequired<typeof caps, 'appPackage'>} */ (caps)
      ));
    const localDebugPort = await getPort();
    log.info(`Chose local port ${localDebugPort} for remote debug communication`);
    await forwardPort({
      udid: caps.udid,
      remotePort: Number(remoteDebugPort),
      localPort: localDebugPort,
    });
    this.#forwardedPorts.push(localDebugPort);
    return localDebugPort;
  }

  /**
   *
   * @param {StartChromedriverOptions} opts
   */
  // @ts-ignore
  async startChromedriver({debuggerPort, executable, executableDir, isAutodownloadEnabled, details}) {

    // TODO: need to get 'details' as the result of /version

    this.#chromedriver = new Chromedriver({
      // @ts-ignore bad types
      port: await getPort(),
      executable,
      executableDir,
      isAutodownloadEnabled,
      details,
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
   * @template {ExecuteMethodArgs} [TArgs=unknown[]]
   * @template [TReturn=unknown]
   * @param {string} script - Either a script to run, or in the case of an Execute Method, the name of the script to execute.
   * @param {TArgs} [args]
   * @returns {Promise<TReturn>}
   */
  async execute(script, args) {
    if (TizenTVDriver.isExecuteScript(script)) {
      log.debug(`Calling script "${script}" with args: ${JSON.stringify(args)}`);
      const methodArgs = /** @type {[Record<string,any>]} */ (args);
      return await this.executeMethod(script, [methodArgs[0]]);
    }
    return /** @type {TReturn} */(await this.executeChromedriverScript(script, /** @type {readonly unknown[]} */(args)));
  }

  /**
   * Execute some arbitrary JS via Chromedriver.
   * @template {readonly any[]} [TArgs=unknown[]]
   * @template [TReturn=unknown]
   * @param {((...args: any[]) => TReturn)|string} script
   * @param {TArgs} [args]
   * @returns {Promise<{value: TReturn}>}
   */
  async executeChromedriverScript(script, args) {
    return await this.#executeChromedriverScript('/execute/sync', script, args);
  }

  /**
   * Execute some arbitrary JS via Chromedriver.
   * @template {readonly any[]} [TArgs=unknown[]]
   * @template [TReturn=unknown]
   * @param {string} endpointPath - Relative path of the endpoint URL
   * @param {((...args: any[]) => TReturn)|string} script
   * @param {TArgs} [args]
   * @returns {Promise<{value: TReturn}>}
   */
  async #executeChromedriverScript(endpointPath, script, args) {
    const wrappedScript =
      typeof script === 'string' ? script : `return (${script}).apply(null, arguments)`;
    if (!this.#chromedriver) {
      throw new Error('Chromedriver is not running');
    }
    // @ts-ignore
    return await this.#chromedriver.sendCommand(endpointPath, 'POST', {
      script: wrappedScript,
      args: args ?? [],
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
      // @ts-ignore
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
   * @returns {boolean}
   */
  #isChromedriverAutodownloadEnabled() {
    if (this.isFeatureEnabled(CHROMEDRIVER_AUTODOWNLOAD_FEATURE)) {
      return true;
    }
    this.log.debug(
      `Automated Chromedriver download is disabled. ` +
        `Use '${CHROMEDRIVER_AUTODOWNLOAD_FEATURE}' server feature to enable it`,
    );
    return false;
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
    log.debug(`Waiting ${this.#rcKeypressCooldown}ms...`);
    await B.delay(this.#rcKeypressCooldown);
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
    log.debug(`Waiting ${this.#rcKeypressCooldown}ms...`);
    await B.delay(this.#rcKeypressCooldown);
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
   * @param {string|string[]} text - If an array, will be joined with an empty character
   * @param {string} elId - Element ID
   * @returns {Promise<unknown>}
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
      return await /** @type {TizenRemote} */ (this.#remote).text(text);
    }

    return await this.proxyCommand(`/element/${elId}/value`, 'POST', {text});
  }

  /**
   * Return the list of installed applications with the pair of
   * an application name and the package name.
   * @returns {Promise<[{appName: string, appPackage: string}]>}
   */
  async tizentvListApps() {
    return await listApps({udid: this.opts.udid});
  }
}

export {TizenTVDriver, Keys};

/**
 * A known script identifier (e.g., `tizen: pressKey`)
 * @typedef {keyof TizenTVDriverExecuteMethodMap} ScriptId
 */

/**
 * Capabilities for {@linkcode TizenTVDriver}
 * @typedef {import('@appium/types').DriverCaps<TizenTVDriverCapConstraints>} TizenTVDriverCaps
 */

/**
 * W3C-style caps for {@linkcode TizenTVDriver}
 * @typedef {import('@appium/types').W3CDriverCaps<TizenTVDriverCapConstraints>} W3CTizenTVDriverCaps
 */

/**
 * Possible values of the `rcMode` cap
 * @typedef {typeof RC_MODE_JS | typeof RC_MODE_REMOTE} RcMode

/**
 * @typedef {typeof TizenTVDriver.executeMethodMap} TizenTVDriverExecuteMethodMap
 */

/**
 * Options for {@linkcode TizenTVDriver.startChromedriver}
 * @typedef StartChromedriverOptions
 * @property {string} executable
 * @property {string} executableDir
 * @property {boolean} isAutodownloadEnabled
 * @property {number} debuggerPort
 */

/**
 * @template {import('@appium/types').Constraints} C
 * @typedef {import('@appium/types').DriverOpts<C>} DriverOpts
 */

/**
 * Like {@linkcode TizenTVDriverCaps} but the actually-required stuff is required.
 * @typedef {import('type-fest').SetRequired<TizenTVDriverCaps, 'deviceAddress' | 'udid'>} StrictTizenTVDriverCaps
 */

/**
 * @typedef {import('./desired-caps').TizenTVDriverCapConstraints} TizenTVDriverCapConstraints
 * @typedef {import('@headspinio/tizen-remote').RcKeyCode} RcKeyCode
 * @typedef {import('@appium/types').DriverData} DriverData
 * @typedef {import('@appium/types').ServerArgs} ServerArgs
 */

/**
 * @typedef {readonly any[] | readonly [import('@appium/types').StringRecord] | Readonly<import('@appium/types').StringRecord>} ExecuteMethodArgs
 */
