import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listPlayers } from '../src/data';
import { PITCH_LENGTH_M } from '../src/physics/computeSpeed';
import { Screen } from '../src/ui/Screen';
import { colors, radius, space, stroke, type } from '../src/ui/tokens';

/**
 * Every number here is real: the pitch length the app calibrates against, the
 * typical error at 60 fps, and the number of times anything leaves the phone.
 */
const FACTS = [
  { value: String(PITCH_LENGTH_M), label: 'M PITCH\nAS RULER' },
  { value: '±4', label: 'KM/H\nAT 60 FPS' },
  { value: '0', label: 'UPLOADS\nEVER' },
];

export default function Index() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [checked, setChecked] = useState(false);
  const [bowler, setBowler] = useState<string | null>(null);

  // Re-read on focus so finishing setup, or coming back from it, is reflected
  // without a restart. An existing player is what "already onboarded" means —
  // there is no separate flag to drift out of sync with the data.
  useEffect(() => {
    if (!isFocused) return;
    let alive = true;
    listPlayers()
      .then((players) => {
        if (!alive) return;
        setBowler(players.length > 0 ? players[0].name : null);
        setChecked(true);
      })
      .catch(() => {
        if (!alive) return;
        setBowler(null);
        setChecked(true);
      });
    return () => {
      alive = false;
    };
  }, [isFocused]);

  return (
    <Screen
      style={[
        styles.screen,
        { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg },
      ]}
    >
      <View>
        <Text style={styles.title}>Paceball</Text>
        <Text style={styles.sub}>Your phone. The ultimate speed gun.</Text>
      </View>

      <View style={styles.facts}>
        {FACTS.map((fact) => (
          <View key={fact.label} style={styles.fact}>
            <Text style={styles.factValue} numberOfLines={1} adjustsFontSizeToFit>
              {fact.value}
            </Text>
            <Text style={styles.factLabel}>{fact.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        {!checked ? (
          <ActivityIndicator color={colors.muted} />
        ) : bowler === null ? (
          <>
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.push('/setup/player')}
              accessibilityRole="button"
              accessibilityLabel="Get started"
            >
              <Text style={styles.primaryButtonText}>Get started</Text>
            </Pressable>
            <Text style={styles.footnote}>Two screens. Nothing to sign up for.</Text>
          </>
        ) : (
          <>
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.push('/capture')}
              accessibilityRole="button"
              accessibilityLabel="Record a delivery"
            >
              <Text style={styles.primaryButtonText}>Record a delivery</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.push('/setup/how-it-works')}
              accessibilityRole="button"
              accessibilityLabel="How it works"
            >
              <Text style={styles.secondaryButtonText}>How it works</Text>
            </Pressable>
            <Text style={styles.footnote}>Bowling as {bowler}.</Text>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'space-between' },

  title: { ...type.h1, color: colors.text },
  sub: { ...type.body, color: colors.muted, marginTop: space.sm },

  facts: {
    flexDirection: 'row',
    borderTopWidth: stroke.hairline,
    borderBottomWidth: stroke.hairline,
    borderColor: colors.line,
    paddingVertical: space.lg,
  },
  fact: { flex: 1 },
  factValue: { ...type.h1, color: colors.text },
  factLabel: { ...type.label, color: colors.muted, marginTop: space.sm },

  actions: { alignItems: 'stretch' },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  primaryButtonText: { ...type.body, color: colors.bg, fontWeight: '800' },
  secondaryButton: {
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    paddingVertical: space.md,
    alignItems: 'center',
    marginTop: space.sm,
  },
  secondaryButtonText: { ...type.body, color: colors.text },
  footnote: {
    ...type.caption,
    color: colors.muted,
    textAlign: 'center',
    marginTop: space.md,
  },
});
