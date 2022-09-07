import keycode from 'keycode';
import {Keys} from '@headspinio/tizen-remote';

/**
 * This thing maps an Rc Key Code to a UTF-8 key code.
 * @module
 *
 */

/**
 * Map of keyboard keys to UTF-8 key codes.  Probably only usedful for testing
 * keyboard (non-RC) interaction.
 */
const Utf8Keys = Object.freeze({
  NULL: '\uE000',
  CANCEL: '\uE001',
  HELP: '\uE002',
  BACKSPACE: '\uE003',
  TAB: '\uE004',
  CLEAR: '\uE005',
  RETURN: '\uE006',
  ENTER: '\uE007',
  SHIFT: '\uE008',
  CONTROL: '\uE009',
  ALT: '\uE00a',
  PAUSE: '\uE00b',
  ESCAPE: '\uE00c',
  SPACE: '\uE00d',
  PAGE_UP: '\uE00e',
  PAGE_DOWN: '\uE00f',
  END: '\uE010',
  HOME: '\uE011',
  LEFT: '\uE012',
  UP: '\uE013',
  RIGHT: '\uE014',
  DOWN: '\uE015',
  INSERT: '\uE016',
  DELETE: '\uE017',
  SEMICOLON: '\uE018',
  EQUALS: '\uE019',
  NUMPAD0: '\uE01a',
  NUMPAD1: '\uE01b',
  NUMPAD2: '\uE01c',
  NUMPAD3: '\uE01d',
  NUMPAD4: '\uE01e',
  NUMPAD5: '\uE01f',
  NUMPAD6: '\uE020',
  NUMPAD7: '\uE021',
  NUMPAD8: '\uE022',
  NUMPAD9: '\uE023',
  MULTIPLY: '\uE024',
  ADD: '\uE025',
  SEPARATOR: '\uE026',
  SUBTRACT: '\uE027',
  DECIMAL: '\uE028',
  DIVIDE: '\uE029',
  F1: '\uE031',
  F2: '\uE032',
  F3: '\uE033',
  F4: '\uE034',
  F5: '\uE035',
  F6: '\uE036',
  F7: '\uE037',
  F8: '\uE038',
  F9: '\uE039',
  F10: '\uE03a',
  F11: '\uE03b',
  F12: '\uE03c',
  META: '\uE03d',
  /**
   * ikr?
   * @see https://en.wikipedia.org/wiki/Language_input_keys
   */
  ZENKAKUHANKAKU: '\uE040',
  R_SHIFT: '\uE050',
  R_CONTROL: '\uE051',
  R_ALT: '\uE052',
  R_META: '\uE053',
  R_PAGEUP: '\uE054',
  R_PAGEDOWN: '\uE055',
  R_END: '\uE056',
  R_HOME: '\uE057',
  R_ARROWLEFT: '\uE058',
  R_ARROWUP: '\uE059',
  R_ARROWRIGHT: '\uE05A',
  R_ARROWDOWN: '\uE05B',
  R_INSERT: '\uE05C',
  R_DELETE: '\uE05D',
});


/**
 * Name/code pairing of remote control keys supported by the Tizen JS API
 * via `tizen.tvinputdevice`.
 *
 */
 const JsKeyCodes = Object.freeze({
  0: 48,
  1: 49,
  2: 50,
  3: 51,
  4: 52,
  5: 53,
  6: 54,
  7: 55,
  8: 56,
  9: 57,
  VolumeUp: 447,
  VolumeDown: 448,
  VolumeMute: 449,
  ChannelUp: 427,
  ChannelDown: 428,
  ColorF0Red: 403,
  ColorF1Green: 404,
  ColorF2Yellow: 405,
  ColorF3Blue: 406,
  Menu: 10133,
  Tools: 10135,
  Info: 457,
  Exit: 10182,
  Search: 10225,
  Guide: 458,
  MediaRewind: 412,
  MediaPause: 19,
  MediaFastForward: 417,
  MediaRecord: 416,
  MediaPlay: 415,
  MediaStop: 413,
  MediaPlayPause: 10252, // unknown mapping
  MediaTrackPrevious: 10232, // unknown mapping
  MediaTrackNext: 10233, // unknown mapping
  Source: 10072,
  PictureSize: 10140,
  PreviousChannel: 10190,
  ChannelList: 10073,
  'E-Manual': 10146,
  MTS: 10195,
  '3D': 10199, // unknown mapping
  Soccer: 10228, // unknown mapping
  Caption: 10221,
  Teletext: 10200,
  Extra: 10253, // unknown mapping
  Minus: 189, // unknown mapping

  // "mandatory keys"
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowLeft: 37,
  ArrowDown: 40,
  Enter: 13,
  Back: 10009,
});

/**
 * Set of {@linkcode RcKeyCode} values
 */
const RcKeyCodes = Object.freeze(new Set(Object.values(Keys)));

/**
 * Mapping of {@linkcode RcKeyCode}s to JS key code names (`key`s).
 */
