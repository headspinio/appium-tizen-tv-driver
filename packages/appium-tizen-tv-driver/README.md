# Appium Tizen TV Driver

[![npm version](https://img.shields.io/npm/v/appium-tizen-tv-driver.svg)](https://www.npmjs.com/package/appium-tizen-tv-driver)


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
  - Note: The pairing popup could appear a couple of times. Please allow all of them.
  - Note: The command could print `Invalid WebSocket frame: invalid status code 1005` error and fail without showing any popups.
    One possible reason here is this pairing request was denied in the past. Please check if such a "denied" item exists in the device list below.
    Then, please re-run the `pair-remote` command.
    - Go to _Settings_ -> _General_ -> _External Device Manager_ -> _Device Connect Manager_ -> _Device List_ and delete the "denied" item. (This device list place could depend on TV kinds)

## Known limitations

- WebKit based Tizen TV models (Tizen 2.4 (2016) and lower versions) do not support chromedriver based automation. Please use `'appium:rcMode':'remote'`. Then, the session will work as rcOnly mode.
  -  Reference: [Web Engine Specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)
- Tizen TV models that have Chrome 57 and lower versions do not support chormedriver based automation because chromedriver for such old versions requires chrome binary. `debuggerAddress` only mode does not work. Please use `'appium:rcMode':'remote'` and rcOnly mode such devices.
  - `cannot connect to chrome at 127.0.0.1:35713 from session not created exception: Chrome version must be >= 58.0.3029.0`

## Capabilities

| Capability                      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platformName`                  | _[Required]_ Must be `TizenTV`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `appium:automationName`         | _[Required]_ Must be `TizenTV`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `appium:deviceName`             | _[Required]_ This capability can technically be any string, but if you set it to `<device-host>:<sdb-port>`, then you don't need to include the `appium:udid` or `appium:deviceAddress` capabilities. E.g.: `127.0.0.1:26101`|
| `appium:chromedriverExecutable` | _[Required*]_ Most Tizen TVs run a very old version of Chrome. Because this driver uses Chromedriver under the hood, you'll need to have a very old version of Chromedriver handy that works with the version of Chrome backing the apps on your TV. In our testing, we've found Chromedriver 2.36 to work with most TVs. You need to tell the driver where you've installed this version of Chromedriver using the `appium:chromedriverExecutable` capability, passing in an absolute path to the Chromedriver binary. |
| `appium:chromedriverExecutableDir` | _[Required*]_ Full path to the folder where chromedriver executables are located. This folder is used then to store the downloaded chromedriver executables if automatic download is enabled with `chromedriver_autodownload` security flag. Please read [Automatic Discovery of Compatible Chromedriver in appium-uiautomator2-driver](https://github.com/appium/appium-uiautomator2-driver?tab=readme-ov-file#automatic-discovery-of-compatible-chromedriver) for more details. If the chrome version on the TV is lower than v63 major version, the using chrome version will be `Chrome/58.0.3029.0` forcefully to use chromedriver 2.31 for the session. Lower chromedriver could raise `cannot find Chrome binary` error, which prevent starting chromedriver session. |
| `appium:deviceAddress`          | The IP address on the local network of the TV you want to automate. This capability is required if the equivalent information is not found in `appium:deviceName`|
| `appium:udid`                   | The device ID as returned by `sdb devices`. This capability is required if the equivalent information is not found in `appium:deviceName`|
| `appium:app`                    | An absolute path to your `.wgt` app file, if you want Appium to install the app. It could also be an URL to a remote location.|
| `appium:appPackage`             | The app package ID, if you want Appium to use an app already on the TV.|
| `appium:rcMode`                 | One of `js` or `remote`. If `js`, the driver will use Chromedriver to mimic remote control keypresses. If `remote`, the driver will use a websocket-based input device API. If `remote`, see the `appium:rcToken` capability below. Defaults to `js`.                                                                                                                                                                                                                                                                |
| `appium:rcToken`                | Set to the same value as the token printed out when running the `pair-remote` driver script. If omitted _and `appium:rcMode` is `remote`_, the driver will attempt to get a token from the the `TIZEN_REMOTE_TOKEN` environment variable, on-disk cache, or fetched automatically from the device and persisted to cache for future sessions (this will take at least 30s).                                                                                                                                          |
| `appium:resetRcToken`           | If `appium:rcMode` is `remote`, set this to `true` to force the driver to fetch a new token from the device. This is useful if your token is no longer valid and you do not wish to use the `pair-remote` driver script.                                                                                                                                                                                                                                                                                             |
|`appium:rcOnly`| If this is set to `true`, then no Chromedriver connection will be established, and only remote control commands will be available (no finding elements, getting source, etc...). This mode is useful if you have a non-web-based app and simply want to automate fire-and-forget remote control commands|
| `appium:useOpenDebugPort`       | If you have already launched an app on the TV in debug mode, and you know its remote debugging port, you can have Appium simply attach to it by sending in the port as a number as the value of this capability. This is mostly useful for driver development.                                                                                                                                                                                                                                                       |
| `appium:isDeviceApiSsl`         | Set it to `true` if you want Appium to connect to the device over SSL.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `appium:rcDebugLog` | Set to `true` to enable debug logs from the interaction with the device's remote control API. |
| `appium:rcKeypressCooldown` | Cooldown (in milliseconds) after each keypress via remote.  Only applies if `appium:rcMode` is `remote`.  Increase this number if keypress commands complete before the app under test reflects the keypress. Defaults to `750` ms. |
| `appium:noReset` | If the driver resets the local data of the application under test. It calls `window.localStorage.clear()` and `window.location.reload()` to clear the local data and reload the content. Defaults to `true`.
| `appium:powerCyclePostUrl` | If the driver cycling the device power with `appium:fullReset` capability. Both capabilities are set, the session creation will try to cycle the device power.
| `appium:sendKeysStrategy` | If the driver uses remote control API to send keys or proxies to the chromedriver. Available values are `proxy` or `rc`. Please read `Set Value (Send Keys)` section below for more details. Default to `undefined`. Please configure it explicitly.

(*) `appium:chromedriverExecutable` or `appium:chromedriverExecutableDir` are required. The chromedriver autodwonload works only when `appium:chromedriverExecutableDir` is provided.
If both capabilities are given, `appium:chromedriverExecutableDir` take priority.

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

> The list of installed applications. Old device models (e.g. Year 2016) may always return an empty list as not supported.
> Each item has `appName` and `appPackage`.

- `POST /session/:sessionId/execute`

#### Arguments

- `script`: `tizen: listApps`

### Activate the package name

> Send a launch command with the given package name to the device under test.
> This package name is the same as what you give as `appium:appPackage`.
> Note that launching `appPackage` with `debug` mode requires `appPackage` has been terminated.

- `POST /session/:sessionId/execute`

#### Arguments

- `script`: `tizen: activateApp`
- `appPackage`: application package name to launch
- `debug`: if activating the app with 'debug' mode.
It launches the `appPackage` with `sdb -s <device> shell 0 debug <appPackage>` so that the session can automate it via chromedriver.
The `appPackage` must be terminated before the launch.
Existing chromedriver session will be terminated to keep one chormedriver session.

> [!NOTE]
> The launching with `debug` mode could clear the local data as the `sdb` command behavior.
> i.e. If you store some data in the `localStorage` like `driver.execute_script "localStorage.setItem('cat', 'dog');"`,
> `driver.execute_script "return localStorage.getItem('cat');"` will return `nil` instead of `dog` after the activateApp with `debug` option restart.
> Please consider handling the `localStorage` directly without `debug` launching option.

#### Example

```ruby
# Ruby
driver.execute_script "tizen: activateApp", {appPackage: "biF5E2SN9M.AppiumHelper"}
driver.execute_script "tizen: activateApp", {appPackage: "biF5E2SN9M.AppiumHelper", debug: true}
```

### Terminate the package id

> Send a kill command with the given package id to the device under test.
> This package id is not the entire `appPackage`.
> It could be the same as the `appPackage`, but it also could be different.
> Please check the `pkgId` value in your application under test package.
> e.g. `org.tizen.browser` works both `appPackage` and `pkgId`, but `9Ur5IzDKqV.TizenYouTube` works as `appPackage` but the `9Ur5IzDKqV` part is `pkgId` used in this command.

- `POST /session/:sessionId/execute`

#### Arguments

- `script`: `tizen: terminateApp`
- `pkgId`: package id to terminate

#### Example

```ruby
# Ruby
driver.execute_script "tizen: terminateApp", {pkgId: "biF5E2SN9M"}
```

### Clear the local data of the application under test

> Calls `window.localStorage.clear()` and `window.location.reload()` methods to clear the local data and reload the content of the application under test to reset it.

- `POST /session/:sessionId/execute`

#### Arguments

- `script`: `tizen: clearApp`

#### Example

```ruby
# Ruby
driver.execute_script "tizen: clearApp"
```

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
- The application under test keeps raising an error succh as `Could not launch the null application` (as part of the error message)
    - Please specify `appium:app` capability. Then usually tizentv driver uninstalls the app before installing the app to terminate the running app process forcefully.
    - Perhaps the TV device internal is weird state to launch the app process.
- App uninstallation could fail silently. It means while tizen/shell command did not end with exit code non-zero, the command failed to uninstall the app.
    - Please manually uninstall the application if you'd like to uninstall completely.
    - Report this issue in [bug report](https://www.tizen.org/ko/community/bug-tracker/how-report-bugs)

## Credits

- This driver is developed by [HeadSpin](https://headspin.io) and other open source contributors.
- It is inspired by and relies on previous work done by [@sharkyStudy](https://github.com/sharkyStudy). Thank you!
