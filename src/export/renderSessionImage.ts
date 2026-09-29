import { Directory, File, Paths } from 'expo-file-system';
import { ImageFormat, Skia, type SkFont, type SkImage } from '@shopify/react-native-skia';
import type { Session } from '../types';
import { measurementState } from '../physics/measurementState';
import type { SpeedUnit } from '../settings/settings';
import { colors, shareCard } from '../ui/tokens';
import { isSession } from '../data/validation';
import { drawCard } from './drawCard';
import { createExportFont } from './font';
import { EXPORT_HEIGHT, EXPORT_WIDTH, frameFileName } from './layout';

/**
 * The app icon for the card's header, decoded by Skia from the bundled asset,
 * the way RN Skia's own useImage resolves one. Decoration only: without it the
 * card draws a plain mark in its place rather than failing the export.
 */
async function loadCardIcon(): Promise<SkImage | null> {
  try {
    const { Image } = await import('react-native');
    const uri = Image.resolveAssetSource(require('../../assets/icon.png'))?.uri;
    if (!uri) return null;
    const data = await Skia.Data.fromURI(uri);
    const image = Skia.Image.MakeImageFromEncoded(data);
    data.dispose();
    return image;
  } catch {
    return null;
  }
}

export async function renderSessionImage(
  session: Session, watermark: boolean, details: { playerName?: string | null; unit?: SpeedUnit } = {},
) {
  if (!isSession(session)) throw new Error('Cannot export an invalid saved delivery.');
  if (measurementState(session).kind !== 'measured') {
    throw new Error('This delivery has no measured speed to export.');
  }
  const frames = new Directory(session.framesDir);
  const relative = Paths.relative(Paths.document, frames);
  if (!session.framesDir.startsWith('file://') || !relative || relative === '..' ||
    relative.startsWith('../') || relative.startsWith('..\\') || Paths.isAbsolute(relative)) {
    throw new Error('Export requires frames in permanent app storage.');
  }
  const source = new File(frames, frameFileName(session.release.frame));
  if (!source.exists || source.size === 0) throw new Error('The saved release frame is missing.');
  const bytes = await source.bytes();
  const encoded = Skia.Data.fromBytes(bytes);
  const photo = Skia.Image.MakeImageFromEncoded(encoded);
  encoded.dispose();
  if (!photo) throw new Error('The saved release frame could not be decoded.');
  const icon = await loadCardIcon();
  const surface = Skia.Surface.MakeOffscreen(EXPORT_WIDTH, EXPORT_HEIGHT);
  if (!surface) { photo.dispose(); icon?.dispose(); throw new Error('Could not allocate the export image.'); }
  const fonts = new Map<string, SkFont>();
  const font = (size: number, bold = false) => {
    const key = `${size}${bold ? 'b' : ''}`;
    let value = fonts.get(key);
    if (!value) { value = createExportFont(size, bold); fonts.set(key, value); }
    return value;
  };
  let output: File | undefined;
  try {
    drawCard(Skia, surface.getCanvas(), photo, session, watermark, font, { ...colors, ...shareCard }, { ...details, icon });
    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    let png: Uint8Array;
    try { png = snapshot.encodeToBytes(ImageFormat.PNG); } finally { snapshot.dispose(); }
    if (!png.length) throw new Error('The export renderer produced an empty image.');
    // A cache artifact: the saved session remains the source of truth.
    const directory = new Directory(Paths.cache, 'paceball-exports');
    directory.create({ intermediates: true, idempotent: true });
    output = new File(directory, `paceball-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
    output.write(png);
    return { imagePath: output.uri, videoPath: null };
  } catch (error) {
    if (output?.exists) output.delete();
    throw error;
  } finally {
    for (const value of fonts.values()) value.dispose();
    surface.dispose();
    photo.dispose();
    icon?.dispose();
  }
}
