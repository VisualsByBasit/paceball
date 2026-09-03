import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, opacity, radius, space, stroke, type } from '../../src/ui/tokens';

const MAX_NAME_LENGTH = 40;

/**
 * Setup 01 — who is bowling.
 *
 * Only the name is collected. Height and shoe size exist on the Player type for
 * calibration methods that are not built yet, and asking for data the app
 * cannot use would be a question with no purpose.
 *
 * The player is not created here. It is created at the end of setup, so backing
 * out of the next screen does not leave an orphan profile behind.
 */
export default function SetupPlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');

  const trimmed = name.trim();
  const canContinue = trimmed.length > 0;

  const onContinue = () => {
    if (!canContinue) return;
    router.push({ pathname: '/setup/how-it-works', params: { name: trimmed } });
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          styles.content,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg },
        ]}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={space.md}>
            <Text style={styles.headerAction}>Back</Text>
          </Pressable>
          <Text style={styles.headerStep}>1 OF 3</Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>Who's bowling?</Text>
          <Text style={styles.sub}>
            Deliveries are saved against a bowler, so your speeds build into a trend
            rather than a pile of one-offs.
          </Text>

          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor={colors.muted}
            selectionColor={colors.accent}
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={MAX_NAME_LENGTH}
            returnKeyType="next"
            onSubmitEditing={onContinue}
            accessibilityLabel="Bowler name"
          />
        </View>

        <Pressable
          style={[styles.primaryButton, !canContinue && styles.buttonOff]}
          onPress={onContinue}
          disabled={!canContinue}
          accessibilityRole="button"
          accessibilityLabel="Continue"
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: space.lg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerAction: { ...type.caption, color: colors.muted },
  headerStep: { ...type.label, color: colors.muted },

  body: { flex: 1, paddingTop: space.xxl },
  title: { ...type.h1, color: colors.text },
  sub: { ...type.body, color: colors.muted, marginTop: space.sm },

  input: {
    ...type.h2,
    color: colors.text,
    borderBottomWidth: stroke.hairline,
    borderColor: colors.line,
    paddingVertical: space.md,
    marginTop: space.xl,
  },

  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  primaryButtonText: { ...type.body, color: colors.bg, fontWeight: '800' },
  buttonOff: { opacity: opacity.disabled },
});
