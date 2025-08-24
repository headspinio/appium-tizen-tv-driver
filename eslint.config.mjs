import globals from 'globals';
import appiumTsConfig from '@appium/eslint-config-appium-ts';

export default [
  ...appiumTsConfig,
  {
    files: ['packages/tizen-remote/**/*.js'],
    rules: {
      'promise/no-native': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['packages/appium-tizen-tv-driver/lib/scripts.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        myCustomGlobal: 'readonly',
      },
    },
    rules: {
      'promise/no-native': 'off',
    },
  },
  {
    files: ['packages/tizen-sample-app/js/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.jquery,
        tizen: 'readonly',
        startTime: 'writable',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
];
