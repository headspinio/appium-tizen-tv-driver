'use strict';

module.exports = (wallaby) => {
  return {
    compilers: {
      '**/*.js': wallaby.compilers.typeScript({
        allowJs: true,
        allowSyntheticDefaultImports: true,
        resolveJsonModule: true,
        isolatedModules: true,
      }),
      '**/*.ts?(x)': wallaby.compilers.typeScript(),
    },
    env: {
      type: 'node',
      params: {
        env: 'DEBUG=tizen-remote*'
      }
    },
    files: [
      './packages/*/*.js',
      './packages/*/lib/**/*.js',
      './packages/*/lib/**/*.ts',
      './packages/*/*.json',
      '!./packages/*/build/**',
      '!./packages/*/node_modules/**',
      '!./packages/*/scripts/**',
      './packages/*/test/**/fixtures/**/*',
      './packages/*/test/**/helpers.js',
      './packages/tizen-remote/test/e2e/server.js',
      './packages/appium-tizen-tv-driver/test/unit/mocks.js'
    ],
    testFramework: 'mocha',
    tests: [
      './packages/*/test/unit/**/*.spec.js',
      './packages/*/test/unit/**/*.spec.ts',
      './packages/tizen-remote/test/e2e/**/*.e2e.spec.js'
    ],
    runMode: 'onsave',
  };
};
