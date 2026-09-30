import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MICROPHONE_DENIED_LINE,
  MICROPHONE_DENIED_LINK,
  microphoneSettingLine,
} from '../src/capture/microphone';
import { useSoundSetting } from '../src/capture/useSound';
import { getActivePlayer } from '../src/data';
import { CALIBRATION_SPECS, OFFERED_CALIBRATIONS, offeredCalibration } from '../src/physics/calibration';
import {
  allowanceLine,
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
import type { Player } from '../src/types';
import { AppBar } from '../src/ui/AppBar';
import { LICENCE_NAME, LICENCE_TEXT } from '../src/ui/licence';
import { first } from '../src/ui/routeParams';
import { colors, opacity, radius, size, space, stroke, type } from '../src/ui/tokens';
import { unitLabel, unitSpoken } from '../src/ui/units';
import { TabBar } from '../src/ui/TabBar';
import { formatBias } from '../src/ui/format';

type RestoreState = { status: 'idle' } | { status: 'restoring' } | RestoreOutcome;

/** The sub-screens the top-level list opens. Privacy is its own route, /diagnostics. */
type Page = 'player' | 'measurement' | 'recording' | 'pro' | 'about';

const PAGE_TITLE: Record<Page, string> = {
  player: 'Player',
  measurement: 'Measurement',
  recording: 'Recording',
  pro: 'Pro',
  about: 'About',
};

function isPage(value: string): value is Page {
  return value in PAGE_TITLE;
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

/**
 * Settings, the way Android lays them out: a short list of groups, each
 * opening its own screen. A group is this same route pushed again with a
 * `page`, so Back and the system back gesture return to the list. Privacy and
 * crash reports is its own screen already, and its row opens it directly.
 */
export default function SettingsScreen() {
  const raw = first(useLocalSearchParams().page);
  const page = isPage(raw) ? raw : null;
  return page === null ? <SettingsList /> : <SettingsPage page={page} />;
}

function SettingsList() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const settings = useSettings();
  const { isPro } = usePurchases();
  const version = Constants.expoConfig?.version ?? null;

  // Read again on focus, so the row names whoever is bowling now.
  const [player, setPlayer] = useState<Player | null | undefined>(undefined);
  useEffect(() => {
    if (!isFocused) return;
    let alive = true;
    getActivePlayer()
      .then((p) => alive && setPlayer(p))
      .catch(() => alive && setPlayer(null));
    return () => {
      alive = false;
    };
  }, [isFocused]);

  const open = (to: Page) => router.push({ pathname: '/settings', params: { page: to } });

  return (
    <View style={styles.page}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xl },
        ]}
      >
        <AppBar title="Settings" onBack={() => router.back()} />
        <View style={styles.list}>
          <ListRow
            title="Player"
            value={player === undefined ? 'Loading…' : (player?.name ?? 'No player yet')}
            onPress={() => open('player')}
          />
          <ListRow
            title="Measurement"
            value={`${unitLabel(settings.unit)} · ${CALIBRATION_SPECS[settings.calibrationMethod].title}`}
            onPress={() => open('measurement')}
          />
          <ListRow
            title="Recording"
            value={`Default exposure ${formatBias(settings.exposureBias)} · Microphone · Intro sound ${settings.introSound ? 'on' : 'off'}`}
            onPress={() => open('recording')}
          />
          {/* Always here, Pro or not: this is how Pro is found, and how a
              subscription is checked, managed and restored. */}
          <ListRow
            title="Pro"
            value={isPro ? 'Active' : 'See Pro options and restore purchases'}
            onPress={() => open('pro')}
          />
          <ListRow
            title="Privacy and crash reports"
            value="What leaves the phone, and the switch for it."
            onPress={() => router.push('/diagnostics')}
          />
          <ListRow
            title="About"
            value={`Version ${version ?? 'Unknown'} · ${LICENCE_NAME}`}
            onPress={() => open('about')}
          />
        </View>
      </ScrollView>
      {/* Home, History and Settings share one tab bar. */}
      <TabBar current="settings" />
    </View>
  );
}

