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
      './packages/**/*.js',
      './packages/**/*.json',
      '!./packages/**/build/**',
      '!./packages/**/test/**/*.spec.js',
      '!./packages/*/node_modules/**',
      '!./packages/*/gulpfile.js',
      '!./packages/*/scripts/**',
      './packages/*/test/**/fixtures/**/*',
      './babel.config.json',
    ],
    testFramework: 'mocha',
    tests: [
      './packages/*/test/unit/**/*.spec.js',
      './packages/tizen-remote/test/**/*.spec.js',
      '!./packages/*/test/e2e/**/*',
    ],
    runMode: 'onsave',
    workers: {recycle: true},
  };
};
