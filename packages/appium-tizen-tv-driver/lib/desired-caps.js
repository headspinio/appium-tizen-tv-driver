let commonCapConstraints = {
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
    presence: true,
  },
  deviceMac: {
    isString: true,
    presence: true,
  },
  app: {
    isString: true,
  },
  appPackage: {
    isString: true,
  },
  udid: {
    isString: true,
    presence: true,
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
    presence: true,
  },
  sendKeysStrategy: {
    isString: true,
  },
};

let desiredCapConstraints = {};

Object.assign(desiredCapConstraints, commonCapConstraints);

export default desiredCapConstraints;
export {commonCapConstraints};
