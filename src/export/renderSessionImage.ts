import { Directory, File, Paths } from 'expo-file-system';
import { ImageFormat, matchFont, Skia, type SkFont } from '@shopify/react-native-skia';
import type { Session } from '../types';
import { colors } from '../ui/tokens';
import { isSession } from '../data/validation';
import { drawCard } from './drawCard';
import { EXPORT_HEIGHT, EXPORT_WIDTH, frameFileName } from './layout';

export async function renderSessionImage(session: Session, watermark: boolean) {
  if (!isSession(session)) throw new Error('Cannot export an invalid saved delivery.');
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
  const surface = Skia.Surface.MakeOffscreen(EXPORT_WIDTH, EXPORT_HEIGHT);
  if (!surface) { photo.dispose(); throw new Error('Could not allocate the export image.'); }
  const fonts = new Map<number, SkFont>();
  const font = (size: number) => {
    let value = fonts.get(size);
    if (!value) { value = matchFont({ fontFamily: 'sans-serif', fontSize: size }); fonts.set(size, value); }
    return value;
  };
  let output: File | undefined;
  try {
    drawCard(Skia, surface.getCanvas(), photo, session, watermark, font, colors);
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
  }
}
