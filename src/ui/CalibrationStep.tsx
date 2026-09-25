import { useState } from 'react';
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
  A4_LONG_EDGE_MM,
  CALIBRATION_ORDER,
  CALIBRATION_SPECS,
  MARKER_SOURCE_ORDER,
  MARKER_SOURCE_SPECS,
  MAX_SHOE_CM,
  MAX_SHOE_EU,
  MIN_SHOE_CM,
  MIN_SHOE_EU,
  formatMetres,
  type MarkersDraft,
} from '../physics/calibration';
import { colors, opacity, radius, space, stroke, type } from './tokens';
import type { CalibrationMethod } from '../types';

type CalibrationStepProps = {
  topInset: number;
  bottomInset: number;
  method: CalibrationMethod;
  onSelectMethod: (method: CalibrationMethod) => void;
  /** Raw text, so a half-typed number is not thrown away on re-render. */
  markers: MarkersDraft;
  onChangeMarkers: (patch: Partial<MarkersDraft>) => void;
  /** The outer shoe length a paced distance is scaled by, or null if unknown. */
  shoeLengthCm: number | null;
  /** What the profile holds, so the right prompt appears when one is missing. */
  shoe: { lengthCm: number | null; sizeEu: number | null };
  onSaveShoe: (patch: { shoeLengthCm?: number; shoeSizeEu?: number }) => void;
  shoeProblem: string | null;
  /** Height on the player profile, or null if there is none on file. */
  heightCm: number | null;
  /** The resolved distance, or null while the method cannot supply one. */
  metres: number | null;
  /** Paces behind the resolved distance, when it was paced. */
  paceCount: number | null;
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
 *
 * For markers it also asks HOW the distance was established. Without that every
 * markers reading has to assume the worst of the three and carry a 5% reference
 * uncertainty; recording that it was taped drops the same reading to 0.5%.
 */
export function CalibrationStep({
  topInset,
  bottomInset,
  method,
  onSelectMethod,
  markers,
  onChangeMarkers,
  shoeLengthCm,
  shoe,
  onSaveShoe,
  shoeProblem,
  heightCm,
  metres,
  paceCount,
  problem,
  onConfirm,
  onBack,
}: CalibrationStepProps) {
  const spec = CALIBRATION_SPECS[method];
  const sourceSpec = MARKER_SOURCE_SPECS[markers.source];
  const canConfirm = metres !== null;

  const [shoeInput, setShoeInput] = useState('');
  const [shoeInputProblem, setShoeInputProblem] = useState<string | null>(null);

  // A paced distance needs a shoe to scale by. Which one is missing decides
  // which question gets asked.
  const needsSize = markers.source === 'paced-shoe-size' && shoe.sizeEu === null;
  const needsLength = markers.source === 'paced-measured-shoe' && shoe.lengthCm === null;

  const submitShoe = () => {
    const value = Number(shoeInput.trim().replace(',', '.'));
    if (!Number.isFinite(value)) {
      setShoeInputProblem('Enter a number.');
      return;
    }
    if (needsSize) {
      if (value < MIN_SHOE_EU || value > MAX_SHOE_EU) {
        setShoeInputProblem(`An EU size is between ${MIN_SHOE_EU} and ${MAX_SHOE_EU}.`);
        return;
      }
      setShoeInputProblem(null);
      setShoeInput('');
      onSaveShoe({ shoeSizeEu: value });
      return;
    }
    if (value < MIN_SHOE_CM || value > MAX_SHOE_CM) {
      setShoeInputProblem(`A shoe is between ${MIN_SHOE_CM} cm and ${MAX_SHOE_CM} cm long.`);
      return;
    }
    setShoeInputProblem(null);
    setShoeInput('');
    onSaveShoe({ shoeLengthCm: value });
  };

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
            in the clip. The next two taps measure across it.
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
                      ? 'No height on the player profile yet, and this version cannot add one.'
                      : option.detail}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {spec.source === 'entered' ? (
            <View style={styles.custom}>
              <Text style={styles.label}>HOW DID YOU MEASURE IT?</Text>
              <Text style={styles.sourceNote}>
                This distance scales every speed, and how it was established sets
                how wide the error range has to be.
              </Text>

              <View style={styles.sources}>
                {MARKER_SOURCE_ORDER.map((key) => {
                  const option = MARKER_SOURCE_SPECS[key];
                  const on = key === markers.source;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => onChangeMarkers({ source: key })}
                      style={[styles.source, on && styles.sourceOn]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${option.title}, ${option.accuracy}`}
                    >
                      <Text style={[styles.sourceTitle, on && styles.sourceTitleOn]}>
                        {option.title}
                      </Text>
                      <Text style={[styles.sourceAccuracy, on && styles.sourceAccuracyOn]}>
                        {option.accuracy}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.customHint}>{sourceSpec.detail}</Text>

              {sourceSpec.paced ? (
                <>
                  <Text style={[styles.label, styles.fieldLabel]}>HEEL-TO-TOE PACES</Text>
                  <View style={styles.customRow}>
                    <TextInput
                      style={styles.input}
                      value={markers.paces}
                      onChangeText={(text) => onChangeMarkers({ paces: text })}
                      placeholder="0"
                      placeholderTextColor={colors.muted}
                      selectionColor={colors.accent}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      maxLength={5}
                      returnKeyType="done"
                      onSubmitEditing={onConfirm}
                      accessibilityLabel="Heel-to-toe paces between the markers"
                    />
                    <Text style={styles.inputUnit}>paces</Text>
                  </View>
                  {/* Shown live, so a wrong shoe or a miscount is obvious before
                      it scales the whole reading. */}
                  {shoeLengthCm === null ? null : (
                    <Text style={styles.computed}>
                      {paceCount === null || metres === null
                        ? `${shoeLengthCm.toFixed(1)} cm per pace`
                        : `${paceCount} × ${shoeLengthCm.toFixed(1)} cm = ${formatMetres(metres)}`}
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={[styles.label, styles.fieldLabel]}>
                    DISTANCE BETWEEN THE MARKERS
                  </Text>
                  <View style={styles.customRow}>
                    <TextInput
                      style={styles.input}
                      value={markers.metres}
                      onChangeText={(text) => onChangeMarkers({ metres: text })}
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
                    Measure it as carefully as you can. This number scales every
                    speed you record against it.
                  </Text>
                </>
              )}

              {needsSize || needsLength ? (
                <View style={styles.shoe}>
                  <Text style={styles.label}>
                    {needsSize ? 'YOUR EU SHOE SIZE' : 'OUTER SHOE LENGTH'}
                  </Text>
                  <Text style={styles.customHint}>
                    {needsSize
                      ? 'Paces are scaled by the outer length of your shoe, worked out from your size.'
                      : `Stand the shoe along the long edge of a sheet of A4. That edge is ${A4_LONG_EDGE_MM} mm. Measure heel to toe, on the outside of the sole.`}
                  </Text>
                  <View style={styles.customRow}>
                    <TextInput
                      style={styles.input}
                      value={shoeInput}
                      onChangeText={setShoeInput}
                      placeholder={needsSize ? '42' : '28.5'}
                      placeholderTextColor={colors.muted}
                      selectionColor={colors.accent}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      maxLength={5}
                      returnKeyType="done"
                      onSubmitEditing={submitShoe}
                      accessibilityLabel={
                        needsSize ? 'Your EU shoe size' : 'Outer shoe length in centimetres'
                      }
                    />
                    <Text style={styles.inputUnit}>{needsSize ? 'EU' : 'cm'}</Text>
                  </View>
                  <Pressable
                    style={styles.shoeSave}
                    onPress={submitShoe}
                    accessibilityRole="button"
                    accessibilityLabel={needsSize ? 'Save shoe size' : 'Save shoe length'}
                  >
                    <Text style={styles.shoeSaveText}>Save to my profile</Text>
                  </Pressable>
                  {shoeInputProblem ? (
                    <Text style={styles.problem}>{shoeInputProblem}</Text>
                  ) : null}
                </View>
              ) : null}

              {/* A measured shoe is five times better than a converted size, so
                  the better path is offered rather than buried in settings. */}
              {markers.source === 'paced-shoe-size' ? (
                <Pressable
                  onPress={() => onChangeMarkers({ source: 'paced-measured-shoe' })}
                  accessibilityRole="button"
                  accessibilityLabel="Measure your shoe instead, for a five times tighter error range"
                >
                  <Text style={styles.upgrade}>
                    Measure the shoe against an A4 sheet instead: five times
                    tighter, and it only has to be done once.
                  </Text>
                </Pressable>
              ) : null}

              {shoeProblem ? <Text style={styles.shoeNote}>{shoeProblem}</Text> : null}
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
  fieldLabel: { marginTop: space.md },
  sourceNote: { ...type.caption, color: colors.muted, marginTop: space.xs },

  sources: { flexDirection: 'row', marginTop: space.sm },
  source: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    marginRight: space.xs,
  },
  sourceOn: { borderColor: colors.accent, borderWidth: stroke.medium },
  sourceTitle: { ...type.caption, color: colors.muted },
  sourceTitleOn: { color: colors.text, fontWeight: '700' },
  sourceAccuracy: { ...type.caption, ...type.mono, color: colors.muted, marginTop: space.xs },
  sourceAccuracyOn: { color: colors.accent },

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
  computed: { ...type.body, ...type.mono, color: colors.accent, marginTop: space.sm },

  shoe: {
    marginTop: space.md,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: space.md,
  },
  shoeSave: {
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.text,
    paddingVertical: space.sm,
    alignItems: 'center',
    marginTop: space.md,
  },
  shoeSaveText: { ...type.caption, color: colors.text, fontWeight: '800' },
  shoeNote: { ...type.caption, color: colors.warn, marginTop: space.sm },
  upgrade: {
    ...type.caption,
    color: colors.accent,
    marginTop: space.md,
    textDecorationLine: 'underline',
  },

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
