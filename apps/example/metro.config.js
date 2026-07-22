/* global __dirname */

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('epub')) {
  config.resolver.assetExts.push('epub');
}

if (!config.resolver.assetExts.includes('txt')) {
  config.resolver.assetExts.push('txt');
}

module.exports = config;
