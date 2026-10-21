import AsyncStorage from '@react-native-async-storage/async-storage';

/** Cihazda tutulan basit oyuncu profili (seviye / istatistik). Backend'e dokunmaz. */
export interface Profile {
  games: number;
  wins: number;
  lastRoom: string | null;
}

const KEY = 'profile:v1';
const EMPTY: Profile = { games: 0, wins: 0, lastRoom: null };

export async function getProfile(): Promise<Profile> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Profile>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Oyun bittiğinde bir kez çağrılır (aynı oda iki kez sayılmaz). */
export async function recordGame(roomId: string, won: boolean): Promise<void> {
  const p = await getProfile();
  if (p.lastRoom === roomId) return;
  const next: Profile = { games: p.games + 1, wins: p.wins + (won ? 1 : 0), lastRoom: roomId };
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
}

/** Her 200 XP (~3-4 oyun) = 1 seviye. XP ilerlemesi 0..1. */
export function levelOf(p: Profile) {
  const xp = p.games * 50 + p.wins * 30;
  const per = 200;
  return { level: 1 + Math.floor(xp / per), progress: (xp % per) / per, xp };
}
