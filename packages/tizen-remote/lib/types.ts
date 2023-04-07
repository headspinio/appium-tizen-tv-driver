/**
 * Options for {@linkcode TizenRemote}.
 *
 * @group Options
 */
export interface TizenRemoteOptions {
  /**
   * Remote control token
   */
  token?: string;
  /**
   * Port of the Tizen device's WS server
   */
  port?: number | string;
  /**
   * Whether to use SSL
   */
  ssl?: boolean;
  /**
   * Timeout for the initial handshake (ms)
   */
  handshakeTimeout?: number;
  /**
   * Number of retries for the initial handshake
   */
  handshakeRetries?: number;
  /**
   * Timeout for the token request (ms)
   */
  tokenTimeout?: number;
  /**
   * Whether to automatically reconnect on disconnection
   */
  autoReconnect?: boolean;
  /**
   * Whether to persist the token to disk _and_ whether to read it from disk when needed
   */
  persistToken?: boolean;
  /**
   * Whether to enable debug logging
   */
  debug?: boolean;
}
