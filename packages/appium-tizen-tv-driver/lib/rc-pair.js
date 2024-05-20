import yargs from 'yargs/yargs';
import {TizenRemote, Keys as KEYS} from '@headspinio/tizen-remote';
import {RC_OPTS} from './driver';
import got from 'got';

/**
 *
 * @param {{host:string, port?: number}} opts
 * @returns {Promise<void>}
 */
export async function pairRemote({host, port}) {
  try {
    await got.get(`http://${host}:8001`);
  } catch (err) {
    console.log(`The device ${host} might be denied in the past pairing. Please make sure that the device ${host} has no denied devices, especially named '${host}'.`); // eslint-disable-line no-console
    throw err;
  }

  const rc = new TizenRemote(host, {...RC_OPTS, port});

  try {
    const token = await rc.getToken({force: true});
    if (token) {
      console.log(token); // eslint-disable-line no-console
      return;
    }

    if (await rc.isTokenSupportedDevice()) {
      throw new Error(`Could not retrieve token; please try allowing the remote again`);
    }

    console.log('The device may not token supported device. Allowing the notification is sufficient.');  // eslint-disable-line no-console
  } finally {
    await rc.disconnect();
  }
}

/**
 *
 * @param {{host: string, token:string, port?: number}} opts
 */
export async function testRemote({host, token, port}) {
  const rc = new TizenRemote(host, {
    ...RC_OPTS,
    port,
    token,
  });
  try {
    await rc.click(KEYS.HOME);
    console.log('OK'); // eslint-disable-line no-console
  } finally {
    await rc.disconnect();
  }

}

async function main() {
  const {host, token, port} = await yargs(process.argv.slice(2))
    .option('host', {
      type: 'string',
      alias: 'h',
      describe: 'IP address of the Tizen device',
    })
    .option('port', {
      type: 'number',
      alias: 'p',
      describe: 'Port of websocket server on the Tizen device',
      default: 8002
    })
    .option('token', {
      type: 'string',
      alias: 't',
      describe: 'Token retrieved from previous call (to test if pairing is successful)',
    })
    .demandOption(['host'], 'Please provide "host" argument')
    .help().parse();

  if (token) {
    await testRemote({host, token, port});
  } else {
    await pairRemote({host, port});
  }
}

if (require.main === module) {
  process.on('unhandledRejection', (err) => {
    throw err;
  });
  main();
}
