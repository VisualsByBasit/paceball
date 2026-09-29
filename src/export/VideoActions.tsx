import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { getSession } from '../data';
import { measurementState } from '../physics/measurementState';
import type { Session } from '../types';
import { ActionButton } from '../ui/ActionButton';
import { Notice } from '../ui/Notice';
import { colors, size, space, type } from '../ui/tokens';
import { saveVideoToGallery, shareVideoExport } from './deliveryActions';
import { createSessionVideoExport, isCancelledExport, type VideoExportTask } from './renderSessionVideo';

export const VIDEO_FAILED = 'Video could not be created. Your delivery is safe.';
export const VIDEO_USE_IMAGE = 'Create an image instead';
export const VIDEO_NEEDS_READING = 'A measured reading is needed to share a video.';

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; progress: number | null }
  | { kind: 'done'; videoPath: string }
  | { kind: 'failed' }
  | { kind: 'cancelled' };

/**
 * The delivery as a short clip with its reading burned in. Free clips carry the
 * watermark strip; the caller passes watermark={false} only when the Pro
 * entitlement allows a clean one. Sound is off for every export until switched
 * on for that export. A failure never falls back to anything: it says so and
 * offers the image card instead.
 */
export function VideoActions({ sessionId, watermark = true, onUseImage }: {
  sessionId: string;
  watermark?: boolean;
  onUseImage: () => void;
}) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [withSound, setWithSound] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const task = useRef<VideoExportTask | null>(null);

  useEffect(() => {
    let live = true;
    getSession(sessionId).then((value) => { if (live) setSession(value); }, () => { if (live) setSession(null); });
    return () => { live = false; };
  }, [sessionId]);

  // Leaving mid-export stops the encoder and removes its partial file.
  useEffect(() => () => { void task.current?.cancel(); }, []);

  if (session === undefined) return <Text style={styles.caption}>Loading delivery...</Text>;
  if (session === null || measurementState(session).kind !== 'measured') {
    return <Notice tone="info">{VIDEO_NEEDS_READING}</Notice>;
  }

  const start = async () => {
    if (task.current) return;
    setNotice(null);
    const current = createSessionVideoExport(session, { isPro: !watermark, includeAudio: withSound });
    task.current = current;
    setPhase({ kind: 'running', progress: null });
    // Only what the encoder reports. No estimate stands in for it.
    const subscription = current.onProgress((progress) => {
      if (Number.isFinite(progress)) {
        setPhase({ kind: 'running', progress: Math.max(0, Math.min(100, Math.round(progress))) });
      }
    });
    try {
      const result = await current.result;
      setPhase({ kind: 'done', videoPath: result.outputPath });
    } catch (error) {
      setPhase(isCancelledExport(error) ? { kind: 'cancelled' } : { kind: 'failed' });
    } finally {
      subscription.remove();
      task.current = null;
      // Every export starts silent, whatever the last one chose.
      setWithSound(false);
    }
  };

  const cancel = () => { void task.current?.cancel(); };

  const act = async (action: () => Promise<void>, done?: string) => {
    if (busy || phase.kind !== 'done') return;
    setBusy(true);
    setNotice(null);
    try { await action(); if (done) setNotice(done); } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not complete this action. Try again.');
    } finally { setBusy(false); }
  };

  const running = phase.kind === 'running';
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.label}>Include original sound</Text>
          <Text style={styles.caption}>{withSound ? 'The clip keeps the sound of the delivery.' : 'Off: the clip is silent.'}</Text>
        </View>
        <Switch
          value={withSound}
          onValueChange={setWithSound}
          disabled={running}
          accessibilityLabel="Include original sound in this video"
        />
      </View>

      {phase.kind === 'done' ? (
        <>
          <Notice tone="success">Video clip ready.</Notice>
          <ActionButton
            label="Share video"
            busy={busy ? 'Opening...' : null}
            onPress={() => void act(() => shareVideoExport(phase.videoPath))}
          />
          <ActionButton
            variant="secondary"
            label="Save video to gallery"
            disabledReason={busy ? 'Another action is still running.' : null}
            onPress={() => void act(() => saveVideoToGallery(phase.videoPath), 'Video saved to gallery.')}
          />
          <ActionButton variant="text" label="Create video again" onPress={() => void start()} />
        </>
      ) : (
        <ActionButton
          label="Create video clip"
          busy={running
            ? phase.progress === null ? 'Creating video...' : `Creating video... ${phase.progress}%`
            : null}
          onPress={() => void start()}
        />
      )}
      {running ? <ActionButton variant="destructive" label="Cancel export" onPress={cancel} /> : null}

      {phase.kind === 'failed' ? (
        <Notice tone="error" live action={{ label: VIDEO_USE_IMAGE, onPress: onUseImage }}>{VIDEO_FAILED}</Notice>
      ) : null}
      {phase.kind === 'cancelled' ? <Notice tone="info" live>Export cancelled. Nothing was saved.</Notice> : null}
      {notice ? <Notice tone="info" live>{notice}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.sm, marginTop: space.md },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: size.target, marginBottom: space.sm },
  rowText: { flex: 1, marginRight: space.md },
  label: { ...type.body, color: colors.text, fontWeight: '700' },
  caption: { ...type.caption, color: colors.muted },
});
