// ABOUTME: Mock for bun:sqlite used in Jest tests (Node.js environment)
// ABOUTME: Provides stub Database class so modules importing bun:sqlite can load
class Database {
  constructor() {}
  query() { return { all: () => [], run: () => {} }; }
  close() {}
}
module.exports = { Database };
