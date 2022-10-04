import B from 'bluebird';
import {Env} from '@humanwhocodes/env';
import {Keys} from '@headspinio/tizen-remote';
import {startServer, TEST_HOST} from '../helpers';
import getPort from 'get-port';
import unexpected from 'unexpected';
import {tizenBrowser} from './browser';
import {getChromedriverBinaryPath} from 'appium-chromedriver/build/lib/utils';
import {
  RC_MODE_JS,
  PLATFORM_NAME,
  RC_MODE_REMOTE,
  TEXT_STRATEGY_PROXY,
  TEXT_STRATEGY_REMOTE,
} from '../../lib/driver';

const expect = unexpected.clone();

/**
 * This is the (static) ID of `tizen-sample-app`
 */
const SAMPLE_APP_ID = 'tNQ5t7rV07.sample';

/**
 * Tizen device host and sdb port
 */
const DEFAULT_DEVICE = `${TEST_HOST}:26101`;

/**
 *
 * @param {import('./browser').TizenBrowser} [driver]
 * @param {import('@appium/types').AppiumServer} [server]
 */
async function cleanup(driver, server) {
  try {
    await driver?.deleteSession();
  } catch {}
  try {
    await server?.close();
  } catch {}
}

describe('TizenTVDriver', function () {
  /**
   * ***VERY IMPORTANT***: if we cancel a test we **MUST MUST MUST** run cleanup
   * or the device will get stuck in the app and we'll have to either restart it
   * or reinstall the app.
   * @param {import('./browser').TizenBrowser} driver
   * @param {import('@appium/types').AppiumServer} server
   */
  function listenForInterrupts(driver, server) {
    process.removeAllListeners('SIGHUP').removeAllListeners('SIGINT');
    process
      .once('SIGHUP', async () => {
        await cleanup(driver, server);
      })
      .once('SIGINT', async () => {
        await cleanup(driver, server);
      });
  }

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

  /** @type {import('@appium/types').NSDriverCaps<import('../../lib/driver').TizenTVDriverCapConstraints>} */
  let capabilities;

  /** @type {import('@appium/types').NSDriverCaps<import('../../lib/driver').TizenTVDriverCapConstraints>} */
  let baseCaps;

  before(async function () {
    device = env.get('TEST_APPIUM_TIZEN_DEVICE', DEFAULT_DEVICE);
    baseCaps = {
      'appium:deviceName': device,
      platformName: PLATFORM_NAME,
      'appium:appPackage': env.get('TEST_APPIUM_TIZEN_APPID', SAMPLE_APP_ID),
      'appium:automationName': PLATFORM_NAME,
      'appium:appLaunchCooldown': 5000,
      'appium:chromedriverExecutable': env.get('TEST_APPIUM_TIZEN_CHROMEDRIVER'),
    };

    if (!baseCaps['appium:chromedriverExecutable']) {
      baseCaps['appium:chromedriverExecutable'] = await getChromedriverBinaryPath();
    }
  });

  describe('when run in "proxy"/"js" mode', function () {
    before(async function () {
      this.timeout('40s');
      capabilities = {
        ...baseCaps,
        'appium:rcMode': RC_MODE_JS,
        'appium:sendKeysStrategy': TEXT_STRATEGY_PROXY,
      };
      appiumServerPort = await getPort();
      server = await startServer(appiumServerPort);
      driver = await tizenBrowser({
        hostname: TEST_HOST,
        port: appiumServerPort,
        connectionRetryCount: 0,
        logLevel: 'debug',
        capabilities,
      });
      listenForInterrupts(driver, server);
    });

    after(async function () {
      this.timeout('20s');
      await cleanup(driver, server);
    });

    it('should run some javascript', async function () {
      const header = await driver.$('#header');
      expect(await header.getText(), 'to equal', 'Initialized');
    });

    it('should press a button on the remote control', async function () {
      await driver.pressKey(Keys.ENTER);
      const name = await driver.$('#rc-button-name').getText();
      const code = await driver.$('#rc-button-code').getText();
      const duration = await driver.$('#event-duration').getText();
      expect(code, 'to equal', '13');
      expect(name, 'to equal', 'Enter');
      expect(Number(duration), 'to be less than', 500);
    });

    it('should "long press" a button on the remote control', async function () {
      await driver.longPressKey(Keys.ENTER);
      const name = await driver.$('#rc-button-name').getText();
      const code = await driver.$('#rc-button-code').getText();
      const duration = await driver.$('#event-duration').getText();
      expect(code, 'to equal', '13');
      expect(name, 'to equal', 'Enter');
      expect(Number(duration), 'to be greater than or equal to', 500);
    });

    it('should allow text input', async function () {
      // this actually seems slower than the remote mode
      this.timeout('20s');
      const input = await driver.$('#text-input');
      await input.setValue('Sylvester McMonkey McTester');
      expect(await input.getText(), 'to equal', 'Sylvester McMonkey McTester');
    });
  });

  describe('when run in "remote" mode', function () {
    describe('without token persistence', function () {
      before(async function () {
        // this can take awhile as we may need to get a new token.
        this.timeout('60s');
        capabilities = {
          ...baseCaps,
          'appium:rcMode': RC_MODE_REMOTE,
          'appium:rcToken': env.get('TEST_APPIUM_TIZEN_RC_TOKEN'),
          'appium:sendKeysStrategy': TEXT_STRATEGY_REMOTE,
          'appium:resetRcToken': true,
        };

        appiumServerPort = await getPort();
        server = await startServer(appiumServerPort);
        driver = await tizenBrowser({
          hostname: TEST_HOST,
          port: appiumServerPort,
          connectionRetryCount: 0,
          logLevel: 'debug',
          capabilities,
        });
        listenForInterrupts(driver, server);
      });

      after(async function () {
        this.timeout('20s');
        await cleanup(driver, server);
      });

      it('should run some javascript', async function () {
        const header = await driver.$('#header');
        expect(await header.getText(), 'to equal', 'Initialized');
      });

      it('should press a button on the remote control', async function () {
        await driver.pressKey(Keys.ENTER);
        const name = await driver.$('#rc-button-name').getText();
        const code = await driver.$('#rc-button-code').getText();
        const duration = await driver.$('#event-duration').getText();
        expect(code, 'to equal', 'Enter'); // !!!
        expect(name, 'to equal', 'Enter');
        expect(Number(duration), 'to be less than', 500);
      });

      it('should "long press" a button on the remote control', async function () {
        await driver.longPressKey(Keys.ENTER);
        const name = await driver.$('#rc-button-name').getText();
        const code = await driver.$('#rc-button-code').getText();
        const duration = await driver.$('#event-duration').getText();
        expect(code, 'to equal', 'Enter'); // !!!
        expect(name, 'to equal', 'Enter');
        expect(Number(duration), 'to be greater than or equal to', 500);
      });

      it('should allow text input', async function () {
        const input = await driver.$('#text-input');
        await input.setValue('Sylvester McMonkey McTester');
        expect(await input.getText(), 'to equal', 'Sylvester McMonkey McTester');
      });
    });

    describe('with token persistence', function() {
      after(async function () {
        this.timeout('20s');
        await cleanup(driver, server);
      });

      before(async function() {
        // if this is set we will use a cached token instead of forcing a new one;
        if (!env.get('TEST_APPIUM_TIZEN_FORCE_TOKEN_CACHE')) {
          this.timeout('60s');
          capabilities = {
            ...baseCaps,
            'appium:rcMode': RC_MODE_REMOTE,
            'appium:rcToken': env.get('TEST_APPIUM_TIZEN_RC_TOKEN'),
            'appium:sendKeysStrategy': TEXT_STRATEGY_REMOTE,
            'appium:resetRcToken': true
          };

          appiumServerPort = await getPort();
          server = await startServer(appiumServerPort);
          driver = await tizenBrowser({
            hostname: TEST_HOST,
            port: appiumServerPort,
            connectionRetryCount: 0,
            logLevel: 'debug',
            capabilities,
          });
          listenForInterrupts(driver, server);

          await cleanup(driver, server);
        }
      });

      it('should reconnect w/o issue & press a button on the remote control', async function () {
        this.timeout('60s');
        capabilities = {
          ...baseCaps,
          'appium:rcMode': RC_MODE_REMOTE,
          'appium:rcToken': env.get('TEST_APPIUM_TIZEN_RC_TOKEN'),
          'appium:sendKeysStrategy': TEXT_STRATEGY_REMOTE,
          // do not reset token!!
        };

        appiumServerPort = await getPort();
        server = await startServer(appiumServerPort);
        driver = await tizenBrowser({
          hostname: TEST_HOST,
          port: appiumServerPort,
          connectionRetryCount: 0,
          logLevel: 'debug',
          capabilities,
        });
        listenForInterrupts(driver, server);

        await driver.pressKey(Keys.ENTER);
        const [name, code, duration] = await B.all([
          driver.$('#rc-button-name').getText(),
          driver.$('#rc-button-code').getText(),
          driver.$('#event-duration').getText()
        ]);
        const result = {
          name,
          code,
          duration: Number(duration),
        };
        try {
          expect(result, 'to satisfy', {
            name: 'Enter',
            code: 'Enter',
            duration: expect.it('to be less than', 500),
          });
        } finally {
          await cleanup(driver, server);
        }
      });

      describe('when rcKeypressCooldown is invalid', function() {
        beforeEach(async function() {
          capabilities = {
            ...baseCaps,
            'appium:rcMode': RC_MODE_REMOTE,
            'appium:rcToken': env.get('TEST_APPIUM_TIZEN_RC_TOKEN'),
            'appium:sendKeysStrategy': TEXT_STRATEGY_REMOTE,
            // do not reset token!!
          };

          appiumServerPort = await getPort();
          server = await startServer(appiumServerPort);
        });

        afterEach(async function () {
          await cleanup(driver, server);
        });

        describe('when it is negative', function() {
          it('should fail', async function () {
            capabilities['appium:rcKeypressCooldown'] = -1;
            await expect(
              tizenBrowser({
                hostname: TEST_HOST,
                port: appiumServerPort,
                connectionRetryCount: 0,
                logLevel: 'debug',
                capabilities,
              }),
              'to be rejected with',
              /appium:rcKeypressCooldown must be a positive integer/i
            );
          });
        });
        describe('when it is not an integer', function() {
          it('should fail', async function () {
            capabilities['appium:rcKeypressCooldown'] = 100.5;
            await expect(
              tizenBrowser({
                hostname: TEST_HOST,
                port: appiumServerPort,
                connectionRetryCount: 0,
                logLevel: 'debug',
                capabilities,
              }),
              'to be rejected with',
              /appium:rcKeypressCooldown must be a positive integer/i
            );
          });
        });

        describe('when it is too big', function() {
          it('should fail', async function () {
            // @ts-expect-error
            capabilities['appium:rcKeypressCooldown'] = '9007199254740992';
            await expect(
              tizenBrowser({
                hostname: TEST_HOST,
                port: appiumServerPort,
                connectionRetryCount: 0,
                logLevel: 'debug',
                capabilities,
              }),
              'to be rejected with',
              /appium:rcKeypressCooldown must be a positive integer/i
            );
          });
        });
      });
    });
  });

  describe('when caps are missing both `udid` and `deviceAddress`', function () {
    describe('when `deviceName` does not look like a `udid`', function () {
      it('should fail', async function () {
        capabilities = {
          ...baseCaps,
          'appium:rcMode': RC_MODE_JS,
          'appium:sendKeysStrategy': TEXT_STRATEGY_PROXY,
          'appium:deviceName': '127.0.0.1',
        };
        appiumServerPort = await getPort();
        server = await startServer(appiumServerPort);
        await expect(
          tizenBrowser({
            hostname: TEST_HOST,
            port: appiumServerPort,
            connectionRetryCount: 0,
            logLevel: 'debug',
            capabilities,
          }),
          'to be rejected'
        );
      });

      after(async function () {
        await cleanup(undefined, server);
      });
    });
  });

});
