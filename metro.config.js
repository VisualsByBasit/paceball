// Expo's default Metro config, wrapped by Sentry so bundles carry the debug IDs
// that let a report's stack be symbolicated. Nothing here sends anything.
const path = require('node:path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// website/ is a separate Next.js project with its own node_modules. Metro must
// never crawl it, or its copy of React turns into duplicate-module errors here.
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const websiteDir = new RegExp(
  `^${path.join(__dirname, 'website').split(path.sep).map(escape).join('[\\\\/]')}(?:[\\\\/].*)?$`,
);
const blockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(blockList) ? blockList : blockList ? [blockList] : []),
  websiteDir,
];

module.exports = config;
