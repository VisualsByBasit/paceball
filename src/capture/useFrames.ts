import { useCallback, useEffect, useRef, useState } from 'react';
import { Directory, File, Paths } from 'expo-file-system';
import FrameExtractor from '../../modules/frame-extractor/src/FrameExtractorModule';

/**
 * Long-edge cap for extracted frames. Well above the ~1080 px a phone can show,
 * so marking accuracy is unaffected, but it stops a 4K clip costing 4K of decode
 * and disk for every frame.
 */
export const FRAME_MAX_WIDTH = 1280;

/**
 * Frames per native call. Small enough that the strip visibly fills as it goes,
 * large enough that the per-call MediaMetadataRetriever setup is amortised.
 */
const BATCH = 12;

/** A first frame that never arrives should not leave the screen spinning forever. */
const PROBE_TIMEOUT_MS = 15000;

export type FramesStatus = 'probing' | 'extracting' | 'ready' | 'error';

export type FramesState = {
  status: FramesStatus;
  /** Index-aligned `file://` JPEG paths. `null` means not decoded yet. */
  frames: (string | null)[];
  /** How many frames have been decoded so far. */
  decoded: number;
  /**
   * Frames this clip actually has. Starts at the container's frame count and is
   * revised down if the decoder stops early — that hint routinely over-reports.
   */
  total: number;
  error: string | null;
  /** Plain-language result of the one-frame smoke test, for the debug line. */
  probe: string | null;
};

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function withTimeout<T>(promise: Promise<T>, ms: number, reason: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(reason)), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      }
    );
  });
}

/** One cache directory per clip, so re-entering the screen reuses what is there. */
function framesDirFor(videoPath: string): Directory {
  const base = videoPath.split('/').pop() ?? 'clip';
  const safe = base.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]/g, '_') || 'clip';
  return new Directory(Paths.cache, 'paceball-frames', safe);
}

const FRAME_NAME = /^frame_(\d+)\.jpg$/;

/** Frames left over from an earlier visit, so an interrupted run is not repeated. */
function readCached(dir: Directory): Map<number, string> {
  const found = new Map<number, string>();
  try {
    if (!dir.exists) return found;
    for (const entry of dir.list()) {
      if (!(entry instanceof File)) continue;
      const match = FRAME_NAME.exec(entry.name);
      if (!match) continue;
      if (entry.size <= 0) continue;
      found.set(Number(match[1]), entry.uri);
    }
  } catch {
    // An unreadable cache is not a failure — we just decode everything again.
  }
  return found;
}

/**
 * Decodes a clip to JPEGs on disk, in order, reporting progress as it goes.
 *
 * The first frame is extracted on its own and checked on the filesystem before
 * anything else runs: the native module is the one part of this screen that can
 * fail wholesale, so it is proven to return a real, non-empty JPEG path before
 * the UI commits to it.
 */
