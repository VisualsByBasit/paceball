import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { diagnosticsStatus, sendDiagnosticTest, setDiagnosticsConsent } from '../src/diagnostics';
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
    <Text style={styles.body}>Paceball processes recordings and measurements on your phone. Images you save to your gallery or share can remain after uninstalling. Device backups may also retain app data.</Text>
    <Text style={styles.title}>Optional crash reports</Text>
    <Text style={styles.body}>If you enable this, Paceball sends limited technical error reports to Sentry: app version, error type, time and code locations. Reports exclude player names, recordings, marked points and speeds. Sentry receives your network address when a report is sent. Your bowling measurements work without crash reports.</Text>
    <View style={styles.row}>
      <Text style={styles.body}>Send crash reports</Text>
      <Switch accessibilityLabel="Send optional crash reports to Sentry" value={status.consent}
        disabled={!status.configured} onValueChange={(value) => {
          try { setDiagnosticsConsent(value); setStatus(diagnosticsStatus()); setNotice(value ? 'Crash reports enabled.' : 'Future reports disabled. Reports already sent are not deleted.'); }
          catch { setNotice('Could not update this preference. Try again.'); }
        }} />
    </View>
    {!status.configured ? <Text style={styles.note}>Crash reporting is not available in this build. No reports are sent.</Text> : null}
    {__DEV__ && status.configured && status.consent ? <Pressable style={styles.button} disabled={busy} accessibilityRole="button" onPress={async () => {
      setBusy(true);
      try { const flushed = await sendDiagnosticTest(); setNotice(flushed ? 'SDK finished sending. Verify the event in Sentry to confirm receipt.' : 'Sending timed out. Check the connection and Sentry dashboard.'); }
      catch { setNotice('Could not send the test report.'); }
      finally { setBusy(false); }
    }}><Text style={styles.body}>{busy ? 'Sending…' : 'Send development test report'}</Text></Pressable> : null}
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
