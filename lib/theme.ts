import type { Side } from './types';

/**
 * Tasarım sistemi — "Neon Arena" teması.
 * Fantasy-Football kart dili (koyu, neon cyan/mor/magenta glow, gradyan kartlar) +
 * Tap-2-Earn oyun ekonomisi dili (camsı paneller, altın/elmas rozetler, parlak butonlar).
 */
export const colors = {
  // Zemin
  bg: '#050A14',
  bg2: '#0A1426',
  surface: '#0E1A30',
  surface2: '#14233F',
  surfaceElevated: '#1A2D4E',
  glass: 'rgba(16, 30, 54, 0.72)',
  glassStrong: 'rgba(12, 22, 42, 0.88)',
  inset: 'rgba(3, 8, 18, 0.62)',

  // Çizgiler
  border: 'rgba(120, 190, 255, 0.14)',
  borderLight: 'rgba(120, 200, 255, 0.28)',

  // Metin
  text: '#FFFFFF',
  textSoft: '#D6E4FA',
  muted: '#8FA3C4',
  subtle: '#5C7194',

  // Takımlar
  teamA: '#FF6B8B',
  teamB: '#38D6FF',

  // Neon aksanlar
  cyan: '#22E3FF',
  accent: '#3B9BFF',
  violet: '#8B5CF6',
  magenta: '#FF4FD8',
  mint: '#34F5B0',
  green: '#22D89A',
  yellow: '#FFC83D',
  gold: '#FFB52E',
  orange: '#FF8A3D',
  red: '#FF4D6D',
  purple: '#8B5CF6',
};

/** Gradyan paletleri (LinearGradient için, her biri 2 durak). */
export const gradients = {
  primary: ['#2FE0FF', '#3B7BFF'] as const,
  success: ['#6CFFC4', '#16C784'] as const,
  danger: ['#FF7A93', '#E8344F'] as const,
  gold: ['#FFE066', '#FF9F1C'] as const,
  violet: ['#B28CFF', '#6D3DF0'] as const,
  magenta: ['#FF7AE6', '#B53DF0'] as const,
  card: ['rgba(30, 52, 92, 0.9)', 'rgba(10, 20, 40, 0.92)'] as const,
  screen: ['#050A14', '#0A1426'] as const,
  teamA: ['#FF8FA8', '#E8344F'] as const,
  teamB: ['#5EE6FF', '#2A7BFF'] as const,
};

export const radius = { xs: 8, sm: 12, md: 18, lg: 24, xl: 32, full: 9999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 32 };

/** Yazı tipleri: başlık/sayılar için Outfit, metin için Sora. */
export const fonts = {
  body: 'Sora_500Medium',
  bodySemi: 'Sora_600SemiBold',
  bodyBold: 'Sora_700Bold',
  display: 'Outfit_700Bold',
  displayHeavy: 'Outfit_800ExtraBold',
  displayBlack: 'Outfit_900Black',
};

export const teamColor = (s: Side | null | undefined) =>
  s === 'A' ? colors.teamA : s === 'B' ? colors.teamB : colors.muted;

export const teamGradient = (s: Side | null | undefined) =>
  s === 'A' ? gradients.teamA : s === 'B' ? gradients.teamB : gradients.card;

export const teamName = (s: Side | null | undefined) => (s ? `Takım ${s}` : 'Takımsız');

export const tierLabel = { base: 'Temel Kat', body: 'Gövde Katı', roof: 'Çatı Katı' } as const;

/** Renk + alfa yardımcıları (hex → rgba). */
export const alpha = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
