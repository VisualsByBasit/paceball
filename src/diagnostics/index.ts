import type { ComponentType } from 'react';
import * as Sentry from '@sentry/react-native';
import { createMMKV } from 'react-native-mmkv';
import { scrubDiagnosticEvent } from './privacy';

const preferences = createMMKV({ id: 'paceball-diagnostics' });
const CONSENT_KEY = 'crash-reports-enabled';
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
const nativeCrashTestEnabled = process.env.EXPO_PUBLIC_SENTRY_NATIVE_TEST_ENABLED === 'true';
let initialized = false;
let nativeReady: Promise<boolean> | null = null;

export function diagnosticsStatus() {
  return {
    configured: Boolean(dsn),
    consent: preferences.getString(CONSENT_KEY) === 'true',
    nativeCrashTestEnabled,
  };
}

export function initializeDiagnostics(): void {
  const { configured, consent } = diagnosticsStatus();
  if (!configured || !consent) return;
  if (initialized) { const client = Sentry.getClient(); if (client) client.getOptions().enabled = true; return; }
  let markNativeReady: (ready: boolean) => void = () => undefined;
  nativeReady = new Promise<boolean>((resolve) => { markNativeReady = resolve; });
  Sentry.init({
    dsn,
    enabled: true,
    // Leave release/dist unset so the native integration uses the exact app
    // version and build number that the Gradle source-map upload is labelled with.
    environment: nativeCrashTestEnabled ? 'preview' : __DEV__ ? 'development' : 'production',
    // Native crash handling starts only after stored opt-in has been checked.
    // Native events do not pass through the JavaScript beforeSend callback, so
    // avoid enriching the native scope and disclose its technical context in UI.
    enableNative: true, enableNativeCrashHandling: true,
    autoInitializeNativeSdk: true, enableNdk: true, enableNdkScopeSync: false,
    sendDefaultPii: false, sendClientReports: false,
    enableAutoSessionTracking: false, enableAutoPerformanceTracing: false,
    // Omit tracing/replay sample options altogether: this SDK installs some
    // collectors even when those options are explicitly zero.
    enableLogs: false, enableStallTracking: false, enableAppStartTracking: false,
    beforeSendTransaction: () => null,
    attachScreenshot: false, attachViewHierarchy: false,
    attachThreads: false, maxBreadcrumbs: 0, beforeBreadcrumb: () => null,
    enableNativeFramesTracking: false, enableWatchdogTerminationTracking: false,
    enableAppHangTracking: false, enableCaptureFailedRequests: false,
    onReady: ({ didCallNativeInit }) => markNativeReady(didCallNativeInit),
    beforeSend: (event, hint) => {
      if (!diagnosticsStatus().consent) return null;
      hint.attachments = [];
      return scrubDiagnosticEvent(event);
    },
  });
  initialized = true;
}

export async function setDiagnosticsConsent(enabled: boolean): Promise<void> {
  preferences.set(CONSENT_KEY, String(enabled));
  if (enabled) {
    initializeDiagnostics();
    return;
  }

  const client = Sentry.getClient();
  if (client) client.getOptions().enabled = false;
  if (initialized) await Sentry.close();
  initialized = false;
  nativeReady = null;
}

export async function sendDiagnosticTest(): Promise<boolean> {
  const status = diagnosticsStatus();
  if (!status.configured || !status.consent) throw new Error('Configure Sentry and enable crash reports first.');
  initializeDiagnostics();
  Sentry.captureException(new Error('Paceball diagnostic test'));
  return Sentry.getClient()?.flush(5000) ?? false;
}

export async function sendNativeDiagnosticTest(): Promise<void> {
  const status = diagnosticsStatus();
  if (!status.configured || !status.consent || !status.nativeCrashTestEnabled) {
    throw new Error('Native crash testing is not enabled in this build.');
  }
  initializeDiagnostics();
  const ready = await Promise.race([
    nativeReady ?? Promise.resolve(false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
  ]);
  if (!ready) throw new Error('The native Sentry SDK is not ready.');
  Sentry.nativeCrash();
}

/**
 * Sentry.wrap mounts a profiler that expects Sentry.init to have run, and warns
 * "App Start Span could not be finished" on every launch when it has not.
 * index.js initialises before the router loads the root, so by the time the
 * root is wrapped this knows whether it did. Without a DSN and consent the root
 * is returned untouched: breadcrumbs, tracing and app-start tracking are all off,
 * so the wrapper would have sent nothing extra. Opting in later starts Sentry
 * without it, and errors are still caught by the SDK's global handlers.
 */
export function wrap<P extends Record<string, unknown>>(RootComponent: ComponentType<P>): ComponentType<P> {
  return initialized ? Sentry.wrap(RootComponent) : RootComponent;
}
