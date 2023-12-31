/**
 * Pinia getters, used via `this.$store.getters`, e.g.:
 * `this.$store.getters['jv/get'](<args>)`
 *
 * @namespace getters
 * @memberof module:pinia-jsonapi.createJsonapiStore
 * @param {object} conf - a pinia-jsonapi config object
 */

import get from 'lodash/get'
import { JSONPath } from 'jsonpath-plus'

export default (conf, utils) => {
  // Short var name
  let jvtag = conf['jvtag']
  return {
    /**
     * Get record(s) from the store
     *
     * @memberof module:pinia-jsonapi.createJsonapiStore.getters
     * @param {(string|object)} data
     * @param {string}  - A URL path to an item - e.g. `endpoint/1`
     * @param {object}  - A restructured object  - e.g. `{ _jv: { type: "endpoint", id: "1" } }`
     * @param {string} jsonpath - a JSONPath string to filter the record(s) which are being retrieved. See [JSONPath Syntax](https://github.com/dchester/jsonpath#jsonpath-syntax)
     * @return {object} Restructured representation of the record(s)
     */
    getData: (store) => (data, jsonpath, seen) => {
      let result
      let state = store.$state
      if (!data) {
        // No data arg - return whole state object
        result = state
      } else {
        const [type, id] = utils.getTypeId(data, false)

        if (type in state) {
          if (id) {
            if (id in state[type]) {
              // single item
              result = state[type][id]
            } else {
              // No item of that type
              return {}
            }
          } else {
            // whole collection, indexed by id
            result = state[type]
          }
        } else {
          // no records for that type in state
          return {}
        }
      }

      // Follow relationships
      result = utils.checkAndFollowRelationships(store, result, seen)

      // Filter by jsonpath
      if (jsonpath) {
        const filtered = JSONPath({ path: jsonpath, json: result })
        if (Array.isArray(filtered)) {
          result = {}
          for (let item of filtered) {
            result[item[jvtag]['id']] = item
          }
        }
      }
      return result
    },
    /**
     * Get the related record(s) of a record from the store
     *
     * @memberof module:pinia-jsonapi.createJsonapiStore.getters
     * @param {(string|object)} data
     * @param {string}  - A URL path to an item - e.g. `endpoint/1`
     * @param {object}  - A restructured object  - e.g. `{ _jv: { type: "endpoint", id: "1" } }`
     * @return {object} Restructured representation of the record(s)
     */
    getRelatedData: (store) => (data, seen) => {
      let state = store.$state
      const [type, id] = utils.getTypeId(data, false)
      if (!type || !id) {
        throw 'No type/id specified'
      }
      let parent = get(state, [type, id])
      if (parent) {
        return utils.getRelationships(store, parent, seen)
      }
      return {}
    },
  }
}
