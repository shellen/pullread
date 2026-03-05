const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
    "node_modules/.+\\.js$": "babel-jest",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(entities|defuddle)/)"
  ],
  moduleNameMapper: {
    "^bun:sqlite$": "<rootDir>/src/__mocks__/bun-sqlite.js",
    "^defuddle/node$": "<rootDir>/node_modules/defuddle/dist/node.js",
  },
};
