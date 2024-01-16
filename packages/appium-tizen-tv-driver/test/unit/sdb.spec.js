import unexpected from 'unexpected';
import unexpectedSinon from 'unexpected-sinon';
import {_parseListAppsCmd} from '../../lib/cli/sdb';

const expect = unexpected.clone().use(unexpectedSinon);

describe('sdb', function () {
  describe('_parseListAppsCmd', function () {
    it('should return the list of apps', function () {
      const returnValue = `
      Application List for user 5001
      User's Application
       Name 	 AppID
      =================================================
      'HdmiCec'	 'org.tizen.hdmicec'
      'automation-app'	 'org.tizen.automation-app'
      '뉴스리듬'	 'jObNpkM9m9.newsrhythm'
      'HomeSetting'	 'org.tizen.homesetting'
      'com.samsung.tv.aria-engine'	 'com.samsung.tv.aria-engine'
      ''	 'org.tizen.tts-engine-vd-sr'
      'Widget Viewer for SDK'	 'org.tizen.widget_viewer_sdk'
      'Apps'	 'org.volt.apps'
      'Netflix'	 'org.tizen.netflix-app'
      'Tizen keyboard'	 'ise-default-tv'
      'Remote Management'	 'org.tizen.remote-management'
      'App'	 'com.samsung.tv.cobalt-app-2146'
      ''	 'org.tizen.reminder'
      'Smarthub Connection Test'	 'org.tizen.smarthub-connection-test'
      ' Network status widget '	 'org.tizen.rs-network-status'
      'SamsungAccountService'	 'com.samsung.tizen.samsung-account'
      =================================================
      `

      // Spaces in the app name should exist as-is.
      expect(_parseListAppsCmd(returnValue), "to equal", [
        { appName: 'HdmiCec', appPackage: 'org.tizen.hdmicec' },
        { appName: 'automation-app', appPackage: 'org.tizen.automation-app' },
        { appName: '뉴스리듬', appPackage: 'jObNpkM9m9.newsrhythm' },
        { appName: 'HomeSetting', appPackage: 'org.tizen.homesetting' },
        { appName: 'com.samsung.tv.aria-engine', appPackage: 'com.samsung.tv.aria-engine' },
        { appName: '', appPackage: 'org.tizen.tts-engine-vd-sr' },
        { appName: 'Widget Viewer for SDK', appPackage: 'org.tizen.widget_viewer_sdk' },
        { appName: 'Apps', appPackage: 'org.volt.apps' },
        { appName: 'Netflix', appPackage: 'org.tizen.netflix-app' },
        { appName: 'Tizen keyboard', appPackage: 'ise-default-tv' },
        { appName: 'Remote Management', appPackage: 'org.tizen.remote-management' },
        { appName: 'App', appPackage: 'com.samsung.tv.cobalt-app-2146' },
        { appName: '', appPackage: 'org.tizen.reminder' },
        { appName: 'Smarthub Connection Test', appPackage: 'org.tizen.smarthub-connection-test' },
        { appName: ' Network status widget ', appPackage: 'org.tizen.rs-network-status' },
        { appName: 'SamsungAccountService', appPackage: 'com.samsung.tizen.samsung-account' }
      ]);
    });
  });
});
