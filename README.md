# Appium Tizen TV Driver

The Appium Tizen TV Driver is a test automation tool for Samsung Tizen TV devices. It works with
Tizen apps that have been developed using the web-style framework (not the "native" C++-based
apps). This driver is designed to be used with [Appium](https://github.com/appium/appium). On its
own it doesn't do anything.

## Installation

If you're using the standard Appium CLI tool to manage drivers:

```
appium driver install --source=npm appium-tizen-tv-driver
```

(Or if you're using NPM to manage dependencies, just include the `appium-tizen-tv-driver` npm
package in your `package.json`)

## Additional Requirements

- [Tizen Studio](https://developer.tizen.org/development/tizen-studio/download) is required to use
  this driver. Once it's installed, you'll need to export the `TIZEN_HOME` environment variable
  that the driver relies on. It's also convenient to add some of the studio tools to your path so
  you can run them as well:
    ```
    export TIZEN_HOME=/path/to/your/tizen-studio
    export PATH=${PATH}:${TIZEN_HOME}/tools:${TIZEN_HOME}/tools/ide/bin
    ```
- The TV needs to be put into [developer mode](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).
- The app you want to test needs to be a correctly-signed debug version of your app.
- The TV needs to be on the same local network as the Appium server.
- On a first run, the driver will attempt to pair a virtual "remote control" device with the TV.
  You must be present to accept the permissions for this pairing, otherwise remote control-based
  commands will not work. See below for the `appium:rcPairingMode` capability.

## Capabilities

|Capability|Description|
|--|--|
|`platformName`|[Required] Must be `TizenTV`|
|`appium:automationName`|[Required] Must be `TizenTV`|
|`appium:deviceName`|[Required] Appium requires this capability be sent, but this driver does not do anything with it you so can make it whatever you want.|
|`appium:deviceAddress`|[Required] The IP address on the local network of the TV you want to automate|
|`appium:deviceMac`|[Required] The Mac address of the TV|
|`appium:udid`|[Required] The device ID as returned by `sdb devices`|
|`appium:app`|An absolute path to your `.wgt` app file, if you want Appium to install the app.|
|`appium:appPackage`|The app package ID, if you want Appium to use an app already on the TV.|
|`appium:chromedriverExecutable`|[Required] Most Tizen TVs run a very old version of Chrome. Because this driver uses Chromedriver under the hood, you'll need to have a very old version of Chromedriver handy that works with the version of Chrome backing the apps on your TV. In our testing, we've found Chromedriver 2.36 to work with most TVs. You need to tell the driver where you've installed this version of Chromedriver using the `appium:chromedriverExecutable` capability, passing in an absolute path to the Chromedriver binary.|
|`appium:rcPairingMode`|Set to `true` to essentially create an empty session to give you time to accept the remote pairing dialog so that the access token can be saved for later use. This is a good initial step before running actual automation.|
|`appium:useOpenDebugPort`|If you have already launched an app on the TV in debug mode, and you know its remote debugging port, you can have Appium simply attach to it by sending in the port as a number as the value of this capability. This is mostly useful for driver development.|
|`appium:isDeviceApiSsl`|Set it to `true` if you want Appium to connect to the device over SSL.|

## Commands

### `Create Session`

- `POST /session`

This is a standard WebDriver protocol command that allows you to send in a set of capabilities to
start an automation session on your app.

###  `Delete Session`

- `DELETE /session/:sessionId`

End a session, close the app and make the driver ready for new sessions.

### Set Value (Send Keys)

* `POST /session/:sessionId/element/:elementId/value`

Send keys to an input element. Note that the behaviour of this command depends on the
`appium:sendKeysStrategy` capability and its value. The default value of this capability is
`proxy`, and in this mode, calling this command will proxy the command via Chromedriver.

If you set the value of this capability to `rc`, the text will instead be sent over the remote
control protocol implemented by Samsung. In this mode, the actual element ID used is immaterial;
the remote has no knowledge of "elements". It merely sends text into the active input field. You
are responsible for making sure an input field is active and that the keyboard is on screen. This
command will take care of entering the text and closing the keyboard. What happens next is up to
your application logic.

### `Press Key Code`

- `POST /session/:sessionId/appium/device/press_keycode`

Press a remote key on the TV. The keycodes should be the string taken from the `KEYS` object
exported by the [samsung-tv-control](https://www.npmjs.com/package/samsung-tv-control) package.
Refer to your Appium client library for how to use this method. Note that the string should not
include the initial `KEYS_` prefix that exists on the [object
fields](https://github.com/Toxblh/samsung-tv-control/blob/master/src/keys.ts)

### Proxied Commands

Once a session is started, all commands other than the ones mentioned above are proxied to
Chromedriver. This means you have access to the entire suite of WebDriver spec commands available
through Chromedriver. Refer to the Chromedriver documentation and Selenium client documentation for
your language to see what's available.

## Contributing

Pull requests are welcome! To work on the driver locally, clone the repo and run `npm install`.
Make your changes, then run `npm run build` to transpile them. You can install the driver using
Appium's driver CLI to install from your local development path. You can also just watch for
changes in the code and rebuild when anything does change:

```
npm run watch
```

## Credits

- This driver is developed by [HeadSpin](https://headspin.io) and other open source contributors.
- It is inspired by and relies on previous work done by [@sharkyStudy](https://github.com/sharkyStudy). Thank you!
