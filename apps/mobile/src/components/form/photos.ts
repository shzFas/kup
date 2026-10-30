import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { api } from '@/lib/api';

export const MAX_PHOTOS = 20;
const MAX_SIDE = 2560;

export interface PhotoItem {
  key: string;
  uri: string; // local file or absolute remote URL, for the thumbnail
  id?: string; // server photo id once uploaded
  status: 'uploading' | 'done' | 'error';
}

/** Photo id from a listing photo URL: "/media/photos/ph_123.jpg" → "ph_123". */
export function photoIdFromUrl(url: string): string {
  const base = url.split('?')[0].split('/').pop() ?? url;
  return base.replace(/\.[a-z0-9]+$/i, '').replace(/_t$/, '');
}

/** Ask for the source and return picked assets (images only). */
export async function pickPhotos(remaining: number): Promise<ImagePicker.ImagePickerAsset[]> {
  const source = await new Promise<'library' | 'camera' | null>((resolve) =>
    Alert.alert('Добавить фото', undefined, [
      { text: 'Выбрать из галереи', onPress: () => resolve('library') },
      { text: 'Сделать снимок', onPress: () => resolve('camera') },
      { text: 'Отмена', style: 'cancel', onPress: () => resolve(null) },
    ]),
  );
  if (!source) return [];
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Нет доступа к камере', 'Разрешите доступ в настройках телефона.');
      return [];
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    return r.canceled ? [] : r.assets;
  }
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    orderedSelection: true,
    quality: 0.85,
  });
  return r.canceled ? [] : r.assets.slice(0, remaining);
}

/**
 * Backend accepts only jpeg/png/webp: always re-encode to JPEG (this also converts HEIC)
 * and downscale to 2560px on the long side.
 */
export async function toJpeg(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const ctx = ImageManipulator.manipulate(asset.uri);
  const { width: w, height: h } = asset;
  if (w && h && Math.max(w, h) > MAX_SIDE) ctx.resize(w >= h ? { width: MAX_SIDE } : { height: MAX_SIDE });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return out.uri;
}

export async function uploadJpeg(uri: string) {
  return api.uploadPhoto({ uri, name: 'photo.jpg', type: 'image/jpeg' });
}
