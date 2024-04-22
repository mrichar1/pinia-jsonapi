export function jsonFormat() {
  return {
    id: '2',
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
      id: '2',
    },
  }
}
