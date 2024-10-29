import log from '../logger';
import {runCmd, SDB_BIN_NAME} from './helpers';
import {util} from 'appium/support';
import _ from 'lodash';
import {retry} from 'asyncbox';

const DEBUG_PORT_RE = /^(?:.*port:\s)(?<port>\d{1,5}).*/;
const APP_LIST_RE = /^[^']*'(?<name>[^']*)'[^']+'(?<id>[^']+)'\s*$/;

const WAIT_TIME = '30';


/**
 * sdb shell debug command has different format lower/bigger than this version.
 * At least 3.0.0 and 2.5.0 should be `shell 0 debug <app> <number>`,
 * 5.0 and newer should be `shell 0 debug <app> <number>`.
 */
const PLATFORM_VERSION_COMMAND_COMPATIBILITY = '4.0.0';

/**
 *
 * @param {string?} udid
 * @param {string[]} args
 */
async function runSDBCmd(udid, args) {
  const restriction = udid ? ['-s', udid] : [];
  return await runCmd(SDB_BIN_NAME, [...restriction, ...args]);
}

/**
 * Return a list of debug command for the given platform version
 * @param {string} platformVersion the platform version available via `sdb capability` result
 * @param {string} appPackage
 * @returns {Array<string>}
 */
function _buildDebugCommand(platformVersion, appPackage) {
  const cmd = ['shell', '0', 'debug', appPackage];
  if (util.compareVersions(platformVersion, '<', PLATFORM_VERSION_COMMAND_COMPATIBILITY)) {
    // this WAIT_TIME is maybe in seconds, or it could be attempt count.
    cmd.push(WAIT_TIME);
  }
  return cmd;
}

/**
 *
 * @param {*} stdout
 * @returns
 */
function _parseDebugPort(stdout) {
  return stdout.trim().match(DEBUG_PORT_RE)?.groups?.port;
}

/**
 * @param {import('type-fest').SetRequired<Pick<StrictTizenTVDriverCaps, 'appPackage'|'udid'>, 'appPackage'>} caps
 * @param {string|number} platformVersion Platform version info available via `sdb capability` command
 * @param {number} [retryTimes=3] How many the command attemps to start the debug command. The launching app with debugger could fail
 *                                frequently. This retry will reduce the failure ratio.
 */
async function debugApp({appPackage, udid}, platformVersion, retryTimes = 3) {
  const getDebugPort = async () => {
    const {stdout} = await runSDBCmd(udid, _buildDebugCommand(`${platformVersion}`, appPackage));

    if (stdout.includes('failed')) {
      throw new Error(`Launching ${appPackage} might failed. Is it debuggable app or Did you terminate the package properly? Original error: ${stdout}}`);
    }

    const port = _parseDebugPort(stdout);
    if (!port) {
      throw new Error(`Cannot parse debug port from sdb output`);
    }
    return port;
  };

  log.info(`Starting ${appPackage} in debug mode on ${udid} up to ${retryTimes} times`);
  try {
    const port = await retry(retryTimes, getDebugPort);
    log.info(`Debug port opened on ${port}`);
    return port;
  } catch (e) {
    const message = /** @type {import('teen_process').ExecError} */(e);
    throw new Error(
      `Unable to retrieve debugger port from debug start invocation. ` +
        `Original error: ${message}`
    );
  }
}

/**
 * Launch (but do not attempt to debug) an app on the TV
 *
 * @param {import('type-fest').SetRequired<Pick<StrictTizenTVDriverCaps, 'appPackage'|'udid'>, 'appPackage'>} caps
 */
async function launchApp({appPackage, udid}) {
  log.info(`Starting ${appPackage} in on ${udid}`);
  const {stdout} = await runSDBCmd(udid, ['shell', '0', 'was_execute', appPackage]);
  if (/launch app failed/.test(stdout)) {
    throw new Error(`Could not launch app. Stdout from launch call was: ${stdout}`);
  }
}

/**
 * Launch (but do not attempt to debug) an app on the TV
 *
 * @param {import('type-fest').SetRequired<Pick<StrictTizenTVDriverCaps, 'udid'>, 'udid'>} caps
 * @param {string} pkgId package id to kill the process.
 */
async function terminateApp({udid}, pkgId) {
  log.info(`Terminating ${pkgId} in on ${udid}`);
  const {stdout} = await runSDBCmd(udid, ['shell', '0', 'kill', pkgId]);
  if (/failed/i.test(stdout)) {
    throw new Error(`Could not terminate app. Please make sure if the given '${pkgId}' was correct package id. Stdout from kill call was: ${stdout}`);
  }
}


/**
 * Return the list of installed applications with the pair of
 * an application name and the package name.
 * @param {Pick<StrictTizenTVDriverCaps, 'udid'>} caps
 * @param {string} platformVersion
 * @returns {Promise<[{appName: string, appPackage: string}]|[]>}
 */
async function listApps({udid}, platformVersion) {
  if (util.compareVersions(platformVersion, '<', PLATFORM_VERSION_COMMAND_COMPATIBILITY)) {
    // Old output needs more complex parsing logic.
    log.info(`listApps is not supported for platform version ${platformVersion}`);
    return [];
  }

  log.info(`Listing apps installed on '${udid}'`);
  const {stdout} = await runSDBCmd(udid, ['shell', '0', 'applist']);
  const apps = _parseListAppsCmd(stdout);
  log.info(`There are ${apps.length} apps installed`);
  return apps;
}

// FIXME: change to a class method and use #
function _parseListAppsCmd(input) {
  return input
    // the new string by tizen was '\r\n', so here should consider the case as well.
    .split(/\r\n|\n/)
    .map((line) => {
      const match = line.match(APP_LIST_RE);
      if (!match?.groups) {
        return false;
      }
      return {appName: match.groups.name, appPackage: match.groups.id};
    })
    .filter(Boolean);
}

/**
 * Return a dictionary of the result of 'sdb capability'
 * @param {Pick<StrictTizenTVDriverCaps, 'udid'>} caps
 * @returns {Promise<{}>}
 */
async function deviceCapabilities({udid}) {
  log.info(`Getting capabilities on '${udid}'`);
  const {stdout} = await runSDBCmd(udid, ['capability']);
  return _parseCapability(stdout);
}

function _parseCapability (input) {
  const eachLine = input.split(/\r\n|\n/);
  const caps = {};
  for (const line of eachLine) {
    const [key, value] = line.split(':');
    if (_.isEmpty(key)) {
      continue;
    }
    caps[key] = value;
  }
  return caps;
}

/**
 * @param {Pick<StrictTizenTVDriverCaps, 'udid'> & {localPort: number, remotePort: number}} caps
 */
async function forwardPort({udid, localPort, remotePort}) {
  log.info(`Forwarding local TCP port ${localPort} to port ${remotePort} on device ${udid}`);
  await runSDBCmd(udid, ['forward', `tcp:${localPort}`, `tcp:${remotePort}`]);
}

/**
 * @param {Pick<StrictTizenTVDriverCaps, 'udid'> & {localPort: number}} caps
 */
async function removeForwardedPort({udid, localPort}) {
  log.info(`Removing port forwarding for device ${udid} and local port ${localPort}`);
  await runSDBCmd(udid, ['forward', '--remove', String(localPort)]);
}

/**
 * @param {Pick<StrictTizenTVDriverCaps, 'udid'>} caps
 */
async function removeForwardedPorts({udid}) {
  log.info(`Removing all port forwarding for device ${udid}`);
  await runSDBCmd(udid, ['forward', '--remove-all']);
}

/**
 * @param {Pick<StrictTizenTVDriverCaps, 'udid'>} caps
 */
async function connectDevice({udid}) {
  log.info(`Connecting device '${udid}' via sdb`);
  await runSDBCmd(null, ['connect', udid]);
}

/**
 * @param {Pick<StrictTizenTVDriverCaps, 'udid'>} caps
 */
async function disconnectDevice({udid}) {
  log.info(`Disconnecting device '${udid}' via sdb`);
  await runSDBCmd(null, ['disconnect', udid]);
}

export {
  runSDBCmd,
  debugApp,
  launchApp,
  terminateApp,
  listApps,
  _parseListAppsCmd,
  forwardPort,
  removeForwardedPorts,
  connectDevice,
  disconnectDevice,
  removeForwardedPort,
  _buildDebugCommand,
  _parseDebugPort,
  _parseCapability,
  deviceCapabilities
};

/**
 * @typedef {import('../driver').StrictTizenTVDriverCaps} StrictTizenTVDriverCaps
 */
