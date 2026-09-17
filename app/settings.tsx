import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CALIBRATION_ORDER, CALIBRATION_SPECS } from '../src/physics/calibration';
import {
  MANAGE_SUBSCRIPTION_URL,
  usePurchases,
  type RestoreOutcome,
} from '../src/purchases';
import {
  EXPOSURE_BIAS_OPTIONS,
  SPEED_UNITS,
  updateSettings,
  useSettings,
} from '../src/settings';
import { LICENCE_NAME, LICENCE_TEXT } from '../src/ui/licence';
import { colors, opacity, radius, space, stroke, type } from '../src/ui/tokens';
import { unitLabel, unitSpoken } from '../src/ui/units';

type RestoreState = { status: 'idle' } | { status: 'restoring' } | RestoreOutcome;

/** A signed number the way a camera readout writes it — a true minus, and a plus on none. */
function formatBias(bias: number): string {
  if (bias === 0) return '0';
  return bias < 0 ? `−${Math.abs(bias)}` : `+${bias}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** What the store actually said, in words. Never a success the store did not report. */
function restoreMessage(state: RestoreState): { text: string; tone: 'text' | 'muted' | 'danger' } | null {
  switch (state.status) {
    case 'restored':
      return {
        text:
          state.expiresAt === null
            ? 'Paceball Pro is active on this phone.'
            : `Paceball Pro is active on this phone. It ${state.willRenew ? 'renews' : 'ends'} on ${formatDate(state.expiresAt)}.`,
        tone: 'text',
      };
    case 'nothing':
      return {
        text: 'Google Play found no Paceball purchase on the account signed in to this phone.',
        tone: 'muted',
      };
    case 'unavailable':
      return {
        text: 'Purchases are not set up in this build, so there is no store to restore from.',
        tone: 'danger',
      };
    case 'failed':
      return { text: `Could not restore: ${state.message}`, tone: 'danger' };
    default:
      return null;
  }
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const { isPro, pro, restore: restorePurchases } = usePurchases();

  const [restore, setRestore] = useState<RestoreState>({ status: 'idle' });
  const [licenceOpen, setLicenceOpen] = useState(false);

  const onRestore = useCallback(async () => {
    setRestore({ status: 'restoring' });
    setRestore(await restorePurchases());
  }, [restorePurchases]);

  const version = Constants.expoConfig?.version ?? null;
  const restoring = restore.status === 'restoring';
  const restoreNote = restoreMessage(restore);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xl },
      ]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={space.md} accessibilityRole="button">
          <Text style={styles.headerAction}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>SETTINGS</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Always here, Pro or not: this is how Pro is found, and how a
          subscription is checked and managed. */}
      <Section title="PACEBALL PRO">
        {isPro ? (
          <>
            <Text style={styles.rowTitle}>Paceball Pro is active</Text>
            <Text style={styles.rowDetail}>
              {pro.active
                ? pro.expiresAt === null
                  ? 'Unlimited analyses, exports without the watermark, and compare.'
                  : `${pro.willRenew ? 'Renews' : 'Ends'} on ${formatDate(pro.expiresAt)}.`
                : 'Forced on for development. The store has no subscription on this account.'}
            </Text>
            <Pressable
              style={styles.button}
              onPress={() => Linking.openURL(MANAGE_SUBSCRIPTION_URL)}
              accessibilityRole="link"
            >
              <Text style={styles.buttonText}>Manage subscription</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={styles.link}
            onPress={() => router.push({ pathname: '/paywall', params: { context: 'pro' } })}
            accessibilityRole="button"
            accessibilityLabel="See what Paceball Pro adds"
          >
            <View style={styles.optionBody}>
              <Text style={styles.optionTitle}>Paceball Pro</Text>
              <Text style={styles.optionDetail}>
                Unlimited analyses, exports without the watermark, and compare.
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      </Section>

      <Section title="READINGS">
        <Text style={styles.rowTitle}>Speed units</Text>
        <Text style={styles.rowDetail}>
          Readings are always measured and saved in km/h. This only changes how they read out.
        </Text>
        <View style={styles.segments} accessibilityRole="radiogroup">
          {SPEED_UNITS.map((unit) => {
            const on = settings.unit === unit;
            return (
              <Pressable
                key={unit}
                style={[styles.segment, on && styles.segmentOn]}
                onPress={() => updateSettings({ unit })}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={unitSpoken(unit)}
              >
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>
                  {unitLabel(unit)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.rowTitle, styles.rowGap]}>Default scale reference</Text>
        <Text style={styles.rowDetail}>
          What Mark opens on. You can still pick another for any delivery.
        </Text>
        <View accessibilityRole="radiogroup">
          {CALIBRATION_ORDER.map((method) => {
            const spec = CALIBRATION_SPECS[method];
            const on = settings.calibrationMethod === method;
            return (
              <Pressable
                key={method}
                style={[styles.option, on && styles.optionOn]}
                onPress={() => updateSettings({ calibrationMethod: method })}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${spec.title}. ${spec.detail}`}
              >
                <View style={[styles.radio, on && styles.radioOn]} />
                <View style={styles.optionBody}>
                  <Text style={styles.optionTitle}>{spec.title}</Text>
                  <Text style={styles.optionDetail}>{spec.detail}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="CAPTURE">
        <Text style={styles.rowTitle}>Default exposure bias</Text>
        <Text style={styles.rowDetail}>
          Darker makes the camera choose a faster shutter, so the ball smears less. Go brighter
          only if the clip is too dark to mark. Cameras that cannot reach a value get the nearest
          they support.
        </Text>
        <View style={styles.segments} accessibilityRole="radiogroup">
          {EXPOSURE_BIAS_OPTIONS.map((bias) => {
            const on = settings.exposureBias === bias;
            return (
              <Pressable
                key={bias}
                style={[styles.segment, on && styles.segmentOn]}
                onPress={() => updateSettings({ exposureBias: bias })}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Exposure bias ${bias}`}
              >
                <Text style={[styles.segmentText, styles.tabular, on && styles.segmentTextOn]}>
                  {formatBias(bias)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="PURCHASES">
        <Text style={styles.rowDetail}>
          Bought Paceball Pro before, or on another phone? Restoring asks Google Play for every
          purchase on the account signed in here.
        </Text>
        <Pressable
          style={[styles.button, restoring && styles.off]}
          disabled={restoring}
          onPress={onRestore}
          accessibilityRole="button"
          accessibilityState={{ busy: restoring, disabled: restoring }}
        >
          {restoring ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.buttonText}>Restore purchases</Text>
          )}
        </Pressable>
        {restoreNote ? (
          <Text
            style={[styles.restoreNote, { color: colors[restoreNote.tone] }]}
            accessibilityLiveRegion="polite"
          >
            {restoreNote.text}
          </Text>
        ) : null}
      </Section>

      <Section title="PRIVACY">
        <Pressable
          style={styles.link}
          onPress={() => router.push('/diagnostics')}
          accessibilityRole="button"
        >
          <View style={styles.optionBody}>
            <Text style={styles.optionTitle}>Privacy and crash reports</Text>
            <Text style={styles.optionDetail}>What leaves the phone, and the switch for it.</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </Section>

      <Section title="ABOUT">
        <View style={styles.aboutRow}>
          <Text style={styles.optionTitle}>Version</Text>
          <Text style={[styles.aboutValue, styles.tabular]}>{version ?? 'Unknown'}</Text>
        </View>
        <Pressable
          style={styles.aboutRow}
          onPress={() => setLicenceOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: licenceOpen }}
        >
          <Text style={styles.optionTitle}>Licence</Text>
          <Text style={styles.aboutValue}>
            {LICENCE_NAME} {licenceOpen ? '˄' : '˅'}
          </Text>
        </Pressable>
        {licenceOpen ? (
          <Text style={styles.licence} selectable>
            {LICENCE_TEXT}
          </Text>
        ) : null}
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  headerAction: { ...type.caption, color: colors.muted },
  headerTitle: { ...type.label, color: colors.muted },
  // Balances Back, so the title sits in the middle.
  headerSpacer: { width: space.xl },

  section: {
    borderTopWidth: stroke.hairline,
    borderColor: colors.line,
    paddingVertical: space.lg,
  },
  sectionTitle: { ...type.label, color: colors.muted, marginBottom: space.md },

  rowTitle: { ...type.body, color: colors.text, fontWeight: '700' },
  rowGap: { marginTop: space.lg },
  rowDetail: { ...type.caption, color: colors.muted, marginTop: space.xs, marginBottom: space.md },
  tabular: { ...type.tabular },

  segments: { flexDirection: 'row' },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    marginRight: space.xs,
  },
  segmentOn: { backgroundColor: colors.text, borderColor: colors.text },
  segmentText: { ...type.body, color: colors.muted },
  segmentTextOn: { color: colors.bg, fontWeight: '800' },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: stroke.medium,
    borderColor: colors.line,
    marginBottom: space.sm,
  },
  optionOn: { borderColor: colors.text },
  radio: {
    width: space.md,
    height: space.md,
    borderRadius: radius.pill,
    borderWidth: stroke.medium,
    borderColor: colors.muted,
    marginRight: space.md,
  },
  radioOn: { borderColor: colors.text, backgroundColor: colors.text },
  optionBody: { flex: 1 },
  optionTitle: { ...type.body, color: colors.text },
  optionDetail: { ...type.caption, color: colors.muted, marginTop: space.xs },

  button: {
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  buttonText: { ...type.body, color: colors.text },
  off: { opacity: opacity.disabled },
  restoreNote: { ...type.body, marginTop: space.md },

  link: { flexDirection: 'row', alignItems: 'center' },
  chevron: { ...type.h2, color: colors.muted, marginLeft: space.md },

  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  aboutValue: { ...type.body, color: colors.muted },
  licence: {
    ...type.caption,
    color: colors.muted,
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
});