/** One group on the top-level list: its name, what it is set to now, and a chevron. */
function ListRow({ title, value, onPress }: { title: string; value: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${value}`}
    >
      <View style={styles.optionBody}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDetail}>{value}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function SettingsPage({ page }: { page: Page }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.page}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xl },
        ]}
      >
        <AppBar title={PAGE_TITLE[page]} onBack={() => router.back()} />
        {page === 'player' ? <PlayerPage /> : null}
        {page === 'measurement' ? <MeasurementPage /> : null}
        {page === 'recording' ? <RecordingPage /> : null}
        {page === 'pro' ? <ProPage /> : null}
        {page === 'about' ? <AboutPage /> : null}
      </ScrollView>
    </View>
  );
}

/**
 * Who is bowling, as saved at setup. Read only: no shipped screen edits or
 * switches a profile yet, so this says what is on it and nothing more.
 */
function PlayerPage() {
  const [player, setPlayer] = useState<Player | null | 'error' | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    getActivePlayer()
      .then((p) => alive && setPlayer(p))
      .catch(() => alive && setPlayer('error'));
    return () => {
      alive = false;
    };
  }, []);

  if (player === undefined) return <Text style={styles.rowDetail}>Loading player…</Text>;
  if (player === 'error') return <Text style={styles.rowDetail}>Could not read the player on this phone.</Text>;
  if (player === null) {
    return <Text style={styles.rowDetail}>No player yet. Setup creates one before the first recording.</Text>;
  }
  return (
    <Section title="PROFILE">
      <View style={styles.aboutRow}>
        <Text style={styles.optionTitle}>Name</Text>
        <Text style={styles.aboutValue}>{player.name}</Text>
      </View>
      {player.shoeLengthCm !== undefined ? (
        <View style={styles.aboutRow}>
          <Text style={styles.optionTitle}>Shoe length</Text>
          <Text style={[styles.aboutValue, styles.tabular]}>{player.shoeLengthCm} cm</Text>
        </View>
      ) : player.shoeSizeEu !== undefined ? (
        <View style={styles.aboutRow}>
          <Text style={styles.optionTitle}>Shoe size</Text>
          <Text style={[styles.aboutValue, styles.tabular]}>EU {player.shoeSizeEu}</Text>
        </View>
      ) : null}
      {/* Height is kept on the profile but not shown while the height
          reference is hidden (OFFERED_CALIBRATIONS). */}
    </Section>
  );
}

function MeasurementPage() {
  const settings = useSettings();
  return (
    <>
      <Section title="UNITS">
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
      </Section>

      <Section title="SCALE REFERENCE">
        <Text style={styles.rowTitle}>Default scale reference</Text>
        <Text style={styles.rowDetail}>
          What Mark opens on. You can still pick another for any delivery.
        </Text>
        <View accessibilityRole="radiogroup">
          {OFFERED_CALIBRATIONS.map((method) => {
            const spec = CALIBRATION_SPECS[method];
            const on = offeredCalibration(settings.calibrationMethod) === method;
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
    </>
  );
}

function RecordingPage() {
  const settings = useSettings();
  // The same setting as Capture's Sound chip, through the same toggle, so the
  // two always agree.
  const sound = useSoundSetting();
  return (
    <>
      <Section title="EXPOSURE">
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

      <Section title="SOUND">
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.rowTitle}>Record sound</Text>
            <Text style={styles.rowDetail}>
              {microphoneSettingLine(sound.microphone.status, settings.recordSound)}
            </Text>
          </View>
          <Switch
            value={sound.on}
            onValueChange={() => void sound.toggle()}
            accessibilityLabel={sound.on ? 'Sound on' : 'Sound off'}
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor={colors.text}
          />
        </View>
        {sound.denied ? (
          <Text style={styles.rowDetail}>{MICROPHONE_DENIED_LINE}</Text>
        ) : null}
        <Pressable
          style={styles.button}
          onPress={() => void Linking.openSettings().catch(() => undefined)}
          accessibilityRole="link"
        >
          <Text style={styles.buttonText}>
            {sound.denied ? MICROPHONE_DENIED_LINK : 'Open system settings'}
          </Text>
        </Pressable>
      </Section>


      <Section title="LAUNCH">
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.rowTitle}>Intro sound</Text>
            <Text style={styles.rowDetail}>
              The logo intro when Paceball starts plays with its sound. Off plays it silent. It
              never stops music you are already playing.
            </Text>
          </View>
          <Switch
            value={settings.introSound}
            onValueChange={(on) => {
              updateSettings({ introSound: on });
            }}
            accessibilityLabel="Intro sound"
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor={colors.text}
          />
        </View>
      </Section>
    </>
  );
}

function ProPage() {
  const router = useRouter();
  const { isPro, pro, allowance, restore: restorePurchases } = usePurchases();
  const [restore, setRestore] = useState<RestoreState>({ status: 'idle' });

  const onRestore = useCallback(async () => {
    setRestore({ status: 'restoring' });
    setRestore(await restorePurchases());
  }, [restorePurchases]);

  const restoring = restore.status === 'restoring';
  const restoreNote = restoreMessage(restore);

  return (
    <>
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
              onPress={() => void Linking.openURL(MANAGE_SUBSCRIPTION_URL).catch(() => undefined)}
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
              <Text style={styles.optionTitle}>See Pro options</Text>
              <Text style={styles.optionDetail}>
                Unlimited analyses, exports without the watermark, and compare.
              </Text>
              {/* Only a free user has an allowance to report. */}
              <Text style={styles.allowance}>
                {allowanceLine(allowance, (t) =>
                  new Date(t).toLocaleDateString(undefined, { weekday: 'long' })
                )}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
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
    </>
  );
}

function AboutPage() {
  const [licenceOpen, setLicenceOpen] = useState(false);
  const version = Constants.expoConfig?.version ?? null;
  return (
    <Section title="PACEBALL">
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
  page: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg },

  list: { marginTop: space.md, borderTopWidth: stroke.hairline, borderColor: colors.line },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.listRow,
    paddingVertical: space.md,
    borderBottomWidth: stroke.hairline,
    borderColor: colors.line,
  },
  listRowPressed: { backgroundColor: colors.surface },

  section: {
    borderTopWidth: stroke.hairline,
    borderColor: colors.line,
    paddingVertical: space.lg,
  },
  sectionTitle: { ...type.label, color: colors.muted, marginBottom: space.md },

  rowTitle: { ...type.body, color: colors.text, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  switchText: { flex: 1, flexShrink: 1 },
  rowDetail: { ...type.caption, color: colors.muted, marginTop: space.xs, marginBottom: space.md },
  tabular: { ...type.tabular },

  segments: { flexDirection: 'row' },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: size.target,
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.control,
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

  // The app's secondary button: the same height, radius and edge as ActionButton's.
  button: {
    minHeight: size.button,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: stroke.medium,
    borderColor: colors.control,
    paddingHorizontal: space.lg,
    alignItems: 'center',
  },
  buttonText: { ...type.button, color: colors.text, textAlign: 'center' },
  off: { opacity: opacity.disabled },
  restoreNote: { ...type.body, marginTop: space.md },

  link: { flexDirection: 'row', alignItems: 'center', minHeight: size.listRow },
  chevron: { ...type.h2, color: colors.muted, marginLeft: space.md },

  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: size.listRow,
  },
  allowance: { ...type.caption, color: colors.text, marginTop: space.xs },
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
