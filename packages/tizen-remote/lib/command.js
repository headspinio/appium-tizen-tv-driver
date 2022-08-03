import {constants} from './index';

export class KeyCommand {
  method = constants.COMMAND_METHOD;

  /** @type {import('./index').TizenRemoteCommandParams<import('./index').KeyCommandType, import('./index').KeyCode>} */
  params;

  /**
   * @param {import('./index').KeyCommandType} cmd
   * @param {import('./index').KeyCode} data
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

  /** @type {import('./index').TizenRemoteCommandParams<string, 'base64'>} */
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
      TypeOfRemote: 'SendRemoteKey',
    };
  }
}
