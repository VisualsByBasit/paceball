import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButton } from '../../src/ui/ActionButton';
import { AppBar } from '../../src/ui/AppBar';
import { colors, space, stroke, type } from '../../src/ui/tokens';

const MAX_NAME_LENGTH = 40;

/**
 * Setup, step 1 of 3: who is bowling.
 *
 * Only the name is collected here. A shoe is asked for on the scale step, where
 * a paced markers distance needs one. Height calibration reads the profile,
 * which no shipped screen can set yet, so asking for it here would be a
 * question with no use, and so would a line about measuring heel to toe.
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
        <AppBar
          title="Setup"
          onBack={() => router.back()}
          right={<Text style={styles.headerStep}>Step 1 of 3</Text>}
        />

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

        <ActionButton
          label="Continue"
          onPress={onContinue}
          disabledReason={canContinue ? null : 'Enter a name to continue.'}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: space.lg },

  headerStep: { ...type.caption, ...type.tabular, color: colors.muted },

  body: { flex: 1, paddingTop: space.xl },
  title: { ...type.h1, color: colors.text },
  sub: { ...type.body, color: colors.muted, marginTop: space.sm },

  // Input outlines are `control`, so the field can be found at a glance.
  input: {
    ...type.h2,
    color: colors.text,
    borderBottomWidth: stroke.medium,
    borderColor: colors.control,
    paddingVertical: space.md,
    marginTop: space.xl,
  },
});
