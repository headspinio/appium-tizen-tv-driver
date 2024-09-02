# `@headspinio/tizen-remote`

> Remote control automation for Tizen devices

[![npm version](https://img.shields.io/npm/v/@headspinio/tizen-remote.svg)](https://www.npmjs.com/package/@headspinio/tizen-remote)

## Basic Usage

```js
import {TizenRemote, Keys} from '@headspinio/tizen-remote';

const remote = new TizenRemote({
  host: 'my-tizen.device.local',
  port: 12345,
  appId: 'my.app-id',
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
- Automatic pairing of remote control with the device (token stored per host)
- Allows automation of keypresses
- Supports auto-reconnection on unexpected disconnect
- Supports multiple connection attempts with exponential backoff

## Installation

```bash
npm i @headspinio/tizen-remote
```

## API

(TODO)

## Environment

If a `token` option is not provided via the `TizenRemote` constructor's options, this library will look for a token in the `TIZEN_REMOTE_TOKEN` environment variable (if neither are found, automatic pairing is attempted).

## License

Copyright © 2022 [HeadSpin](https://headspin.io), Inc. Licensed Apache-2.0
