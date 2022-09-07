import {Env} from '@humanwhocodes/env';
import {Keys} from '@headspinio/tizen-remote';
import {startServer, TEST_HOST} from '../helpers';
import getPort from 'get-port';
import unexpected from 'unexpected';
import {tizenBrowser} from './browser';
import {getChromedriverBinaryPath} from 'appium-chromedriver/build/lib/utils';
const expect = unexpected.clone();

const SAMPLE_APP_ID = 'tNQ5t7rV07.sample';
const DEFAULT_DEVICE = `${TEST_HOST}:26101`;
/**
 *
 * @param {import('./browser').TizenBrowser} driver
 * @param {import('@appium/types').AppiumServer} server
 */
async function cleanup(driver, server) {
  try {
    await driver.deleteSession();
  } catch {}
  try {
    await server.close();
  } catch {}
}

describe('TizenTVDriver', function () {

  const env = new Env();

  /** @type {number} */
  let appiumServerPort;
  /**
   * @type {import('@appium/types').AppiumServer}
   */
  let server;
  /**
   * @type {import('./browser').TizenBrowser}
   */
  let driver;

  /** @type {string} */
  let device;

  /** @type {import('../../lib/driver').TizenTVDriverW3CCaps} */
  let caps;

  process.on('SIGHUP', async () => {
    await cleanup(driver, server);
  });

  before(async function () {
    device = env.get('TEST_APPIUM_TIZEN_DEVICE', DEFAULT_DEVICE);
    caps = {
      'appium:udid': device,
      'appium:deviceName': device,
      platformName: 'TizenTV',
      'appium:appPackage': env.get('TEST_APPIUM_TIZEN_APPID', SAMPLE_APP_ID),
      'appium:automationName': 'TizenTV',
      'appium:appLaunchCooldown': 5000,
      'appium:rcToken': env.get('TEST_APPIUM_TIZEN_TOKEN'),
      'appium:sendKeysStrategy': 'rc',
      'appium:deviceAddress': device.split(':')[0],
      'appium:chromedriverExecutable': env.get('TEST_APPIUM_TIZEN_CHROMEDRIVER'),
    };

    if (!caps['appium:chromedriverExecutable']) {
      caps['appium:chromedriverExecutable'] = await getChromedriverBinaryPath();
    }

    this.timeout('40s');
    appiumServerPort = await getPort();
    server = await startServer(appiumServerPort);
    driver = await tizenBrowser({
      hostname: TEST_HOST,
      port: appiumServerPort,
      connectionRetryCount: 0,
      logLevel: 'debug',
      capabilities: caps,
    });
  });

  after(async function () {
    this.timeout('20s');
    await cleanup(driver, server);
  });

  it('should run some javascript', async function() {
    const header = await driver.$('#header');
    expect(await header.getText(), 'to equal', 'Initialized');
  });

  it('should press a button on the remote control', async function () {
    await driver.pressKey(Keys.ENTER);
    const name = await driver.$('#rc-button-name').getValue();
    const code = await driver.$('#rc-button-code').getValue();
    expect(name, 'to equal', 'Enter');
    expect(code, 'to equal', '13');
  });
});

