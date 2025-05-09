/**
 * A class containing utility functions for use with pinia-jsonapi
 *
 * **Note** - an instance of this class is exported as `utils` from `pinia-jsonapi`,
 * so it does not need to be used directly.
 *
 * @name Utils
 * @namespace utils
 * @memberof module:pinia-jsonapi
 * @param {object} conf - A pinia-jsonapi config object.
 */

import get from 'lodash/get'
import isEqual from 'lodash/isEqual'
import merge from 'lodash/merge'

/**
 * Helper methods added to `_jv` by {@link module:pinia-jsonapi.utils.addJvHelpers}
 * @namespace helpers
 * @memberof module:pinia-jsonapi.
 */

/**
 * Documentation for internal functions etc.
 * These are not available when the module is imported,
 * and are documented for module developers only.
 * @namespace _internal
 * @memberof module:pinia-jsonapi
 */

const Utils = class {
  constructor(conf) {
    this.conf = conf
    this.jvtag = conf.jvtag
  }

  /**
   * @memberof module:pinia-jsonapi._internal
   * @param {object} data - An object to be deep copied
   * @return {object} A deep copied object
   */

  _copy(data) {
    // Recursive object copying function (for 'simple' objects)
    let out = Array.isArray(data) ? [] : {}
    for (let key in data) {
      // null is typeof 'object'
      if (typeof data[key] === 'object' && data[key] !== null) {
        out[key] = this._copy(data[key])
      } else {
        out[key] = data[key]
      }
    }
    return out
  }

  /**
   * Add helper functions and getters to a restructured object
   * @memberof module:pinia-jsonapi.utils
   * @param {object} obj - An object to assign helpers to
   * @return {object} A copy of the object with added helper functions/getters
   */
  addJvHelpers(obj) {
    // Avoid 'this' confusion in property definitions
    let jvtag = this.jvtag
    let hasProperty = this.hasProperty
    if (obj[jvtag] && !hasProperty(obj[jvtag], 'isRel') && !hasProperty(obj[jvtag], 'isAttr')) {
      Object.assign(obj[jvtag], {
        /**
         * @memberof module:pinia-jsonapi.helpers
         * @param {string} name - Name of a (potential) relationship
         * returns {boolean} true if the name given is a relationship of this object
         */
        isRel(name) {
          return hasProperty(get(obj, [jvtag, 'relationships'], {}), name)
        },
        /**
         * @memberof module:pinia-jsonapi.helpers
         * @param {string} name - Name of a (potential) attribute
         * returns {boolean} true if the name given is an attribute of this object
         */
        isAttr(name) {
          return name !== jvtag && hasProperty(obj, name) && !obj[jvtag].isRel(name)
        },
      })
    }
    /**
     * @memberof module:pinia-jsonapi.helpers
     * @name rels
     * @property {object} - An object containing all relationships for this object
     */
    if (hasProperty(obj, jvtag)) {
      Object.defineProperty(obj[jvtag], 'rels', {
        get() {
          const rel = {}
          for (let key of Object.keys(get(obj, [jvtag, 'relationships'], {}))) {
            rel[key] = obj[key]
          }
          return rel
        },
        // Allow to be redefined
        configurable: true,
      })
      /**
       * @memberof module:pinia-jsonapi.helpers
       * @name attrs
       * @property {object} - An object containing all attributes for this object
       */
      Object.defineProperty(obj[jvtag], 'attrs', {
        get() {
          const att = {}
          for (let [key, val] of Object.entries(obj)) {
            if (obj[jvtag].isAttr(key)) {
              att[key] = val
            }
          }
          return att
        },
        // Allow to be redefined
        configurable: true,
      })
    }
    return obj
  }

  /**
   * If `followRelationshipData` is set, call `followRelationships` for either an item or a collection
   * See {@link module:pinia-jsonapi~Configuration|Configuration}
   * @memberof module:pinia-jsonapi._internal
   * @param {object} state - Vuex state object
   * @param {object} getters - Vuex getters object
   * @param {object} records - Record(s) to follow relationships for.
   * @param {array} seen - internal recursion state-tracking
   * @return {object} records with relationships followed
   */
  checkAndFollowRelationships(store, records, seen) {
    if (this.conf.followRelationshipsData) {
      let resData = {}
      if (store.$state === records) {
        // All of state
        for (let [key, record] of Object.entries(records)) {
          resData[key] = this.checkAndFollowRelationships(store, record, seen)
        }
      } else if (this.hasProperty(records, this.jvtag)) {
        // single item
        resData = this.followRelationships(store, records, seen)
      } else {
        // multiple items
        for (let [key, item] of Object.entries(records)) {
          resData[key] = this.followRelationships(store, item, seen)
        }
      }
      if (resData) {
        return resData
      }
    }
    return records
  }

  /**
   * A function that cleans up a patch object, so that it doesn't introduce unexpected changes when sent to the API.
   * It removes any attributes which are unchanged from the store, to minimise accidental reversions.
   * It also strips out any of links, relationships and meta from `_jv` - See {@link module:pinia-jsonapi~Configuration|Configuration}
   * @memberof module:pinia-jsonapi.utils
   * @param {object} patch - A restructured object to be cleaned
   * @param {object} state={} - Vuex state object (for patch comparison)
   * @param {array} jvProps='[]' - _jv Properties to be kept
   * @return {object} A cleaned copy of the patch object
   */
  cleanPatch(patch, state = {}, jvProps = []) {
    // Add helper properties (use a copy to prevent side-effects)
    const modPatch = this.deepCopy(patch)
    const attrs = get(modPatch, [this.jvtag, 'attrs'])
    const clean = { [this.jvtag]: {} }
    // Only try to clean the patch if it exists in the store
    const stateRecord = get(state, [modPatch[this.jvtag]['type'], modPatch[this.jvtag]['id']])
    if (stateRecord) {
      for (let [k, v] of Object.entries(attrs)) {
        if (!this.hasProperty(stateRecord, k) || !isEqual(stateRecord[k], v)) {
          clean[k] = v
        }
      }
    } else {
      Object.assign(clean, attrs)
    }

    // Add _jv data, as required
    clean[this.jvtag]['type'] = patch[this.jvtag]['type']
    clean[this.jvtag]['id'] = patch[this.jvtag]['id']
    for (let prop of jvProps) {
      let propVal = get(patch, [this.jvtag, prop])
      if (propVal) {
        clean[this.jvtag][prop] = propVal
      }
    }

    return clean
  }

  /**
   * Deep copy a normalised object, then re-add helper nethods
   * @memberof module:pinia-jsonapi.utils
   * @param {object} obj - An object to be deep copied
   * @return {object} A deep copied object, with Helper functions added
   */
  deepCopy(obj) {
    let copyObj = this._copy(obj)
    if (Object.entries(copyObj).length) {
      if (this.hasProperty(copyObj, this.jvtag)) {
        copyObj = this.addJvHelpers(copyObj)
      }
      return copyObj
    }
    return obj
  }

  /**
   * A thin wrapper around `getRelationships, making a copy of the object.
   * We can't add rels to the original object, otherwise Vue's watchers
   * spot the potential for loops (which we are guarding against) and throw an error
   *
   * @memberof module:pinia-jsonapi._internal
   * @param {object} state - Vuex state object
   * @param {object} getters - Vuex getters object
   * @param {object} record - Record to get relationships for.
   * @param {array} seen - internal recursion state-tracking
   * @return {object} records with relationships followed and helper functions added (see {@link module:pinia-jsonapi.utils.addJvHelpers})
   */
  followRelationships(store, record, seen) {
    let data = {}

    Object.defineProperties(data, Object.getOwnPropertyDescriptors(record))

    let relationships = this.getRelationships(store, data, seen)
    Object.defineProperties(data, Object.getOwnPropertyDescriptors(relationships))

    return this.addJvHelpers(data)
  }

  /**
   * Make a copy of a restructured object, adding (js) getters for its relationships
   * That call the (vuex) get getter to fetch that record from the store
   *
   * Already seen objects are tracked using the 'seen' param to avoid loops.
   *
   * @memberof module:pinia-jsonapi._internal
   * @param {object} getters - Vuex getters object
   * @param {object} parent - The object whose relationships should be fetched
   * @param {array} seen - Internal recursion state tracking
   * @returns {object} A copy of the object with getter relationships added
   */
  getRelationships(store, parent, seen = []) {
    // Avoid 'this' confusion in Object.defineProperty
    let conf = this.conf
    let jvtag = this.jvtag
    let relationships = get(parent, [jvtag, 'relationships'], {})
    let relationshipsData = {}
    for (let relName of Object.keys(relationships)) {
      let relations = get(relationships, [relName, 'data'])
      relationshipsData[relName] = {}
      if (relations) {
        let isItem = !Array.isArray(relations)
        let relationsData = {}

        for (let relation of isItem ? Array.of(relations) : relations) {
          let relType = relation['type']
          let relId = relation['id']

          if (!this.hasProperty(relationsData, relId)) {
            Object.defineProperty(relationsData, relId, {
              get() {
                let current = [relName, relType, relId]
                // Stop if seen contains an array which matches 'current'
                if (!conf.recurseRelationships && seen.some((a) => a.every((v, i) => v === current[i]))) {
                  return { [jvtag]: { type: relType, id: relId } }
                } else {
                  // prettier-ignore
                  return store.getData(
                      `${relType}/${relId}`,
                      undefined,
                      [...seen, [relName, relType, relId]]
                    )
                }
              },
              enumerable: true,
            })
          }
        }
        if (isItem) {
          Object.defineProperty(
            relationshipsData,
            relName,
            Object.getOwnPropertyDescriptor(relationsData, Object.keys(relationsData)[0])
          )
        } else {
          Object.defineProperties(relationshipsData[relName], Object.getOwnPropertyDescriptors(relationsData))
        }
      }
    }
    return relationshipsData
  }

  /**
   * Get the type, id and relationships from a restructured object
   * @memberof module:pinia-jsonapi.utils
   * @param {object} data - A restructured object
   * @param {boolean} encode=true - url-encode the returned values
   * @return {array} An array (optionally) containing type, id and rels
   */
  getTypeId(data, encode = true) {
    let type, id, rel
    if (typeof data === 'string') {
      try {
        // If the data param is a full URL, we can't extract type/id/rel from it
        new URL(data)
        return []
      } catch {
        // Continue if not a full URL
      }
      ;[type, id, rel] = data.replace(/^\//, '').split('/')
    } else {
      ;({ type, id } = data[this.jvtag])
    }

    let result = [type, id, rel]
    // Spec: The values of the id and type members MUST be strings.
    // uri encode to prevent mis-interpretation as url parts.
    if (encode) {
      result = [type && encodeURIComponent(type), id && encodeURIComponent(id), rel && encodeURIComponent(rel)]
    }
    return result.filter(Boolean)
  }

  /**
   * Return the URL path (links.self) or construct from type/id
   * @memberof module:pinia-jsonapi.utils
   * @param {object} data - A restructured object
   * @return {string} The record's URL path
   */
  getURL(data, post = false) {
    let path = data
    if (typeof data === 'object') {
      if (get(data, [this.jvtag, 'links', 'self']) && !post) {
        path = data[this.jvtag]['links']['self']
      } else {
        let { type, id } = data[this.jvtag]
        path = type
        // POST endpoints are always to collections, not items
        if (id && !post) {
          path += '/' + id
        }
      }
    }
    return path
  }

  /**
   * Shorthand for the 'safe' `hasOwnProperty` as described here:
   * [eslint: no-prototype-builtins](https://eslint.org/docs/rules/no-prototype-builtins])
   * @name hasProperty
   * @memberof module:pinia-jsonapi._internal
   */
  hasProperty(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop)
  }

  /**
   * Convert JSONAPI record(s) to restructured data
   * @memberof module:pinia-jsonapi.utils
   * @param {object} data - The `data` object from a JSONAPI record
   * @param {boolean} recordType=isData - Set a key in _jv for every record which reflects if this came 'direct' from 'data' or via 'included'
   * @return {object} Restructured data
   */
  jsonapiToNorm(data, recordType = 'isData') {
    const norm = {}
    if (Array.isArray(data)) {
      data.forEach((item) => {
        let { id } = item
        if (!this.hasProperty(norm, id)) {
          norm[id] = {}
        }
        Object.assign(norm[id], this.jsonapiToNormItem(item, recordType))
      })
    } else {
      Object.assign(norm, this.jsonapiToNormItem(data, recordType))
    }
    return norm
  }

  /**
   * Restructure a single jsonapi item. Used internally by {@link module:pinia-jsonapi.utils.jsonapiToNorm}
   * @memberof module:pinia-jsonapi._internal
   * @param {object} data - JSONAPI record
   * @param {boolean} recordType=isData - Set a key in _jv which reflects if this came 'direct' from 'data' or via 'included'
   * @return {object} Restructured data
   */
  jsonapiToNormItem(data, recordType = 'isData') {
    if (!data) {
      return {}
    }
    // Move attributes to top-level, nest original jsonapi under _jv
    const norm = Object.assign({ [this.jvtag]: data }, data['attributes'])
    // Create a new object omitting attributes
    const { attributes, ...normNoAttrs } = norm[this.jvtag] // eslint-disable-line no-unused-vars
    norm[this.jvtag] = normNoAttrs
    // Set recordType (either isData or isIncluded) to true
    norm[this.jvtag][recordType] = true
    return norm
  }

  /**
   * Convert one or more restructured records to jsonapi
   * @memberof module:pinia-jsonapi.utils
   * @param {object} record - A restructured record to be convert to JSONAPI
   * @return {object} JSONAPI record
   */
  normToJsonapi(record) {
    const jsonapi = []
    if (!this.hasProperty(record, this.jvtag)) {
      // Collection of id-indexed records
      for (let item of Object.values(record)) {
        jsonapi.push(this.normToJsonapiItem(item))
      }
    } else {
      jsonapi.push(this.normToJsonapiItem(record))
    }
    if (jsonapi.length === 1) {
      return { data: jsonapi[0] }
    } else {
      return { data: jsonapi }
    }
  }

  /**
   * Convert a single restructured item to JSONAPI. Used internally by {@link module:pinia-jsonapi.utils.normToJsonapi}
   * @memberof module:pinia-jsonapi._internal
   * @param {object} data - Restructured data
   * @return {object}  JSONAPI record
   */
  normToJsonapiItem(data) {
    const jsonapi = {}
    //Pick out expected resource members, if they exist
    for (let member of ['id', 'type', 'relationships', 'meta', 'links']) {
      if (this.hasProperty(data[this.jvtag], member)) {
        jsonapi[member] = data[this.jvtag][member]
      }
    }
    // User-generated data (e.g. post) has no helper functions
    if (this.hasProperty(data[this.jvtag], 'attrs')) {
      jsonapi['attributes'] = data[this.jvtag].attrs
    } else {
      jsonapi['attributes'] = Object.assign({}, data)
      delete jsonapi['attributes'][this.jvtag]
    }
    return jsonapi
  }

  /**
   * Convert one or more restructured records to nested (type & id) 'store' object
   * @memberof module:pinia-jsonapi.utils
   * @param {object} record - A restructured record to be convert to JSONAPI
   * @return {object} Structured 'store' object
   */
  normToStore(record) {
    let store = {}
    if (this.hasProperty(record, this.jvtag)) {
      if (!this.hasProperty(record[this.jvtag], 'id')) {
        // No id means no item to add to store: return empty store
        return store
      }
      // Convert item to look like a collection
      record = { [record[this.jvtag]['id']]: record }
    }
    for (let item of Object.values(record)) {
      const { type, id } = item[this.jvtag]
      if (!this.hasProperty(store, type)) {
        store[type] = {}
      }
      if (this.conf.followRelationshipsData) {
        for (let rel in item[this.jvtag].rels) {
          delete item[rel]
        }
      }
      store[type][id] = item
    }
    return store
  }

  /**
   * If `preserveJSON` is set, add the returned JSONAPI in a get action to _jv.json
   * See {@link module:pinia-jsonapi~Configuration|Configuration}
   * @memberof module:pinia-jsonapi._internal
   * @param {object} data - Restructured record
   * @param {object} json - JSONAPI record
   * @return {object} data record, with JSONAPI added in _jv.json
   */
  preserveJSON(data, json) {
    if (this.conf.preserveJson && data) {
      if (!this.hasProperty(data, this.jvtag)) {
        data[this.jvtag] = {}
      }
      // Store original json in _jv
      data[this.jvtag]['json'] = json
    }
    return data
  }

  /**
   * Restructure all records in 'included' (using {@link module:pinia-jsonapi._internal.jsonapiToNorm})
   * and add to the store.
   * @memberof module:pinia-jsonapi._internal
   * @param {object} results - JSONAPI record
   */
  getIncludedRecords(results) {
    let includes = get(results, ['data', 'included'])
    if (includes) {
      let norm = []
      // Include array can have different types, so write to array to avoid id conflicts
      for (let item of includes) {
        norm.push(this.jsonapiToNormItem(item, 'isIncluded'))
      }
      return norm
    }
    return []
  }

  /**
   * Transform args to always be an array (data and config options).
   * See {@link module:pinia-jsonapi.actions} for an explanation of why this function is needed.
   *
   * @memberof module:pinia-jsonapi._internal
   * @param {(string|array)} args - Array of data and configuration info
   * @return {array} Array of data and config options
   */
  unpackArgs(args) {
    if (Array.isArray(args)) {
      return args
    }
    return [args, {}]
  }

  /**
   * A single function to encapsulate the different merge approaches of the record mutations.
   * See {@link module:pinia-jsonapi.mutations} to see the mutations that use this function.
   *
   * @memberof module:pinia-jsonapi._internal
   * @param {object} state - Vuex state object
   * @param {object} records - Restructured records to be updated
   * @param {boolean} merging - Whether or not to merge or overwrite records
   */
  updateRecords(store, records, mergeDefault = this.conf.mergeRecords) {
    const storeRecords = this.normToStore(records)
    let merging = {}
    let storeData = {}
    for (let [type, item] of Object.entries(storeRecords)) {
      let newRecords = item
      if (mergeDefault) {
        if (!(type in merging)) {
          merging[type] = true
          if (!this.hasProperty(store.$state, type)) {
            // If there's no type, then there are no existing records to merge with
            merging[type] = false
          }
        }
        if (merging[type]) {
          newRecords = Object.fromEntries(
            Object.entries(item).map(([id, data]) => {
              const oldRecord = get(store.$state, [type, id])
              if (oldRecord) {
                data = merge(oldRecord, data)
              }
              return [id, data]
            })
          )
        }
      }
      Object.assign(storeData, { [type]: newRecords })
    }
    for (let [type, data] of Object.entries(storeData)) {
      if (type in store.$state) {
        Object.assign(store.$state[type], data)
      } else {
        store.$state[type] = data
      }
    }
  }
}

