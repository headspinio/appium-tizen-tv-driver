import {RcKeyCode} from '@headspinio/tizen-remote';
import {Browser, RemoteOptions, remote} from 'webdriverio';

export async function tizenBrowser(opts: RemoteOptions) {
  const browser = await remote(opts);
  browser.addCommand(
    'pressKey',
    async (key: RcKeyCode) => await browser.execute('tizen: pressKey', {key})
  );
  browser.addCommand(
    'longPressKey',
    async (key: RcKeyCode, duration: number) =>
      await browser.execute('tizen: longPressKey', {key, duration})
  );
  return browser as TizenBrowser;
}

/**
 * An async webdriverio browser with custom command(s)
 */
export interface TizenBrowser extends Browser {
  pressKey(key: RcKeyCode): Promise<unknown>;
  longPressKey(key: RcKeyCode, duration?: number): Promise<unknown>;
}
