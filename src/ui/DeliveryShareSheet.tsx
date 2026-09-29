import { useRef, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { deleteSession, renderExport } from '../data';
import { saveExportToGallery, shareExport } from '../export/deliveryActions';
import { EXPORT_HEIGHT, EXPORT_WIDTH } from '../export/layout';
import { VideoActions } from '../export/VideoActions';
import { canExportWithoutWatermark, useEntitlements } from '../purchases';
import { ActionButton } from './ActionButton';
import { BottomSheet } from './BottomSheet';
import { createDeliveryDelete, DELETE_CONFIRM } from './deleteDelivery';
import { errorMessage } from './format';
import { Notice } from './Notice';
import { ShareChoice } from './ShareChoice';
import { colors, radius, space, stroke, type } from './tokens';

export const SHARE_TITLE = 'Share reading';
export const CREATE_IMAGE = 'Create image';
export const REMOVE_WATERMARK = 'Remove watermark';

type DeliveryShareSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** A saved, measured delivery. Callers open the sheet for nothing else. */
  sessionId: string;
  /**
   * Offer deleting the delivery too, below the sharing, and what to do once it
   * is gone. Analysis passes it; Result, where the delivery has only just been
   * saved, does not.
   */
  onDeleted?: () => void;
};

/**
 * The one share sheet, the same from Result as from Analysis: the image card or
 * the video clip, each created, then shared or saved. Free cards and clips
 * carry the watermark, which is the growth loop; "Remove watermark" opens the
 * paywall for a free user and makes the clean card for Pro. The clip is clean
 * for Pro, read from the entitlement when the sheet opens.
 */
export function DeliveryShareSheet({ visible, onClose, sessionId, onDeleted }: DeliveryShareSheetProps) {
  const entitlements = useEntitlements();
  const clean = canExportWithoutWatermark(entitlements);
  return (
    <BottomSheet visible={visible} title={SHARE_TITLE} onClose={onClose}>
      <ShareChoice
        image={<ImageShare sessionId={sessionId} clean={clean} onLeave={onClose} />}
        video={(useImage) => (
          <VideoActions sessionId={sessionId} watermark={!clean} onUseImage={useImage} />
        )}
      />
      {onDeleted ? <DeleteAction sessionId={sessionId} onDeleted={onDeleted} /> : null}
    </BottomSheet>
  );
}

type Made = { path: string; clean: boolean };

/**
 * The image card: created branded, or clean for Pro, then shared or saved.
 * One action at a time; each says what it is doing while it runs.
 */
function ImageShare({ sessionId, clean, onLeave }: { sessionId: string; clean: boolean; onLeave: () => void }) {
  const router = useRouter();
  const lock = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [made, setMade] = useState<Made | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const run = async (doing: string, action: () => Promise<string | void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(doing);
    setNotice(null);
    try {
      const done = await action();
      if (done) setNotice({ tone: 'success', text: done });
    } catch (e) {
      setNotice({ tone: 'error', text: errorMessage(e) });
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  const create = (withoutWatermark: boolean) =>
    void run(withoutWatermark ? 'Creating clean image...' : 'Creating image...', async () => {
      const result = await renderExport({ sessionId, watermark: !withoutWatermark });
      setMade({ path: result.imagePath, clean: withoutWatermark });
    });

  const removeWatermark = () => {
    if (!clean) {
      // The sheet is drawn over every screen. Left open, it would hide the
      // paywall this opens until it was closed.
      onLeave();
      router.push({ pathname: '/paywall', params: { context: 'export' } });
      return;
    }
    create(true);
  };

  return (
    <View style={styles.section}>
      <ActionButton
        label={made && !made.clean ? 'Create image again' : CREATE_IMAGE}
        busy={busy === 'Creating image...' ? busy : null}
        disabledReason={busy && busy !== 'Creating image...' ? 'Another action is still running.' : null}
        onPress={() => create(false)}
      />
      <ActionButton
        variant="secondary"
        label={REMOVE_WATERMARK}
        busy={busy === 'Creating clean image...' ? busy : null}
        onPress={removeWatermark}
        accessibilityLabel={clean ? 'Create the image without the watermark' : 'Remove the watermark with Paceball Pro'}
      />
      <Text style={styles.caption}>
        {clean
          ? 'Pro: the clean card carries your reading only.'
          : 'Free cards carry the Paceball mark. Pro cards carry your reading only.'}
      </Text>

      {made ? (
        <View style={styles.section}>
          <Text style={styles.madeLabel}>{made.clean ? 'IMAGE WITHOUT WATERMARK' : 'IMAGE WITH WATERMARK'}</Text>
          {/* The PNG that was written, read back from its file: exactly what
              Share and Save to gallery will send, not a drawing of it. */}
          <Image
            key={made.path}
            source={{ uri: made.path }}
            style={styles.preview}
            resizeMode="contain"
            fadeDuration={0}
            accessibilityLabel={made.clean ? 'The image without the watermark' : 'The image with the Paceball watermark'}
          />
          <ActionButton
            label="Share"
            busy={busy === 'Opening...' ? busy : null}
            disabledReason={busy && busy !== 'Opening...' ? 'Another action is still running.' : null}
            onPress={() => void run('Opening...', () => shareExport(made.path))}
            accessibilityLabel="Share this image"
          />
          <ActionButton
            variant="secondary"
            label="Save to gallery"
            busy={busy === 'Saving...' ? busy : null}
            disabledReason={busy && busy !== 'Saving...' ? 'Another action is still running.' : null}
            onPress={() =>
              void run('Saving...', async () => {
                await saveExportToGallery(made.path);
                return 'Image saved to gallery.';
              })
            }
            accessibilityLabel="Save this image to the gallery"
          />
        </View>
      ) : null}

      {notice ? (
        <Notice tone={notice.tone} live>
          {notice.text}
        </Notice>
      ) : null}
    </View>
  );
}

/** Deleting the delivery, asked first in the same words as History. */
function DeleteAction({ sessionId, onDeleted }: { sessionId: string; onDeleted: () => void }) {
  const [error, setError] = useState<string | null>(null);
  // Read when the delete lands, so it is always the screen's current callback.
  const onDeletedRef = useRef(onDeleted);
  onDeletedRef.current = onDeleted;
  const del = useRef(
    createDeliveryDelete({
      ask: (title, message, buttons) => Alert.alert(title, message, buttons),
      remove: deleteSession,
      onDeleted: () => onDeletedRef.current(),
      onError: (e) => setError(errorMessage(e)),
    })
  );
  return (
    <View style={styles.delete}>
      <ActionButton
        variant="destructive"
        label={DELETE_CONFIRM}
        onPress={() => {
          setError(null);
          del.current(sessionId, false);
        }}
      />
      {error ? (
        <Notice tone="error" live>
          {`Could not delete this delivery: ${error}`}
        </Notice>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm, marginTop: space.md },
  caption: { ...type.caption, color: colors.muted },
  madeLabel: { ...type.label, color: colors.muted },
  // Full width, the card's own proportions, the whole card inside it.
  preview: {
    width: '100%',
    aspectRatio: EXPORT_WIDTH / EXPORT_HEIGHT,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
  },
  delete: { gap: space.sm, marginTop: space.xl },
});
