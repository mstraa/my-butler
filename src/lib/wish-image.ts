import { Directory, File, Paths } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

import type { WishSource } from '@/db/wishes';

/**
 * Photo (appareil) ou capture (galerie) pour une envie : recadrée, puis copiée dans les documents
 * de l'app pour survivre au vidage du cache. Renvoie null si l'utilisateur annule ou refuse l'accès.
 */
export async function pickWishImage(from: 'camera' | 'library'): Promise<{ uri: string; source: WishSource } | 'denied' | null> {
  const perm = from === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return 'denied';
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: 0.7 };
  const res = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (res.canceled || !res.assets?.[0]) return null;
  return { uri: await saveWishImage(res.assets[0].uri), source: from === 'camera' ? 'photo' : 'screen' };
}

/** Copie une image (cache du sélecteur, image partagée par une autre app) dans les documents de l'app. */
export async function saveWishImage(uri: string, mimeType?: string | null) {
  const src = new File(uri);
  const dir = new Directory(Paths.document, 'envies');
  if (!dir.exists) dir.create({ intermediates: true });
  const fromMime = mimeType?.match(/^image\/(png|webp|gif|heic)/i)?.[1];
  const ext = src.name.match(/\.(jpe?g|png|webp|gif|heic)$/i)?.[0] ?? (fromMime ? `.${fromMime.toLowerCase()}` : '.jpg');
  const dest = new File(dir, `envie-${Date.now()}${ext}`);
  if (uri.startsWith('content:')) {
    // Adresse Android (partage, galerie) : seule l'ancienne API sait la lire.
    await copyAsync({ from: uri, to: dest.uri });
  } else {
    await src.copy(dest);
  }
  return dest.uri;
}
