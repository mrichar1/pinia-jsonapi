export function jsonFormat() {
  return {
    id: '1',
    type: 'machine',
    attributes: {
      foo: 1,
    },
  }
}

export function normFormat() {
  return {
    foo: 1,
    _jv: {
      type: 'machine',
      id: '1',
    },
  }
}

export function storeFormat() {
  return {
    machine: {
      1: {
        ...normFormat(),
      },
    },
  }
}
