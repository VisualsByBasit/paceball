// Expo's default Metro config, wrapped by Sentry so bundles carry the debug IDs
// that let a report's stack be symbolicated. Nothing here sends anything.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