export function useFrames(videoPath: string, frameCount: number) {
  const [state, setState] = useState<FramesState>(() => ({
    status: 'probing',
    frames: new Array<string | null>(Math.max(0, frameCount)).fill(null),
    decoded: 0,
    total: Math.max(0, frameCount),
    error: null,
    probe: null,
  }));

  const runRef = useRef(0);

  const extract = useCallback(async () => {
    const run = ++runRef.current;
    const alive = () => runRef.current === run;

    const total = Math.max(0, frameCount);
    const frames = new Array<string | null>(total).fill(null);

    setState({
      status: 'probing',
      frames,
      decoded: 0,
      total,
      error: null,
      probe: null,
    });

    if (!videoPath || total === 0) {
      if (alive()) {
        setState((s) => ({
          ...s,
          status: 'error',
          error: !videoPath
            ? 'No video was handed to this screen.'
            : 'The clip reports zero frames.',
        }));
      }
      return;
    }

    let dir: Directory;
    try {
      dir = framesDirFor(videoPath);
      dir.create({ intermediates: true, idempotent: true });
    } catch (e) {
      if (alive()) {
        setState((s) => ({
          ...s,
          status: 'error',
          error: `Could not open a cache directory: ${message(e)}`,
        }));
      }
      return;
    }

    const cached = readCached(dir);
    for (const [index, uri] of cached) {
      if (index >= 0 && index < total) frames[index] = uri;
    }

    // Smoke test: prove the native module returns a usable JPEG path before the
    // rest of the screen is built on that assumption.
    let probe: string;
    if (frames[0]) {
      probe = `reused ${cached.size} cached frame${cached.size === 1 ? '' : 's'}`;
    } else {
      try {
        const first = await withTimeout(
          FrameExtractor.extractFrames(videoPath, 0, 1, dir.uri, FRAME_MAX_WIDTH),
          PROBE_TIMEOUT_MS,
          `no frame after ${PROBE_TIMEOUT_MS / 1000}s`
        );
        if (!alive()) return;

        if (!Array.isArray(first) || first.length === 0) {
          throw new Error('returned no paths for frame 0');
        }
        const uri = first[0];
        if (!uri.endsWith('.jpg')) {
          throw new Error(`returned a non-JPEG path: ${uri}`);
        }
        const file = new File(uri);
        if (!file.exists) {
          throw new Error(`returned ${uri}, but no file is there`);
        }
        if (file.size <= 0) {
          throw new Error(`wrote an empty file at ${uri}`);
        }
        frames[0] = uri;
        probe = `frame 0 → ${Math.round(file.size / 1024)} KB JPEG`;
      } catch (e) {
        if (!alive()) return;
        setState((s) => ({
          ...s,
          status: 'error',
          error: `Frame extraction failed: ${message(e)}`,
          probe: 'extractFrames did not return a usable JPEG',
        }));
        return;
      }
    }

    let decoded = frames.reduce((n, f) => (f ? n + 1 : n), 0);
    if (!alive()) return;
    setState({ status: 'extracting', frames: [...frames], decoded, total, error: null, probe });

    // Sequential batches. Decoding forward is far cheaper than seeking around,
    // so the strip fills left to right and stays usable while the rest lands.
    let end = total;
    for (let start = 0; start < end; start += BATCH) {
      if (!alive()) return;

      const count = Math.min(BATCH, end - start);
      let missing = false;
      for (let i = start; i < start + count; i += 1) {
        if (!frames[i]) {
          missing = true;
          break;
        }
      }
      if (!missing) continue;

      let paths: string[];
      try {
        paths = await FrameExtractor.extractFrames(
          videoPath,
          start,
          count,
          dir.uri,
          FRAME_MAX_WIDTH
        );
      } catch (e) {
        if (!alive()) return;
        // Some frames are better than none — keep what decoded and say why it stopped.
        setState((s) => ({
          ...s,
          status: decoded > 0 ? 'ready' : 'error',
          total: decoded > 0 ? decoded : s.total,
          error: `Stopped after ${decoded} frames: ${message(e)}`,
        }));
        return;
      }
      if (!alive()) return;

      for (let i = 0; i < paths.length; i += 1) {
        const index = start + i;
        if (index < total && !frames[index]) decoded += 1;
        if (index < total) frames[index] = paths[i];
      }

      // A short batch means the decoder ran out before the container said it would.
      if (paths.length < count) {
        end = start + paths.length;
        frames.length = end;
        break;
      }

      setState({
        status: 'extracting',
        frames: [...frames],
        decoded,
        total: end,
        error: null,
        probe,
      });
    }

    if (!alive()) return;
    setState({
      status: decoded > 0 ? 'ready' : 'error',
      frames: [...frames],
      decoded,
      total: Math.max(1, end),
      error: decoded > 0 ? null : 'The clip decoded no frames.',
      probe,
    });
  }, [videoPath, frameCount]);

  useEffect(() => {
    extract();
    // Bumping the run id strands the in-flight loop rather than letting it
    // keep decoding for a screen that has gone away.
    return () => {
      runRef.current += 1;
    };
  }, [extract]);

  return { ...state, retry: extract };
}
