import log from './logger';
import {routeConfiguringFunction, server as baseServer} from 'appium/driver';
import TizenTVDriver from './driver';

/**
 *
 * @param {number} port
 * @param {string} host
 * @returns {Promise<import('@appium/types').AppiumServer>}
 */
async function startServer(port, host) {
  let tizenTVDriver = new TizenTVDriver();
  log.debug('Driver ready!');
  let router = routeConfiguringFunction(tizenTVDriver);
  let server = await baseServer(
    // @ts-expect-error
    {
      routeConfiguringFunction: router,
      port,
      hostname: host,
    }
  );
  log.info(`TizenTVDriver server listening on http://${host}:${port}`);
  return server;
}

export {startServer};
