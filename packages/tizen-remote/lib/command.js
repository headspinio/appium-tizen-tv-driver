import {constants} from './tizen-remote';

export class KeyCommand {
  method = constants.COMMAND_METHOD;

  /** @type {import('./tizen-remote').TizenRemoteCommandParams<import('./tizen-remote').KeyCommandType, import('./tizen-remote').RcKeyCode>} */
  params;

  /**
   * @param {import('./tizen-remote').KeyCommandType} cmd
   * @param {import('./tizen-remote').RcKeyCode} data
   */
  constructor(cmd, data) {
    this.params = {
      Cmd: cmd,
      DataOfCmd: data,
      Option: constants.COMMAND_PARAMS_OPTION,
      TypeOfRemote: 'SendRemoteKey',
    };
  }
}

export class TextCommand {
  method = constants.COMMAND_METHOD;

  /** @type {import('./tizen-remote').TizenRemoteCommandParams<string, 'base64'>} */
  params;

  /**
   * Original text
   * @type {string}
   */
  text;

  /**
   * @param {string} text
   */
  constructor(text) {
    this.text = text;
    this.params = {
      Cmd: Buffer.from(text).toString('base64'),
      DataOfCmd: 'base64',
      Option: constants.COMMAND_PARAMS_OPTION,
      TypeOfRemote: 'SendInputString',
    };
  }
}
