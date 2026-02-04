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
    "node_modules/(?!(entities)/)"
  ],
  moduleNameMapper: {
    "^bun:sqlite$": "<rootDir>/src/__mocks__/bun-sqlite.js",
  },
};
