import yargs from 'yargs/yargs';
import {TizenRemote, Keys as KEYS} from '@headspinio/tizen-remote';
import {RC_OPTS} from './driver';

export async function pairRemote({host}) {
  const rc = new TizenRemote({
    ...RC_OPTS,
    host,
  });

  const token = await rc.getToken();
  if (token) {
    console.log(token); // eslint-disable-line no-console
    return;
  }

  throw new Error(`Could not retrieve token; please try allowing the remote again`);
}

export async function testRemote({host, token}) {
  const rc = new TizenRemote(host, {
    ...RC_OPTS,
    token,
  });

  await rc.click(KEYS.HOME);
  await rc.disconnect();
}

async function main() {
  const {host, token} = yargs(process.argv.slice(2))
    .option('host', {
      alias: 'h',
      describe: 'IP address of the Tizen device',
    })
    .option('token', {
      alias: 't',
      describe: 'Token retrieved from previous call (to test if pairing is successful)',
    })
    .demandOption(['host'], 'Please provide "host" argument')
    .help().argv;

  if (token) {
    await testRemote({host, token});
  } else {
    await pairRemote({host});
  }
}

if (require.main === module) {
  process.on('unhandledRejection', (err) => {
    throw err;
  });
  main();
}
