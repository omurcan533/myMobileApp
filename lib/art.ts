import type { ImageSourcePropType } from 'react-native';
import type { Side } from './types';

export const art = {
  brand: require('../assets/brand/mascot-mark-v1.png') as ImageSourcePropType,
  bg: require('../assets/art/bg_jungle.jpg') as ImageSourcePropType,
  fox: require('../assets/art/mascot_fox.jpg') as ImageSourcePropType,
  raccoon: require('../assets/art/mascot_raccoon.jpg') as ImageSourcePropType,
  eagle: require('../assets/art/mascot_eagle.jpg') as ImageSourcePropType,
  bear: require('../assets/art/mascot_bear.jpg') as ImageSourcePropType,
  cat: require('../assets/art/mascot_cat.jpg') as ImageSourcePropType,
};

const originalAvatarOptions = [
  { id: 'fox', label: 'Tilki', source: art.fox },
  { id: 'raccoon', label: 'Rakun', source: art.raccoon },
  { id: 'eagle', label: 'Kartal', source: art.eagle },
  { id: 'bear', label: 'Ayı', source: art.bear },
  { id: 'cat', label: 'Kedi', source: art.cat },
] as const;
export const AVATAR_OPTIONS = [
  ...originalAvatarOptions,
  { id: 'panda', label: 'Panda', source: require('../assets/art/mascot_panda.jpg') as ImageSourcePropType },
  { id: 'rabbit', label: 'Tavşan', source: require('../assets/art/mascot_rabbit.jpg') as ImageSourcePropType },
  { id: 'wolf', label: 'Kurt', source: require('../assets/art/mascot_wolf.jpg') as ImageSourcePropType },
  { id: 'owl', label: 'Baykuş', source: require('../assets/art/mascot_owl.jpg') as ImageSourcePropType },
  { id: 'chameleon', label: 'Bukalemun', source: require('../assets/art/mascot_chameleon.jpg') as ImageSourcePropType },
  { id: 'tiger', label: 'Kaplan', source: require('../assets/art/mascot_tiger.jpg') as ImageSourcePropType },
  { id: 'penguin', label: 'Penguen', source: require('../assets/art/mascot_penguin.jpg') as ImageSourcePropType },
  { id: 'koala', label: 'Koala', source: require('../assets/art/mascot_koala.jpg') as ImageSourcePropType },
  { id: 'red_panda', label: 'Kızıl Panda', source: require('../assets/art/mascot_red_panda.jpg') as ImageSourcePropType },
  { id: 'lion', label: 'Aslan', source: require('../assets/art/mascot_lion.jpg') as ImageSourcePropType },
  { id: 'axolotl', label: 'Aksolotl', source: require('../assets/art/mascot_axolotl.jpg') as ImageSourcePropType },
  { id: 'capybara', label: 'Kapibara', source: require('../assets/art/mascot_capybara.jpg') as ImageSourcePropType },
  { id: 'otter', label: 'Su Samuru', source: require('../assets/art/mascot_otter.jpg') as ImageSourcePropType },
  { id: 'snow_leopard', label: 'Kar Leoparı', source: require('../assets/art/mascot_snow_leopard.jpg') as ImageSourcePropType },
  { id: 'toucan', label: 'Tukan', source: require('../assets/art/mascot_toucan.jpg') as ImageSourcePropType },
  { id: 'crocodile', label: 'Timsah', source: require('../assets/art/mascot_crocodile.jpg') as ImageSourcePropType },
  { id: 'elephant', label: 'Fil', source: require('../assets/art/mascot_elephant.jpg') as ImageSourcePropType },
  { id: 'frog', label: 'Kurbağa', source: require('../assets/art/mascot_frog.jpg') as ImageSourcePropType },
  { id: 'magpie', label: 'Saksağan', source: require('../assets/art/mascot_magpie.jpg') as ImageSourcePropType },
  { id: 'lynx', label: 'Vaşak', source: require('../assets/art/mascot_lynx.jpg') as ImageSourcePropType },
] as const;
export type AvatarId = (typeof AVATAR_OPTIONS)[number]['id'];
const AVATARS = originalAvatarOptions.map((option) => option.source);
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
