'use strict';

module.exports = (wallaby) => {
  return {
    compilers: {
      '**/*.js': wallaby.compilers.babel(),
    },
    debug: true,
    env: {
      type: 'node',
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
      './babel.config.json',
    ],
    testFramework: 'mocha',
    tests: [
      './packages/*/test/unit/**/*.spec.js',
      './packages/tizen-remote/test/e2e/tizen-remote.e2e.spec.js'
    ],
    runMode: 'onsave',
    workers: {recycle: true},
  };
};
