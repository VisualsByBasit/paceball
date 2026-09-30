import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButton } from '../../src/ui/ActionButton';
import { AppBar } from '../../src/ui/AppBar';
import { WhereToStand } from '../../src/ui/WhereToStand';
import { colors, radius, size, space, stroke, type } from '../../src/ui/tokens';

const RECORDING =
  'Film side-on, three seconds or more, with the ruler, the release and the bounce in shot. Sound is recorded too if you allow the microphone.';

/** The four marks every reading is made from, in the order they are placed. */
const MARKS = [
  {
    title: 'One end of a known distance',
    body: 'Both sets of stumps, two markers you measured, the ball or your height. You choose the ruler before marking.',
  },
  {
    title: 'The other end',
    body: 'The distance between the two marks is what turns pixels into metres.',
  },
  {
    title: 'The ball at release',
    body: 'The first frame where it has left the hand.',
  },
  {
    title: 'The ball at bounce',
    body: 'The first frame where it touches the ground.',
  },
];

/** The two things a reading is, and is not, said plainly before the detail. */
const PLAINLY = [
  'Average speed from release to bounce, not release speed.',
  'No visible bounce means no speed.',
];

const HONESTY = [
  'You get the average speed to the bounce, not release speed, which is 5–8% quicker off the hand.',
  'Every reading shows its own error range, combining the frame timing, the reference length and how precisely each point was marked. Filming the reference small in frame can add error the range does not cover.',
  'No spin rate, no revolutions. They cannot be measured from 60 fps video, so they are not shown.',
  'Paceball never uploads your videos or measurements, and there is no account. What can leave the phone: crash reports if you turn them on, which carry no videos, names or speeds; a check with RevenueCat when the app opens, for whether you have Pro; your purchase, through Google Play and RevenueCat, if you subscribe or restore; and any card you choose to share.',
];

/**
 * Setup, step 2 of 3: what the app measures, and what it deliberately does not.
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
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <AppBar
          title={isOnboarding ? 'Setup' : 'How it works'}
          onBack={() => router.back()}
          right={isOnboarding ? <Text style={styles.headerStep}>Step 2 of 3</Text> : null}
        />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: space.lg }]}>
        <Text style={styles.title} accessibilityRole="header">
          Four marks. An honest estimate.
        </Text>
        <Text style={styles.sub}>{RECORDING}</Text>

        <View style={styles.steps}>
          {MARKS.map((mark, i) => (
            <View key={mark.title} style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{i + 1}</Text>
              </View>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>{mark.title}</Text>
                <Text style={styles.stepBody}>{mark.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {PLAINLY.map((line) => (
          <Text key={line} style={styles.plain}>
            {line}
          </Text>
        ))}

        {/* Opened from Home, the placement guide is here too, to reopen any
            time. In setup it is the very next step, so it is not shown twice. */}
        {isOnboarding ? null : (
          <View style={styles.where}>
            <Text style={styles.whereTitle} accessibilityRole="header">
              Where to stand
            </Text>
            <WhereToStand />
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>WHAT YOU GET, AND WHAT YOU DON'T</Text>
          {HONESTY.map((line) => (
            <View key={line} style={styles.cardRow}>
              <Text style={styles.cardBullet}>-</Text>
              <Text style={styles.cardText}>{line}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <ActionButton
          label={isOnboarding ? 'Where to stand' : 'Got it'}
          onPress={onContinue}
          accessibilityLabel={isOnboarding ? 'Continue to where to stand' : 'Done'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { paddingHorizontal: space.md },
  content: { paddingHorizontal: space.lg, paddingTop: space.md },
  headerStep: { ...type.caption, ...type.tabular, color: colors.muted },

  title: { ...type.h1, color: colors.text },
  sub: { ...type.body, color: colors.muted, marginTop: space.sm },

  steps: { marginTop: space.lg, gap: space.md },
  step: { flexDirection: 'row', alignItems: 'flex-start' },
  stepNumber: {
    width: size.target / 2 + space.sm,
    height: size.target / 2 + space.sm,
    borderRadius: radius.pill,
    borderWidth: stroke.medium,
    borderColor: colors.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  stepNumberText: { ...type.button, ...type.tabular, color: colors.text },
  stepText: { flex: 1 },
  stepTitle: { ...type.body, color: colors.text, fontWeight: '700' },
  stepBody: { ...type.body, color: colors.muted },

  plain: { ...type.body, color: colors.text, fontWeight: '700', marginTop: space.md },

  where: { marginTop: space.xl },
  whereTitle: { ...type.h2, color: colors.text },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    padding: space.md,
    marginTop: space.lg,
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
});
