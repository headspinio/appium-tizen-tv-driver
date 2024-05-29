import unexpected from 'unexpected';
import unexpectedSinon from 'unexpected-sinon';
import {_parseListAppsCmd, _buildDebugCommand, _parseDebugPort, _parseCapability} from '../../lib/cli/sdb';

const expect = unexpected.clone().use(unexpectedSinon);

describe('sdb', function () {
  describe('buildDebugCommand', function () {
    it('should for newer platform version', function () {
      for (const platformVersion of [
        '4',
        '4.0',
        '4.0.0',
        '4.0.0.0'
      ]) {
        expect(
          _buildDebugCommand(platformVersion, 'biF5E2SN9M.AppiumHelper'), 'to equal', ['shell', '0', 'debug', 'biF5E2SN9M.AppiumHelper']
        );
      }
    });
    it('should for older platform version', function () {
      for (const platformVersion of [
        '3',
        '3.5',
        '3.5.9',
        '3.5.9.9'
      ]) {
        expect(
          _buildDebugCommand(platformVersion, 'biF5E2SN9M.AppiumHelper'), 'to equal', ['shell', '0', 'debug', 'biF5E2SN9M.AppiumHelper', '30']
        );
      }
    });
  });

  describe('parseDebugPort', function () {
    it('should parse the version as zero', function () {
      const stdout = 'port: 0\r\n\tresult: launched\r\n';
      expect(
        _parseDebugPort(stdout), 'to equal', '0'
      );
    });

    it('should parse the version as non-zero', function () {
      const stdout = 'port: 44670\r\n\tresult: launched\r\n';
      expect(
        _parseDebugPort(stdout), 'to equal', '44670'
      );
    });

    it('should parse the version for platform version 4 or newer', function () {
      const stdout = '... successfully launched pid = 32003 with debug 1 port: 44670';
      expect(
        _parseDebugPort(stdout), 'to equal', '44670'
      );
    });
  });

  describe('_parseCapability', function () {
    it('newer device, platform 5.0', function () {
      const stdout = `
secure_protocol:enabled
intershell_support:disabled
filesync_support:pushpull
usbproto_support:disabled
sockproto_support:enabled
syncwinsz_support:enabled
sdbd_rootperm:disabled
rootonoff_support:disabled
encryption_support:disabled
zone_support:disabled
multiuser_support:enabled
cpu_arch:armv7
sdk_toolpath:/home/owner/share/tmp/sdk_tools
profile_name:tv
vendor_name:Samsung
can_launch:tv-samsung
device_name:Tizen
platform_version:5.0
product_version:4.0
sdbd_version:2.2.31
sdbd_plugin_version:3.7.1_TV_REL
sdbd_cap_version:1.0
log_enable:disabled
log_path:/tmp
appcmd_support:disabled
appid2pid_support:enabled
pkgcmd_debugmode:enabled
netcoredbg_support:enabled`;

      const parsedResult = _parseCapability(stdout);
      expect(
        parsedResult, 'to equal', {
          secure_protocol: 'enabled',
          intershell_support: 'disabled',
          filesync_support: 'pushpull',
          usbproto_support: 'disabled',
          sockproto_support: 'enabled',
          syncwinsz_support: 'enabled',
          sdbd_rootperm: 'disabled',
          rootonoff_support: 'disabled',
          encryption_support: 'disabled',
          zone_support: 'disabled',
          multiuser_support: 'enabled',
          cpu_arch: 'armv7',
          sdk_toolpath: '/home/owner/share/tmp/sdk_tools',
          profile_name: 'tv',
          vendor_name: 'Samsung',
          can_launch: 'tv-samsung',
          device_name: 'Tizen',
          platform_version: '5.0',
          product_version: '4.0',
          sdbd_version: '2.2.31',
          sdbd_plugin_version: '3.7.1_TV_REL',
          sdbd_cap_version: '1.0',
          log_enable: 'disabled',
          log_path: '/tmp',
          appcmd_support: 'disabled',
          appid2pid_support: 'enabled',
          pkgcmd_debugmode: 'enabled',
          netcoredbg_support: 'enabled'
        }
      );
      expect(parsedResult.platform_version, 'to equal', '5.0');
    });
    it('old device, platform 2.4', function () {
      const stdout = `
secure_protocol:enabled
intershell_support:disabled
filesync_support:push
usbproto_support:enabled
sockproto_support:enabled
syncwinsz_support:enabled
rootonoff_support:disabled
zone_support:disabled
multiuser_support:disabled
cpu_arch:armv7
profile_name:tv
vendor_name:Samsung
can_launch:tv-samsung-public_-_tv-samsung-partner
platform_version:2.4.0
product_version:2.0
sdbd_version:2.2.31
sdbd_plugin_version:1.0.0
sdbd_cap_version:1.0`;

      const parsedResult = _parseCapability(stdout);
      expect(
        parsedResult, 'to equal', {
          secure_protocol: 'enabled',
          intershell_support: 'disabled',
          filesync_support: 'push',
          usbproto_support: 'enabled',
          sockproto_support: 'enabled',
          syncwinsz_support: 'enabled',
          rootonoff_support: 'disabled',
          zone_support: 'disabled',
          multiuser_support: 'disabled',
          cpu_arch: 'armv7',
          profile_name: 'tv',
          vendor_name: 'Samsung',
          can_launch: 'tv-samsung-public_-_tv-samsung-partner',
          platform_version: '2.4.0',
          product_version: '2.0',
          sdbd_version: '2.2.31',
          sdbd_plugin_version: '1.0.0',
          sdbd_cap_version: '1.0'
        }
      );
      expect(parsedResult.platform_version, 'to equal', '5.0');
    });
  });

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

  describe('_parseListAppsCmd with spaces and bad data', function () {
    it('should return the list of apps', function () {
      const returnValue = "\tApplication List for user 5001\r\n\tUser's Application \r\n\t Name \t AppID \r\n\t=================================================\r\n\t'alexa-fullscreen-app'\t 'com.samsung.tv.alexa-client-xapp-ut-on-tv'   \r\n\t'ContentSharing.Provider.Ftp'\t 'com.samsung.tv.coss.provider.d2d'      \r\n\t'Xbox'\t 'GHI3a0zMSx.XboxGamePass'     \r\n\t'not-a-real-app'\t 'should.not.work.string' baddata\r\n\t'cloning'\t 'org.tizen.cloning'\r\n\t'csfs'\t 'com.samsung.tv.csfs'\r\n\t'あ'\t 'pIaMf8YZyZ.service'\r\n\t'service-application'\t 'org.tizen.was-appsync'\r\n\t'fuzzy-search-engine'\t 'com.samsung.tv.fuzzy-search-engine'\r\n\t'pisa-control-service'\t 'org.tizen.pisa-control-service'\r\n\t'SmartThings Home CCTV Service'\t 'com.samsung.tv.iot-service-home-cctv_FLUX'\r\n\t'samsung-pass'\t 'com.samsung.tizen.samsung-pass-agent'\r\n\t'pluginplatform'\t 'com.samsung.tizen.smartthings-plugin-platform'\r\n\t'LibAriaFW'\t 'lib-ariafw-tv'\r\n\t'com.samsung.tv.ondevice-voice'\t 'com.samsung.tv.ondevice-voice'\r\n\t'PBS Video'\t '70fRFUwYlD.OtterGAProd'\r\n\t'iacr'\t 'com.samsung.tv.iacr'\r\n\t'Samsung Health'\t 'com.samsung.tv.samsung-health'\r\n\t''\t 'com.samsung.tv.remoteapp.local_stream'\r\n\t=================================================\r\n";

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
