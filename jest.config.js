const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  // jest is one of several runners in this repo. Ignore tests that belong to
  // the others so `npm test` exits clean:
  //   - tests/e2e/**       → Playwright (throws under jest)
  //   - worker/**          → vitest + cloudflare:test
  //   - *.test.ts files importing from `bun:test` → run via `npm run test:bun`
  testPathIgnorePatterns: [
    "/node_modules/",
    "/tests/e2e/",
    "/worker/",
    "/src/models\\.test\\.ts$",
    "/src/shell-open\\.test\\.ts$",
  ],
  transform: {
    ...tsJestTransformCfg,
    "node_modules/.+\\.js$": "babel-jest",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(entities|defuddle|loxodonta-core-monorepo|better-sqlite3)/)"
  ],
  moduleNameMapper: {
    "^bun:sqlite$": "<rootDir>/src/__mocks__/bun-sqlite.js",
    "^defuddle/node$": "<rootDir>/node_modules/defuddle/dist/node.js",
  },
};
