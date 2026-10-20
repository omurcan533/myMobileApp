import type { Side } from './types';

export const colors = {
  bg: '#080B12',
  bg2: '#0E131F',
  surface: '#101521',
  surface2: '#161D2C',
  surfaceElevated: '#1A2336',
  border: '#1C2436',
  borderLight: '#242F46',
  text: '#FFFFFF',
  muted: '#8E9BAE',
  subtle: '#5A6679',
  teamA: '#FB7185', // Midas zarif mercan gülü
  teamB: '#38BDF8', // Midas modern gök mavisi
  yellow: '#F59E0B',
  purple: '#8B5CF6',
  green: '#10B981',
  red: '#F43F5E',
  accent: '#2B66FF', // Midas imza elektrik mavisi
};

export const radius = { sm: 10, md: 16, lg: 24, full: 9999 };

export const teamColor = (s: Side | null | undefined) =>
  s === 'A' ? colors.teamA : s === 'B' ? colors.teamB : colors.muted;

export const teamName = (s: Side | null | undefined) => (s ? `Takım ${s}` : 'Takımsız');

export const tierLabel = { base: 'Temel Kat', body: 'Gövde Katı', roof: 'Çatı Katı' } as const;
