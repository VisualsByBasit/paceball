import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createPlayer } from '../../src/data';
import { PITCH_LENGTH_M } from '../../src/physics/computeSpeed';
import { shouldShowOnboardingPaywall, usePurchases } from '../../src/purchases';
import { getSettings, updateSettings } from '../../src/settings';
import { errorMessage } from '../../src/ui/format';
import { ActionButton } from '../../src/ui/ActionButton';
import { AppBar } from '../../src/ui/AppBar';
import { Notice } from '../../src/ui/Notice';
import { WhereToStand } from '../../src/ui/WhereToStand';
import { colors, space, stroke, type } from '../../src/ui/tokens';

/**
 * Setup, step 3 of 3: where to stand, and how to frame the shot.
 *
 * Last in setup, because it only makes sense once the pitch has been named as
 * the ruler on the previous screen, and because it is the thing you act on as
 * you walk out to film. Like how-it-works it is reached two ways: with a `name`
 * param it closes onboarding and creates the profile; without one it is a
 * read-only reminder.
 */
export default function SetupCameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ name?: string }>();

  const name = (Array.isArray(params.name) ? params.name[0] : params.name)?.trim() ?? '';
  const isOnboarding = name.length > 0;
  const { isPro, configured, loading } = usePurchases();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = useCallback(async () => {
    if (!isOnboarding) {
      router.back();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createPlayer(name);
      // Unwind setup before opening the camera, so Back from the camera does
      // not walk into onboarding again and offer to create a second profile.
      router.dismissAll();
      // The store is never waited on. If it has not answered yet this offers
      // nothing and marks nothing, and Capture weighs the same conditions
      // again on its first mount, so a slow store defers the offer by one
      // screen rather than losing it for the life of the install.
      const offerPro = shouldShowOnboardingPaywall({
        shown: getSettings().onboardingPaywallShown,
        isPro,
        configured,
        loading,
      });
      if (offerPro) {
        // Recorded before it opens, so buying, skipping or closing the app on it
        // all count as the one time it is offered.
        updateSettings({ onboardingPaywallShown: true });
        // The paywall moves on to the camera itself when it is dismissed.
        router.push({ pathname: '/paywall', params: { context: 'onboarding' } });
      } else {
        router.push('/capture');
      }
    } catch (e) {
      setSaving(false);
      setError(errorMessage(e));
    }
  }, [configured, isOnboarding, isPro, loading, name, router]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <AppBar
          title={isOnboarding ? 'Setup' : 'Where to stand'}
          onBack={() => router.back()}
          right={isOnboarding ? <Text style={styles.headerStep}>Step 3 of 3</Text> : null}
        />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: space.md, paddingBottom: space.lg }]}
      >
        <Text style={styles.title} accessibilityRole="header">
          Film side-on. Keep it steady.
        </Text>
        <Text style={styles.sub}>
          Paceball measures how far the ball travels and how long it takes. The pitch
          is the ruler: the {PITCH_LENGTH_M} m between the wickets is what turns
          pixels into metres. Filming from an angle distorts that ruler, so the number
          comes out wrong.
        </Text>

        <WhereToStand />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        {error ? (
          <View style={styles.error}>
            <Notice tone="error" live>
              {error}
            </Notice>
          </View>
        ) : null}
        <ActionButton
          label={isOnboarding ? "Let's bowl" : 'Got it'}
          onPress={onFinish}
          busy={saving ? 'Setting up…' : null}
          accessibilityLabel={isOnboarding ? `Create the profile for ${name} and start` : 'Done'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg },

  bar: { paddingHorizontal: space.md },
  headerStep: { ...type.caption, ...type.tabular, color: colors.muted },

  title: { ...type.h1, color: colors.text },
  sub: { ...type.body, color: colors.muted, marginTop: space.sm },

  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: stroke.hairline,
    borderColor: colors.line,
  },
  error: { marginBottom: space.md },
});
