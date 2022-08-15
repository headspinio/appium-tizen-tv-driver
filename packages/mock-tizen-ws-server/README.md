# @headspinio/mock-tizen-ws-server

> Provides a mock implementation of a WebSocket server running on a Tizen device

## Features

- Assigns tokens on per-client basis
- Keepalive functionality
- Exists, so that you can script it

## Installation

```bash
npm i @headspinio/mock-tizen-ws-server -D
```

## Usage

This module is based on the [`WebSocketServer`](https://github.com/websockets/ws/blob/HEAD/doc/ws.md#class-websocketserver) implementation from the [`ws`](https://npm.im/ws) package.

```js
import {MockTizenWSServer} from '@headspinio/mock-tizen-ws-server';

const server = new MockTizenWSServer({
  // any options which WebSocketServer expects,
  // e.g. port, host, etc.
  // and:
  keepAliveTimeout: 5000, // keepalive timeout in ms
  keepalive: true, // enable keepalive
});

```

Use env var `DEBUG=mock-tizen-ws-server` for debug output.

## License

Copyright © 2022 [HeadSpin](https://headspin.io), Inc. Licensed Apache-2.0
