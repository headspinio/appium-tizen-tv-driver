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
  terminateApp,
  launchApp,
  removeForwardedPort,
  deviceCapabilities
} from './cli/sdb';
import {tizenInstall, tizenRun, tizenUninstall} from './cli/tizen';
import {desiredCapConstraints} from './desired-caps';
import {getKeyData, isRcKeyCode} from './keymap';
import log from './logger';
import {AsyncScripts, SyncScripts} from './scripts';
import { util } from 'appium/support';

const BROWSER_APP_ID = 'org.tizen.browser';
const GALLERY_APP_ID = 'com.samsung.tv.gallery';
const DEFAULT_APP_LAUNCH_CANDIDATES = [
  BROWSER_APP_ID,
  GALLERY_APP_ID
];

const DEFAULT_APP_LAUNCH_COOLDOWN = 3000;

/**
 * To get chrome version from the browser info.
 */
const VERSION_PATTERN = /([\d.]+)/;

/**
 * Minimal chrome browser for autodownload.
 * Chromedriver for older than this chrome version could have an issue
 * to raise no chrome binary error.
 */
const MIN_CHROME_MAJOR_VERSION = 58;
const MIN_CHROME_VERSION = 'Chrome/58.0.3029.0';

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
 * Use '5.0' platform version to handle the session is for newer device if it was not available.
 * https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html
 */
const DEFAULT_PLATFORM_VERSION = '5.0';


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
 * App extension for tizen tv applications
 */
const APP_EXTENSION = '.wgt';

/**
 * @type {import('@appium/types').RouteMatcher[]}
 */
