/**
 * Pinia actions, used via `this.$store.dispatch`, e.g.:
 * `this.$store.dispatch('jv/get', <args>)`
 *
 * `args` can be either a string or an object representing the item(s) required,
 * or it can be an array of string/object and an optional axios config object.
 * @namespace actions
 * @memberof module:pinia-jsonapi.createJsonapiStore
 * @param {axios} api - an axios api instance
 * @param {object} conf - a pinia-jsonapi config object
 */

import get from 'lodash/get'
import merge from 'lodash/merge'

const actions = (api, conf, utils) => {
  // Short var name
  let jvtag = conf['jvtag']

  /**
   * Internal method to 'write' related items from the API.
   * This method is wrapped by `(delete|patch|post)Related` actions, and is not available directly as an action.
   *
   * @async
   * @memberof module:pinia-jsonapi.createJsonapiStore.actions
   * @param {object} args - A restructured object, specifying relationship(s)  - e.g. `{ _jv: { type: "endpoint", id: "1", relationships: {...} } }`
   * @param {object} args - A restructured object, specifying relationship(s)  - e.g. `{ _jv: { type: "endpoint", id: "1", relationships: {...} } }`
   * @return {object} Restructured representation of the 'parent' item
   */
  const writeRelated = async (store, args, method) => {
    let [data, config] = utils.unpackArgs(args)
    let [type, id] = utils.getTypeId(data)
    if (!type || !id) {
      throw 'No type/id specified'
    }

    let rels
    if (typeof data === 'object' && utils.hasProperty(data[jvtag], 'relationships')) {
      rels = data[jvtag]['relationships']
    } else {
      throw 'No relationships specified'
    }

    // Iterate over all records in rels
    let relPromises = []
    let includes = []
    for (let [relName, relItems] of Object.entries(rels)) {
      includes.push(relName)
      if (utils.hasProperty(relItems, 'data')) {
        let path = `${type}/${id}/relationships/${relName}`
        const apiConf = {
          method: method,
          url: path,
          data: relItems,
        }
        merge(apiConf, config)
        relPromises.push(api(apiConf))
      }
    }
    // Wait for all individual API calls to complete
    await Promise.all(relPromises)
    // Get the updated object from the API
    let params = {}
    // Also include related objects
    if (conf.relatedIncludes) {
      params['include'] = includes.join()
    }
    return store.get([`${type}/${id}`, { params: params }])
  }

  /**
   * Internal method for common api-get handling code for get and getRelated methods.
   *
   * @async
   * @memberof module:pinia-jsonapi.createJsonapiStore.actions
   * @param {object} data - Data for the api request.
   * @param {object} config - Axios configuration object.
   * @return {object} an API promise object.
   */
  const apiGet = (data, config) => {
    const path = utils.getURL(data)
    const apiConf = { method: 'get', url: path }
    // https://github.com/axios/axios/issues/362
    config['data'] = config['data'] || {}
    merge(apiConf, config)
    return api(apiConf)
  }

  return {
    /**
     * Get items from the API
     *
     * @async
     * @memberof module:pinia-jsonapi.createJsonapiStore.actions
     * @param {(string|object|array)} args - See {@link module:pinia-jsonapi.createJsonapiStore.actions} for a summary of args
     * @param {string}  - A URL path to an item - e.g. `endpoint/1`
     * @param {object}  - A restructured object  - e.g. `{ _jv: { type: "endpoint", id: "1" } }`
     * @param {array}  - A 2-element array, consisting of a string/object and an optional axios config object
     * @return {object} Restructured representation of the requested item(s)
     */
    get(args, search = false) {
      const [data, config] = utils.unpackArgs(args)
      return apiGet(data, config).then((results) => {
        let resData = utils.jsonapiToNorm(results.data.data)

        // Don't write data if searching
        if (!search) {
          let [type, id] = utils.getTypeId(data)
          let includes = utils.getIncludedRecords(results)
          if (!id && conf.clearOnUpdate) {
            let record = resData
            if (Object.keys(resData).length === 0 && type) {
              // No records - assume type == endpoint
              record = { _jv: { type: type } }
            }
            if (record) {
              this.clearRecords(record)
            }
          } else {
            this.addRecords(resData)
          }
          this.mergeRecords(includes)
        }
        resData = utils.checkAndFollowRelationships(this, resData)
        resData = utils.preserveJSON(resData, results.data)
        return resData
      })
    },
    /**
     * Get related items from the API
     *
     * @async
     * @memberof module:pinia-jsonapi.createJsonapiStore.actions
     * @param {(string|object|array)} args - See {@link module:pinia-jsonapi.createJsonapiStore.actions} for a summary of args
     * @param {string}  - A URL path to an item - e.g. `endpoint/1`
     * @param {object}  - A restructured object  - e.g. `{ _jv: { type: "endpoint", id: "1" } }`
     * @param {array}  - A 2-element array, consisting of a string/object and an optional axios config object
     * @return {object} Restructured representation of the requested item(s)
     */
    async getRelated(args) {
      const [data, config] = utils.unpackArgs(args)
      let [type, id, relName] = utils.getTypeId(data)
      if (!type || !id) {
        throw 'No type/id specified'
      }

      let rels
      if (typeof data === 'object' && utils.hasProperty(data[jvtag], 'relationships')) {
        rels = data[jvtag]['relationships']
      } else {
        let record = await this.get(args)

        rels = get(record, [jvtag, 'relationships'], {})
        if (relName && utils.hasProperty(rels, relName)) {
          // Only process requested relname
          rels = { [relName]: rels[relName] }
        }
      }

      // We can't pass multiple/non-promise vars in a promise chain,
      // so must define such vars in a higher scope
      let relNames = []
      let relPromises = []

      // Iterate over all records in rels
      for (let [relName, relItems] of Object.entries(rels)) {
        // Use per-rel config if set, otherwise default to config
        let relCfg = get(config, ['_jv', relName], config)
        let relData
        // relationships value might be empty if user-constructed
        // so fetch relationships resource linkage for these
        if (!relItems) {
          try {
            const resLink = await api.get(`${type}/${id}/relationships/${relName}`, relCfg)
            relItems = resLink.data
          } catch (error) {
            throw `No such relationship: ${relName}`
          }
        }
        // Use related link if provided
        if (utils.hasProperty(relItems, 'links')) {
          relData = relItems['links']['related']
          if (!(typeof relData === 'string')) {
            relData = relData['href']
          }
          relData = [relData]
          // Or extract relationships from 'data' (type/id)
          // empty to-one rels (null) are special-cased
        } else if (utils.hasProperty(relItems, 'data') && relItems['data'] !== null) {
          relData = relItems['data']
          if (!Array.isArray(relData)) {
            // Treat as if always an array
            relData = [relData]
          }
        }
        if (relData) {
          for (let entry of relData) {
            // Rewrite 'data' objects to normalised form
            if (!(typeof entry === 'string')) {
              entry = { [jvtag]: entry }
            }
            relNames.push(relName)
            relPromises.push(apiGet(entry, relCfg))
          }
        } else {
          // Empty to-one rels should have a relName but no data
          relNames.push(relName)
          // prettier-ignore
          relPromises.push(new Promise((resolve) => { resolve({}) }))
        }
      }
      // 'Merge' all promise resolution/rejection
      return Promise.all(relPromises).then((results) => {
        let allRels = []
        // Collect the jsonapi data & includes from each response
        results.forEach(({ data }) => {
          let res = get(data, ['data'])
          let included = get(data, ['included'])
          if (res) {
            allRels.push(res)
          }
          if (included) {
            allRels.push(...included)
          }
        })
        // Restructure the data
        allRels = utils.jsonapiToNorm(allRels)
        this.mergeRecords(allRels)
        // Use storeFormat: (type: id: object) as may have multiple types
        return utils.normToStore(allRels)
      })
    },
    /**
     * DELETE an object's relationships via its `relationships URL`
     *
     * @async
     * @memberof module:pinia-jsonapi.createJsonapiStore.actions
     * @param {object} args - A restructured object, specifying relationship(s)  - e.g. `{ _jv: { type: "endpoint", id: "1", relationships: {...} } }`
     * @return {object} Restructured representation of the 'parent' item
     */
    deleteRelated(args) {
      return writeRelated(this, args, 'delete')
    },
    /**
     * PATCH an object's relationships via its `relationships URL`
     *
     * @async
     * @memberof module:pinia-jsonapi.createJsonapiStore.actions
     * @param {object} args - A restructured object, specifying relationship(s)  - e.g. `{ _jv: { type: "endpoint", id: "1", relationships: {...} } }`
     * @return {object} Restructured representation of the 'parent' item
     */
    patchRelated(args) {
      return writeRelated(this, args, 'patch')
    },
    /**
     * POST to an object's relationships via its `relationships URL`
     *
     * @async
     * @memberof module:pinia-jsonapi.createJsonapiStore.actions
     * @param {object} args - A restructured object, specifying relationship(s)  - e.g. `{ _jv: { type: "endpoint", id: "1", relationships: {...} } }`
     * @return {object} Restructured representation of the 'parent' item
     */
    postRelated(args) {
      return writeRelated(this, args, 'post')
    },
    /**
     * Post an item to the API
     *
     * @async
     * @memberof module:pinia-jsonapi.createJsonapiStore.actions
     * @param {(object|array)} args - See {@link module:pinia-jsonapi.createJsonapiStore.actions} for a summary of args
     * @param {object}  - A restructured object  - e.g. `{ _jv: { type: "endpoint", id: "1" } }`
     * @param {array}  - A 2-element array, consisting of a string/object and an optional axios config object
     * @return {object} Restructured representation of the posted item
     */
    post(args) {
      let [data, config] = utils.unpackArgs(args)
      const path = utils.getURL(data, true)
      const apiConf = {
        method: 'post',
        url: path,
        data: utils.normToJsonapi(data),
      }
      merge(apiConf, config)
      return api(apiConf).then((results) => {
        let includes = utils.getIncludedRecords(results)
        this.mergeRecords(includes)

        // If the server handed back data, store it (to get id)
        // spec says 201, but some servers (wrongly) return 200
        if (results.status === 200 || results.status === 201) {
          data = utils.jsonapiToNorm(results.data.data)
        }
        this.addRecords(data)
        return utils.preserveJSON(this.getData(data), results.data)
      })
    },
    /**
     * Patch an item in the API
     *
     * @async
     * @memberof module:pinia-jsonapi.createJsonapiStore.actions
     * @param {(object|array)} args - See {@link module:pinia-jsonapi.createJsonapiStore.actions} for a summary of args
     * @param {object}  - A restructured object  - e.g. `{ _jv: { type: "endpoint", id: "1" } }`
     * @param {array}  - A 2-element array, consisting of a string/object and an optional axios config object
     * @return {object} Restructured representation of the patched item
     */
    patch(args) {
      let [data, config] = utils.unpackArgs(args)
      if (conf.cleanPatch) {
        data = utils.cleanPatch(data, this.$state, conf.cleanPatchProps)
      }
      const path = utils.getURL(data)
      const apiConf = {
        method: 'patch',
        url: path,
        data: utils.normToJsonapi(data),
      }
      merge(apiConf, config)
      return api(apiConf).then((results) => {
        // If the server handed back data, store it
        if (results.status === 200 && utils.hasProperty(results.data, 'data')) {
          // Full response
          this.deleteRecord(data)
          data = utils.jsonapiToNorm(results.data.data)
          this.addRecords(data)
        } else {
          // 200 (meta-only), or 204 (no resource) response
          // Update the store record from the patch
          this.mergeRecords(data)
        }

        // NOTE: We deliberately process included records after any `deleteRecord` mutations
        // to avoid deleting any included records that we just added.
        let includes = utils.getIncludedRecords(results)
        this.mergeRecords(includes)
        return utils.preserveJSON(this.getData(data), results.data)
      })
    },
    /**
     * Delete an item from the API
     *
     * @async
     * @memberof module:pinia-jsonapi.createJsonapiStore.actions
     * @param {(string|object|array)} args - See {@link module:pinia-jsonapi.createJsonapiStore.actions} for a summary of args
     * @param {string}  - A URL path to an item - e.g. `endpoint/1`
     * @param {object}  - A restructured object  - e.g. `{ _jv: { type: "endpoint", id: "1" } }`
     * @param {array}  - A 2-element array, consisting of a string/object and an optional axios config object
     * @return {object} Restructured representation of the deleted item
     */
    delete(args) {
      const [data, config] = utils.unpackArgs(args)
      const path = utils.getURL(data)
      const apiConf = { method: 'delete', url: path }
      merge(apiConf, config)
      return api(apiConf).then((results) => {
        let includes = utils.getIncludedRecords(results)
        this.mergeRecords(includes)
        this.deleteRecord(data)
        if (results.data) {
          return utils.preserveJSON(utils.jsonapiToNorm(results.data.data), results.data)
        } else {
          return data
        }
      })
    },
    /**
     * Get items from the API without updating the Pinia store
     *
     * @see module:pinia-jsonapi.createJsonapiStore.actions.get
     * @async
     * @memberof module:pinia-jsonapi.createJsonapiStore.actions
     * @param {(string|object|array)} args - See {@link module:pinia-jsonapi.createJsonapiStore.actions} for a summary of args
     * @param {string}  - A URL path to an item - e.g. `endpoint/1`
     * @param {object}  - A restructured object  - e.g. `{ _jv: { type: "endpoint", id: "1" } }`
     * @param {array}  - A 2-element array, consisting of a string/object and an optional axios config object
     * @return {object} Restructured representation of the posted item
     */
    search(args) {
      // Set 'search' param to true to prevent store updates
      return this.get(args, true)
    },
    /**
     * Alias for {@link module:pinia-jsonapi.createJsonapiStore.actions.get}
     * @async
     * @memberof module:pinia-jsonapi.createJsonapiStore.actions
     */
    fetch(args) {
      return this.get(args)
    },
    /**
     * Alias for {@link module:pinia-jsonapi.createJsonapiStore.actions.post}
     * @async
     * @memberof module:pinia-jsonapi.createJsonapiStore.actions
     */
    create(args) {
      return this.post(args)
    },
    /**
     * Alias for {@link module:pinia-jsonapi.createJsonapiStore.actions.patch}
     * @async
     * @memberof module:pinia-jsonapi.createJsonapiStore.actions
     */
    update(args) {
      return this.patch(args)
    },
    /**
     * Add record(s) to the store, according to `mergeRecords` config option
     * @memberof module:pinia-jsonapi.createJsonapiStore.actions
     * @param {object} records - The record(s) to be added
     */
    addRecords(records) {
      utils.updateRecords(this, records)
    },
    /**
     * Delete all records from the store (of a given type) other than those included in a given record
     * @memberof module:pinia-jsonapi.createJsonapiStore.actions
     * @param {object} records - A record with type set.
     */
    clearRecords(records) {
      Object.assign(this.$state, utils.normToStore(records))
    },
    /**
     * Delete a record from the store.
     * @memberof module:pinia-jsonapi.createJsonapiStore.actions
     * @param {(string|object)} record - The record to be deleted
     */
    deleteRecord(record) {
      const [type, id] = utils.getTypeId(record, false)
      if (!type || !id) {
        throw `deleteRecord: Missing type or id: ${record}`
      }
      try {
        delete this.$state[type][id]
      } catch (err) {
        if (err instanceof TypeError) {
          // Trying to delete non-existent object - ignore
        } else {
          throw err
        }
      }
    },
    /**
     * Merge (or add) records to the store
     * @memberof module:pinia-jsonapi.createJsonapiStore.actions
     * @param {object} records - The record(s) to be merged
     */
    mergeRecords(records) {
      utils.updateRecords(this, records, true)
    },
    /**
     * Replace (or add) record(s) to the store
     * @memberof module:pinia-jsonapi.createJsonapiStore.actions
     * @param {object} records - The record(s) to be replaced
     */
    replaceRecords(records) {
      utils.updateRecords(this, records, false)
    },
  }
}

export default actions
