import {promisify} from 'node:util';
import {WebSocketServer} from 'ws';
import {parse as parseUrl} from 'url';
import d from 'debug';
import delay from 'delay';

const debug = d('tizen-remote:test:e2e:server');

/**
 * @type {WeakMap<import('ws').WebSocket,boolean>}
 */
const heartbeats = new WeakMap();

const KEEP_ALIVE_TIMEOUT = 1000;

/**
 * Websocket server for E2E API testing
 */
export class TestWSServer extends WebSocketServer {
  #keepAliveTimeout = KEEP_ALIVE_TIMEOUT;

  /** @type {NodeJS.Timer|undefined} */
  #keepAliveInterval;

  /** @type {Map<string,string>} */
  tokens;

  /**
   * @param {import('ws').ServerOptions & {keepaliveTimeout?: number, keepalive?: boolean}} opts
   */
  constructor(opts) {
    super(opts);

    this.tokens = new Map();

    if (opts.keepalive !== false) {
      this.on('connection', (ws, req) => {
        heartbeats.set(ws, true);
        ws.on('pong', () => {
          debug('Client at %s:%d is alive', req.socket.remoteAddress, req.socket.remotePort);
          heartbeats.set(ws, true);
        });
      }).on('close', () => {
        this.#stopKeepAliveInterval();
      });

      this.#keepAliveTimeout = opts.keepaliveTimeout ?? KEEP_ALIVE_TIMEOUT;
      this.#resetKeepAliveInterval();
    }

    this.on('listening', () => {
      // likely not a unix pipe, so we get an `AddressInfo` object back
      const {address, port} = /** @type {import('node:net').AddressInfo} */ (this.address());
      debug('Server started listening on %s:%d', address, port);
      this.once('close', () => {
        debug('Server stopped listening on %s:%d', address, port);
      });

      this.on('connection', (ws, req) => {
        debug('Connection from %s:%d', req.socket.remoteAddress, req.socket.remotePort);

        // unsure of a better way to extract the searchParams from the request URL
        const clientName =
          (req.url
            ? new URLSearchParams(/** @type {string} */ (parseUrl(req.url).query)).get('name')
            : undefined) ?? '(unknown)';

        ws.once('message', async (data) => {
          /** @type {any} */
          let payload;
          try {
            payload = JSON.parse(data.toString());
          } catch {
            payload = '(invalid JSON)';
          }
          debug('Message from %s:%d: %O', req.socket.remoteAddress, req.socket.remotePort, payload);
          this.tokens.set(clientName, `token-${clientName}`);
          await delay(20);
          const response = {
            data: {
              token: this.tokens.get(clientName),
            },
            event: 'ms.channel.connect',
          };
          if (req.socket.writable) {
            debug(
              'Sending response to %s:%d: %O',
              req.socket.remoteAddress,
              req.socket.remotePort,
              response
            );
            ws.send(JSON.stringify(response));
          } else {
            debug('Socket %s:%d hung up before we could send a response', req.socket.remoteAddress, req.socket.remotePort);
          }
        });
      });
    });
  }

  #resetKeepAliveInterval() {
    this.#stopKeepAliveInterval();
    this.#keepAliveInterval = setInterval(() => {
      for (const conn of this.clients) {
        if (!heartbeats.get(conn)) {
          conn.terminate();
          return;
        }
        heartbeats.set(conn, false);

        // eslint-disable-next-line promise/prefer-await-to-callbacks
        conn.ping((/** @type {any} */ err) => {
          this.emit('client-disconnect', {ws: conn, err});
        });
      }
    }, this.#keepAliveTimeout);
  }

  #stopKeepAliveInterval() {
    clearInterval(this.#keepAliveInterval);
  }

  /**
   * Disconnects all connected clients and stops the server
   */
  async stop() {
    for (const ws of this.clients) {
      ws.close();
    }
    try {
      await promisify(this.close).call(this);
    } catch {
      // might already be closed
    }
  }
}
