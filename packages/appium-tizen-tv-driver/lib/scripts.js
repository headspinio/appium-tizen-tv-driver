/**
 * These are scripts which are sent to the browser via an `/execute/<async|sync>` command.
 * @module
 */

/**
 * All functions must have a final parameter which is a {@linkcode AsyncCallback}.
 *
 * This is not expressible dynamically in TS, so I didn't do it
 */
export const AsyncScripts = Object.freeze({
  /**
   * @param {number|string} code
   * @param {string} key
   * @param {number} duration
   * @param {AsyncCallback} done
   * @returns {void}
   */
  pressKey: (code, key, duration, done) => {
    document.dispatchEvent(new KeyboardEvent('keydown', {code: String(code), key}));
    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keyup', {code: String(code), key}));
      done(null);
    }, duration);
  },
});

/**
 * These are all synchronous
 */
export const SyncScripts = Object.freeze({
  exit: () => {
    // @ts-expect-error
    window.tizen.application.getCurrentApplication().exit();
  },
  reset: () => {
    window.localStorage.clear();
    window.location.reload();
  },
});

/**
 * The callback function passed to the script executed via `execute/async`.
 *
 * If this function was called without a parameter, it would respond still with `null` to the requester,
 * so we demand `null` at minimum here for consistency.
 *
 * @template [T=null]
 * @callback AsyncCallback
 * @param {T extends undefined ? never : T} result
 * @returns {void}
 */
