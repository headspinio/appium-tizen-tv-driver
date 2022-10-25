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
    describe('setValue()', function () {
      describe('when configured to use the RC', function () {
        /** @type {InstanceType<TizenTVDriver>} */
        let driver;

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

        it('should send ENTER', async function () {
          await driver.setValue('stuff', 'some-element-id');
          expect(
            mocks.MockTizenRemote.TizenRemote().click,
            'was called with',
            mocks.MockTizenRemote.Keys.ENTER
          );
        });
      });
    });
  });
});
