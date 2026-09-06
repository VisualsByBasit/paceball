import { useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { deleteSession, renderExport } from '../data';
import { colors, opacity, radius, space, type } from '../ui/tokens';
import { saveExportToGallery, shareExport } from './deliveryActions';

/** Free exports always carry branding; entitlement-controlled clean UI is later. */
export function SessionActions({ sessionId, onDeleted }: { sessionId: string; onDeleted?: () => void }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice(null);
    try { await action(); } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not complete this action. Try again.');
    } finally { lock.current = false; setBusy(false); }
  };
  const generate = () => run(async () => {
    const result = await renderExport({ sessionId, watermark: true });
    setImagePath(result.imagePath);
  });
  const confirmDelete = () => {
    if (lock.current) return;
    Alert.alert('Delete this delivery?',
      'Its video and extracted frames will also be deleted. This cannot be undone. Images already saved to your gallery or shared will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void run(async () => {
          await deleteSession(sessionId);
          setDeleted(true);
          setImagePath(null);
          onDeleted?.();
        }) },
      ]);
  };
  if (deleted) return <Text style={styles.notice}>Delivery deleted.</Text>;
  const button = (label: string, action: () => void) => (
    <Pressable accessibilityRole="button" disabled={busy} onPress={action}
      style={[styles.button, busy && styles.disabled]}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.container}>
      {button(busy ? 'Working…' : imagePath ? 'Create image again' : 'Create share image', generate)}
      {imagePath ? <>
        <Image source={{ uri: imagePath }} style={styles.preview} resizeMode="contain" accessibilityLabel="Paceball export preview" />
        {button('Save image to gallery', () => void run(async () => {
          await saveExportToGallery(imagePath); setNotice('Image saved to gallery.');
        }))}
        {button('Share image', () => void run(() => shareExport(imagePath)))}
      </> : null}
      {onDeleted ? button('Delete delivery', confirmDelete) : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.sm, marginTop: space.md },
  button: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md, alignItems: 'center' },
  label: { ...type.body, color: colors.text },
  notice: { ...type.caption, color: colors.muted, marginTop: space.sm },
  preview: { width: '100%', aspectRatio: 1080 / 1200 },
  disabled: { opacity: opacity.disabled },
});
