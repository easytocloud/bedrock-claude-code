// @ts-check
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: ['node_modules/**', 'out/**', '.vscode-test/**']
  },
  // TypeScript source files
  {
    files: ['src/**/*.ts'],
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' }
    },
    rules: {
      'curly': 'error',
      'eqeqeq': 'error',
      'no-throw-literal': 'error',
      'semi': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-debugger': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  // Browser-side webview JS
  {
    files: ['media/webview.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { acquireVsCodeApi: 'readonly', window: 'readonly', document: 'readonly', console: 'readonly' }
    },
    rules: {
      'eqeqeq': 'error',
      'no-var': 'error',
      'no-debugger': 'error',
      'semi': ['error', 'always']
    }
  }
];
