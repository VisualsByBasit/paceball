import { File, Directory, Paths } from 'expo-file-system';
// SDK 57's root saveToLibraryAsync throws; the supported legacy entry point
// provides write-only saving without querying the user's photo collection.
import { requestPermissionsAsync, saveToLibraryAsync } from 'expo-media-library/legacy';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

function requireExport(imagePath: string) {
  const root = new Directory(Paths.cache, 'paceball-exports');
  const relative = Paths.relative(root, imagePath);
  if (!imagePath.startsWith('file://') || !relative || relative === '..' ||
    relative.startsWith('../') || relative.startsWith('..\\') || Paths.isAbsolute(relative) ||
    !imagePath.endsWith('.png')) throw new Error('Select a Paceball PNG export.');
  const file = new File(imagePath);
  if (!file.exists || file.size === 0) throw new Error('The exported image is missing. Create it again.');
}

export async function saveExportToGallery(imagePath: string): Promise<void> {
  requireExport(imagePath);
  const permission = await requestPermissionsAsync(true, []);
  if (!permission.granted) {
    throw new Error(permission.canAskAgain
      ? 'Photo saving permission was denied. Try again to allow saving.'
      : 'Allow photo saving for Paceball in phone Settings, then try again.');
  }
  await saveToLibraryAsync(imagePath);
}

export async function shareExport(imagePath: string): Promise<void> {
  requireExport(imagePath);
  if (!await isAvailableAsync()) throw new Error('Sharing is not available on this device. Save to gallery instead.');
  await shareAsync(imagePath, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share your Paceball delivery' });
}
