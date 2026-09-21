import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { diagnosticsStatus, sendDiagnosticTest, sendNativeDiagnosticTest, setDiagnosticsConsent } from '../src/diagnostics';
import { purchasesConfigured } from '../src/purchases';
import { colors, radius, space, type } from '../src/ui/tokens';

export default function DiagnosticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState(diagnosticsStatus);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  return <ScrollView style={styles.screen} contentContainerStyle={{ padding: space.md, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg }}>
    <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.button}><Text style={styles.body}>Back</Text></Pressable>
    <Text style={styles.title}>Privacy and crash reports</Text>
    <Text style={styles.body}>Your videos and measurements stay on this phone. Paceball never uploads your videos or measurements, and there is no account. Android's own backup can copy app data to your backup, and images you save to your gallery or share can remain after uninstalling.</Text>
    <Text style={styles.title}>Purchases</Text>
    {purchasesConfigured()
      ? <Text style={styles.body}>Paceball Pro is sold through Google Play and RevenueCat. When the app opens, it asks RevenueCat whether this phone has Pro and what the plans cost. When you subscribe or restore, your purchase goes through Google Play and RevenueCat. They receive the purchase, an anonymous ID and device details such as the Android and app version. They never receive your videos, names or speeds.</Text>
      : <Text style={styles.body}>Purchases are not set up in this build, so nothing is sent to Google Play or RevenueCat.</Text>}
    <Text style={styles.title}>Optional crash reports</Text>
    <Text style={styles.body}>Off unless you turn them on below. Crash reports go to Sentry only if you opt in.</Text>
    <Text style={styles.body}>If you enable this, Paceball sends limited JavaScript and native crash reports to Sentry. Reports can include the app version, event time, error or crash type, code locations, native stack traces, device model, Android version and technical crash state. JavaScript reports keep only reviewed static error messages; other messages are redacted. Paceball does not add player names, recordings, marked points or speeds, and reports have no breadcrumbs, screenshots or view hierarchy. Sentry receives your network address when a report is sent. Your bowling measurements work without crash reports.</Text>
    <View style={styles.row}>
      <Text style={styles.body}>Send crash reports</Text>
      <Switch accessibilityLabel="Send optional crash reports to Sentry" value={status.consent}
        disabled={!status.configured || busy} onValueChange={async (value) => {
          setBusy(true);
          try { await setDiagnosticsConsent(value); setStatus(diagnosticsStatus()); setNotice(value ? 'Crash reports enabled.' : 'Future reports disabled. Reports already sent are not deleted.'); }
          catch { setNotice('Could not update this preference. Try again.'); }
          finally { setBusy(false); }
        }} />
    </View>
    {!status.configured ? <Text style={styles.note}>Crash reporting is not available in this build. No reports are sent.</Text> : null}
    {__DEV__ && status.configured && status.consent ? <Pressable style={styles.button} disabled={busy} accessibilityRole="button" onPress={async () => {
      setBusy(true);
      try { const flushed = await sendDiagnosticTest(); setNotice(flushed ? 'SDK finished sending. Verify the event in Sentry to confirm receipt.' : 'Sending timed out. Check the connection and Sentry dashboard.'); }
      catch { setNotice('Could not send the test report.'); }
      finally { setBusy(false); }
    }}><Text style={styles.body}>{busy ? 'Sending…' : 'Send development test report'}</Text></Pressable> : null}
    {status.nativeCrashTestEnabled && status.configured && status.consent ? <Pressable style={styles.button} disabled={busy} accessibilityRole="button" onPress={() => {
      Alert.alert('Test native crash?', 'This test build will close immediately. Reopen Paceball, then check Sentry for the native crash event.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Crash test build', style: 'destructive', onPress: () => {
          setBusy(true);
          void sendNativeDiagnosticTest().catch(() => {
            setBusy(false);
            setNotice('The native crash test could not start.');
          });
        } },
      ]);
    }}><Text style={styles.body}>Test native crash</Text></Pressable> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.note}>{notice}</Text> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { ...type.h2, color: colors.text, marginVertical: space.md },
  body: { ...type.body, color: colors.text }, note: { ...type.caption, color: colors.muted, marginVertical: space.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: space.md },
  button: { padding: space.md, backgroundColor: colors.surface, borderRadius: radius.md },
});
