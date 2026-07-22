const { defineConfig } = require('eslint/config');
const universeNative = require('eslint-config-universe/flat/native');
const universeWeb = require('eslint-config-universe/flat/web');

module.exports = defineConfig([
  {
    ignores: [
      '**/.expo/**',
      '**/android/**',
      '**/build/**',
      '**/coverage/**',
      '**/ios/**',
      '**/node_modules/**',
    ],
  },
  ...universeNative,
  ...universeWeb,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    files: ['packages/native-epub-kit/app.plugin.js', 'packages/native-epub-kit/plugin/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        module: 'readonly',
        require: 'readonly',
      },
    },
  },
]);
