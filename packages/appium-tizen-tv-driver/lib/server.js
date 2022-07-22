import log from './logger';
import {routeConfiguringFunction, server as baseServer} from 'appium-base-driver';
import TizenTVDriver from './driver';

async function startServer(port, host) {
  let tizenTVDriver = new TizenTVDriver();
  log.debug('Driver ready!');
  let router = routeConfiguringFunction(tizenTVDriver);
  let server = await baseServer(router, port, host);
  log.info(`TizenTVDriver server listening on http://${host}:${port}`);
  return server;
}

export {startServer};
