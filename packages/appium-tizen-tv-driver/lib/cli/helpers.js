import {exec} from 'teen_process';
import {fs, system} from 'appium/support';
import path from 'path';
import log from '../logger';
import net from 'node:net';
import _ from 'lodash';

const TIZEN_BIN_NAME = 'tizen';
const SDB_BIN_NAME = 'sdb';

/**
 * Default timeout to wait for the tizen command.
 */
export const CMD_TIMEOUT_MS = 120000;

/**
 * Default retry count for the tizen command.
 */
export const CMD_RETRY_MAX = 2;

/**
 * back off time in each retry
 */
export const CMD_RETRY_BACKOFF_MS = 1000;

/**
 * Lookup of path parts by bin name, relative to `TIZEN_HOME` env var
 */
const BIN_PATHS = system.isWindows()
  ? Object.freeze({
      [TIZEN_BIN_NAME]: ['tools', 'ide', 'bin', 'tizen.bat'],
      [SDB_BIN_NAME]: ['tools', 'sdb.exe'],
    })
  : Object.freeze({
      [TIZEN_BIN_NAME]: ['tools', 'ide', 'bin', TIZEN_BIN_NAME],
      [SDB_BIN_NAME]: ['tools', SDB_BIN_NAME],
    });

/**
 * In-memory cache of known executable paths
 * @type {Record<string,string>}
 */
const bins = {};

/**
 * Runs external command by "bin name"
 * @param {KnownBinName} bin
 * @param {string[]} args
 * @param {number} timeout Timeout to raise an error
 */
async function runCmd(bin, args, timeout) {
  if (!(bin in bins)) {
    await setBin(bin);
  }
  log.info(`Running command with timeout ${timeout}ms: ${bins[bin]} ${args.join(' ')}`);
  try {
    return await exec(bins[bin], args, {timeout});
  } catch (err) {
    const e = /** @type {import('teen_process').ExecError} */ (err);
    const stdout = e.stdout.replace(/[\r\n]+/g, ' ');
    const stderr = e.stderr.replace(/[\r\n]+/g, ' ');
    e.message = `${e.message}. Stdout was: '${stdout}'. Stderr was: '${stderr}'`;
    throw e;
  }
}

/**
 * Type guard
 * @param {any} value
 * @returns {value is KnownBinName}
 */
function isKnownBinName(value) {
  return value === TIZEN_BIN_NAME || value === SDB_BIN_NAME;
}

/**
 * @param {string} name
 */
async function setBin(name) {
  if (!isKnownBinName(name)) {
    throw new Error(`We don't know how to find the '${name}' binary`);
  }
  log.info(`Attempting to verify location of the '${name}' binary`);
  if (!process.env.TIZEN_HOME) {
    throw new Error(`TIZEN_HOME env var must be set so that we can find Tizen CLI tools`);
  }
  // TODO check name of binary on windows and update based on platform if necessary
  const bin = path.resolve(process.env.TIZEN_HOME, ...BIN_PATHS[name]);
  try {
    await fs.access(bin, fs.constants.R_OK | fs.constants.X_OK);
  } catch {
    throw new Error(
      `Tried to find binary at ${bin} but it did not exist or was not ` +
        `executable. Please double-check permissions and TIZEN_HOME value`
    );
  }
  bins[name] = bin;
  log.info(`Binary was found at ${bin}`);
}

/**
 * Check the connection of the given host:port
 * @param {string} udid Expected to be <host:port> string
 * @param {number} timeout
 * @returns
 */
async function checkConnection(udid, timeout = 5000) {
  const [host, port] = _.split(udid, ':');
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

    socket.setTimeout(timeout);
    socket.on('connect', () => {
          socket.destroy();
          resolve(true);
    });

    socket.on('timeout', () => {
          socket.destroy();
          reject(new Error('Connection timed out'));
    });

    socket.on('error', (err) => {
          socket.destroy();
          reject(err);
    });

    socket.connect(_.toNumber(port), host);
  });
}

export {runCmd, setBin, TIZEN_BIN_NAME, SDB_BIN_NAME, checkConnection};

/**
 * @typedef {typeof TIZEN_BIN_NAME|typeof SDB_BIN_NAME} KnownBinName
 */
