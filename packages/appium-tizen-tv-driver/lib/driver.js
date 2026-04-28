import {Keys, TizenRemote} from '@headspinio/tizen-remote';
import {Chromedriver} from 'appium-chromedriver';
import {BaseDriver, errors} from 'appium/driver.js';
import {retryInterval} from 'asyncbox';
import B from 'bluebird';
import getPort from 'get-port';
import got from 'got';
import _ from 'lodash';
import path from 'path';
import os from 'os';
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
} from './cli/sdb.js';
import {tizenInstall, tizenRun, tizenUninstall} from './cli/tizen.js';
import {desiredCapConstraints} from './desired-caps.js';
import {getKeyData, isRcKeyCode} from './keymap.js';
import log from './logger.js';
import {AsyncScripts, SyncScripts} from './scripts.js';
import { util } from 'appium/support.js';
import { CMD_RETRY_MAX, CMD_TIMEOUT_MS } from './cli/helpers.js';

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
 * Default directory for storing Chromedriver executables
 */
const DEFAULT_CHROMEDRIVER_DIR = path.join(os.homedir(), '.appium', 'chromedrivers');


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
 * Constant for "api" RC mode, which uses Tizen TV Input Device API
 */
export const RC_MODE_API = 'api';
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

// don't proxy any 'appium' routes
/**
 * @type {import('@appium/types').RouteMatcher[]}
 */
