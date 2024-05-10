import unexpected from 'unexpected';
import unexpectedSinon from 'unexpected-sinon';
import {initMocks} from './mocks';

const expect = unexpected.clone().use(unexpectedSinon);

describe('TizenTVDriver', function () {
  /** @type {typeof import('../../lib/driver').TizenTVDriver} */
  let TizenTVDriver;

  /** @type {sinon.SinonSandbox} */
  let sandbox;

  /** @type {ReturnType<typeof initMocks>['mocks']} */
  let mocks;

  /** @type {typeof import('../../lib/driver').TEXT_STRATEGY_REMOTE} */
  let TEXT_STRATEGY_REMOTE;

  /** @type {typeof import('../../lib/driver').RC_MODE_REMOTE} */
  let RC_MODE_REMOTE;

  beforeEach(function () {
    ({
      sandbox,
      mocks,
      // these are the "real" variables under test; they've just had their deps swapped
      target: {TizenTVDriver, TEXT_STRATEGY_REMOTE, RC_MODE_REMOTE},
    } = initMocks(
      () => require('../../lib/driver'),
      (r) => ({
        '../../lib/cli/tizen': r.mockThrough(),
        '../../lib/cli/sdb': r.mockThrough(),
      })
    ));
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('constructor', function () {
    it('should create a new instance', function () {
      expect(new TizenTVDriver(), 'to be a', TizenTVDriver);
    });
  });

  describe('instance method', function () {
    /** @type {InstanceType<TizenTVDriver>} */
    let driver;

    describe('setValue()', function () {
      describe('when configured to use the RC', function () {
        beforeEach(async function () {
          driver = new TizenTVDriver();
          await driver.createSession({
            alwaysMatch: {
              platformName: 'tizentv',
              'appium:rcMode': RC_MODE_REMOTE,
              'appium:sendKeysStrategy': TEXT_STRATEGY_REMOTE,
              'appium:udid': 'test',
              'appium:deviceName': 'test',
              'appium:chromedriverExecutable': '/some/chromedriver',
              'appium:deviceAddress': 'test',
              'appium:appLaunchCooldown': 0,
            },
            firstMatch: [{}],
          });
        });

        it('should send the text to the remote library', async function () {
          await driver.setValue('stuff', 'some-element-id');
          expect(mocks.MockTizenRemote.TizenRemote().text, 'was called once');
        });

        it('should not send ENTER', async function () {
          await driver.setValue('stuff', 'some-element-id');
          expect(
            mocks.MockTizenRemote.TizenRemote().click,
            'was not called'
          );
        });
      });
    });

    describe('fixChromeVersionForAutodownload', function () {
      beforeEach(async function () {
        driver = new TizenTVDriver();
      });

      it('Set minimal chrome version', function () {
        const browserInfo = {
          'Browser': 'Chrome/56.0.2924.0',
          'Protocol-Version': '1.2',
          'User-Agent': 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 4.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 TV Safari/537.36',
          'WebKit-Version': '537.36 (@24d4006dbb9188e920764a35a60873d6a0157c12)'
        };
        expect(
          driver.fixChromeVersionForAutodownload(browserInfo),
          'to equal',
          {
            'Browser': 'Chrome/63.0.3239.0',
            'Protocol-Version': '1.2',
            'User-Agent': 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 4.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 TV Safari/537.36',
            'WebKit-Version': '537.36 (@24d4006dbb9188e920764a35a60873d6a0157c12)'
          }
        );
      });

      it('Use the given chrome version', function () {
        const browserInfo = {
          'Browser': 'Chrome/63.0.3239.0',
          'Protocol-Version': '1.2',
          'User-Agent': 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 TV Safari/537.36',
          'V8-Version': '6.3.294',
          'WebKit-Version': '537.36 (@0ced44f6f658d59a57d436f1a95308d722d235e9)',
          'webSocketDebuggerUrl': 'ws://127.0.0.1:35645/devtools/browser/7381318c-0c82-4453-a0e9-a0ecbf486254'
        };
        expect(
          driver.fixChromeVersionForAutodownload(browserInfo),
          'to equal',
          browserInfo
        );
      });
    });
  });
});
