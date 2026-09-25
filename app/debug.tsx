import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Directory, File } from 'expo-file-system';
import { isAvailableAsync as canShare, shareAsync } from 'expo-sharing';
import { listSessions } from '../src/data';
import { SessionActions } from '../src/export/SessionActions';
import {
  createSessionVideoExport,
  type VideoExportResult,
  type VideoExportTask,
} from '../src/export/renderSessionVideo';
import { usePurchases } from '../src/purchases';
import { colors, radius, space, stroke, type } from '../src/ui/tokens';
import type { Session } from '../src/types';

/**
 * Development tool: every saved session's raw fields and file paths, the
 * Media3 export spike and the Pro override. Not a screen anyone ships; release
 * builds redirect away from the route. It follows the tokens only so it stays
 * readable on a dark phone.
 */

/** The fields worth eyeballing while the calibration work settles. */
function summarise(session: Session) {
  return {
    id: session.id,
    speedKmh: session.speedKmh,
    videoPath: session.videoPath,
    framesDir: session.framesDir,
    calibrationMethod: session.calibrationMethod,
    calRealMetres: session.calRealMetres,
    travelMetres: session.travelMetres,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

type PathCheck = {
  label: string;
  uri: string;
  exists: boolean;
  detail: string;
};

/**
 * expo-file-system throws on a path it cannot even parse, and a stored session
 * can point at anything, so every probe is caught and reported rather than
 * taking the screen down.
 */
function checkFile(label: string, uri: string): PathCheck {
  try {
    const file = new File(uri);
    if (!file.exists) return { label, uri, exists: false, detail: 'missing' };
    return { label, uri, exists: true, detail: formatBytes(file.size) };
  } catch (e) {
    return { label, uri, exists: false, detail: `error: ${message(e)}` };
  }
}

function checkDirectory(label: string, uri: string): PathCheck {
  try {
    const directory = new Directory(uri);
    if (!directory.exists) return { label, uri, exists: false, detail: 'missing' };
    const entries = directory.list().length;
    const size = directory.size;
    const bytes = size === null ? 'size unreadable' : formatBytes(size);
    return { label, uri, exists: true, detail: `${bytes} · ${entries} entries` };
  } catch (e) {
    return { label, uri, exists: false, detail: `error: ${message(e)}` };
  }
}

/**
 * A route in every build, because expo-router routes are files. Outside
 * development it only redirects home, so a paceball://debug link from another
 * app cannot open saved recordings' paths or delete controls in a release.
 */
export default function DebugRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <DebugScreen />;
}

function DebugScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, PathCheck[]>>({});

  const load = useCallback(() => {
    setSessions(null);
    setError(null);
    setChecks({});
    listSessions()
      .then(setSessions)
      .catch((e: unknown) => {
        setSessions([]);
        setError(message(e));
      });
  }, []);

  useEffect(load, [load]);

  const check = useCallback((session: Session) => {
    setChecks((current) => ({
      ...current,
      [session.id]: [
        checkFile('videoPath', session.videoPath),
        checkDirectory('framesDir', session.framesDir),
      ],
    }));
  }, []);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg },
      ]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={space.md}>
          <Text style={styles.headerAction}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>DEBUG · SESSIONS</Text>
        <Pressable onPress={load} hitSlop={space.md}>
          <Text style={styles.headerAction}>Reload</Text>
        </Pressable>
      </View>

      {/* Development only. __DEV__ is a compile-time constant, so this whole
          block is stripped from a production bundle and the override cannot be
          reached there; the provider also refuses to honour or set it. */}
      {__DEV__ ? <ProOverride /> : null}

      {error ? <Text style={styles.error}>listSessions() threw: {error}</Text> : null}

      {sessions === null ? (
        <ActivityIndicator color={colors.muted} style={styles.loading} />
      ) : sessions.length === 0 ? (
        <Text style={styles.empty}>No saved sessions.</Text>
      ) : (
        <>
          <Text style={styles.count}>{sessions.length} saved</Text>
          {sessions.map((session) => {
            const rows = checks[session.id];
            return (
              <View key={session.id} style={styles.card}>
                <SessionActions sessionId={session.id} onDeleted={load} />
                <Text style={styles.json} selectable>
                  {JSON.stringify(summarise(session), null, 2)}
                </Text>

                <Pressable
                  style={styles.checkButton}
                  onPress={() => check(session)}
                  accessibilityRole="button"
                  accessibilityLabel={`Check files for session ${session.id}`}
                >
                  <Text style={styles.checkButtonText}>
                    {rows ? 'Check files again' : 'Check files'}
                  </Text>
                </Pressable>

                {rows?.map((row) => (
                  <View key={row.label} style={styles.checkRow}>
                    <Text style={styles.checkLabel}>{row.label}</Text>
                    <Text style={[styles.checkValue, !row.exists && styles.checkValueBad]}>
                      {row.exists ? '✓' : '✗'} {row.detail}
                    </Text>
                  </View>
                ))}

                {__DEV__ ? <VideoExportSpike session={session} /> : null}
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

/**
 * Device checkpoint for the Media3 spike. It intentionally lives on
 * the existing debug route and is stripped from production UI. The generated
 * MP4 stays in cache unless the tester opens the system share sheet.
 */
function VideoExportSpike({ session }: { session: Session }) {
  const { isPro } = usePurchases();
  const taskRef = useRef<VideoExportTask | null>(null);
  // Off until switched on, and back off after every export: a shared file is
  // silent unless sound was chosen for that one.
  const [includeAudio, setIncludeAudio] = useState(false);
  const [exportedWithAudio, setExportedWithAudio] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<VideoExportResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => () => {
    void taskRef.current?.cancel();
  }, []);

  const start = useCallback(async () => {
    setResult(null);
    setExportError(null);
    setProgress(0);
    setRunning(true);
    let subscription: { remove: () => void } | null = null;
    const withAudio = includeAudio;
    setIncludeAudio(false);
    try {
      const task = createSessionVideoExport(session, { isPro, includeAudio: withAudio });
      taskRef.current = task;
      subscription = task.onProgress(setProgress);
      const done = await task.result;
      setExportedWithAudio(withAudio);
      setResult(done);
      setProgress(100);
    } catch (error) {
      setExportError(message(error));
      setProgress(null);
    } finally {
      subscription?.remove();
      taskRef.current = null;
      setRunning(false);
    }
  }, [includeAudio, isPro, session]);

  const cancel = useCallback(async () => {
    await taskRef.current?.cancel();
  }, []);

  const share = useCallback(async () => {
    if (!result) return;
    try {
      if (!await canShare()) {
        setExportError('Sharing is not available on this device.');
        return;
      }
      await shareAsync(result.outputPath, { mimeType: 'video/mp4', dialogTitle: 'Share delivery video' });
    } catch (error) {
      setExportError(message(error));
    }
  }, [result]);

  return (
    <View style={styles.videoSpike}>
      <Text style={styles.overrideLabel}>MEDIA3 VIDEO SPIKE · DEVICE ONLY</Text>
      <Text style={styles.videoHelp}>
        {isPro ? 'Pro: clean overlay' : 'Free: Paceball watermark'} ·{' '}
        {includeAudio ? 'sound included' : 'silent export'}
      </Text>
      <View style={styles.overrideRow}>
        <Pressable
          style={[styles.overrideChoice, includeAudio && styles.overrideChoiceOn]}
          onPress={() => setIncludeAudio((value) => !value)}
          disabled={running}
          accessibilityRole="switch"
          accessibilityState={{ checked: includeAudio, disabled: running }}
          accessibilityLabel="Include sound in this export"
        >
          <Text style={[styles.overrideChoiceText, includeAudio && styles.overrideChoiceTextOn]}>
            Sound {includeAudio ? 'on' : 'off'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.overrideChoice, styles.videoPrimary]}
          onPress={running ? cancel : start}
          accessibilityRole="button"
        >
          <Text style={styles.videoPrimaryText}>
            {running ? 'Cancel export' : 'Export marked clip'}
          </Text>
        </Pressable>
      </View>
      {progress !== null ? <Text style={styles.videoHelp}>Progress: {progress}%</Text> : null}
      {exportError ? <Text style={styles.error}>Export: {exportError}</Text> : null}
      {result ? (
        <>
          <Text style={styles.videoResult} selectable>
            {formatBytes(result.inputBytes)} → {formatBytes(result.outputBytes)} ·{' '}
            {(result.elapsedMs / 1_000).toFixed(1)}s encode · {result.clipDurationMs}ms clip{`\n`}
            canvas {result.canvasWidth}×{result.canvasHeight} · source rotation{' '}
            {result.sourceRotationDegrees}° · {result.coordinateMode} ·{' '}
            {exportedWithAudio ? 'with sound' : 'silent'}
          </Text>
          <Pressable style={styles.checkButton} onPress={share} accessibilityRole="button">
            <Text style={styles.checkButtonText}>Open exported MP4 in share sheet</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

/**
 * Development only. Forces the Pro entitlement on or off so the
 * gates and the paywall can be exercised without a store account. It is only
 * rendered under __DEV__, and the provider ignores the override outside __DEV__
 * as well, so a production build has no path to it.
 */
function ProOverride() {
  const { isPro, devOverride, setDevOverride, configured, mocked } = usePurchases();
  const choices: { label: string; value: boolean | null }[] = [
    { label: 'Store', value: null },
    { label: 'Pro on', value: true },
    { label: 'Pro off', value: false },
  ];
  return (
    <View style={styles.overrideCard}>
      <Text style={styles.overrideLabel}>PRO OVERRIDE · DEV ONLY</Text>
      <View style={styles.overrideRow}>
        {choices.map((choice) => {
          const on = devOverride === choice.value;
          return (
            <Pressable
              key={choice.label}
              style={[styles.overrideChoice, on && styles.overrideChoiceOn]}
              onPress={() => setDevOverride(choice.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Entitlement: ${choice.label}`}
            >
              <Text style={[styles.overrideChoiceText, on && styles.overrideChoiceTextOn]}>
                {choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.overrideState}>
        isPro {String(isPro)} · key {configured ? 'set' : 'missing'} · offering{' '}
        {mocked ? 'mock' : 'store'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  overrideCard: {
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    padding: space.md,
    marginBottom: space.md,
  },
  overrideLabel: { ...type.label, color: colors.muted, marginBottom: space.sm },
  overrideRow: { flexDirection: 'row' },
  overrideChoice: {
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    marginRight: space.sm,
  },
  overrideChoiceOn: { backgroundColor: colors.text, borderColor: colors.text },
  overrideChoiceText: { ...type.caption, color: colors.muted },
  overrideChoiceTextOn: { color: colors.bg, fontWeight: '800' },
  overrideState: { ...type.caption, ...type.mono, color: colors.muted, marginTop: space.sm },
  content: { paddingHorizontal: space.lg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  headerAction: { ...type.caption, color: colors.muted },
  headerTitle: { ...type.label, color: colors.muted },

  loading: { marginTop: space.xl },
  empty: { ...type.body, color: colors.muted, marginTop: space.xl },
  error: { ...type.caption, color: colors.danger, marginBottom: space.md },
  count: { ...type.label, color: colors.muted, marginBottom: space.sm },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    padding: space.md,
    marginBottom: space.sm,
  },
  json: { ...type.caption, ...type.mono, color: colors.text },

  checkButton: {
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    paddingVertical: space.sm,
    alignItems: 'center',
    marginTop: space.md,
  },
  checkButtonText: { ...type.caption, color: colors.text },

  checkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  checkLabel: { ...type.caption, ...type.mono, color: colors.muted },
  checkValue: {
    ...type.caption,
    ...type.mono,
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  checkValueBad: { color: colors.danger },
  videoSpike: {
    borderTopWidth: stroke.hairline,
    borderTopColor: colors.line,
    marginTop: space.md,
    paddingTop: space.md,
  },
  videoHelp: { ...type.caption, color: colors.muted, marginBottom: space.sm },
  videoPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  videoPrimaryText: { ...type.caption, color: colors.bg, fontWeight: '800' },
  videoResult: { ...type.caption, ...type.mono, color: colors.text, marginTop: space.sm },
});
