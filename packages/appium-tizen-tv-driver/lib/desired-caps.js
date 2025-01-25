export const desiredCapConstraints = /** @type {const} */({
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
  },
  chromedriverExecutableDir: {
    isString: true,
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
  rcOnly: {
    isBoolean: true,
  },
  rcDebugLog: {
    isBoolean: true
  },
  rcKeypressCooldown: {
    isNumber: true
  },
  appLaunchCooldown: {
    isNumber: true
  },
  showChromedriverLog: {
    isBoolean: true
  },
  sdbExecTimeout: {
    isNumber: true
  }
});

/**
 * @typedef {typeof desiredCapConstraints} TizenTVDriverCapConstraints
 */
