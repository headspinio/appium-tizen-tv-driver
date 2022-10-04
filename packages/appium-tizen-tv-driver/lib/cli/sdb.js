import log from '../logger';
import {runCmd, SDB_BIN_NAME} from './helpers';

const DEBUG_PORT_RE = /^(?:.*port:\s)(?<port>\d{1,5})$/;
const APP_LIST_RE = /^[^']*'(?<name>[^']+)'[^']+'(?<id>[^']+)'.*$/;

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
 * @param {import('type-fest').SetRequired<Pick<StrictTizenTVDriverCaps, 'appPackage'|'udid'>, 'appPackage'>} caps
 */
async function debugApp({appPackage, udid}) {
  log.info(`Starting ${appPackage} in debug mode on ${udid}`);
  const {stdout} = await runSDBCmd(udid, ['shell', '0', 'debug', appPackage]);
  try {
    const port = stdout.trim().match(DEBUG_PORT_RE)?.groups?.port;
    if (!port) {
      throw new Error(`Cannot parse debug port from sdb output`);
    }
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
 * @param {Pick<StrictTizenTVDriverCaps, 'udid'>} caps
 */
async function listApps({udid}) {
  log.info(`Listing apps installed on '${udid}'`);
  const {stdout} = await runSDBCmd(udid, ['shell', '0', 'applist']);
  const apps = stdout
    .split('\n')
    .map((line) => {
      // TODO WIP fix this regex
      const match = line.match(APP_LIST_RE);
      if (!match?.groups) {
        return false;
      }
      return {appName: match.groups.name, appPackage: match.groups.id};
    })
    .filter(Boolean);
  log.info(`There are ${apps.length} apps installed`);
  return apps;
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
  listApps,
  forwardPort,
  removeForwardedPorts,
  connectDevice,
  disconnectDevice,
  removeForwardedPort,
};

/**
 * @typedef {import('../driver').StrictTizenTVDriverCaps} StrictTizenTVDriverCaps
 */
