import {exec} from 'teen_process';
import {fs, system} from 'appium/support';
import path from 'path';
import log from '../logger';

const TIZEN_BIN_NAME = 'tizen';
const SDB_BIN_NAME = 'sdb';

/**
 * Default timeout to wait for the tizen command.
 */
const CMD_TIMEOUT_MS = 240000;

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
 */
async function runCmd(bin, args) {
  if (!(bin in bins)) {
    await setBin(bin);
  }
  log.info(`Running command: ${bins[bin]} ${args.join(' ')}`);
  try {
    return await exec(bins[bin], args, {timeout: CMD_TIMEOUT_MS});
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
export {runCmd, setBin, TIZEN_BIN_NAME, SDB_BIN_NAME};

/**
 * @typedef {typeof TIZEN_BIN_NAME|typeof SDB_BIN_NAME} KnownBinName
 */
