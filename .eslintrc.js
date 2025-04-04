module.exports = {
  extends: ['eslint:recommended', 'plugin:vue/recommended', 'plugin:prettier-vue/recommended'],
  env: {
    browser: true,
    es6: true,
    mocha: true,
    node: true,
  },
  parserOptions: {
    parser: '@babel/eslint-parser',
    requireConfigFile: false,
    ecmaVersion: 2019,
    sourceType: 'module',
  },
  rules: {
    'prettier-vue/prettier': 'error',
    camelcase: 'error',
    'no-console': 'warn',
  },
}
