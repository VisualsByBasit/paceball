import { useCallback } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PITCH_LENGTH_M } from '../../src/physics/computeSpeed';
import { colors, radius, space, stroke, type } from '../../src/ui/tokens';

const STEPS = [
  {
    title: 'Record side-on',
    body: 'Stand level with where the ball will pitch, with both sets of stumps in frame for the whole delivery. Three seconds minimum.',
  },
  {
    title: 'Mark the pitch',
    body: `Tap both wickets. The ${PITCH_LENGTH_M} m between them is the ruler that turns pixels into metres.`,
  },
  {
    title: 'Mark the ball',
    body: 'Tap it at release, then where it pitches. That gives the distance it covered and the time it took.',
  },
];

const HONESTY = [
  'You get the average speed to the bounce — not release speed, which is 5–8% quicker off the hand.',
  'Every reading carries an error range. Typically ±4 km/h at 60 fps.',
  'No spin rate, no revolutions. They cannot be measured from 60 fps video, so they are not shown.',
  'Everything stays on this phone. No account, no upload.',
];

/**
 * Setup 02 — what the app measures, and what it deliberately does not.
 *
 * Reached two ways. With a `name` param it is the middle step of onboarding and
 * hands the name on to the camera screen, which creates the profile; without
 * one it is a read-only explainer opened from the home screen.
 */
export default function HowItWorksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ name?: string }>();

  const name = (Array.isArray(params.name) ? params.name[0] : params.name)?.trim() ?? '';
  const isOnboarding = name.length > 0;

  const onContinue = useCallback(() => {
    if (!isOnboarding) {
      router.back();
      return;
    }
    router.push({ pathname: '/setup/camera', params: { name } });
  }, [isOnboarding, name, router]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.md, paddingBottom: space.lg },
        ]}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={space.md}>
            <Text style={styles.headerAction}>Back</Text>
          </Pressable>
          {isOnboarding ? <Text style={styles.headerStep}>2 OF 3</Text> : null}
        </View>

        <Text style={styles.title}>How it works</Text>

        <View style={styles.steps}>
          {STEPS.map((step, i) => (
            <View key={step.title} style={styles.step}>
              <Text style={styles.stepNumber}>{i + 1}</Text>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepBody}>{step.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>WHAT YOU GET, AND WHAT YOU DON'T</Text>
          {HONESTY.map((line) => (
            <View key={line} style={styles.cardRow}>
              <Text style={styles.cardBullet}>—</Text>
              <Text style={styles.cardText}>{line}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}
      >
        <Pressable
          style={styles.primaryButton}
          onPress={onContinue}
          accessibilityRole="button"
          accessibilityLabel={isOnboarding ? 'Continue to where to stand' : 'Done'}
        >
          <Text style={styles.primaryButtonText}>
            {isOnboarding ? 'Where to stand' : 'Got it'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const STEP_NUMBER_WIDTH = 28;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xl,
  },
  headerAction: { ...type.caption, color: colors.muted },
  headerStep: { ...type.label, color: colors.muted },

  title: { ...type.h1, color: colors.text },

  steps: { marginTop: space.lg },
  step: { flexDirection: 'row', marginBottom: space.lg },
  stepNumber: {
    ...type.h2,
    color: colors.muted,
    width: STEP_NUMBER_WIDTH,
  },
  stepText: { flex: 1 },
  stepTitle: { ...type.h2, color: colors.text },
  stepBody: { ...type.caption, color: colors.muted, marginTop: space.xs },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    padding: space.md,
    marginTop: space.sm,
  },
  cardLabel: { ...type.label, color: colors.muted, marginBottom: space.sm },
  cardRow: { flexDirection: 'row', marginTop: space.sm },
  cardBullet: { ...type.caption, color: colors.muted, marginRight: space.sm },
  cardText: { ...type.caption, color: colors.text, flex: 1 },

  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: stroke.hairline,
    borderColor: colors.line,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { ...type.body, color: colors.bg, fontWeight: '800' },
});
