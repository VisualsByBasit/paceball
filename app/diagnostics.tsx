import { useState, type ReactNode } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { diagnosticsStatus, sendDiagnosticTest, sendNativeDiagnosticTest, setDiagnosticsConsent } from '../src/diagnostics';
import { purchasesConfigured } from '../src/purchases';
import { PRIVACY_UPDATED, PRIVACY_URL } from '../src/purchases/links';
import { ActionButton } from '../src/ui/ActionButton';
import { AppBar } from '../src/ui/AppBar';
import { Notice, type NoticeTone } from '../src/ui/Notice';
import { colors, size, space, stroke, type } from '../src/ui/tokens';

/** A headed part of the policy, ruled off from the one before. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
}

export default function DiagnosticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState(diagnosticsStatus);
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xl }]}
    >
      <AppBar title="Privacy and crash reports" onBack={() => router.back()} />
      <Text style={styles.note}>Last updated {PRIVACY_UPDATED}</Text>

      <View style={styles.lead}>
        <Text style={styles.body}>Your videos and measurements stay on this phone. Paceball never uploads your videos or measurements, and there is no account. Android's own backup can copy app data to your backup, and images you save to your gallery or share can remain after uninstalling. Saving an image to your gallery may ask for permission to add it; Paceball cannot read your gallery.</Text>
        <ActionButton
          variant="secondary"
          label="Read the full privacy policy"
          onPress={() => void Linking.openURL(PRIVACY_URL).catch(() => undefined)}
          style={styles.link}
        />
      </View>

      <Section title="Sound">
        <Text style={styles.body}>Recordings include sound if you allow the microphone. Recordings stay on this phone, with or without sound. Shared videos are silent unless you choose to include sound. Speeds are measured from the picture alone, so sound never changes a reading.</Text>
      </Section>

      <Section title="Purchases">
        {purchasesConfigured()
          ? <Text style={styles.body}>Paceball Pro is sold through Google Play and RevenueCat. When the app opens, it asks RevenueCat whether this phone has Pro, and Google Play for the plans and their prices. When you subscribe or restore, your purchase goes through Google Play and RevenueCat. They receive the purchase, an anonymous ID and device details such as the Android and app version. They never receive your videos, names or speeds.</Text>
          : <Text style={styles.body}>Purchases are not set up in this build, so nothing is sent to Google Play or RevenueCat.</Text>}
      </Section>

      <Section title="Optional crash reports">
        <Text style={styles.body}>Off unless you turn them on below. Crash reports go to Sentry only if you opt in.</Text>
        <Text style={[styles.body, styles.paragraph]}>If you enable this, Paceball sends limited JavaScript and native crash reports to Sentry. Reports can include the app version, event time, error or crash type, code locations, native stack traces, device model, Android version and technical crash state. JavaScript reports keep only reviewed static error messages; other messages are redacted. Paceball does not add player names, recordings, marked points or speeds, and reports have no breadcrumbs, screenshots or view hierarchy. Sentry receives your network address when a report is sent. Your bowling measurements work without crash reports.</Text>
        <View style={styles.row}>
          <Text style={[styles.body, styles.rowLabel]}>Send crash reports</Text>
          <Switch accessibilityLabel="Send optional crash reports to Sentry" value={status.consent}
            disabled={!status.configured || busy} onValueChange={async (value) => {
              setBusy(true);
              try { await setDiagnosticsConsent(value); setStatus(diagnosticsStatus()); setNotice(value ? { tone: 'success', text: 'Crash reports enabled.' } : { tone: 'info', text: 'Future reports disabled. Reports already sent are not deleted.' }); }
              catch { setNotice({ tone: 'error', text: 'Could not update this preference. Try again.' }); }
              finally { setBusy(false); }
            }} />
        </View>
        {!status.configured ? <Notice tone="info">Crash reporting is not available in this build. No reports are sent.</Notice> : null}
        {(__DEV__ || status.nativeCrashTestEnabled) && status.configured && status.consent ? (
          <ActionButton
            variant="secondary"
            label="Send test error report"
            busy={busy ? 'Sending…' : null}
            style={styles.test}
            onPress={async () => {
              setBusy(true);
              try { const flushed = await sendDiagnosticTest(); setNotice(flushed ? { tone: 'success', text: 'SDK finished sending. Verify the event in Sentry to confirm receipt.' } : { tone: 'caution', text: 'Sending timed out. Check the connection and Sentry dashboard.' }); }
              catch { setNotice({ tone: 'error', text: 'Could not send the test report.' }); }
              finally { setBusy(false); }
            }}
          />
        ) : null}
        {status.nativeCrashTestEnabled && status.configured && status.consent ? (
          <ActionButton
            variant="destructive"
            label="Test native crash"
            disabledReason={busy ? 'Another action is still running.' : null}
            style={styles.test}
            onPress={() => {
              Alert.alert('Test native crash?', 'This test build will close immediately. Reopen Paceball, then check Sentry for the native crash event.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Crash test build', style: 'destructive', onPress: () => {
                  setBusy(true);
                  void sendNativeDiagnosticTest().catch(() => {
                    setBusy(false);
                    setNotice({ tone: 'error', text: 'The native crash test could not start.' });
                  });
                } },
              ]);
            }}
          />
        ) : null}
        {notice ? <View style={styles.notice}><Notice tone={notice.tone} live>{notice.text}</Notice></View> : null}
      </Section>

      <Section title="Deleting your data">
        <Text style={styles.body}>To delete your purchase ID or any crash reports, email paceballpro@gmail.com and include the approximate date you used Paceball. We will delete it within 30 days. Everything else Paceball stores is on your phone and is removed when you delete a delivery or uninstall the app.</Text>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg },
  note: { ...type.caption, color: colors.muted, textAlign: 'center', marginBottom: space.lg },
  lead: { paddingBottom: space.lg },
  body: { ...type.body, color: colors.text },
  paragraph: { marginTop: space.md },
  link: { marginTop: space.lg },
  section: { borderTopWidth: stroke.hairline, borderColor: colors.line, paddingVertical: space.lg },
  heading: { ...type.h2, color: colors.text, marginBottom: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: size.listRow,
    marginVertical: space.md,
  },
  rowLabel: { flex: 1, fontWeight: '700', marginRight: space.md },
  test: { marginBottom: space.md },
  notice: { marginTop: space.sm },
});
