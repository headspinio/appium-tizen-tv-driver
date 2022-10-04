const commonCapConstraints = {
  platformName: {
    isString: true,
    inclusionCaseInsensitive: ['TizenTV'],
    presence: true,
  },
  deviceName: {
    isString: true,
    presence: true,
  },
  deviceAddress: {
    isString: true,
  },
  app: {
    isString: true,
  },
  appPackage: {
    isString: true,
  },
  udid: {
    isString: true,
  },
  chromedriverExecutable: {
    isString: true,
    presence: true, // for now require a custom chromedriver to work with tv version
  },
  isDeviceApiSsl: {
    isBoolean: true,
  },
  useOpenDebugPort: {
    isNumber: true,
  },
  powerCyclePostUrl: {
    isString: true,
  },
  rcToken: {
    isString: true,
  },
  resetRcToken: {
    isBoolean: true,
  },
  sendKeysStrategy: {
    isString: true,
  },
  rcMode: {
    isString: true,
    inclusionCaseInsensitive: ['remote', 'js']
  },
  rcDebugLog: {
    isBoolean: true
  },
  rcKeypressCooldown: {
    isNumber: true
  }
};

const desiredCapConstraints = {...commonCapConstraints};

export {desiredCapConstraints};
