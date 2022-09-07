import {remote} from 'webdriverio';

/**
 * @type {import('./browser').tizenBrowser}
 */
export async function tizenBrowser(opts) {
  const browser = await remote(opts);
  browser.addCommand(
    'pressKey',
    /**
     * @param {string} key
     */
    async (key) => await browser.execute('tizen: pressKey', {key})
  );
  return browser;
}
