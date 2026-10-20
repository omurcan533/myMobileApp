import type { Minigame, Room, Round } from './types';

/** Açık tur, yoksa en son çözülen tur. */
export const currentRound = (rounds: Round[]): Round | undefined =>
  rounds.find((r) => r.status === 'open') ??
  [...rounds].filter((r) => r.status === 'resolved').sort((a, b) => b.idx - a.idx)[0];

/** Oyun duraklatıldıysa saat o anda donmuş sayılır. */
export const effNow = (room: Room, now: number) =>
  room.paused && room.paused_at ? Date.parse(room.paused_at) : now;

export const secondsLeft = (iso: string | null | undefined, now: number) =>
  iso ? Math.max(0, (Date.parse(iso) - now) / 1000) : 0;

export const latestMinigame = (ms: Minigame[]): Minigame | undefined => ms[ms.length - 1];

export const byId = <T extends { id: string }>(list: T[]) =>
  Object.fromEntries(list.map((x) => [x.id, x])) as Record<string, T>;
