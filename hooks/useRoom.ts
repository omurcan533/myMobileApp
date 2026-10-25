import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type {
  Answer, CanvasItem, Minigame, MinigameEntry, Player, Room, RoomData, Round, RoundReveal, TeamPiece, TeamState, Vote,
} from '../lib/types';

/**
 * Odanın tüm durumunu yükler ve Realtime ile canlı tutar.
 * Her değişiklikte (debounce ile) yeniden çeker; ayrıca ağ kopmalarına karşı
 * 6 sn'lik yedek yoklama yapar. Veri küçük olduğu için bu yaklaşım yeterlidir.
 */
export function useRoom(roomId: string) {
  const [data, setData] = useState<RoomData | null>(null);
  const [gone, setGone] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    const q = <T,>(table: string, order?: string) => {
      const b = supabase.from(table).select('*');
      return (table === 'rooms' ? b.eq('id', roomId) : b.eq('room_id', roomId)).order(order ?? 'id') as unknown as Promise<{
        data: T[] | null;
      }>;
    };
    const [rooms, players, teams, rounds, answers, teamPieces, minigames, canvas, votes, reveals] = await Promise.all([
      q<Room>('rooms'),
      q<Player>('players', 'joined_at'),
      q<TeamState>('room_teams', 'side'),
      q<Round>('room_rounds', 'idx'),
      q<Answer>('round_answers', 'created_at'),
      q<TeamPiece>('team_pieces', 'created_at'),
      q<Minigame>('room_minigames', 'created_at'),
      q<CanvasItem>('canvas_items', 'z_index'),
      q<Vote>('votes', 'created_at'),
      q<RoundReveal>('round_reveals', 'created_at'),
    ]);
    if (!alive.current) return;
    const room = rooms.data?.[0];
    if (!room) {
      setGone(true);
      return;
    }
    const ids = (minigames.data ?? []).map((m) => m.id);
    let entries: MinigameEntry[] = [];
    if (ids.length) {
      const res = await supabase.from('minigame_entries').select('*').in('minigame_id', ids);
      entries = (res.data as MinigameEntry[]) ?? [];
    }
    if (!alive.current) return;
    setData({
      room,
      players: players.data ?? [],
      teams: teams.data ?? [],
      rounds: rounds.data ?? [],
      answers: answers.data ?? [],
      teamPieces: teamPieces.data ?? [],
      minigames: minigames.data ?? [],
      entries,
      canvas: canvas.data ?? [],
      votes: votes.data ?? [],
      reveals: reveals.data ?? [],
    });
  }, [roomId]);

  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 120);
    };
    load();

    const ch = supabase.channel(`room-${roomId}`);
    for (const table of ['players', 'room_teams', 'room_rounds', 'round_answers', 'team_pieces', 'canvas_items', 'votes', 'round_reveals']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `room_id=eq.${roomId}` }, schedule);
    }
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, schedule);
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'minigame_entries' }, schedule);
    ch.subscribe();

    const poll = setInterval(load, 6000);
    return () => {
      alive.current = false;
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      supabase.removeChannel(ch);
    };
  }, [roomId, load]);

  return { data, gone, refresh: load };
}
