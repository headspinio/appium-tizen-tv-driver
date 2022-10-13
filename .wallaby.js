'use strict';

module.exports = (wallaby) => {
  return {
    compilers: {
      '**/*.js': wallaby.compilers.babel(),
    },
    debug: true,
    env: {
      type: 'node',
      params: {
        env: 'DEBUG=tizen-remote*'
      }
    },
    files: [
      './packages/*/*.js',
      './packages/*/lib/**/*.js',
      './packages/*/*.json',
      '!./packages/*/build/**',
      '!./packages/*/node_modules/**',
      '!./packages/*/gulpfile.js',
      '!./packages/*/scripts/**',
      './packages/*/test/**/fixtures/**/*',
      './packages/*/test/**/helpers.js',
      './babel.config.json',
      './packages/tizen-remote/test/e2e/server.js',
    ],
    testFramework: 'mocha',
    tests: [
      './packages/*/test/unit/**/*.spec.js',
      './packages/tizen-remote/test/e2e/**/*.e2e.spec.js'
    ],
    runMode: 'onsave',
  };
};
