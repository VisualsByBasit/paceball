// Diagnostics initialise before the router so an error thrown while the app
// starts is still caught. initializeDiagnostics does nothing unless a DSN is set
// in this build AND the user has opted in, so by default this sends nothing.
import { initializeDiagnostics } from './src/diagnostics';

initializeDiagnostics();

// Expo Router must be loaded after error reporting is initialized.
require('expo-router/entry');
