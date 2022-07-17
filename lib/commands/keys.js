import _ from 'lodash';
import { KEYS as RC_KEYS } from 'samsung-tv-control';

const RC_TEXT_STRAT = 'rc';

export async function pressKeyCode (keycode) {
  const key = `KEY_${keycode}`;
  if (!RC_KEYS[key]) {
    throw new Error(`Keycode '${keycode}' was not recognized`);
  }
  await this.rc.sendKeyPromise(RC_KEYS[key]);
}

export async function setValue (text, elId) {
  if (this.opts.sendKeysStrategy === RC_TEXT_STRAT) {
    if (_.isArray(text)) {
      text = text.join('');
    }
    await this.rc.sendTextPromise(text);
    return;
  }

  return await this.proxyCommand(`/element/${elId}/value`, 'POST', {text});
}
