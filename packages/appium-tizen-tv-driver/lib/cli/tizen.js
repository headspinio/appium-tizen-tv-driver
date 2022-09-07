import log from '../logger';
import {runCmd, TIZEN_BIN_NAME} from './helpers';

/**
 * @param {string[]} args
 */
async function runTizenCmd(args) {
  return await runCmd(TIZEN_BIN_NAME, args);
}

/**
 * @param {import('type-fest').SetRequired<Pick<TizenTVDriverCaps, 'app'|'udid'>, 'app'>} caps
 */
async function tizenInstall({app, udid}) {
  log.info(`Installing tizen app '${app}' on device '${udid}'`);
  return await runTizenCmd(['install', '-n', app, '-s', udid]);
}

/**
 * @param {Pick<TizenTVDriverCaps, 'appPackage'|'udid'>} caps
 */
async function tizenUninstall({appPackage, udid}) {
  log.info(`Uninstalling tizen app '${appPackage}' on device '${udid}'`);
  return await runTizenCmd(['uninstall', '-p', appPackage, '-s', udid]);
}

/**
 * @param {Pick<TizenTVDriverCaps, 'appPackage'|'udid'>} caps
 */
async function tizenRun({appPackage, udid}) {
  log.info(`Running tizen app '${appPackage}' on device '${udid}'`);
  return await runTizenCmd(['run', '-p', appPackage, '-s', udid]);
}

export {runTizenCmd, tizenInstall, tizenUninstall, tizenRun};

/**
 * @typedef {import('../driver').TizenTVDriverCaps} TizenTVDriverCaps
 */
