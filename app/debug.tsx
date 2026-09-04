import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Directory, File } from 'expo-file-system';
import { listSessions } from '../src/data';
import { colors, radius, space, stroke, type } from '../src/ui/tokens';
import type { Session } from '../src/types';

/**
 * THROWAWAY. Delete this file once screen 08 History exists — it is a window
 * onto stored sessions while there is no real one, not a screen anyone ships.
 * It follows the tokens only so it stays readable on a dark phone.
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
    return { label, uri, exists: false, detail: `error — ${message(e)}` };
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
    return { label, uri, exists: false, detail: `error — ${message(e)}` };
  }
}

export default function DebugScreen() {
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
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
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
});
