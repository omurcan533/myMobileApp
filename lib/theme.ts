import type { Side } from './types';

export const colors = {
  bg: '#0A0A1F',
  bg2: '#17174A',
  surface: '#1C1C4A',
  surface2: '#2A2A6E',
  text: '#FFFFFF',
  muted: '#A5A5D6',
  teamA: '#FF4D8D',
  teamB: '#2DE2E6',
  yellow: '#FFD93D',
  purple: '#7C5CFF',
  green: '#3DDC84',
  red: '#FF5C6C',
};

export const radius = { sm: 12, md: 20, lg: 28 };

export const teamColor = (s: Side | null | undefined) =>
  s === 'A' ? colors.teamA : s === 'B' ? colors.teamB : colors.muted;

export const teamName = (s: Side | null | undefined) => (s ? `Takım ${s}` : 'Takımsız');

export const tierLabel = { base: 'Temel Kat', body: 'Gövde Katı', roof: 'Çatı Katı' } as const;
