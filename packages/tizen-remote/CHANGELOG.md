# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.5.0](https://github.com/headspinio/appium-tizen-tv-driver/compare/@headspinio/tizen-remote@0.4.4...@headspinio/tizen-remote@0.5.0) (2023-04-14)

### ⚠ BREAKING CHANGES

- **tizen-remote:** Uses a new scheme for token storage. Instead of a single JSON file, we use one file per device. This will break existing token stores. Also, the `name` option of the `TizenRemote` constructor is no longer recognized.

This replaces the bespoke token cache with the `@appium/strongbox` package. As such, it mitigates the need for lockfiles.

### Features

- **tizen-remote:** use per-host token storage ([7ea9983](https://github.com/headspinio/appium-tizen-tv-driver/commit/7ea9983f5dfb49c17565b66fa4716ce3e2c613aa))

### Bug Fixes

- **tizen-remote:** update dependency @babel/runtime to v7.20.13 ([9db2a56](https://github.com/headspinio/appium-tizen-tv-driver/commit/9db2a56859a837f662bb26436e90bb93332b1cb9))
- **tizen-remote:** update dependency type-fest to v3.8.0 ([b473d3d](https://github.com/headspinio/appium-tizen-tv-driver/commit/b473d3d3d9a22f5d22ebf529886d2c19ef6c8cd2))
- **tizen-remote:** update dependency ws to v8.12.1 ([2f1becc](https://github.com/headspinio/appium-tizen-tv-driver/commit/2f1becc032ab84564424086837f0977ad5d08d2a))
- **tizen-remote:** update dependency ws to v8.13.0 ([cde366b](https://github.com/headspinio/appium-tizen-tv-driver/commit/cde366b29aa9b47b90b53a676ac2dfc18079bfa1))
- type-related fixes ([cd1e78b](https://github.com/headspinio/appium-tizen-tv-driver/commit/cd1e78b0d7c930e56181f52b3b18eb4477ffe757))

## [0.4.4](https://github.com/headspinio/appium-tizen-tv-driver/compare/@headspinio/tizen-remote@0.4.3...@headspinio/tizen-remote@0.4.4) (2023-01-16)

### Bug Fixes

- **tizen-remote:** update dependency ws to v8.12.0 ([b48afec](https://github.com/headspinio/appium-tizen-tv-driver/commit/b48afecf4041d1a16d7ce926d7c6731402163dff))

## [0.4.3](https://github.com/headspinio/appium-tizen-tv-driver/compare/@headspinio/tizen-remote@0.4.2...@headspinio/tizen-remote@0.4.3) (2022-12-05)

### Bug Fixes

- **tizen-remote:** update dependency ws to v8.11.0 ([a5aecb5](https://github.com/headspinio/appium-tizen-tv-driver/commit/a5aecb56589d25b7872cde2961bb2a2fe88769d6))

## [0.4.2](https://github.com/headspinio/appium-tizen-tv-driver/compare/@headspinio/tizen-remote@0.4.1...@headspinio/tizen-remote@0.4.2) (2022-11-09)

**Note:** Version bump only for package @headspinio/tizen-remote

## [0.4.1](https://github.com/headspinio/appium-tizen-tv-driver/compare/@headspinio/tizen-remote@0.4.0...@headspinio/tizen-remote@0.4.1) (2022-10-31)

**Note:** Version bump only for package @headspinio/tizen-remote

# [0.4.0](https://github.com/headspinio/appium-tizen-tv-driver/compare/@headspinio/tizen-remote@0.3.0...@headspinio/tizen-remote@0.4.0) (2022-10-13)

### Bug Fixes

- **tizen-remote:** fix lockfile and cache path problems ([ffd327b](https://github.com/headspinio/appium-tizen-tv-driver/commit/ffd327b44ac9b8ab59d4b5cb451dfb4b9729ce3c))

### Features

- **tizen-remote:** update token when new one received ([f86de4a](https://github.com/headspinio/appium-tizen-tv-driver/commit/f86de4adcaac713a8dc22fc22e351968a03bd79d))

# [0.3.0](https://github.com/headspinio/appium-tizen-tv-driver/compare/@headspinio/tizen-remote@0.2.2...@headspinio/tizen-remote@0.3.0) (2022-09-28)

### Features

- **appium-tizen-tv-driver,tizen-remote:** add rcDebugLog capability ([5169de5](https://github.com/headspinio/appium-tizen-tv-driver/commit/5169de5e683d14289c3b002c0beb0efada471039))

## [0.2.2](https://github.com/headspinio/appium-tizen-tv-driver/compare/@headspinio/tizen-remote@0.2.1...@headspinio/tizen-remote@0.2.2) (2022-09-28)

### Bug Fixes

- **appium-tizen-tv-driver,tizen-remote:** do not always force token ([7146d39](https://github.com/headspinio/appium-tizen-tv-driver/commit/7146d392e261947ef98dafb4ed3521ba44fe8d28))

## [0.2.1](https://github.com/headspinio/appium-tizen-tv-driver/compare/@headspinio/tizen-remote@0.2.0...@headspinio/tizen-remote@0.2.1) (2022-09-13)

### Bug Fixes

- **appium-tizen-tv-driver,tizen-remote:** fix broken text input command ([881b7de](https://github.com/headspinio/appium-tizen-tv-driver/commit/881b7de24bf80e71c6e934f2f02bb2a3461966dd))

# 0.2.0 (2022-09-12)

### Bug Fixes

- **tizen-remote:** release should release ([e7b79d3](https://github.com/headspinio/appium-tizen-tv-driver/commit/e7b79d3a35af81c5e3314cfec4b3b3bf56fd0c52))

### Features

- **appium-tizen-tv-driver,tizen-sample-app:** add resetRcToken cap ([779ceac](https://github.com/headspinio/appium-tizen-tv-driver/commit/779ceac426ba3aab764ecea80bffdeaa9e04ec7a))
- **tizen-remote:** accept token from environment ([8ba9515](https://github.com/headspinio/appium-tizen-tv-driver/commit/8ba95150fa5a7c3d95298054c00baf4cf0ca2880))
- **tizen-remote:** add 'force' option to getToken() ([1c89960](https://github.com/headspinio/appium-tizen-tv-driver/commit/1c899605b5c040dce978b03d7ca2a86c15035274))
- **tizen-remote:** add timeout option to sendRequest ([a2eceaf](https://github.com/headspinio/appium-tizen-tv-driver/commit/a2eceaf4c750e88f4f54ec1d0f47a1d4a1505c22))
- **tizen-remote:** adds a library to interact with remote control ws server ([d794179](https://github.com/headspinio/appium-tizen-tv-driver/commit/d794179fe4858bd9fb83c66c661b77b8635e2e1c))
- **tizen-remote:** emit 'sent' event ([56ea9c3](https://github.com/headspinio/appium-tizen-tv-driver/commit/56ea9c37848ce5b765133b2025ba1f939d78fa9b))
- **tizen-remote:** gets tokens automatically ([3fc54a2](https://github.com/headspinio/appium-tizen-tv-driver/commit/3fc54a2cd6031cf061fa4ec1b48f65446be92a24))
- **tizen-remote:** token persistence ([bd78515](https://github.com/headspinio/appium-tizen-tv-driver/commit/bd785152e5fbcb06e10dd4a1a7f46e22a366015d))
