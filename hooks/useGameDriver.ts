import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { serverNow } from '../lib/serverTime';
import { latestMinigame } from '../lib/selectors';
import type { RoomData } from '../lib/types';

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : 0);

/** İstemci tarafında "şimdi ilerletme zamanı mı?" kararı. Sunucu yine de doğrular (idempotent). */
function shouldAdvance(d: RoomData, now: number, myVoted: boolean, lastCall: number): boolean {
  const { room } = d;
  if (room.paused || room.phase === 'lobby' || room.phase === 'team_reveal' || room.phase === 'results') return false;

  switch (room.phase) {
    case 'question': {
      const open = d.rounds.find((r) => r.status === 'open');
      if (open) {
        if (!open.opens_at || !open.closes_at) return false;
        return now >= ms(open.closes_at) + 300;
      }
      return false;
    }
    case 'minigame': {
      const mg = latestMinigame(d.minigames);
      if (!mg) return false;
      if (mg.status === 'live') {
        if (!mg.starts_at || !d.room.phase_ends_at) return false;
        const entries = d.entries.filter((e) => e.minigame_id === mg.id).length;
        return (
          now >= ms(room.phase_ends_at) + 300 ||
          entries >= d.players.length ||
          (mg.kind === 'math_guess' && entries >= 2)
        );
      }
      return false;
    }
    case 'building':
      return now >= ms(room.phase_ends_at) + 300;
    case 'voting':
      // Herkesin oy verdiğini istemci göremez (oylar gizli); oy verdiysen düzenli yokla.
      return now >= ms(room.phase_ends_at) + 300 || (myVoted && now - lastCall > 2500);
    default:
      return false;
  }
}

/**
 * Faz ilerletici: her cihaz çalıştırır, host'a bağımlılık yoktur. Rastgele küçük bir
 * gecikme ile çağrılar dağıtılır; advance_game sunucuda kilitli ve idempotent olduğu
 * için aynı anda birden çok çağrı zararsızdır.
 */
export function useGameDriver(data: RoomData | null, myPlayerId: string | undefined) {
  const ref = useRef(data);
  ref.current = data;
  const busy = useRef(false);
  const lastCall = useRef(0);

  useEffect(() => {
    const id = setInterval(async () => {
      const d = ref.current;
      if (!d || busy.current) return;
      const myVoted = d.votes.some((v) => v.voter_id === myPlayerId);
      if (!shouldAdvance(d, serverNow(), myVoted, lastCall.current)) return;

      busy.current = true;
      try {
        await new Promise((r) => setTimeout(r, Math.random() * 600));
        lastCall.current = Date.now();
        await api.advance(d.room.id);
      } catch {
        /* ağ hatası: bir sonraki turda tekrar denenir */
      } finally {
        busy.current = false;
      }
    }, 700);
    return () => clearInterval(id);
  }, [myPlayerId]);
}
