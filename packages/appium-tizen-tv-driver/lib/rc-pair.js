import yargs from 'yargs/yargs';
import { Samsung as RemoteControl, KEYS } from 'samsung-tv-control';
import { RC_OPTS } from './driver';

export async function pairRemote ({ip, mac}) {
  const rc = new RemoteControl({
    ...RC_OPTS,
    debug: false,
    ip,
    mac,
  });

  await rc.isAvailable();
  const token = await rc.getTokenPromise();
  if (token) {
    console.log(token); // eslint-disable-line no-console
    return;
  }

  throw new Error(`Could not retrieve token; please try allowing the remote again`);
}

export async function testRemote ({ip, mac, token}) {
  const rc = new RemoteControl({
    ...RC_OPTS,
    debug: false,
    ip,
    mac,
    token,
  });

  await rc.isAvailable();
  await rc.sendKeyPromise(KEYS.KEY_HOME);
  process.exit(0); // necessary because stupid rc library doesn't close socket connections
}

async function main () {
  const {host, mac, token} = yargs(process.argv.slice(2))
    .option('host', {
      alias: 'h',
      describe: 'IP address of the Tizen device',
    })
    .option('mac', {
      alias: 'm',
      describe: 'Mac address of the Tizen device',
    })
    .option('token', {
      alias: 't',
      describe: 'Token retrieved from previous call (to test if pairing is successful)',
    })
    .demandOption(['host', 'mac'], 'Please provide both host and mac arguments')
    .help()
    .argv;

  if (token) {
    await testRemote({ip: host, mac, token});
  } else {
    await pairRemote({ip: host, mac});
  }
}

if (require.main === module) {
  main().catch((err) => { // eslint-disable-line promise/prefer-await-to-callbacks
    throw err;
  });
}