/**
 * A class for tracking the status of actions.
 *
 * **Note** - an instance of this class is exported as `status` from `pinia-jsonapi`,
 * so it does not need to be used directly.
 *
 * @namespace status
 * @memberof module:pinia-jsonapi
 * @param {object} maxId=-1 - Limit ID 'history' to N items (default is unlimited).
 */
const ActionStatus = class {
  constructor(maxID = -1) {
    this.PENDING = 0
    this.SUCCESS = 1
    this.ERROR = -1
    this.maxID = maxID || -1
    this.status = {}
    this.counter = 0
  }

  _count() {
    if (this.counter === this.maxID) {
      this.counter = 0
    }
    return ++this.counter
  }

  /**
   * This method:
   * - Creates a new ID property in the class' `status` object.
   * - Sets status to PENDING
   * - Calls the provided function
   * - Attaches then/catch blocks to the promise which will set status to SUCCESS/ERROR
   *
   * @memberof module:pinia-jsonapi.status
   * @params {function} func - A function to be executed which returns a promised
   * @returns {integer} The status ID for this function.
   */
  run(func) {
    const id = this._count()
    this.status[id] = this.PENDING
    const promise = new Promise((resolve, reject) => {
      func()
        .then((result) => {
          this.status[id] = this.SUCCESS
          resolve(result)
        })
        .catch((error) => {
          this.status[id] = this.ERROR
          reject(error)
        })
    })
    promise._statusID = id
    return promise
  }
}

export { Utils, ActionStatus }
