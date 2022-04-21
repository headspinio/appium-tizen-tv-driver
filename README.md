# 🚀  Appium Tizen TV Driver

Appium Tizen TV Driver is a test automation tool for Roku devices. Appium Tizen TV Driver automates Tizen TV web applications, tested on real devices. Appium Roku Driver is part of the [Appium](https://github.com/appium/appium) test automation tool.

# Build Environment

It requires Tizen Studio to install this driver. https://developer.tizen.org/development/tizen-studio/download

```
export TIZEN_HOME=/home/your_place/tizen-studio
export PATH=${PATH}:${TIZEN_HOME}/tools:${TIZEN_HOME}/tools/ide/bin
```

Then, you could run the below to build this driver.

```
npm install && npm run build
```

# Side note

Tizen TV driver expect to have chromedriver 2.36 as `chromedriverExecutable` capability.
