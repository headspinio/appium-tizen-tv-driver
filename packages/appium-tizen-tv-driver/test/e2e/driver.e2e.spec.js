import {Env} from '@humanwhocodes/env';
import {server as baseServer, routeConfiguringFunction} from 'appium/driver';
import TizenTVDriver from '../../lib/driver';
import getPort from 'get-port';
import {remote as wdio} from 'webdriverio';

const env = new Env();

const TEST_HOST = '127.0.0.1';
const DEVICE = env.get('TEST_APPIUM_TIZEN_DEVICE', `${TEST_HOST}:26101`);
const CAPS = {
  'appium:udid': DEVICE,
  'appium:deviceName': DEVICE,
  platformName: 'TizenTV',
  'appium:appPackage': env.require('TEST_APPIUM_TIZEN_APPID'),
  'appium:automationName': 'TizenTV',
  'appium:appLaunchCooldown': 5000,
  'appium:rcToken': env.require('TEST_APPIUM_TIZEN_TOKEN'),
  'appium:sendKeysStrategy': 'rc',
  'appium:deviceAddress': DEVICE.split(':')[0],
  'appium:chromedriverExecutable': env.require('TEST_APPIUM_TIZEN_CHROMEDRIVER'),
};

async function startServer(port, hostname = TEST_HOST) {
  const d = new TizenTVDriver();
  const server = await baseServer({
    routeConfiguringFunction: routeConfiguringFunction(d),
    port,
    hostname,
  });
  return server;
}

describe('TizenTVDriver', function () {
  /** @type {number} */
  let port;
  /**
   * @type {import('@appium/types').AppiumServer}
   */
  let server;
  /**
   * @type {import('webdriverio').Browser<'async'>}
   */
  let driver;

  before(async function () {
    this.timeout(0);
    port = await getPort();
    server = await startServer(port);
    driver = await wdio({
      hostname: TEST_HOST,
      port,
      connectionRetryCount: 0,
      logLevel: 'debug',
      capabilities: CAPS,
    });
  });

  after(async function () {
    this.timeout(0);
    try {
      await driver.deleteSession();
    } catch {}
    try {
      await server.close();
    } catch {}
  });

  it('should login', async function () {});
});
