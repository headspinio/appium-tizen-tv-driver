import {server as baseServer, routeConfiguringFunction} from 'appium/driver';
import {TizenTVDriver} from '../lib/driver';

export const TEST_HOST = '127.0.0.1';

/**
 * Starts a server running the Tizen driver
 * @param {number} port
 * @param {string} [hostname]
 * @returns {Promise<import('@appium/types').AppiumServer>}
 */
export async function startServer(port, hostname = TEST_HOST) {
  return await baseServer({
    routeConfiguringFunction: routeConfiguringFunction(new TizenTVDriver()),
    port,
    hostname,
    cliArgs: /** @type {import('@appium/types').ServerArgs} */(/** @type {unknown} */([]))
  });
}
