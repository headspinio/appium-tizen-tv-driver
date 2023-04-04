// @ts-check

const init = function () {
  $('#header').text('Initializing...');

  try {

    // @ts-ignore no defs for tizen.*
    const supportedKeys = /** @type { {name: string, code: number}[] } */(tizen.tvinputdevice.getSupportedKeys());
    $('#supported-btn-raw').text(JSON.stringify(supportedKeys, null, 2));

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
        if (typeof e.code !== 'number' && !e.code) {
          $('#keydown-error-data').text('Keydown event code is undefined');
        }
      })
      .on('keyup', (e) => {
        if (lastKeyDownMs !== undefined && lastKeyDownCode === e.code) {
          const duration = Date.now() - lastKeyDownMs;
          $('#event-duration').text(duration);
          lastKeyDownMs = undefined;
          lastKeyDownCode = undefined;
        } else if (typeof e.code !== 'number' && !e.code) {
          $('keyup-error-data').text('Keyup event code is undefined');
        } else {
          $('#keyup-error-data').text(`Keyup event code (${e.code}) does not match keydown event code (${lastKeyDownCode})`);
        }
        try {
          $('#event-data').text(JSON.stringify(e, null, 2));
          btnName.text(e.key);
          btnCode.text(e.code);
        } catch (err) {
          console.error(err);
          $('#keyup-error-data').text(err.message);
        }
      });
  } catch (err) {
    $('#general-error-data').text(err.message);
  }

  $('#header').text('Initialized');
};

window.onload = init;
