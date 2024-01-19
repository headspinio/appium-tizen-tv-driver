import unexpected from 'unexpected';
import unexpectedSinon from 'unexpected-sinon';
import {_parseListAppsCmd} from '../../lib/cli/sdb';

const expect = unexpected.clone().use(unexpectedSinon);

describe('sdb', function () {
  describe('_parseListAppsCmd', function () {
    it('should return the list of apps', function () {
      const returnValue = "\tApplication List for user 5001\r\n\tUser's Application \r\n\t Name \t AppID \r\n\t=================================================\r\n\t'alexa-fullscreen-app'\t 'com.samsung.tv.alexa-client-xapp-ut-on-tv'\r\n\t'ContentSharing.Provider.Ftp'\t 'com.samsung.tv.coss.provider.d2d'\r\n\t'Xbox'\t 'GHI3a0zMSx.XboxGamePass'\r\n\t'cloning'\t 'org.tizen.cloning'\r\n\t'csfs'\t 'com.samsung.tv.csfs'\r\n\t'あ'\t 'pIaMf8YZyZ.service'\r\n\t'service-application'\t 'org.tizen.was-appsync'\r\n\t'fuzzy-search-engine'\t 'com.samsung.tv.fuzzy-search-engine'\r\n\t'pisa-control-service'\t 'org.tizen.pisa-control-service'\r\n\t'SmartThings Home CCTV Service'\t 'com.samsung.tv.iot-service-home-cctv_FLUX'\r\n\t'samsung-pass'\t 'com.samsung.tizen.samsung-pass-agent'\r\n\t'pluginplatform'\t 'com.samsung.tizen.smartthings-plugin-platform'\r\n\t'LibAriaFW'\t 'lib-ariafw-tv'\r\n\t'com.samsung.tv.ondevice-voice'\t 'com.samsung.tv.ondevice-voice'\r\n\t'PBS Video'\t '70fRFUwYlD.OtterGAProd'\r\n\t'iacr'\t 'com.samsung.tv.iacr'\r\n\t'Samsung Health'\t 'com.samsung.tv.samsung-health'\r\n\t''\t 'com.samsung.tv.remoteapp.local_stream'\r\n\t=================================================\r\n";

      // Spaces in the app name should exist as-is.
      expect(_parseListAppsCmd(returnValue), 'to equal', [
        { appName: 'alexa-fullscreen-app', appPackage: 'com.samsung.tv.alexa-client-xapp-ut-on-tv' },
        { appName: 'ContentSharing.Provider.Ftp', appPackage: 'com.samsung.tv.coss.provider.d2d' },
        { appName: 'Xbox', appPackage: 'GHI3a0zMSx.XboxGamePass' },
        { appName: 'cloning', appPackage: 'org.tizen.cloning' },
        { appName: 'csfs', appPackage: 'com.samsung.tv.csfs' },
        { appName: 'あ', appPackage: 'pIaMf8YZyZ.service' },
        { appName: 'service-application', appPackage: 'org.tizen.was-appsync' },
        { appName: 'fuzzy-search-engine', appPackage: 'com.samsung.tv.fuzzy-search-engine' },
        { appName: 'pisa-control-service', appPackage: 'org.tizen.pisa-control-service' },
        { appName: 'SmartThings Home CCTV Service', appPackage: 'com.samsung.tv.iot-service-home-cctv_FLUX' },
        { appName: 'samsung-pass', appPackage: 'com.samsung.tizen.samsung-pass-agent' },
        { appName: 'pluginplatform', appPackage: 'com.samsung.tizen.smartthings-plugin-platform' },
        { appName: 'LibAriaFW', appPackage: 'lib-ariafw-tv' },
        { appName: 'com.samsung.tv.ondevice-voice', appPackage: 'com.samsung.tv.ondevice-voice' },
        { appName: 'PBS Video', appPackage: '70fRFUwYlD.OtterGAProd' },
        { appName: 'iacr', appPackage: 'com.samsung.tv.iacr' },
        { appName: 'Samsung Health', appPackage: 'com.samsung.tv.samsung-health' },
         { appName: '', appPackage: 'com.samsung.tv.remoteapp.local_stream' }
      ]);
    });
  });
});
