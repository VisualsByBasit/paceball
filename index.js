import { initializeDiagnostics } from './src/diagnostics';
initializeDiagnostics();
// Expo Router must be loaded after error reporting is initialized.
require('expo-router/entry');