const NO_PROXY = [
  ['POST', new RegExp('^/session/[^/]+/appium')],
  ['GET', new RegExp('^/session/[^/]+/appium')],
  ['GET', new RegExp('^/session/[^/]+/context')],
  ['POST', new RegExp('^/session/[^/]+/execute/sync')],
  // Element finding routes - intercept to fix invalid locator strategies
  ['POST', new RegExp('^/session/[^/]+/element$')],
  ['POST', new RegExp('^/session/[^/]+/elements$')],
  // Source route - intercept to inject synthetic attributes
  ['GET', new RegExp('^/session/[^/]+/source')],
  // Window routes - override unsupported commands
  ['GET', new RegExp('^/session/[^/]+/window/rect')],
  // Element property routes - override Chromedriver to use JS execution
  ['GET', new RegExp('^/session/[^/]+/element/[^/]+/text')],
  ['GET', new RegExp('^/session/[^/]+/element/[^/]+/size')],
  ['GET', new RegExp('^/session/[^/]+/element/[^/]+/location')],
  ['GET', new RegExp('^/session/[^/]+/element/[^/]+/rect')],
  ['GET', new RegExp('^/session/[^/]+/element/[^/]+/displayed')],
  ['GET', new RegExp('^/session/[^/]+/element/[^/]+/enabled')],
  ['GET', new RegExp('^/session/[^/]+/element/[^/]+/selected')],
  ['GET', new RegExp('^/session/[^/]+/element/[^/]+/attribute/[^/]+')],
  ['GET', new RegExp('^/session/[^/]+/element/[^/]+/property/[^/]+')],
  ['GET', new RegExp('^/session/[^/]+/element/[^/]+/css/[^/]+')],
  ['GET', new RegExp('^/session/[^/]+/element/[^/]+/name')],
  // Element interaction routes - override Chromedriver for better compatibility
  ['POST', new RegExp('^/session/[^/]+/element/[^/]+/click')],
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
 * @extends {BaseDriver<import('./desired-caps.js').TizenTVDriverCapConstraints>}
 */
// @ts-ignore - Type inference issue with nested @appium/types
class TizenTVDriver extends BaseDriver {
  /**
   * Make session discovery a free feature
   * This allows Appium Inspector to work without --allow-insecure flag
   */
  static get freeFeatures() {
    return ['session_discovery'];
  }

  static executeMethodMap = Object.freeze({
    'tizen: pressKey': Object.freeze({
      command: 'pressKey',
      params: {required: ['key']},
    }),
    'mobile: pressKey': Object.freeze({
      command: 'pressKey',
      params: {required: ['key']},
    }),
    'tizen: longPressKey': Object.freeze({
      command: 'longPressKey',
      params: {required: ['key'], optional: ['duration']},
    }),
    'mobile: longPressKey': Object.freeze({
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
    // @ts-ignore - Type mismatch between driver opts and base driver constructor
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

    // Try to auto-connect to the device if not already connected
    try {
      log.info(`Attempting to connect to device '${caps.udid}' via sdb`);
      await connectDevice({
        udid: caps.udid,
        sdbExecTimeout: this.sdbExecTimeout,
        sdbExecRetryCount: this.sdbExecRetryCount
      });
      log.info(`Successfully connected to device '${caps.udid}'`);
    } catch (err) {
      log.warn(`Could not auto-connect to device: ${err.message}. Will attempt to proceed anyway.`);
    }

    // Raise an error if the `sdb capabilities` might raise an exception
    const deviceCaps = await deviceCapabilities({
      udid: this.opts.udid,
      sdbExecTimeout: this.sdbExecTimeout,
      sdbExecRetryCount: this.sdbExecRetryCount
    });
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
        await disconnectDevice({
          udid: caps.udid,
          sdbExecTimeout: this.sdbExecTimeout,
          sdbExecRetryCount: this.sdbExecRetryCount,
        });
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
            await tizenUninstall({
              udid: caps.udid,
              appPackage: caps.appPackage,
              sdbExecTimeout: this.sdbExecTimeout,
              sdbExecRetryCount: this.sdbExecRetryCount,
            });
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
        await tizenInstall({
          app: caps.app,
          udid: caps.udid,
          sdbExecTimeout: this.sdbExecTimeout,
          sdbExecRetryCount: this.sdbExecRetryCount
        });
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
          await tizenRun({
            appPackage: caps.appPackage,
            udid: caps.udid,
            sdbExecTimeout: this.sdbExecTimeout,
            sdbExecRetryCount: this.sdbExecRetryCount,
          });
        } else {
          log.info(`No app package provided, will not launch any apps`);
        }
        return [sessionId, caps];
      }

       const localDebugPort = await this.setupDebugger(caps);

       // Set default chromedriver executable directory if not provided
       if (!_.isString(caps.chromedriverExecutableDir)) {
         caps.chromedriverExecutableDir = DEFAULT_CHROMEDRIVER_DIR;
         log.info(`Using default Chromedriver directory: ${caps.chromedriverExecutableDir}`);
       }

       // Enable autodownload by default unless explicitly disabled
       const autodownloadEnabled = caps.autodownloadEnabled !== false;

       await this.startChromedriver({
         debuggerPort: localDebugPort,
         executable: /** @type {string|undefined} */ (caps.chromedriverExecutable),
         executableDir: /** @type {string} */ (caps.chromedriverExecutableDir),
         isAutodownloadEnabled: autodownloadEnabled,
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
        await tizenRun({
          appPackage: pkgId,
          udid,
          sdbExecTimeout: this.sdbExecTimeout,
          sdbExecRetryCount: this.sdbExecRetryCount,
        });
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
            {
              udid,
              appPackage: debugAppPackage || appPackage,
              sdbExecTimeout: this.sdbExecTimeout,
              sdbExecRetryCount: this.sdbExecRetryCount,
            }
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
      sdbExecTimeout: this.sdbExecTimeout,
      sdbExecRetryCount: this.sdbExecRetryCount,
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
     if (executableDir && !executable) {
       // get the result of chrome info to use auto detection.
       try {
         log.info(`Attempting to connect to Chrome debugger at http://${debuggerAddress}/json/version`);
         result = await got.get(`http://${debuggerAddress}/json/version`).json();
         log.info(`The response of http://${debuggerAddress}/json/version was ${JSON.stringify(result)}`);
         result = this.fixChromeVersionForAutodownload(result);
         log.info(`Fixed browser info is ${JSON.stringify(result)}`);
         // To respect the executableDir.
         executable = undefined;
         if (_.isEmpty(result.Browser)) {
           log.info(`No browser version info was available. If no proper chromedrivers exist in ${executableDir}, the session creation will fail.`);
         }
       } catch (err) {
         log.error(`Failed to connect to Chrome debugger at http://${debuggerAddress}/json/version`);
         log.error(`Error details: ${err.message}`);
         throw new errors.SessionNotCreatedError(
           `Could not get the chrome browser information to detect proper chromedriver version. ` +
           `Please verify:\n` +
           `1. The app is launched and running on the TV\n` +
           `2. The app is debuggable (web-based with debugger enabled)\n` +
           `3. The debugger port ${debuggerPort} is accessible\n` +
           `4. Try accessing http://${debuggerAddress}/json/version from your browser\n` +
           `Original error: ${err.message}`
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

     // XXX: goog:chromeOptions in newer versions, chromeOptions in older
     try {
       log.info(`Starting Chromedriver with debuggerAddress: ${debuggerAddress}`);
       if (result?.Browser) {
         log.info(`TV Chrome version: ${result.Browser}`);
       }
       await this.#chromedriver.start({
         chromeOptions: {
           debuggerAddress,
         },
       });
       log.info(`Chromedriver started successfully`);
     } catch (err) {
       log.error(`Chromedriver failed to start: ${err.message}`);
       const chromeVersion = result?.Browser ? ` (TV Chrome version: ${result.Browser})` : '';
       if (err.message?.includes('ObjectId or executionContextId')) {
         throw new errors.SessionNotCreatedError(
           `Chromedriver could not connect to the app's debugger${chromeVersion}. This usually means:\n` +
           `1. The app hasn't fully loaded yet - try increasing 'appium:appLaunchCooldown' (currently waiting ${this.opts.appLaunchCooldown}ms)\n` +
           `2. The Chrome version on the TV doesn't match the Chromedriver version\n` +
           `3. The app's JavaScript context isn't ready\n` +
           `Verify Chrome version with: curl http://${debuggerAddress}/json/version\n` +
           `Original error: ${err.message}`
         );
       }
       throw new errors.SessionNotCreatedError(
         `Failed to start Chromedriver${chromeVersion}: ${err.message}`
       );
     }
     this.proxyReqRes = this.#chromedriver.proxyReq.bind(this.#chromedriver);
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
    * Injects custom attributes (@text, @bounds, @displayed, @enabled, @focused) into all DOM elements
    * This enables mobile-style XPath selectors like //*[@text='Button']
    * @returns {Promise<number>} Number of elements processed
    */
   async injectElementAttributes() {
     const script = `
       var allElements = document.body.getElementsByTagName('*');
       var count = 0;
       Array.from(allElements).forEach(function(el) {
         var rect = el.getBoundingClientRect();
         var style = window.getComputedStyle(el);
         
         // Calculate bounds in format: [left,top][right,bottom]
         var left = Math.round(rect.left);
         var top = Math.round(rect.top);
         var right = Math.round(rect.right);
         var bottom = Math.round(rect.bottom);
         var boundsStr = '[' + left + ',' + top + '][' + right + ',' + bottom + ']';
         
         el.setAttribute('x', Math.round(rect.left));
         el.setAttribute('y', Math.round(rect.top));
         el.setAttribute('width', Math.round(rect.width));
         el.setAttribute('height', Math.round(rect.height));
         
         // Set bounds attribute in format
         el.setAttribute('bounds', boundsStr);
         el.setAttribute('displayed', el.offsetParent !== null ? 'true' : 'false');
         el.setAttribute('enabled', el.disabled ? 'false' : 'true');
         el.setAttribute('focused', el === document.activeElement ? 'true' : 'false');
         
         // Add text content if available
         var text = el.textContent ? el.textContent.trim() : '';
         if (text && text.length > 0 && text.length < 100) {
           el.setAttribute('text', text.substring(0, 100));
         }
         
         count++;
       });
       return count;
     `;

     try {
       const count = /** @type {number} */ (await this.#executeChromedriverScript('/execute/sync', script, []));
       log.debug(`Injected attributes into ${count} elements`);
       return count;
     } catch (error) {
       log.warn(`Failed to inject element attributes: ${error.message}`);
       return 0;
     }
   }

   /**
    * Get page source - intercepts to inject synthetic attributes into HTML
    * This is critical for Appium Inspector which parses the source XML to populate element attributes
    * @returns {Promise<string>}
    */
   async getPageSource() {
     // Refresh element attributes before returning source
     await this.injectElementAttributes();

     // Now get the modified source
     // @ts-ignore
     const modifiedSource = /** @type {string} */ (await this.#chromedriver.sendCommand('/source', 'GET'));

     return modifiedSource;
   }

   /**
    * Convert unsupported locator strategies to CSS selectors
    * Tizen TV's older Chrome versions don't support W3C "id" locator
    * @param {string} strategy - Original locator strategy
    * @param {string} selector - Original selector value
    * @returns {{strategy: string, selector: string}}
    */
   #convertLocatorStrategy(strategy, selector) {
     // Convert "id" strategy to CSS selector
     if (strategy === 'id') {
       log.debug(`Converting locator strategy from "id" to "css selector" for: ${selector}`);
       return {
         strategy: 'css selector',
         selector: `#${selector}`
       };
     }

     // Convert "name" strategy to CSS selector
     if (strategy === 'name') {
       log.debug(`Converting locator strategy from "name" to "css selector" for: ${selector}`);
       return {
         strategy: 'css selector',
         selector: `[name="${selector}"]`
       };
     }

     // Convert "class name" with spaces or hyphens to CSS selector
     if (strategy === 'class name' && (selector.includes(' ') || selector.includes('-'))) {
       log.warn(`"class name" strategy only accepts a single class (no spaces or hyphens). Converting "${selector}" to CSS selector`);
       const classes = selector.split(/\s+/).filter(c => c.length > 0);
       const cssSelector = classes.map(c => {
         const escaped = c.replace(/([\[\](){}:.<>#@!%^&*+~=|\\\/'"?,])/g, '\\$1');
         return `.${escaped}`;
       }).join('');
       return {strategy: 'css selector', selector: cssSelector};
     }

     // Return as-is for supported strategies (css selector, xpath, tag name, link text, partial link text)
     return {strategy, selector};
   }

   /**
    * Find element - intercepts to fix invalid locator strategies and retry with attribute injection on failure
    * @param {string} strategy - Locator strategy
    * @param {string} selector - Selector value
    * @returns {Promise<import('@appium/types').Element>}
    */
   async findElement(strategy, selector) {
     const converted = this.#convertLocatorStrategy(strategy, selector);
     if (converted.strategy !== strategy) {
       log.info(`Converted locator: "${strategy}":"${selector}" -> "${converted.strategy}":"${converted.selector}"`);
     }

     try {
       // @ts-ignore
       return await this.#chromedriver.sendCommand('/element', 'POST', {
         using: converted.strategy,
         value: converted.selector
       });
     } catch (err) {
       // If element not found and using XPath with @text or other custom attributes,
       // re-inject attributes and retry once
       if (err.message?.includes('no such element') &&
           converted.strategy === 'xpath' &&
           /@(text|bounds|displayed|enabled|x|y|width|height)/.test(converted.selector)) {
         log.info('Element not found with custom attribute selector, re-injecting attributes and retrying');
         await this.injectElementAttributes();
         // @ts-ignore
         return await this.#chromedriver.sendCommand('/element', 'POST', {
           using: converted.strategy,
           value: converted.selector
         });
       }
       throw err;
     }
   }

   /**
    * Find elements - intercepts to fix invalid locator strategies and inject attributes for custom XPath
    * @param {string} strategy - Locator strategy
    * @param {string} selector - Selector value
    * @returns {Promise<import('@appium/types').Element[]>}
    */
   async findElements(strategy, selector) {
     const converted = this.#convertLocatorStrategy(strategy, selector);
     if (converted.strategy !== strategy) {
       log.info(`Converted locator: "${strategy}":"${selector}" -> "${converted.strategy}":"${converted.selector}"`);
     }

     // For XPath with custom attributes, always re-inject before searching
     // This ensures attributes are fresh for queries that expect multiple results
     if (converted.strategy === 'xpath' &&
         /@(text|bounds|displayed|enabled|x|y|width|height)/.test(converted.selector)) {
       await this.injectElementAttributes();
     }

     // @ts-ignore
     return await this.#chromedriver.sendCommand('/elements', 'POST', {
       using: converted.strategy,
       value: converted.selector
     });
   }

   /**
    * Helper to build element object from element ID for Chromedriver
    * @param {string} elementId - Element ID
    * @returns {any}
    */
   #buildElementObject(elementId) {
     // Use both JSONWP and W3C formats for compatibility
     return {
       ELEMENT: elementId,
       'element-6066-11e4-a52e-4f735466cecf': elementId
     };
   }

   /**
    * Get element text - overrides default Chromedriver implementation
    * @param {string} elementId - Element ID
    * @returns {Promise<string>}
    */
   async getText(elementId) {
     const script = `
       var element = arguments[0];
       return element.textContent || element.innerText || '';
     `;
     const result = await this.#executeChromedriverScript('/execute/sync', script, [
       this.#buildElementObject(elementId)
     ]);
     return /** @type {string} */ (result);
   }

   /**
    * Get element size - overrides default Chromedriver implementation
    * @param {string} elementId - Element ID
    * @returns {Promise<{width: number, height: number}>}
    */
   async getSize(elementId) {
     log.info(`[getSize] Getting size for element ${elementId} via JS execution`);
     const script = `
       var element = arguments[0];
       var rect = element.getBoundingClientRect();
       return {
         width: rect.width,
         height: rect.height
       };
     `;
     const result = await this.#executeChromedriverScript('/execute/sync', script, [
       this.#buildElementObject(elementId)
     ]);
     log.info(`[getSize] Result:`, JSON.stringify(result));
     return /** @type {{width: number, height: number}} */ (result);
   }

   /**
    * Get element location - overrides default Chromedriver implementation
    * @param {string} elementId - Element ID
    * @returns {Promise<{x: number, y: number}>}
    */
   async getLocation(elementId) {
     log.info(`[getLocation] Getting location for element ${elementId} via JS execution`);
     const script = `
       var element = arguments[0];
       var rect = element.getBoundingClientRect();
       return {
         x: rect.left,
         y: rect.top
       };
     `;
     const result = await this.#executeChromedriverScript('/execute/sync', script, [
       this.#buildElementObject(elementId)
     ]);
     log.info(`[getLocation] Result:`, JSON.stringify(result));
     return /** @type {{x: number, y: number}} */ (result);
   }

   /**
    * Get element rect (size + location) - overrides default Chromedriver implementation
    * @param {string} elementId - Element ID
    * @returns {Promise<{x: number, y: number, width: number, height: number}>}
    */
   async getElementRect(elementId) {
     const script = `
       var element = arguments[0];
       var rect = element.getBoundingClientRect();
       return {
         x: rect.left,
         y: rect.top,
         width: rect.width,
         height: rect.height
       };
     `;
     const result = await this.#executeChromedriverScript('/execute/sync', script, [
       this.#buildElementObject(elementId)
     ]);
     return /** @type {{x: number, y: number, width: number, height: number}} */ (result);
   }

   /**
    * Check if element is displayed - overrides default Chromedriver implementation
    * @param {string} elementId - Element ID
    * @returns {Promise<boolean>}
    */
   async elementDisplayed(elementId) {
     log.debug(`Checking if element ${elementId} is displayed via JS execution`);
     const script = `
       var element = arguments[0];
       var rect = element.getBoundingClientRect();
       var style = window.getComputedStyle(element);
       return (
         rect.width > 0 &&
         rect.height > 0 &&
         style.display !== 'none' &&
         style.visibility !== 'hidden' &&
         style.opacity !== '0'
       );
     `;
     const result = await this.#executeChromedriverScript('/execute/sync', script, [
       this.#buildElementObject(elementId)
     ]);
     return /** @type {boolean} */ (result);
   }

   /**
    * Check if element is enabled - required for Appium Inspector
    * @param {string} elementId - Element ID
    * @returns {Promise<boolean>}
    */
   async elementEnabled(elementId) {
     const script = `
       var element = arguments[0];
       // Check disabled property and attribute
       if (element.disabled === true) return false;
       if (element.getAttribute('disabled') !== null) return false;
       // Check if element or any parent has disabled attribute
       var current = element;
       while (current && current !== document.body) {
         if (current.disabled === true || current.getAttribute('disabled') !== null) {
           return false;
         }
         current = current.parentElement;
       }
       return true;
     `;
     const result = await this.#executeChromedriverScript('/execute/sync', script, [
       this.#buildElementObject(elementId)
     ]);
     return /** @type {boolean} */ (result);
   }

   /**
    * Check if element is selected - required for Appium Inspector
    * @param {string} elementId - Element ID
    * @returns {Promise<boolean>}
    */
   async elementSelected(elementId) {
     const script = `
       var element = arguments[0];
       // For input elements (checkbox, radio)
       if (element.tagName === 'INPUT' && (element.type === 'checkbox' || element.type === 'radio')) {
         return element.checked === true;
       }
       // For option elements
       if (element.tagName === 'OPTION') {
         return element.selected === true;
       }
       // Check for selected attribute
       return element.getAttribute('selected') !== null;
     `;
     const result = await this.#executeChromedriverScript('/execute/sync', script, [
       this.#buildElementObject(elementId)
     ]);
     return /** @type {boolean} */ (result);
   }

   /**
    * Get element attribute - required for Appium Inspector
    * @param {string} name - Attribute name
    * @param {string} elementId - Element ID
    * @returns {Promise<string|number|null>}
    */
   async getAttribute(name, elementId) {
     const nameLower = name.toLowerCase();

     // For dynamic attributes, compute them fresh to ensure accurate state
     const dynamicAttrs = ['focused', 'displayed', 'enabled'];
     if (dynamicAttrs.includes(nameLower)) {
       const dynamicScript = `
         var element = arguments[0];
         var attrName = arguments[1].toLowerCase();
         if (attrName === 'focused') {
           return element === document.activeElement ? 'true' : 'false';
         }
         if (attrName === 'displayed') {
           return element.offsetParent !== null ? 'true' : 'false';
         }
         if (attrName === 'enabled') {
           return element.disabled ? 'false' : 'true';
         }
         return element.getAttribute(attrName);
       `;
       const result = await this.#executeChromedriverScript('/execute/sync', dynamicScript, [
         this.#buildElementObject(elementId),
         name
       ]);
       return /** @type {string|null} */ (result);
     }

     // Check if this is a positional/dimensional attribute request
     const dimensionalAttrs = ['x', 'y', 'width', 'height'];
     if (dimensionalAttrs.includes(nameLower)) {
       // Try to get actual attribute first
       const attrScript = `
         var element = arguments[0];
         var attrName = arguments[1];
         return element.getAttribute(attrName);
       `;
       const attrResult = await this.#executeChromedriverScript('/execute/sync', attrScript, [
         this.#buildElementObject(elementId),
         name
       ]);

       // If attribute exists and is not empty, return it
       if (attrResult !== null && attrResult !== '') {
         return /** @type {string|null} */ (attrResult);
       }

       // Otherwise, compute from bounding rect as a number
       const rectScript = `
         var element = arguments[0];
         var rect = element.getBoundingClientRect();
         var attrName = arguments[1].toLowerCase();
         if (attrName === 'x') return Math.round(rect.left);
         if (attrName === 'y') return Math.round(rect.top);
         if (attrName === 'width') return Math.round(rect.width);
         if (attrName === 'height') return Math.round(rect.height);
         return null;
       `;
       const computedValue = await this.#executeChromedriverScript('/execute/sync', rectScript, [
         this.#buildElementObject(elementId),
         name
       ]);
       return /** @type {number|null} */ (computedValue);
     }

     // For non-dimensional attributes, just return the attribute value
     const script = `
       var element = arguments[0];
       var attrName = arguments[1];
       return element.getAttribute(attrName);
     `;
     const result = await this.#executeChromedriverScript('/execute/sync', script, [
       this.#buildElementObject(elementId),
       name
     ]);
     return /** @type {string|null} */ (result);
   }

   /**
    * Get element property (JavaScript property, not attribute) - required for Appium Inspector
    * @param {string} name - Property name
    * @param {string} elementId - Element ID
    * @returns {Promise<any>}
    */
   async getProperty(name, elementId) {
     const script = `
       var element = arguments[0];
       var propertyName = arguments[1];
       // Get the property value directly from the element object
       var value = element[propertyName];
       // Return null for undefined to match WebDriver spec
       if (value === undefined) return null;
       return value;
     `;
     const result = await this.#executeChromedriverScript('/execute/sync', script, [
       this.#buildElementObject(elementId),
       name
     ]);
     return result;
   }

   /**
    * Get element CSS value - required for Appium Inspector
    * @param {string} propertyName - CSS property name
    * @param {string} elementId - Element ID
    * @returns {Promise<string>}
    */
   async getCssProperty(propertyName, elementId) {
     const script = `
       var element = arguments[0];
       var propertyName = arguments[1];
       var style = window.getComputedStyle(element);
       return style.getPropertyValue(propertyName) || '';
     `;
     const result = await this.#executeChromedriverScript('/execute/sync', script, [
       this.#buildElementObject(elementId),
       propertyName
     ]);
     return /** @type {string} */ (result);
   }

   /**
    * Get element tag name - required for Appium Inspector
    * @param {string} elementId - Element ID
    * @returns {Promise<string>}
    */
   async getName(elementId) {
     const script = `
       var element = arguments[0];
       return element.tagName.toLowerCase();
     `;
     const result = await this.#executeChromedriverScript('/execute/sync', script, [
       this.#buildElementObject(elementId)
     ]);
     return /** @type {string} */ (result);
   }

   /**
    * Click element - overrides default Chromedriver implementation
    * @param {string} elementId - Element ID
    * @returns {Promise<void>}
    */
   async click(elementId) {
     log.info(`[click] Clicking element ${elementId} via JS execution`);
     const script = `
       var element = arguments[0];
       // Try native click first
       if (typeof element.click === 'function') {
         element.click();
         return true;
       }
       // Fallback to dispatching click event
       var event = new MouseEvent('click', {
         view: window,
         bubbles: true,
         cancelable: true
       });
       element.dispatchEvent(event);
       return true;
     `;
     await this.#executeChromedriverScript('/execute/sync', script, [
       this.#buildElementObject(elementId)
     ]);
     log.info(`[click] Click completed successfully`);
   }

   /**
    * Get window rect - overrides default Chromedriver implementation
    * Tizen TV Chromedriver doesn't support Browser.getWindowForTarget command
    * Uses document root element size as window dimensions
    * @returns {Promise<{width: number, height: number, x: number, y: number}>}
    */
   async getWindowRect() {
     log.info(`[getWindowRect] Getting window dimensions via document element size`);
     try {
       // @ts-ignore
       const elementResult = await this.#chromedriver.sendCommand('/element', 'POST', {
         using: 'css selector',
         value: 'body'
       });
       log.info(`[getWindowRect] Element result:`, JSON.stringify(elementResult));

       // @ts-ignore
       const elementId = elementResult['element-6066-11e4-a52e-4f735466cecf'] || elementResult.ELEMENT;
       log.info(`[getWindowRect] Found element: ${elementId}`);

       // @ts-ignore
       const sizeResult = await this.#chromedriver.sendCommand(`/element/${elementId}/rect`, 'GET', {});
       log.info(`[getWindowRect] Size result:`, JSON.stringify(sizeResult));

       // @ts-ignore
       const width = sizeResult.width || 1920;
       // @ts-ignore
       const height = sizeResult.height || 1080;

       return {
         width,
         height,
         x: 0,
         y: 0
       };
     } catch (error) {
       log.error(`[getWindowRect] Error:`, error);
       log.warn(`[getWindowRect] Using fallback resolution 1920x1080`);
       return {
         width: 1920,
         height: 1080,
         x: 0,
         y: 0
       };
     }
   }

   /**
    * Hide keyboard by blurring the active element
    * @returns {Promise<void>}
    */
   async hideKeyboard() {
     log.info('[hideKeyboard] Hiding keyboard by blurring active element');
     try {
       const script = `
         if (document.activeElement && document.activeElement.blur) {
           document.activeElement.blur();
           return true;
         }
         return false;
       `;
       const result = await this.#executeChromedriverScript('/execute/sync', script, []);
       log.info(`[hideKeyboard] Blur result: ${result}`);
     } catch (error) {
       log.warn(`[hideKeyboard] Failed to hide keyboard: ${error.message}`);
       // Don't throw error - keyboard hiding is not critical
     }
   }

  /**
   * Execute some arbitrary JS via Chromedriver.
   * @template {readonly any[]} [TArgs=unknown[]]
   * @template [TReturn=unknown]
   * @param {((...args: any[]) => TReturn)|string} script
   * @param {TArgs} [args]
   * @returns {Promise<TReturn>}
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
   * @returns {Promise<TReturn>}
   */
  async #executeChromedriverScript(endpointPath, script, args) {
    const wrappedScript =
      typeof script === 'string' ? script : `return (${script}).apply(null, arguments)`;
    if (!this.#chromedriver) {
      throw new Error('Chromedriver is not running');
    }
    // @ts-ignore
    const response = /** @type {any} */ (await this.#chromedriver.sendCommand(endpointPath, 'POST', {
      script: wrappedScript,
      args: args ?? [],
    }));
    return /** @type {TReturn} */ (response?.value);
  }

  /**
   * Execute some arbitrary JS via Chromedriver.
   * @template [TReturn=unknown]
   * @template [TArg=any]
   * @param {((...args: any[]) => TReturn)|string} script
   * @param {TArg[]} [args]
   * @returns {Promise<TReturn>}
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
      await removeForwardedPort({
        udid: /** @type {string} */ (this.opts.udid),
        localPort,
        sdbExecTimeout: this.sdbExecTimeout,
        sdbExecRetryCount: this.sdbExecRetryCount,
      });
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
      await removeForwardedPort({
        udid: /** @type {string} */ (this.opts.udid),
        localPort,
        sdbExecTimeout: this.sdbExecTimeout,
        sdbExecRetryCount: this.sdbExecRetryCount,
      });
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
     log.debug(`pressKey called with rcKeyCode: ${rcKeyCode}, rcMode: ${this.opts.rcMode}, hasRemote: ${Boolean(this.#remote)}`);
     if (this.opts.rcMode === RC_MODE_REMOTE && this.#remote) {
       log.debug(`Clicking key ${rcKeyCode} via remote`);
       return await this.#pressKeyRemote(rcKeyCode);
     }
     if (this.opts.rcMode === RC_MODE_API) {
       log.debug(`Clicking key ${rcKeyCode} via Tizen API`);
       return await this.#pressKeyApi(rcKeyCode);
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

     // Ensure window has focus before every key press
     // This is critical for TV automation where focus can be lost
     log.debug('Ensuring window focus before key press');
     try {
       await this.executeChromedriverScript(`
         window.focus();
         // Also try to focus document element
         if (document.documentElement && typeof document.documentElement.focus === 'function') {
           document.documentElement.focus();
         }
         // Ensure there's an active element to receive events
         if (!document.activeElement || document.activeElement === document.body) {
           var firstInput = document.querySelector('input, button, textarea, select, [tabindex]');
           if (firstInput && typeof firstInput.focus === 'function') {
             firstInput.focus();
           }
         }
       `);
     } catch (err) {
       log.debug(`Could not ensure focus: ${err.message}`);
     }

     // Small delay to ensure focus takes effect
     await B.delay(50);

     await this.executeChromedriverAsyncScript(AsyncScripts.pressKey, [code, key, duration]);

     // Add cooldown delay like remote mode
     log.debug(`Waiting ${this.#rcKeypressCooldown}ms...`);
     await B.delay(this.#rcKeypressCooldown);
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
     try {
       log.debug(`Sending remote click command for key: ${key}`);
       const remote = /** @type {TizenRemote} */ (this.#remote);
       await remote.click(key);
       log.debug(`Remote click command sent successfully for key: ${key}`);
     } catch (err) {
       log.error(`Error sending remote click command: ${err.message}`);
       throw err;
     }
     log.debug(`Waiting ${this.#rcKeypressCooldown}ms...`);
     await B.delay(this.#rcKeypressCooldown);
   }

   /**
    * Mimics a keypress via Tizen TV Input Device API.
    * Falls back to JS mode if the API is not available.
    * @param {RcKeyCode} rcKeyCode
    * @returns {Promise<void>}
    */
   async #pressKeyApi(rcKeyCode) {
     const script = `
       if (!window.tizen || !window.tizen.tvinputdevice) {
         return {available: false};
       }
       
       var keyName = arguments[0];
       var keyCode = arguments[1];
       
       return new Promise(function(resolve, reject) {
         try {
           window.tizen.tvinputdevice.registerKey(
             {name: keyName, code: keyCode},
             function() {
               resolve({available: true, success: true});
             },
             function(error) {
               reject(new Error('Failed to register key: ' + error.message));
             }
           );
         } catch (e) {
           reject(e);
         }
       });
     `;

     const {code, key} = getKeyData(rcKeyCode);
     if (!key) {
       throw new Error(`Invalid/unknown key code: ${rcKeyCode}`);
     }

     try {
       const result = await this.executeChromedriverAsyncScript(script, [key, code || 0]);

       // Check if API was available
        if (result && typeof result === 'object' && /** @type {any} */ (result).available === false) {
         log.warn(`Tizen TV Input Device API not available, falling back to JS mode for key ${rcKeyCode}`);
         return await this.#pressKeyJs(rcKeyCode);
       }

       log.debug(`Pressed key ${rcKeyCode} (${key}) via Tizen API`);
     } catch (err) {
       log.warn(`Tizen TV Input Device API error: ${err.message}, falling back to JS mode`);
       return await this.#pressKeyJs(rcKeyCode);
     }

     // Add cooldown delay
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
     if (this.opts.rcMode === RC_MODE_API) {
       return await this.#longPressKeyApi(key, duration);
     }
     await this.#pressKeyJs(key, duration);
   }

   /**
    * Mimics a long keypress via Tizen TV Input Device API.
    * Falls back to JS mode if the API is not available.
    * @param {RcKeyCode} rcKeyCode
    * @param {number} [duration]
    * @returns {Promise<void>}
    */
   async #longPressKeyApi(rcKeyCode, duration = 1000) {
     const script = `
       if (!window.tizen || !window.tizen.tvinputdevice) {
         return {available: false};
       }
       
       var keyName = arguments[0];
       var keyCode = arguments[1];
       var duration = arguments[2];
       
       return new Promise(function(resolve, reject) {
         try {
           // Register and hold the key
           window.tizen.tvinputdevice.registerKey(
             {name: keyName, code: keyCode},
             function() {
               // Key registered, wait for duration then resolve
               setTimeout(function() {
                 resolve({available: true, success: true});
               }, duration);
             },
             function(error) {
               reject(new Error('Failed to register key: ' + error.message));
             }
           );
         } catch (e) {
           reject(e);
         }
       });
     `;

     const {code, key} = getKeyData(rcKeyCode);
     if (!key) {
       throw new Error(`Invalid/unknown key code: ${rcKeyCode}`);
     }

     try {
       const result = await this.executeChromedriverAsyncScript(script, [key, code || 0, duration]);

       // Check if API was available
        if (result && typeof result === 'object' && /** @type {any} */ (result).available === false) {
         log.warn(`Tizen TV Input Device API not available, falling back to JS mode for long press ${rcKeyCode}`);
         return await this.#pressKeyJs(rcKeyCode, duration);
       }

       log.debug(`Long pressed key ${rcKeyCode} (${key}) for ${duration}ms via Tizen API`);
     } catch (err) {
       log.warn(`Tizen TV Input Device API error: ${err.message}, falling back to JS mode`);
       return await this.#pressKeyJs(rcKeyCode, duration);
     }

     // Add cooldown delay
     log.debug(`Waiting ${this.#rcKeypressCooldown}ms...`);
     await B.delay(this.#rcKeypressCooldown);
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

    if (!this.#chromedriver) {
      throw new Error('Chromedriver is not running');
    }
    // @ts-ignore
    return await this.#chromedriver.sendCommand(`/element/${elId}/value`, 'POST', {text});
  }

  /**
   * Return the list of installed applications with the pair of
   * an application name and the package name.
   * @returns {Promise<[{appName: string, appPackage: string}]|[]>}
   */
  async tizentvListApps() {
    return await listApps({
      udid: this.opts.udid,
      sdbExecTimeout: this.sdbExecTimeout,
      sdbExecRetryCount: this.sdbExecRetryCount
    }, this.#platformVersion);
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
      : await launchApp({
        appPackage, udid:
        this.opts.udid,
        sdbExecTimeout: this.sdbExecTimeout,
        sdbExecRetryCount: this.sdbExecRetryCount
      });
  }

   async #tizentvActivateAppWithDebug(appPackage) {
     const {
       chromedriverExecutable,
       chromedriverExecutableDir,
       showChromedriverLog,
       autodownloadEnabled,
     } = this.caps;

     await this.#cleanupChromedriver();
     await this.#cleanUpChromedriverPorts();

     const localDebugPort = await this.setupDebugger(this.caps, appPackage);

     // Set default chromedriver executable directory if not provided
     const executableDir = chromedriverExecutableDir || DEFAULT_CHROMEDRIVER_DIR;
     const autodownload = autodownloadEnabled !== false;

     await this.startChromedriver({
       debuggerPort: localDebugPort,
       executable: /** @type {string|undefined} */ (chromedriverExecutable),
       executableDir,
       isAutodownloadEnabled: autodownload,
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
    return await terminateApp({
      udid: this.opts.udid,
      sdbExecTimeout: this.sdbExecTimeout,
      sdbExecRetryCount: this.sdbExecRetryCount
    }, pkgId);
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
    * webdriverio compatibility.
    *
    * @returns {Promise<string>}
    */
   async getCurrentContext() {
     return 'NATIVE_APP';
   }

   /**
    * Get available contexts - required for Appium Inspector
    * @returns {Promise<string[]>}
    */
   async getContexts() {
     return ['NATIVE_APP'];
   }

   /**
    * Set context - required for Appium Inspector
    * @param {string} name - Context name
    * @returns {Promise<void>}
    */
    async setContext(name) {
      if (name !== 'NATIVE_APP') {
        throw new errors.InvalidArgumentError(`Context '${name}' is not supported. Only 'NATIVE_APP' is available.`);
      }
      // Already in NATIVE_APP context, nothing to do
    }

   /**
    * Clear an element - required for Appium Inspector
    * @param {string} elementId - Element ID
    * @returns {Promise<void>}
    */
   async clear(elementId) {
     log.info(`[clear] Clearing element ${elementId}`);
     const script = `
       var element = arguments[0];
       if (element.value !== undefined) {
         element.value = '';
       }
       if (element.textContent !== undefined) {
         element.textContent = '';
       }
       // Trigger change event
       var event = new Event('change', { bubbles: true });
       element.dispatchEvent(event);
       return true;
     `;
     await this.#executeChromedriverScript('/execute/sync', script, [
       this.#buildElementObject(elementId)
     ]);
     log.info(`[clear] Element cleared successfully`);
   }

   /**
    * Get the currently active element - required for Appium Inspector
    * @returns {Promise<import('@appium/types').Element>}
    */
   async active() {
     log.debug('[active] Getting active element');
     // @ts-ignore
     return await this.#chromedriver.sendCommand('/element/active', 'POST', {});
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

  /**
   * Tiemout to run sdb or tizen command
   * @returns {number}
  */
  get sdbExecTimeout() {
    const timeout = _.parseInt(this.caps.sdbExecTimeout) || CMD_TIMEOUT_MS;
    return timeout > 0 ? timeout : CMD_TIMEOUT_MS;
  }

  /**
   * Tiemout to run sdb or tizen command
   * @returns {number}
  */
  get sdbExecRetryCount() {
    const count = _.parseInt(this.caps.sdbExecRetryCount) || CMD_RETRY_MAX;
    return count > 0 ? count : CMD_RETRY_MAX;
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
