import {BaseDriver, DeviceSettings} from 'appium-base-driver';
import B from 'bluebird';
import { retryInterval } from 'asyncbox';
import desiredConstraints from './desired-caps';
import commands from './commands';
import _ from 'lodash';
import { tizenInstall, tizenUninstall, tizenRun } from './cli/tizen';
import { debugApp, forwardPort, removeForwardedPort, connectDevice,
         disconnectDevice } from './cli/sdb';
import Chromedriver from 'appium-chromedriver';
import { getPortPromise } from 'portfinder';
import log from './logger';
import { Samsung as RemoteControl } from 'samsung-tv-control';
import got from 'got';

const BROWSER_APP_ID = 'org.tizen.browser';
const DEFAULT_APP_LAUNCH_COOLDOWN = 3000;
const DEFAULT_CAPS = {
  appLaunchCooldown: DEFAULT_APP_LAUNCH_COOLDOWN,
};

const NO_PROXY = [
  ['POST', new RegExp('^/session/[^/]+/appium')],
  ['GET', new RegExp('^/session/[^/]+/appium')],
  ['POST', new RegExp('^/session/[^/]+/element/[^/]+/value')],
];

export const RC_PORT = 8002;
export const RC_NAME = 'Appium';
export const RC_OPTS = {
  debug: true,
  delayCommands: true,
  port: RC_PORT,
  nameApp: RC_NAME,
  saveToken: false,
};

class TizenTVDriver extends BaseDriver {
  constructor (opts = {}, shouldValidateCaps = true) {
    super(opts, shouldValidateCaps);

    this.locatorStrategies = [
      // TODO define tizen locator strategies
    ];

    this.desiredCapConstraints = desiredConstraints;
    this.jwpProxyActive = false;
    this.jwpProxyAvoid = _.clone(NO_PROXY);
    this.settings = new DeviceSettings({});

    this.forwardedPorts = [];
  }

  async createSession (...args) {
    let [sessionId, caps] = await super.createSession(...args);
    caps = {...DEFAULT_CAPS, ...caps};
    const shouldPowerCycle = caps.powerCyclePostUrl && caps.fullReset;

    this.setupRCApi(caps);

    if (!caps.useOpenDebugPort) {
      if (shouldPowerCycle) {
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
        await tizenInstall(caps);
      } else if (!shouldPowerCycle) {
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
        executable: caps.chromedriverExecutable,
      });

      if (!caps.noReset) {
        log.info('Waiting for app launch to take effect');
        await B.delay(caps.appLaunchCooldown);
        log.info('Clearing app local storage');
        await this.executeScript('window.localStorage.clear()');
        log.info('Reloading page');
        await this.executeScript('window.location.reload()');
        log.info('Waiting for app launch to take effect again post-reload');
        await B.delay(caps.appLaunchCooldown);
      }
      return [sessionId, caps];
    } catch (e) {
      await this.cleanUpPorts();
      throw e;
    }
  }

  async setupDebugger (caps) {
    const remoteDebugPort = caps.useOpenDebugPort || await debugApp(caps);
    const localDebugPort = await getPortPromise();
    log.info(`Chose local port ${localDebugPort} for remote debug communication`);
    await forwardPort({udid: caps.udid, remotePort: remoteDebugPort, localPort: localDebugPort});
    this.forwardedPorts.push(localDebugPort);
    return localDebugPort;
  }

  setupRCApi ({deviceAddress, deviceMac, rcToken}) {
    this.rc = new RemoteControl({
      ...RC_OPTS,
      debug: true,
      ip: deviceAddress,
      mac: deviceMac,
      token: rcToken,
    });
  }

  async startChromedriver ({debuggerPort, executable}) {
    this.chromedriver = new Chromedriver({
      port: await getPortPromise(),
      executable
    });

    const debuggerAddress = `127.0.0.1:${debuggerPort}`;

    await this.chromedriver.start({'goog:chromeOptions': {
      debuggerAddress
    }});
    this.proxyReqRes = this.chromedriver.proxyReq.bind(this.chromedriver);
    this.proxyCommand = this.chromedriver.jwproxy.proxyCommand.bind(this.chromedriver);
    this.jwpProxyActive = true;
  }

  async executeScript (script) {
    return await this.chromedriver.sendCommand('/execute/sync', 'POST', {
      script,
      args: [],
    });
  }

  async deleteSession () {
    if (this.chromedriver) {
      log.debug('Terminating app under test');
      try {
        await this.executeScript('tizen.application.getCurrentApplication().exit()');
      } catch (err) {
        log.warn(err);
      }
      log.debug(`Stopping chromedriver`);
      // stop listening for the stopped state event
      this.chromedriver.removeAllListeners(Chromedriver.EVENT_CHANGED);
      try {
        await this.chromedriver.stop();
      } catch (err) {
        log.warn(`Error stopping Chromedriver: ${err.message}`);
      }
      this.chromedriver = null;
    }

    this.rc = null;
    await this.cleanUpPorts();
    return await super.deleteSession();
  }

  async cleanUpPorts () {
    log.info(`Cleaning up any ports which have been forwarded`);
    for (const localPort of this.forwardedPorts) {
      await removeForwardedPort({udid: this.opts.udid, localPort});
    }
  }

  proxyActive () {
    return this.jwpProxyActive;
  }

  getProxyAvoidList () {
    return this.jwpProxyAvoid;
  }

  canProxy () {
    return true;
  }
}

for (const [cmd, fn] of _.toPairs(commands)) {
  TizenTVDriver.prototype[cmd] = fn;
}

export {TizenTVDriver};
export default TizenTVDriver;
