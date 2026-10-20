import { supabase } from './supabase';
import type { GameResults, Side } from './types';

const MESSAGES: Record<string, string> = {
  not_authenticated: 'Oturum açılamadı, tekrar dene.',
  room_not_found: 'Bu kodla bir oda bulunamadı.',
  nickname_taken: 'Bu takma ad odada alınmış.',
  invalid_nickname: 'Takma ad 1-20 karakter olmalı.',
  game_in_progress: 'Oyun çoktan başlamış.',
  room_full: 'Oda dolu (en fazla 12 kişi).',
  need_two_players: 'Başlamak için en az 2 kişi gerekli.',
  not_host: 'Bunu sadece oda kurucusu yapabilir.',
  not_captain: 'Bunu sadece kaptan yapabilir.',
  locked: 'Biraz bekle, yanlış cevap cezan sürüyor.',
  round_closed: 'Tur kapandı.',
  game_paused: 'Oyun duraklatıldı.',
  too_early: 'Çok erken!',
  no_jokers_left: 'Jokerin kalmadı.',
  joker_not_allowed: 'Joker şu an kullanılamaz.',
  own_team_vote: 'Kendi takımına oy veremezsin.',
  voting_closed: 'Oylama kapandı.',
  no_questions: 'Soru havuzu boş.',
  invalid_answer: 'Cevap 1-80 karakter olmalı.',
};

export class GameError extends Error {
  code: string;
  constructor(raw: string) {
    const code = Object.keys(MESSAGES).find((k) => raw.includes(k)) ?? 'unknown';
    super(MESSAGES[code] ?? 'Bir şeyler ters gitti.');
    this.code = code;
  }
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new GameError(error.message);
  return data as T;
}

export const api = {
  createRoom: (nick: string, mode: 'quick' | 'long') =>
    rpc<{ room_id: string; code: string }>('create_room', { p_nickname: nick, p_mode: mode }),
  joinRoom: (code: string, nick: string) =>
    rpc<{ room_id: string; code: string }>('join_room', { p_code: code, p_nickname: nick }),
  startGame: (room: string) => rpc<void>('start_game', { p_room: room }),
  advance: (room: string) => rpc<{ phase: string; advanced: boolean }>('advance_game', { p_room: room }),
  submitAnswer: (round: string, body: string) =>
    rpc<{ correct?: boolean; locked_until?: string; suggested?: boolean }>('submit_answer', { p_round: round, p_body: body }),
  submitFinal: (round: string, body: string) =>
    rpc<{ correct: boolean }>('submit_final', { p_round: round, p_body: body }),
  playJoker: (room: string) => rpc<string>('use_joker', { p_room: room }),
  togglePause: (room: string) => rpc<boolean>('toggle_pause', { p_room: room }),
  setCreatureName: (room: string, name: string) => rpc<void>('set_creature_name', { p_room: room, p_name: name }),
  minigameEntry: (mg: string, target?: string) =>
    rpc<void>('submit_minigame_entry', { p_minigame: mg, p_target: target ?? null }),
  castVote: (room: string, side: Side) => rpc<void>('cast_vote', { p_room: room, p_side: side }),
  voteArchitect: (room: string, candidate: string) =>
    rpc<boolean>('vote_architect', { p_room: room, p_candidate: candidate }),
  results: (room: string) => rpc<GameResults>('get_results', { p_room: room }),
};
