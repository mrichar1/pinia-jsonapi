import axios from 'axios'
import { createJsonapiStore } from '../../../src/pinia-jsonapi'

const api = axios.create({
  // connect to local jsonapi-mock server
  baseURL: 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/vnd.api+json',
    Accept: 'application/vnd.api+json',
  },
})

const { jsonapiStore, status, utils } = createJsonapiStore(api, {})

export { jsonapiStore, status, utils }