const NO_PROXY = [
  ['POST', new RegExp('^/session/[^/]+/appium')],
  ['GET', new RegExp('^/session/[^/]+/appium')],
  ['GET', new RegExp('^/session/[^/]+/context')],
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
    'tizen: activateApp': Object.freeze({
      command: 'tizentvActivateApp',
      params: {required: ['appPackage'], optional: ['debug']},
    }),
    'tizen: terminateApp': Object.freeze({
      command: 'tizentvTerminateApp',
      params: {required: ['pkgId']},
    }),
    'tizen: clearApp': Object.freeze({
      command: 'tizentvClearApp',
      params: {},
    }),

  });

  /** @type {TizenRemote|undefined} */
  #remote;

  /** @type {number[]} */
  #forwardedPorts;

  /** @type {number[]} port forwards for chromedriver usage*/
  #forwardedPortsForChromedriver;

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

  /** @type {string}  Tizen OS platform version*/
  #platformVersion = DEFAULT_PLATFORM_VERSION;


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
    this.#forwardedPortsForChromedriver = [];
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

    // Raise an error if the `sdb capabilities` might raise an exception
    const deviceCaps = await deviceCapabilities({udid: this.opts.udid});
    // @ts-ignore to avoid error for platform_version
    this.#platformVersion = deviceCaps?.platform_version || DEFAULT_PLATFORM_VERSION;
    // @ts-ignore to avoid error for platform_version
    if (deviceCaps?.platform_version) {
      log.info(`The Tizen platform version is ${this.#platformVersion}`);
    } else {
      log.info(`The Tizen platform version is unknown, using ${DEFAULT_PLATFORM_VERSION} as preset version.`);
    }

    if (caps.rcOnly && caps.rcMode !== RC_MODE_REMOTE) {
      log.info(`The rcMode capability was not set to remote but we are in rcOnly mode, so ` +
               `forcing it to remote`);
      caps.rcMode = this.opts.rcMode = RC_MODE_REMOTE;
    }

    // At least tizen tv platform 2.5 and lower should support rcMode only.
    if (util.compareVersions(this.#platformVersion, '<', '3')) {
      if (caps.rcMode === RC_MODE_REMOTE) {
        log.info(`The ${this.opts.udid} Tizen platform version supports only rcOnly mode.`);
        caps.rcOnly = true;
      } else {
        throw new errors.SessionNotCreatedError(
          `The session needs to be 'appium:rcMode': 'remote' because the Tizen ${this.#platformVersion} version ` +
            `is WebKit based engine. It does not work for Chromium based toolchains like WebInspector and chromedriver.`
        );
      }
    }

    if (caps.app) {
      caps.app = await this.helpers.configureApp(caps.app, [APP_EXTENSION]);
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
        // fast cleanup
        if (!caps.noReset) {
          const appInstalled = await this.#isAppInstalled(caps.appPackage);
          try {
            await tizenUninstall(
              /** @type {import('type-fest').SetRequired<typeof caps, 'appPackage'>} */ (caps)
            );
          } catch (e) {
            // Can be ignored. The next installation command will raise an error if this occurs exact error.
            log.warn(`It might be failed to uninstall ${caps.appPackage}. Please uninstall the installed app by manual if needed. Error: ${e.message}`);
          }

          // Double check if the app was uninstalled successfully.
          if (appInstalled && await this.#isAppInstalled(caps.appPackage)) {
            log.warn(`The package ${caps.appPackage} still remains on the device ${caps.udid}. Please uninstall the installed app by manual if needed. ` +
              `sdb/tizen CLI or the device could be weird for the package.`);
          }
        }
        // XXX this is for typescript
        await tizenInstall({...caps, app: caps.app});
      } else if (!(caps.powerCyclePostUrl && caps.fullReset) && !caps.rcOnly) {
        // if the user wants to run an existing app, it might already be running and therefore we
        // can't start it. But if we launch another app, it will kill any already-running app. So
        // launch the browser. Of course we don't need to do this if we already power cycled the
        // TV, or if we're in rcOnly mode.
        try {
          await this.#launchExistingAppInForeground(caps.udid, caps.appPackage);
        } catch (e) {
          throw new errors.SessionNotCreatedError(`Failed to launch non ${caps.appPackage} package to bring the package process ends. Error: ${e.message}`);
        }
      }
    }

    if (caps.appPackage) {
      await this.#isAppInstalled(caps.appPackage);
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

      await this.startChromedriver({
        debuggerPort: localDebugPort,
        executable: /** @type {string} */ (caps.chromedriverExecutable),
        executableDir: /** @type {string} */ (caps.chromedriverExecutableDir),
        isAutodownloadEnabled: /** @type {Boolean} */ (this.#isChromedriverAutodownloadEnabled()),
        verbose: /** @type {Boolean|undefined} */ (caps.showChromedriverLog),
      });
      this.#forwardedPortsForChromedriver.push(localDebugPort);

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
   * Runs "tizen run -p <package>" command to bring the app foreground.
   *
   * @param {string} udid
   * @param {string?} appPackage
   */
  async #launchExistingAppInForeground(udid, appPackage) {
    log.info(`Attempt to launch existing apps from candidates.`);
    for (const pkgId of DEFAULT_APP_LAUNCH_CANDIDATES) {
      if (appPackage === pkgId) {
        continue;
      }

      try {
        await tizenRun({appPackage: pkgId, udid});
        log.info(`${pkgId} started successfully`);
        return;
      } catch (e) {
        log.info(`Failed to run ${pkgId} as ${e.message}. Attempt to the next package from candidate.`);
      }
    }

    // Apps such as "org.tizen.homesetting" succeeds in launching with the tzien run command,
    // but nothing is shown on the screen. It might not help to
    throw new Error(
      `None of ${DEFAULT_APP_LAUNCH_CANDIDATES.join(',')} existed on the device was launchable.`
    );
  }

  /**
   *
   * @param {StrictTizenTVDriverCaps} caps
   * @param {string|undefined} debugAppPackage Use the given app pacakge prior than the caps's one
   * @returns {Promise<number>}
   */
  async setupDebugger(caps, debugAppPackage = undefined) {
    let remoteDebugPort;

    if (!caps.useOpenDebugPort) {
      try {
        const {
          udid,
          appPackage
        } = caps;
        remoteDebugPort = await debugApp(
          /** @type {import('type-fest').SetRequired<typeof caps, 'appPackage'>} */ (
            {udid, appPackage: debugAppPackage || appPackage}
          ),
          this.#platformVersion
        );
      } catch (e) {
        // While the app was debuggable, the `debug` command could succeed. Then the device could be weird. It may require the device config check.
        throw new errors.SessionNotCreatedError(`Failed to launch ${caps.appPackage} as debug mode. It might not be debuggable, or the device condition was weird. Original error: ${e.message}`);
      }
    } else {
      remoteDebugPort = caps.useOpenDebugPort;
    }

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
   * @typedef BrowserVersionInfo
   * @property {string} Browser
   * @property {string} Protocol-Version
   * @property {string} User-Agent
   * @property {string} WebKit-Version
   * @property {string} [V8-Version]
   * @property {string} [webSocketDebuggerUrl]
   */

  /**
   * Set chrome version v58.0.3029.0 as the minimal version
   * for autodownload to use proper chromedriver version if
   *     - the 'Browser' info does not have proper chrome version, or
   *     - older than the chromedriver version could raise no Chrome binary found error,
   *       which no makes sense for TV automation usage.
   *
   * @param {BrowserVersionInfo} browserVersionInfo
   * @return {BrowserVersionInfo}
   */
  fixChromeVersionForAutodownload(browserVersionInfo) {
    const chromeVersion = VERSION_PATTERN.exec(browserVersionInfo.Browser ?? '');
    if (!chromeVersion) {
      browserVersionInfo.Browser = MIN_CHROME_VERSION;
      return browserVersionInfo;
    }

    const majorV = chromeVersion[1].split('.')[0];
    if (_.toInteger(majorV) < MIN_CHROME_MAJOR_VERSION) {
      log.warn(`The device chrome version is ${chromeVersion[1]}, ` +
        `which could cause an issue for the matched chromedriver version. ` +
        `Setting ${MIN_CHROME_VERSION} as browser forcefully, ` +
        `but the session would fail to start.`);
      browserVersionInfo.Browser = MIN_CHROME_VERSION;
    }

    return browserVersionInfo;
  }

  /**
   *
   * @param {StartChromedriverOptions} opts
   */
  async startChromedriver({debuggerPort, executable, executableDir, isAutodownloadEnabled, verbose}) {

    const debuggerAddress = `127.0.0.1:${debuggerPort}`;

    let result;
    if (executableDir) {
      // get the result of chrome info to use auto detection.
      try {
        result = await got.get(`http://${debuggerAddress}/json/version`).json();
        log.info(`The response of http://${debuggerAddress}/json/version was ${JSON.stringify(result)}`);
        result = this.fixChromeVersionForAutodownload(result);
        log.info(`Fixed browser info is ${JSON.stringify(result)}`);
        // To respect the executableDir.
        executable = undefined;
      } catch (err) {
        throw new errors.SessionNotCreatedError(
          `Could not get the chrome browser information to detect proper chromedriver version. Error: ${err.message}`
        );
      }
    }

    this.#chromedriver = new Chromedriver({
      // @ts-ignore bad types
      port: await getPort(),
      executable,
      executableDir,
      isAutodownloadEnabled,
      // @ts-ignore
      details: {info: result},
      verbose
    });

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

  /**
   * Cleanup chromedriver related processes such as
   * the app under test via chromedriver and chromedriver itself.
   * @returns {Promise<void>}
   */
  async #cleanupChromedriver() {
    if (!this.#chromedriver) {
      return;
    }

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

  async deleteSession() {
    await this.#cleanupChromedriver();
    await this.#disconnectRemote();
    await this.cleanUpPorts();
    return await super.deleteSession();
  }

  /**
   * Returns whether the session can enable autodownloadd feature.
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

  /**
   * Cleanup ports used only by chromedriver.
   */
  async #cleanUpChromedriverPorts () {
    log.info(`Cleaning up ports which have been forwarded used by chromedriver`);
    for (const localPort of this.#forwardedPortsForChromedriver) {
      await removeForwardedPort({udid: /** @type {string} */ (this.opts.udid), localPort});
      _.pull(this.#forwardedPorts, localPort);
      _.pull(this.#forwardedPortsForChromedriver, localPort);
    }
  }

  /**
   * Cleanup any ports used by this driver instance.
   */
  async cleanUpPorts() {
      log.info(`Cleaning up any ports which have been forwarded`);
      for (const localPort of this.#forwardedPorts) {
      await removeForwardedPort({udid: /** @type {string} */ (this.opts.udid), localPort});
      _.pull(this.#forwardedPorts, localPort);
      _.pull(this.#forwardedPortsForChromedriver, localPort);
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
      if (_.isUndefined(this.opts.sendKeysStrategy)) {
        throw new TypeError(
          `Please specify appium:sendKeysStrategy to set the '${text}'. ` +
            `It should be one of: ${TEXT_STRATEGY_PROXY} or ${TEXT_STRATEGY_REMOTE}`
        );
      }
      throw new TypeError(
        `Attempted to send keys with invalid appium:sendKeysStrategy ` +
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
   * @returns {Promise<[{appName: string, appPackage: string}]|[]>}
   */
  async tizentvListApps() {
    return await listApps({udid: this.opts.udid}, this.#platformVersion);
  }


  /**
   * Launch the given appPackage. The process won't start as a debug mode.
   * @param {string} appPackage
   * @param {boolean} [debug=false] If launch the appPackage with debug mode.
   *                                Then, running chromedriver session will stop.
   * @returns
   */
  async tizentvActivateApp(appPackage, debug = false) {
    return debug
      ? await this.#tizentvActivateAppWithDebug(appPackage)
      : await launchApp({appPackage, udid: this.opts.udid});
  }

  async #tizentvActivateAppWithDebug(appPackage) {
    const {
      chromedriverExecutable,
      chromedriverExecutableDir,
      showChromedriverLog,
    } = this.caps;

    await this.#cleanupChromedriver();
    await this.#cleanUpChromedriverPorts();

    const localDebugPort = await this.setupDebugger(this.caps, appPackage);
    if (!_.isString(chromedriverExecutable) && !_.isString(chromedriverExecutableDir)) {
      throw new errors.InvalidArgumentError(`appium:chromedriverExecutable or appium:chromedriverExecutableDir is required`);
    }

    await this.startChromedriver({
      debuggerPort: localDebugPort,
      executable: /** @type {string} */ (chromedriverExecutable),
      executableDir: /** @type {string} */ (chromedriverExecutableDir),
      isAutodownloadEnabled: /** @type {Boolean} */ (this.#isChromedriverAutodownloadEnabled()),
      verbose: /** @type {Boolean|undefined} */ (showChromedriverLog),
    });
    this.#forwardedPortsForChromedriver.push(localDebugPort);
  }

  /**
   * Terminate the given app package id.
   * @param {string} pkgId
   * @returns
   */
  async tizentvTerminateApp(pkgId) {
    return await terminateApp({udid: this.opts.udid}, pkgId);
  }

  /**
   * Clear the local data of the application under test.
   */
  async tizentvClearApp() {
    log.info('Clearing app local storage & reloading...');
    await this.executeChromedriverScript(SyncScripts.reset);
  }

  /**
   * A dummy implementation to return 200 ok with NATIVE_APP context for
   * webdriverio compatibility. https://github.com/headspinio/appium-roku-driver/issues/175
   *
   * @returns {Promise<string>}
   */
  async getCurrentContext() {
    return 'NATIVE_APP';
  }

  /**
   * Leave log if the appPackage is probably installed. This method returns 'false'
   * if the target device DOES NOT support get 'applist' command such as old models e.g. 2016
   *
   * @param {string} appPackage
   * @returns {Promise<boolean>}
   */
  async #isAppInstalled(appPackage) {
    let installedPackages;
    try {
      installedPackages = (await this.tizentvListApps()).map((installedApp) => installedApp.appPackage);
    } catch (e) {
      log.info(`An error '${e.message}' occurred during checking ${appPackage} existence on the device, ` +
        `but it may be ignorable. Proceeding the app installation.`);
    }
    if (!_.isArray(installedPackages)) {
      return false;
    }
    if (installedPackages.includes(appPackage)) {
      log.info(`${appPackage} is on the device`);
      return true;
    }
    log.info(`${appPackage} might not exist on the device, or the TV model is old thus no installed app information existed.`);
    return false;
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
 * @property {string|undefined} executable
 * @property {string|undefined} executableDir
 * @property {boolean} isAutodownloadEnabled
 * @property {boolean|undefined} verbose
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
