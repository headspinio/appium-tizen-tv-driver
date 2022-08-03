# `@headspinio/tizen-remote`

> Remote control automation for Tizen devices

## Basic Usage

```js
import { TizenRemote, Keys } from '@headspinio/tizen-remote';

const remote = new TizenRemote({
  host: 'my-tizen.device.local',
  port: 12345,
  token: 'my-secret-token',
  appId: 'my.app-id'
});

await remote.connect();
await remote.click(Keys.LEFT);
await remote.longPress(Keys.ENTER);
await remote.disconnect();
```

## Summary

This package acts as a WebSocket client for the Tizen Remote API and provides various convenience methods for automation.

## Features

- Connects to a Tizen device's remote control service via WebSocket
- Allows automation of keypresses
- Supports auto-reconnection on unexpected disconnect
- Supports multiple connection attempts with exponential backoff

## Installation

```bash
npm i @headspinio/tizen-remote
```

## API

(link API docs here)

## License

Copyright © 2022 [HeadSpin](https://headspin.io), Inc. Licensed Apache-2.0
