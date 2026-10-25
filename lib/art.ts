import type { ImageSourcePropType } from 'react-native';
import type { Side } from './types';

export const art = {
  bg: require('../assets/art/bg_jungle.jpg') as ImageSourcePropType,
  fox: require('../assets/art/mascot_fox.jpg') as ImageSourcePropType,
  raccoon: require('../assets/art/mascot_raccoon.jpg') as ImageSourcePropType,
  eagle: require('../assets/art/mascot_eagle.jpg') as ImageSourcePropType,
  bear: require('../assets/art/mascot_bear.jpg') as ImageSourcePropType,
  cat: require('../assets/art/mascot_cat.jpg') as ImageSourcePropType,
};

export const AVATAR_OPTIONS = [
  { id: 'fox', label: 'Tilki', source: art.fox },
  { id: 'raccoon', label: 'Rakun', source: art.raccoon },
  { id: 'eagle', label: 'Kartal', source: art.eagle },
  { id: 'bear', label: 'Ayı', source: art.bear },
  { id: 'cat', label: 'Kedi', source: art.cat },
] as const;
export type AvatarId = (typeof AVATAR_OPTIONS)[number]['id'];
const AVATARS = AVATAR_OPTIONS.map((option) => option.source);
export function avatarById(id: string | null | undefined): ImageSourcePropType | null {
  return AVATAR_OPTIONS.find((option) => option.id === id)?.source ?? null;
}

/** Oyuncu adından kararlı (herkeste aynı) maskot seçer. */
export function avatarFor(name: string | null | undefined, selected?: string | null): ImageSourcePropType {
  const chosen = avatarById(selected);
  if (chosen) return chosen;
  const s = (name ?? '?').toLocaleLowerCase('tr-TR');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

/** Takım maskotları: A = Tilki, B = Rakun. */
export function teamMascot(side: Side | null | undefined): ImageSourcePropType {
  return side === 'B' ? art.raccoon : art.fox;
}
