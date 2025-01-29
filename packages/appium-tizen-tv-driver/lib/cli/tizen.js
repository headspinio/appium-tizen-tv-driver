import { retryInterval } from 'asyncbox';
import log from '../logger';
import {CMD_RETRY_BACKOFF_MS, runCmd, TIZEN_BIN_NAME} from './helpers';
import { ensureDeviceConnection } from './sdb';

/**
 * @param {string[]} args
 * @param {string} udid
 * @param {number} timeout Timeout to raise an error
 * @param {number} retryCount
 */
async function runTizenCmd(args, udid, timeout, retryCount) {
  const _runCmd = async () => {
    try {
      return await runCmd(TIZEN_BIN_NAME, args, timeout);
    } catch (err) {
      await ensureDeviceConnection(udid);
      // throw the original error.
      throw err;
    }
  };
  return await retryInterval(
    retryCount,
    CMD_RETRY_BACKOFF_MS,
    _runCmd
  );
}

/**
 * @param {import('type-fest').SetRequired<Pick<StrictTizenTVDriverCaps, 'app' | 'udid'| 'sdbExecTimeout'|'sdbExecRetryCount'>, 'app'>} caps
 */
async function tizenInstall({app, udid, sdbExecTimeout, sdbExecRetryCount}) {
  log.info(`Installing tizen app '${app}' on device '${udid}'`);

  // $ tizen install -t biF5E2SN9M.AppiumHelper  -n /path/to/AppiumHelper.wgt -s <device>
  // Transferring the package...
  // Transferred the package: /path/to/AppiumHelper.wgt -> /home/owner/share/tmp/sdk_tools/tmp
  // Installing the package...
  // --------------------
  // Platform log view
  // --------------------
  // install biF5E2SN9M.AppiumHelper
  // package_path /home/owner/share/tmp/sdk_tools/tmp/AppiumHelper.wgt
  // was_install_app return WAS_TRUE
  // app_id[biF5E2SN9M.AppiumHelper] install start
  // app_id[biF5E2SN9M.AppiumHelper] installing[8]
  // ..
  // app_id[biF5E2SN9M.AppiumHelper] installing[95]
  // app_id[biF5E2SN9M.AppiumHelper] installing[97]
  // app_id[biF5E2SN9M.AppiumHelper] installing[100]
  // app_id[biF5E2SN9M.AppiumHelper] install completed
  // spend time for wascmd is [2520]ms
  // cmd_ret:0
  // Installed the package: Id(biF5E2SN9M.AppiumHelper)
  // Tizen application is successfully installed.
  // Total time: 00:00:02.995

  // If an error occurred in the installation command, it will raise an error as well.
  // e.g. Different signature app is already installed.
  const {stdout} = await runTizenCmd(['install', '-n', app, '-s', udid], udid, sdbExecTimeout, sdbExecRetryCount);
  if (/successfully/i.test(stdout)) {
    return;
  }
  throw new Error(`Could not install app ${app}. Stdout from install call was: ${stdout}`);
}

/**
 * Uninstall the given app package from the udid.
 * Raises an error in case tizen command raises exit non-zero code, or
 * the tizen command silently failed with exit code 0.
 *
 * @param {import('type-fest').SetRequired<Pick<StrictTizenTVDriverCaps, 'appPackage'|'udid'|'sdbExecTimeout'|'sdbExecRetryCount'>, 'appPackage'>} caps
 */
async function tizenUninstall({appPackage, udid, sdbExecTimeout, sdbExecRetryCount}) {
  log.info(`Uninstalling tizen app '${appPackage}' on device '${udid}'`);

  // $ tizen uninstall -p biF5E2SN9M.AppiumHelper -s <device>
  // --------------------
  // Platform log view
  // --------------------
  // uninstall biF5E2SN9M.AppiumHelper
  // app_id[biF5E2SN9M.AppiumHelper] uninstall start
  // app_id[biF5E2SN9M.AppiumHelper] uninstalling[14]
  // app_id[biF5E2SN9M.AppiumHelper] uninstalling[57]
  // app_id[biF5E2SN9M.AppiumHelper] uninstall completed
  // spend time for wascmd is [7776]ms
  // cmd_ret:0
  // Total time: 00:00:08.691
  //
  // or
  // $ tizen uninstall -p biF5E2SN9M.AppiumHelper -s <device>
  // Package ID is not valid. Please check the package ID again.
  // Total time: 00:00:00.646
  //
  // or (silently failed.)
  // $ tizen uninstall -p biF5E2SN9M.AppiumHelper -s <device>
  // --------------------
  // Platform log view
  // --------------------
  // Total time: 00:00:00.324

  const {stdout} = await runTizenCmd(['uninstall', '-p', appPackage, '-s', udid], udid, sdbExecTimeout, sdbExecRetryCount);
  if (/uninstall completed/i.test(stdout)) {
    // ok
    return;
  }
  if (/Package ID is not valid/i.test(stdout)) {
    // This case could indicate the app does not exist. Ignoring.
    return;
  }

  throw new Error(`Might fail to uninstall ${appPackage}. Stdout from uninstall call was: ${stdout}`);
}

/**
 * @param {import('type-fest').SetRequired<Pick<StrictTizenTVDriverCaps, 'appPackage'|'udid'|'sdbExecTimeout'|'sdbExecRetryCount'>, 'appPackage'>} caps
 */
async function tizenRun({appPackage, udid, sdbExecTimeout, sdbExecRetryCount}) {
  log.info(`Running tizen app '${appPackage}' on device '${udid}'`);
  return await runTizenCmd(['run', '-p', appPackage, '-s', udid], udid, sdbExecTimeout, sdbExecRetryCount);
}

export {runTizenCmd, tizenInstall, tizenUninstall, tizenRun};

/**
 * @typedef {import('../driver').StrictTizenTVDriverCaps} StrictTizenTVDriverCaps
 */
