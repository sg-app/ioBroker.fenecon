// ioBroker eslint template configuration file for js and ts files
// Please note that esm or react based modules need additional modules loaded.
import config from '@iobroker/eslint-config';

export default [
  ...config,
  {
    // specify files to exclude from linting here
    ignores: [
      '.claude/',
      '.dev-server/',
      '.vscode/',
      '.tmp/',
      'build/',
      'coverage/',
      'dist/',
      'node_modules/',
      'test/**/*.js',
      '*.config.mjs',
      'admin/**/*.d.ts',
      'src/**/*.d.ts',
      'widgets/**/*.js',
    ],
  },
  {
    rules: {
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/require-returns-check': 'off',
    },
  },
];