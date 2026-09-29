import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, size, space, stroke, type } from './tokens';

export type ShareKind = 'image' | 'video';

const OPTIONS: { kind: ShareKind; label: string }[] = [
  { kind: 'image', label: 'Image card' },
  { kind: 'video', label: 'Video clip' },
];

/**
 * What to share: the image card or the video clip. Opens on the image, the one
 * that always works. The video side is handed a way back to the image, for when
 * the clip cannot be made.
 */
export function ShareChoice({ image, video }: {
  image: ReactNode;
  video: (useImage: () => void) => ReactNode;
}) {
  const [kind, setKind] = useState<ShareKind>('image');
  return (
    <View>
      <View style={styles.segments} accessibilityRole="tablist">
        {OPTIONS.map((option) => {
          const on = option.kind === kind;
          return (
            <Pressable
              key={option.kind}
              style={[styles.segment, on && styles.segmentOn]}
              onPress={() => setKind(option.kind)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {kind === 'image' ? image : video(() => setKind('image'))}
    </View>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: 'row', gap: space.sm },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: size.target,
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.control,
  },
  segmentOn: { backgroundColor: colors.text, borderColor: colors.text },
  segmentText: { ...type.body, color: colors.muted },
  segmentTextOn: { color: colors.bg, fontWeight: '800' },
});
