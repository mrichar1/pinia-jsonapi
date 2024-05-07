# Porting from jsonapi-vuex to pinia-jsonapi

The following is a quick summary of the main changes between jsonapi-vuex and pinia-jsonapi - please see `README.md` for the full documentation.

## Changes

### Setup

The contents of store.js are simplified to just import and instantiate a `pinia-jsonapi` instance:

```js
import axios from 'axios'
import { createJsonapiStore } from 'pinia-jsonapi'

const api = axios.create({
  baseURL: 'https://api.example.com/1/api/',
  headers: {
    'Content-Type': 'application/vnd.api+json',
  },
})

const { jsonapiStore } = createJsonapiStore(api)

export { jsonapiStore }
```

You then use this in your components by importing and instantiating it:

```js
import { jsonapiStore } from '../store'

const store = jsonapiStore()
```


### Actions

Actions are no longer called with `dispatch` - instead actions are functions called directly from the store:

```js
// jsonapi-vuex
this.$store.dispatch('jv/get', 'widget').then((data) => {})

// pinia-jsonapi
store.get('widget').then((data) => {})
```

### Mutations

Mutations no longer exist. Store modification occurs through `actions` with the same name as the old `mutations`.

### Getters

`Pinia` has a single namespace for all actions and getters. As a result the getter functions have been renamed from `get` to `getData` and `getRelated` to `getRelatedData` to avoid clashes with the equivalent actions.

Like actions, getters are now called directly from the store:

```js
// jsonapi-vuex
this.$store.getters['jv/get']({ _jv: { type: 'Widget' } })


// pinia-jsonapi
store.getData({ _jv: { type: 'Widget' } })
```
