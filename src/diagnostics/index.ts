import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { createMMKV } from 'react-native-mmkv';
import { scrubDiagnosticEvent } from './privacy';

const preferences = createMMKV({ id: 'paceball-diagnostics' });
const CONSENT_KEY = 'crash-reports-enabled';
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
let initialized = false;

export function diagnosticsStatus() {
  return { configured: Boolean(dsn), consent: preferences.getString(CONSENT_KEY) === 'true' };
}

export function initializeDiagnostics(): void {
  const { configured, consent } = diagnosticsStatus();
  if (!configured || !consent) return;
  if (initialized) { const client = Sentry.getClient(); if (client) client.getOptions().enabled = true; return; }
  Sentry.init({
    dsn,
    release: `com.paceball.app@${Constants.expoConfig?.version ?? 'unknown'}`,
    environment: __DEV__ ? 'development' : 'production',
    // JS-only transport ensures every outgoing error passes the privacy filter.
    // Native crash reporting needs its own native filters before it is enabled.
    enableNative: false, enableNativeCrashHandling: false,
    autoInitializeNativeSdk: false,
    sendDefaultPii: false, sendClientReports: false,
    enableAutoSessionTracking: false, enableAutoPerformanceTracing: false,
    // Omit tracing/replay sample options altogether: this SDK installs some
    // collectors even when those options are explicitly zero.
    enableLogs: false, enableStallTracking: false, enableAppStartTracking: false,
    beforeSendTransaction: () => null,
    attachScreenshot: false, attachViewHierarchy: false,
    maxBreadcrumbs: 0, beforeBreadcrumb: () => null,
    beforeSend: (event, hint) => {
      if (!diagnosticsStatus().consent) return null;
      hint.attachments = [];
      return scrubDiagnosticEvent(event);
    },
  });
  initialized = true;
}

export function setDiagnosticsConsent(enabled: boolean): void {
  preferences.set(CONSENT_KEY, String(enabled));
  if (enabled) initializeDiagnostics();
  else {
    const client = Sentry.getClient();
    if (client) client.getOptions().enabled = false;
  }
}

export async function sendDiagnosticTest(): Promise<boolean> {
  const status = diagnosticsStatus();
  if (!status.configured || !status.consent) throw new Error('Configure Sentry and enable crash reports first.');
  initializeDiagnostics();
  Sentry.captureException(new Error('Paceball diagnostic test'));
  return Sentry.getClient()?.flush(5000) ?? false;
}

export { wrap } from '@sentry/react-native';
