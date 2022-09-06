/* global $ */

const init = function () {
  $('#header').text('Initializing...');

  try {
    const MANDATORY_KEYS = {
      38: 'ArrowUp',
      39: 'ArrowRight',
      37: 'ArrowLeft',
      40: 'ArrowDown',
      13: 'Enter',
      10009: 'Back',
    };

    let keysByCode = {};
    /** @type {{name: string, code: number}[]} */
    try {
      const supportedKeys = tizen.tvinputdevice.getSupportedKeys();
      $('#support-btn-count').text(supportedKeys.length + MANDATORY_KEYS.length);
      keysByCode = supportedKeys.reduce((acc, key) => {
        acc[key.code] = key.name;
        return acc;
      }, /** @type {Record<string,string>} */ ({}));
      $('#supported-btn-raw').text(JSON.stringify(supportedKeys, null, 2));
    } catch (err) {
      $('#supported-btn-raw').text(err.message);
    }

    const btnName = $('#rc-button-name');
    const btnCode = $('#rc-button-code');

    $(document).on('keydown', (e) => {
      try {
        $('#event-data').text(JSON.stringify(e, null, 2));
        const name = keysByCode[e.code] || MANDATORY_KEYS[e.code];
        if (name) {
          btnName.val(name);
        } else {
          btnName.val(`${e.key} (unrecognized)`);
        }
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
