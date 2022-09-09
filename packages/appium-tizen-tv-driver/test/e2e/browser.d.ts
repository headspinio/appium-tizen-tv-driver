import type { Browser, RemoteOptions } from "webdriverio";
import {RcKeyCode} from '@headspinio/tizen-remote';

/**
 * An async webdriverio browser with custom command(s)
 */

export interface TizenBrowser extends Browser<'async'> {
  pressKey(key: RcKeyCode): Promise<unknown>;
  longPressKey(key: RcKeyCode, duration?: number): Promise<unknown>;
}

export function tizenBrowser(opts: RemoteOptions): Promise<TizenBrowser>;