const RcToJsKeyCodes = Object.freeze(
  /** @type {RcToJsKeyMap} */
   {
    KEY_0: '0',
    KEY_1: '1',
    KEY_2: '2',
    KEY_3: '3',
    KEY_4: '4',
    KEY_5: '5',
    KEY_6: '6',
    KEY_7: '7',
    KEY_8: '8',
    KEY_9: '9',
    KEY_VOLDOWN: 'VolumeDown',
    KEY_VOLUP: 'VolumeUp',
    KEY_MUTE: 'VolumeMute',
    KEY_UP: 'ArrowUp',
    KEY_DOWN: 'ArrowDown',
    KEY_LEFT: 'ArrowLeft',
    KEY_RIGHT: 'ArrowRight',
    KEY_CHUP: 'ChannelUp',
    KEY_CHDOWN: 'ChannelDown',
    KEY_RED: 'ColorF0Red',
    KEY_GREEN: 'ColorF1Green',
    KEY_YELLOW: 'ColorF2Yellow',
    KEY_BLUE: 'ColorF3Blue',
    KEY_MENU: 'Menu',
    KEY_TOOLS: 'Tools',
    KEY_INFO: 'Info',
    KEY_EXIT: 'Exit',
    KEY_ENTER: 'Enter',
    KEY_RETURN: 'Back',
    KEY_GUIDE: 'Guide',
    KEY_REWIND: 'MediaRewind',
    KEY_PAUSE: 'MediaPause',
    KEY_FF: 'MediaFastForward',
    KEY_REC: 'MediaRecord',
    KEY_PLAY: 'MediaPlay',
    KEY_STOP: 'MediaStop',
    KEY_SOURCE: 'Source',
    KEY_PICTURE_SIZE: 'PictureSize',
    KEY_PRECH: 'PreviousChannel',
    KEY_CH_LIST: 'ChannelList',
    KEY_HELP: 'E-Manual', // ??
    KEY_MTS: 'MTS',
    KEY_CAPTION: 'Caption',
    KEY_TTX_MIX: 'Teletext', // ??
  }
);

/**
 * Returns the JS key code (`code`) for a given remote control key code (if one is found).
 *
 * Not all `RcKeyCode`s have a corresponding JS key code.
 * @param {RcKeyCode} rcKeyCode
 * @returns {number|undefined}
 */
export function toJsKeyCode(rcKeyCode) {
  return hasJsKeyCode(rcKeyCode) ? JsKeyCodes[RcToJsKeyCodes[rcKeyCode]] : undefined;
}

/**
 * Returns the JS key (`key`) for a given remote control key code (if one is found).
 *
 * Not all `RcKeyCode`s have a corresponding JS key code.
 * @param {RcKeyCode} rcKeyCode
 * @returns {string|undefined}
 */
export function toJsKey(rcKeyCode) {
  return hasJsKeyCode(rcKeyCode) ? RcToJsKeyCodes[rcKeyCode] : undefined;
}

/**
 * Type guard; checks if an `RcKeyCode` is also a {@linkcode RcJsKeyCode}.
 * @param {RcKeyCode} rcKeyCode
 * @returns {rcKeyCode is RcJsKeyCode}
 */
export function hasJsKeyCode(rcKeyCode) {
  return rcKeyCode in RcToJsKeyCodes;
}

/**
 * Type guard. Returns `true` if `name` is a valid `RcKeyCode`
 * @param {any} value
 * @returns {value is RcKeyCode}
 */
export function isRcKeyCode(value) {
  return RcKeyCodes.has(value);
}

/**
 * Type guard. Returns `true` if `value` is a key of {@linkcode Utf8Keys}.
 * @param {any} value
 * @returns {value is keyof typeof Utf8Keys}
 */
export function isUtf8Key(value) {
  return value in Utf8Keys;
}

/**
 * Given an {@linkcode RcKeyCode} or any `string`, returns a key which can be used in a {@linkcode KeyboardEvent}.  `keyCode` could thus be a single character, a UTF-8 character, or   a {@linkcode Utf8Key}.
 * @param {RcKeyCode|string} keyCode
 * @returns {KeyData}
 */
export function getKeyData(keyCode) {
  /** @type {KeyData} */
  const data = {};
  if (isRcKeyCode(keyCode)) {
    // if this is an RcKeyCode, we want to get the corresponding JS key code and key.
    // the names (keys) of these and their codes are determined by the platform.
    const code = toJsKeyCode(keyCode);
    if (code) {
      data.code = code;
    }
    const key = toJsKey(keyCode);
    if (key) {
      data.key = key;
    }
  } else {
    // if just some string,
    if (isUtf8Key(keyCode)) {
      data.key = Utf8Keys[keyCode];
    }
    data.code = keycode(keyCode);
  }
  data.key = data.key ?? keyCode;
  return data;
}


/**
 * A key in the {@linkcode JsKeyCodes} mapping
 * @typedef {keyof typeof JsKeyCodes} JsKeyCode
 */

/**
 * An {@linkcode RcKeyCode} which has a corresponding JS key code.
 * @typedef {keyof typeof RcToJsKeyCodes} RcJsKeyCode
 */

/**
 * @typedef {import('@headspinio/tizen-remote').RcKeyCode} RcKeyCode
 */

/**
 * Data for a `KeyboardEvent` constructor; passed to Tizen app via Chromedriver;
 * @typedef KeyData
 * @property {number} [code]
 * @property {string} [key]
 */
