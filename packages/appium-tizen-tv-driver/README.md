# Appium Tizen TV Driver

> Tizen TV Driver for [Appium](https://appium.io)

The Appium Tizen TV Driver is a test automation tool for Samsung Tizen TV devices. It works with
Tizen apps that have been developed using the web-style framework (not the "native" C++-based
apps). This driver is designed to be used with [Appium](https://github.com/appium/appium); on its
own it doesn't do anything.

## Installation

If you're using the standard Appium CLI tool to manage drivers:

```bash
appium driver install --source=npm appium-tizen-tv-driver
```

(Or if you're using NPM to manage dependencies, just include the `appium-tizen-tv-driver` npm
package in your `package.json`)

## Additional Requirements

- [Tizen Studio](https://developer.tizen.org/development/tizen-studio/download) is required to use
  this driver. Once it's installed, you'll need to export the `TIZEN_HOME` environment variable
  that the driver relies on. It's also convenient to add some of the studio tools to your path so
  you can run them as well:

  ```bash
  export TIZEN_HOME=/path/to/your/tizen-studio
  export PATH=${PATH}:${TIZEN_HOME}/tools:${TIZEN_HOME}/tools/ide/bin
  ```

- The TV needs to be put into [developer mode](
  https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).
- The TV must be connected to the Appium host via sdb (run `sdb connect <tv-ip>`). You can always
  verify that the TV is connected before running a test by running `sdb devices`.
- The app you want to test needs to be a correctly-signed debug version of your app.
- The TV needs to be on the same local network as the Appium server.
- Before running your first session, you should run `appium driver run tizentv pair-remote` to
  initiate a remote pairing session with the TV. When you accept the remote pairing, a pairing
  token will be printed to the command line. Use this token as the content of the `appium:rcToken`
  capability to allow Appium remote control access. The `pair-remote` script takes one required
  argument: `--host`, which should refer to the IP of the TV. For example:

  ```bash
  appium driver run tizentv pair-remote --host 10.192.45.12
  ```

## Capabilities

| Capability                      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platformName`                  | _[Required]_ Must be `TizenTV`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `appium:automationName`         | _[Required]_ Must be `TizenTV`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `appium:deviceName`             | _[Required]_ This capability can technically be any string, but if you set it to `<device-host>:<sdb-port>`, then you don't need to include the `appium:udid` or `appium:deviceAddress` capabilities. E.g.: `127.0.0.1:26101`|
| `appium:chromedriverExecutable` | _[Required]_ Most Tizen TVs run a very old version of Chrome. Because this driver uses Chromedriver under the hood, you'll need to have a very old version of Chromedriver handy that works with the version of Chrome backing the apps on your TV. In our testing, we've found Chromedriver 2.36 to work with most TVs. You need to tell the driver where you've installed this version of Chromedriver using the `appium:chromedriverExecutable` capability, passing in an absolute path to the Chromedriver binary. |
| `appium:deviceAddress`          | The IP address on the local network of the TV you want to automate. This capability is required if the equivalent information is not found in `appium:deviceName`|
| `appium:udid`                   | The device ID as returned by `sdb devices`. This capability is required if the equivalent information is not found in `appium:deviceName`|
| `appium:app`                    | An absolute path to your `.wgt` app file, if you want Appium to install the app.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `appium:appPackage`             | The app package ID, if you want Appium to use an app already on the TV.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `appium:rcMode`                 | One of `js` or `remote`. If `js`, the driver will use Chromedriver to mimic remote control keypresses. If `remote`, the driver will use a websocket-based input device API. If `remote`, see the `appium:rcToken` capability below. Defaults to `js`.                                                                                                                                                                                                                                                                |
| `appium:rcToken`                | Set to the same value as the token printed out when running the `pair-remote` driver script. If omitted _and `appium:rcMode` is `remote`_, the driver will attempt to get a token from the the `TIZEN_REMOTE_TOKEN` environment variable, on-disk cache, or fetched automatically from the device and persisted to cache for future sessions (this will take at least 30s).                                                                                                                                          |
| `appium:resetRcToken`           | If `appium:rcMode` is `remote`, set this to `true` to force the driver to fetch a new token from the device. This is useful if your token is no longer valid and you do not wish to use the `pair-remote` driver script.                                                                                                                                                                                                                                                                                             |
|`appium:rcOnly`| If this is set to `true`, then no Chromedriver connection will be established, and only remote control commands will be available (no finding elements, getting source, etc...). This mode is useful if you have a non-web-based app and simply want to automate fire-and-forget remote control commands|
| `appium:useOpenDebugPort`       | If you have already launched an app on the TV in debug mode, and you know its remote debugging port, you can have Appium simply attach to it by sending in the port as a number as the value of this capability. This is mostly useful for driver development.                                                                                                                                                                                                                                                       |
| `appium:isDeviceApiSsl`         | Set it to `true` if you want Appium to connect to the device over SSL.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `appium:rcDebugLog` | Set to `true` to enable debug logs from the interaction with the device's remote control API. |
| `appium:rcKeypressCooldown` | Cooldown (in milliseconds) after each keypress via remote.  Only applies if `appium:rcMode` is `remote`.  Increase this number if keypress commands complete before the app under test reflects the keypress. Defaults to `750` ms. |

## Commands

### Create Session

> Create a session.

- `POST /session`

This is a standard WebDriver protocol command that allows you to send in a set of capabilities to
start an automation session on your app.

### Delete Session

> End a session.

- `DELETE /session/:sessionId`

End a session, close the app and make the driver ready for new sessions.

### Set Value (Send Keys)

> Send keys to an input element.

- `POST /session/:sessionId/element/:elementId/value`

Note that the behaviour of this command depends on the
`appium:sendKeysStrategy` capability and its value. The default value of this capability is
`proxy`, and in this mode, calling this command will proxy the command via Chromedriver.

If you set the value of this capability to `rc`, the text will instead be sent over the remote
control protocol implemented by Samsung. In this mode, the actual element ID used is immaterial;
the remote has no knowledge of "elements". It merely sends text into the active input field. You
are responsible for making sure an input field is active and that the keyboard is on screen. This
command will take care of entering the text and closing the keyboard. What happens next is up to
your application logic.

### Press Key

> Press a remote key on the TV.

- `POST /session/:sessionId/execute`

#### Arguments

- `script`: `tizen: pressKey`
- `key`: (see below)

The keycodes should be the string taken from values of the [`Keys` object](https://github.com/headspinio/appium-tizen-tv-driver/tree/main/packages/tizen-remote/lib/keys.js)
exported by the [@headspinio/tizen-remote](https://github.com/headspinio/appium-tizen-tv-driver/tree/main/packages/tizen-remote) package.

Refer to your Appium client library for how to use this method.

### Long Press Key

> "Long press" a remote key on the TV.

- `POST /session/:sessionId/execute`

#### Arguments

- `script`: `tizen: longPressKey`
- `key`: (see below)
- `duration`: `{number}` in milliseconds

The keycodes should be the string taken from values of the [`Keys` object](https://github.com/headspinio/appium-tizen-tv-driver/tree/main/packages/tizen-remote/lib/keys.js)
exported by the [@headspinio/tizen-remote](https://github.com/headspinio/appium-tizen-tv-driver/tree/main/packages/tizen-remote) package.

Refer to your Appium client library for how to use this method.

### Get the list of installed applications

> The list of installed applications.
> Each item has `appName` and `appPackage`.

- `POST /session/:sessionId/execute`

#### Arguments

- `script`: `tizen: listApps`


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

```bash
npm run watch
```

## Troubleshooting
- The application under test did not start; `sdb -s <device> shell 0 debug <package id>' exited with code 1`
    - Please make sure the application under test is debuggable


## Credits

- This driver is developed by [HeadSpin](https://headspin.io) and other open source contributors.
- It is inspired by and relies on previous work done by [@sharkyStudy](https://github.com/sharkyStudy). Thank you!
