// ABOUTME: Babel config for Jest to transform ESM modules
// ABOUTME: Required for testing jsdom which depends on ESM-only packages

module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }]
  ]
};
