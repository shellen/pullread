// ABOUTME: Jest mock for bun:sqlite that delegates to better-sqlite3.
// ABOUTME: Enables research-db tests to run in Node/Jest with real SQLite.

const BetterSqlite3 = require('better-sqlite3');

class Database {
  constructor(path) {
    this._db = new BetterSqlite3(path);
  }
  exec(sql) {
    this._db.exec(sql);
  }
  prepare(sql) {
    const stmt = this._db.prepare(sql);
    return {
      run: (...params) => stmt.run(...params),
      get: (...params) => stmt.get(...params),
      all: (...params) => stmt.all(...params),
    };
  }
  close() {
    this._db.close();
  }
}

module.exports = { Database };
