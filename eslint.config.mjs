import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import js from '@eslint/js'
import { FlatCompat } from '@eslint/eslintrc'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pluginVue from 'eslint-plugin-vue'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
})

export default defineConfig([
  globalIgnores([
    '**/karma.conf.js',
    '**/nightwatch.config.js',
    '**/vue.config.js',
    '**/webpack.config.js',
    '**/docs/',
    '**/.yarn',
    '.pnp.cjs',
    '.pnp.loader.mjs',
  ]),
  {
    files: ['**/*.{js,mjs,cjs,vue}'],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.mocha,
      },
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: {
        parser: '@babel/eslint-parser',
        requireConfigFile: false,
      },
    },
    extends: compat.extends('plugin:prettier-vue/recommended'),
    rules: {
      'prettier-vue/prettier': 'error',
      camelcase: 'error',
      'no-console': 'warn',
    },
  },
])
