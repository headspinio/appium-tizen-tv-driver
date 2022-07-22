import { exec } from 'teen_process';
import { fs } from 'appium/support';
import path from 'path';
import log from '../logger';

const TIZEN_BIN_NAME = 'tizen';
const SDB_BIN_NAME = 'sdb';

const BIN_PATHS = {
  [TIZEN_BIN_NAME]: ['tools', 'ide', 'bin', 'tizen'],
  [SDB_BIN_NAME]: ['tools', 'sdb'],
};
const bins = {};

async function runCmd (bin, args) {
  if (!bins[bin]) {
    await setBin(bin);
  }
  log.info(`Running command: ${bins[bin]} ${args.join(' ')}`);
  try {
    return await exec(bins[bin], args);
  } catch (e) {
    const stdout = e.stdout.replace(/[\r\n]+/, ' ');
    const stderr = e.stderr.replace(/[\r\n]+/, ' ');
    e.message = `${e.message}. Stdout was: '${stdout}'. Stderr was: '${stderr}'`;
    throw e;
  }
}

async function setBin (name) {
  if (!Object.keys(BIN_PATHS).includes(name)) {
    throw new Error(`We don't know how to find the '${name}' binary`);
  }
  log.info(`Attempting to verify location of the '${name}' binary`);
  if (!process.env.TIZEN_HOME) {
    throw new Error(`TIZEN_HOME env var must be set so that we can find binary`);
  }
  // TODO check name of binary on windows and update based on platform if necessary
  const bin = path.resolve(process.env.TIZEN_HOME, ...BIN_PATHS[name]);
  if (!await fs.exists(bin)) {
    throw new Error(`Tried to find binary at ${bin} but it did not exist or was not ` +
                    `accessible. Please double-check permissions and TIZEN_HOME value`);
  }
  bins[name] = bin;
  log.info(`Binary was found at ${bin}`);
}
export { runCmd, setBin, TIZEN_BIN_NAME, SDB_BIN_NAME };
