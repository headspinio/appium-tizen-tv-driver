// @ts-check

/* global $ */

const init = function () {
  $('#header').text('Initializing...');

  try {
    /** @type {{name: string, code: number}[]} */
    try {
      // @ts-ignore
      const supportedKeys = tizen.tvinputdevice.getSupportedKeys();
      $('#supported-btn-raw').text(JSON.stringify(supportedKeys, null, 2));
    } catch (err) {
      $('#supported-btn-raw').text(err.message);
    }

    const btnName = $('#rc-button-name');
    const btnCode = $('#rc-button-code');

    /** @type {number|undefined} */
    let lastKeyDownMs;
    /** @type {string|undefined} */
    let lastKeyDownCode;
    $(document)
      .on('keydown', (e) => {
        lastKeyDownMs = Date.now();
        lastKeyDownCode = e.code;
      })
      .on('keyup', (e) => {
        if (lastKeyDownMs !== undefined && lastKeyDownCode === e.code) {
          const duration = Date.now() - lastKeyDownMs;
          $('#event-duration').text(duration);
          lastKeyDownMs = undefined;
          lastKeyDownCode = undefined;
        }
        try {
          $('#event-data').text(JSON.stringify(e, null, 2));
          btnName.val(e.key);
          btnCode.val(e.code);
        } catch (err) {
          console.error(err);
          $('#event-data').text(err.message);
        }
      });
  } catch (err) {
    $('#header').text(err.message);
  }

  $('#header').text('Initialized');
};

window.onload = init;
