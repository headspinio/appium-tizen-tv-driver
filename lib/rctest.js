import { Samsung as RemoteControl, KEYS } from 'samsung-tv-control';

async function main () {
  const rc = new RemoteControl({
    debug: true,
    ip: '127.0.0.1',
    mac: '4c:c9:5e:db:47:c5',
    port: 8002,
    secureSocket: false,
    delayCommands: true,
  });
  await rc.isAvailable();
  console.log(await rc.getTokenPromise());
  await rc.sendKeyPromise(KEYS.KEY_VOLDOWN);
}

main().catch(console.error);
