import {remote} from 'webdriverio';

/**
 * @type {import('./browser').tizenBrowser}
 */
export async function tizenBrowser(opts) {
  const browser = await remote(opts);
  browser.addCommand(
    'pressKey',
    /**
     * @param {import('@headspinio/tizen-remote').RcKeyCode} key
     */
    async (key) => await browser.execute('tizen: pressKey', {key})
  );
  browser.addCommand(
    'longPressKey',
    /**
     * @param {import('@headspinio/tizen-remote').RcKeyCode} key
     * @param {number} [duration]
     */
    async (key, duration) => await browser.execute('tizen: longPressKey', {key, duration})
  );
  return browser;
}
