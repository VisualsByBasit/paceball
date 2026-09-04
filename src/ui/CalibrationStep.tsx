import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CALIBRATION_ORDER,
  CALIBRATION_SPECS,
  formatMetres,
} from '../physics/calibration';
import { colors, opacity, radius, space, stroke, type } from './tokens';
import type { CalibrationMethod } from '../types';

type CalibrationStepProps = {
  topInset: number;
  bottomInset: number;
  method: CalibrationMethod;
  onSelectMethod: (method: CalibrationMethod) => void;
  /** Raw text, so a half-typed number is not thrown away on re-render. */
  customMetres: string;
  onChangeCustomMetres: (text: string) => void;
  /** Height on the player profile, or null if there is none on file. */
  heightCm: number | null;
  /** The resolved distance, or null while the method cannot supply one. */
  metres: number | null;
  problem: string | null;
  onConfirm: () => void;
  onBack: () => void;
};

/**
 * Mark, part one — what the measurement is scaled against.
 *
 * Nothing on screen has a size until one real-world distance is known, so this
 * is asked before the first tap rather than assumed to be a full pitch. Getting
 * it wrong scales every reading by the same factor, which is why the choice is
 * explicit and the distance is shown alongside it.
 */
export function CalibrationStep({
  topInset,
  bottomInset,
  method,
  onSelectMethod,
  customMetres,
  onChangeCustomMetres,
  heightCm,
  metres,
  problem,
  onConfirm,
  onBack,
}: CalibrationStepProps) {
  const spec = CALIBRATION_SPECS[method];
  const canConfirm = metres !== null;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          styles.content,
          { paddingTop: topInset + space.md, paddingBottom: bottomInset + space.lg },
        ]}
      >
        <View style={styles.header}>
          <Pressable onPress={onBack} hitSlop={space.md}>
            <Text style={styles.headerAction}>Retake</Text>
          </Pressable>
          <Text style={styles.headerStep}>SCALE</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>What is the ruler?</Text>
          <Text style={styles.sub}>
            Speed is scaled from one known distance in shot. Pick what you can see
            in the clip — the next two taps measure across it.
          </Text>

          <View style={styles.options}>
            {CALIBRATION_ORDER.map((key) => {
              const option = CALIBRATION_SPECS[key];
              // Height is only offered when there is a height to offer.
              const disabled = option.source === 'profile' && heightCm === null;
              const selected = key === method;

              let value: string;
              if (option.source === 'fixed') {
                value = formatMetres(option.metres!);
              } else if (option.source === 'profile') {
                value = heightCm === null ? 'Not set' : formatMetres(heightCm / 100);
              } else {
                value = 'You measure';
              }

              return (
                <Pressable
                  key={key}
                  onPress={() => onSelectMethod(key)}
                  disabled={disabled}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled }}
                  accessibilityLabel={`${option.title}, ${value}`}
                  style={[
                    styles.option,
                    selected && styles.optionSelected,
                    disabled && styles.optionOff,
                  ]}
                >
                  <View style={styles.optionHead}>
                    <Text style={styles.optionTitle}>{option.title}</Text>
                    <Text
                      style={[styles.optionValue, selected && styles.optionValueSelected]}
                    >
                      {value}
                    </Text>
                  </View>
                  <Text style={styles.optionDetail}>
                    {disabled
                      ? 'Add a height to the player profile to measure against it.'
                      : option.detail}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {spec.source === 'entered' ? (
            <View style={styles.custom}>
              <Text style={styles.label}>DISTANCE BETWEEN THE MARKERS</Text>
              <View style={styles.customRow}>
                <TextInput
                  style={styles.input}
                  value={customMetres}
                  onChangeText={onChangeCustomMetres}
                  placeholder="0.0"
                  placeholderTextColor={colors.muted}
                  selectionColor={colors.accent}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  maxLength={6}
                  returnKeyType="done"
                  onSubmitEditing={onConfirm}
                  accessibilityLabel="Distance between the markers, in metres"
                />
                <Text style={styles.inputUnit}>m</Text>
              </View>
              <Text style={styles.customHint}>
                No tape measure? Pace the gap heel-to-toe and count your feet — an
                adult foot is close to 0.26 m, so 15 heel-to-toe steps is roughly
                3.9 m. This number scales every speed, so measure it as carefully
                as you can.
              </Text>
            </View>
          ) : null}

          {problem ? <Text style={styles.problem}>{problem}</Text> : null}
        </ScrollView>

        <Pressable
          style={[styles.primaryButton, !canConfirm && styles.buttonOff]}
          onPress={onConfirm}
          disabled={!canConfirm}
          accessibilityRole="button"
          accessibilityLabel="Start marking"
        >
          <Text style={styles.primaryButtonText}>Start marking</Text>
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

  body: { paddingTop: space.xl, paddingBottom: space.lg },
  title: { ...type.h1, color: colors.text },
  sub: { ...type.body, color: colors.muted, marginTop: space.sm },

  options: { marginTop: space.lg },
  option: {
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: space.md,
    marginBottom: space.sm,
  },
  optionSelected: { borderColor: colors.accent, borderWidth: stroke.medium },
  optionOff: { opacity: opacity.disabled },
  optionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionTitle: { ...type.body, color: colors.text, fontWeight: '700' },
  optionValue: { ...type.caption, ...type.mono, color: colors.muted },
  optionValueSelected: { color: colors.accent },
  optionDetail: { ...type.caption, color: colors.muted, marginTop: space.xs },

  custom: { marginTop: space.md },
  label: { ...type.label, color: colors.muted },
  customRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    borderBottomWidth: stroke.hairline,
    borderColor: colors.line,
  },
  input: {
    ...type.h1,
    ...type.mono,
    color: colors.text,
    flex: 1,
    paddingVertical: space.sm,
  },
  inputUnit: { ...type.body, color: colors.muted, marginLeft: space.sm },
  customHint: { ...type.caption, color: colors.muted, marginTop: space.sm },

  problem: { ...type.caption, color: colors.danger, marginTop: space.md },

  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  primaryButtonText: { ...type.body, color: colors.bg, fontWeight: '800' },
  buttonOff: { opacity: opacity.disabled },
});
