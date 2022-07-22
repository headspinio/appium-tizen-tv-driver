import B from 'bluebird';
import _ from 'lodash';
import {KEYS as RC_KEYS} from 'samsung-tv-control';

const RC_TEXT_STRAT = 'rc';
const PROXY_TEXT_STRAT = 'proxy';
const SEND_KEYS_STRATS = [RC_TEXT_STRAT, PROXY_TEXT_STRAT];

export async function pressKeyCode(keycode) {
  const key = `KEY_${keycode}`;
  if (!RC_KEYS[key]) {
    throw new Error(`Keycode '${keycode}' was not recognized`);
  }
  await this.rc.sendKeyPromise(RC_KEYS[key]);
}

export async function setValue(text, elId) {
  if (!SEND_KEYS_STRATS.includes(this.opts.sendKeysStrategy)) {
    throw new Error(
      `Attempted to send keys with invalid sendKeysStrategy ` +
        `'${this.opts.sendKeysStrategy}'. It should be one of: ` +
        JSON.stringify(SEND_KEYS_STRATS)
    );
  }

  if (this.opts.sendKeysStrategy === RC_TEXT_STRAT) {
    if (_.isArray(text)) {
      text = text.join('');
    }
    await B.delay(800);
    await this.rc.sendTextPromise(text);
    await this.pressKeyCode('RETURN');
    await B.delay(800);
    return;
  }

  return await this.proxyCommand(`/element/${elId}/value`, 'POST', {text});
}
