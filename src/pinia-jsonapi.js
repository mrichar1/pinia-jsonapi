/**
 * @module pinia-jsonapi
 */
import { defineStore } from 'pinia'
import actions from './actions'
import jvConfig from './config'
import getters from './getters'
import { Utils, ActionStatus } from './lib'

/**
 * pinia-jsonapi pinia store
 * @namespace
 * @memberof module:pinia-jsonapi
 * @param {axios} api - an axios instance
 * @param {object} [conf={}] - pinia-jsonapi configuation
 * @param {string} [name='jv'] - the pinia store id
 * @return {object} A Pinia store object
 */
const createJsonapiStore = (api, conf = {}, name = 'jv') => {
  let config = Object.assign({}, jvConfig, conf)
  // Instantiate helper classes with config prior to re-exporting
  let utils = new Utils(config)
  let status = new ActionStatus(config.maxStatusID)

  return {
    jsonapiStore: defineStore(name, {
      state: () => {
        return { [config['jvtag']]: {} }
      },
      actions: actions(api, config, utils),
      getters: getters(config, utils),
    }),
    config: config,
    status: status,
    utils: utils,
  }
}

// Export instance of Utils, and merged configs
export { createJsonapiStore }
