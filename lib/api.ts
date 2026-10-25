import { supabase } from './supabase';
import type { GameMode, GameResults, Side } from './types';

const MESSAGES: Record<string, string> = {
  not_authenticated: 'Oturum açılamadı, tekrar dene.',
  room_not_found: 'Bu kodla bir oda bulunamadı.',
  nickname_taken: 'Bu takma ad odada alınmış.',
  invalid_nickname: 'Takma ad 1-20 karakter olmalı.',
  game_in_progress: 'Oyun çoktan başlamış.',
  room_full: 'Oda dolu (en fazla 12 kişi).',
  need_two_players: 'Başlamak için en az 2 kişi gerekli.',
  not_host: 'Bunu sadece oda kurucusu yapabilir.',
  locked: 'Biraz bekle, yanlış cevap cezan sürüyor.',
  round_closed: 'Tur kapandı.',
  game_paused: 'Oyun duraklatıldı.',
  too_early: 'Çok erken!',
  no_jokers_left: 'Jokerin kalmadı.',
  joker_not_allowed: 'Joker şu an kullanılamaz.',
  own_team_vote: 'Kendi takımına oy veremezsin.',
  voting_closed: 'Oylama kapandı.',
  no_questions: 'Soru havuzu boş.',
  teams_not_assigned: 'Önce takım dağılımı tamamlanmalı.',
  team_reveal_in_progress: 'Takım tanıtımı henüz tamamlanmadı.',
  invalid_answer: 'Cevap 1-80 karakter olmalı.',
  no_credits: 'Krediniz bitti.',
  no_more_letters: 'Açılabilecek harf kalmadı.',
  not_building_phase: 'İnşa aşaması tamamlanmış.',
  not_architect: 'İnşaat hazır butonuna sadece Mimar basabilir.',
  not_your_turn: 'Sıra sende değil!',
  duel_finished: 'Zar düellosu tamamlandı.',
  captain_duel_in_progress: 'Önce kaptanlık zar düellosu tamamlanmalı.',
  game_not_live: 'Parkur henüz başlamadı veya süresi doldu.',
  not_captain: 'Fayansları yalnızca takım kaptanı seçebilir.',
  run_finished: 'Parkur zaten tamamlandı.',
  missing_survivor_board: 'Parkur verisi bulunamadı. Yeni oyun başlat.',
  invalid_survivor_path: 'Parkur verisi hatalı. Yeni oyun başlat.',
};

export class GameError extends Error {
  code: string;
  constructor(raw: string) {
    const code = Object.keys(MESSAGES).find((k) => raw.includes(k)) ?? 'unknown';
    super(MESSAGES[code] ?? raw);
    this.code = code;
  }
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new GameError(error.message);
  return data as T;
}

export const api = {
  createRoom: (nick: string, mode: GameMode = 'standard') =>
    rpc<{ room_id: string; code: string }>('create_room', { p_nickname: nick, p_mode: mode }),
  joinRoom: (code: string, nick: string) =>
    rpc<{ room_id: string; code: string }>('join_room', { p_code: code, p_nickname: nick }),
  setPlayerAvatar: (room: string, avatar: string) => rpc<void>('set_player_avatar', { p_room: room, p_avatar: avatar }),
  setRoomGames: (room: string, games: string[]) => rpc<void>('set_room_games', { p_room: room, p_games: games }),
  unlockRoomGames: (room: string) => rpc<void>('unlock_room_games', { p_room: room }),
  assignTeams: (room: string) => rpc<void>('assign_teams', { p_room: room }),
  shuffleTeams: (room: string) => rpc<void>('shuffle_teams', { p_room: room }),
  startCaptainDuel: (room: string) => rpc<any>('start_captain_duel', { p_room: room }),
  rollCaptainDice: (room: string) => rpc<any>('roll_captain_dice', { p_room: room }),
  leaveRoom: (room: string) => rpc<void>('leave_room', { p_room: room }),
  startGame: (room: string) => rpc<void>('start_game', { p_room: room }),
  advance: (room: string) => rpc<{ phase: string; advanced: boolean }>('advance_game', { p_room: room }),
  advanceHost: (room: string) => rpc<{ phase: string; advanced: boolean }>('advance_game_host', { p_room: room }),
  confirmBriefing: (room: string) => rpc<void>('confirm_briefing', { p_room: room }),
  submitAnswer: (round: string, body: string) =>
    rpc<{ correct?: boolean; locked_until?: string; suggested?: boolean }>('submit_answer', { p_round: round, p_body: body }),
  submitFinal: (round: string, body: string) =>
    rpc<{ correct: boolean }>('submit_final', { p_round: round, p_body: body }),
  playJoker: (room: string) => rpc<string>('use_joker', { p_room: room }),
  buyLetter: (round: string) => rpc<{ pos: number; letter: string }>('buy_letter', { p_round: round }),
  togglePause: (room: string) => rpc<boolean>('toggle_pause', { p_room: room }),
  setBuildingReady: (room: string, ready = true) =>
    rpc<{ ready_a: boolean; ready_b: boolean; phase: string }>('set_building_ready', { p_room: room, p_ready: ready }),
  setCreatureName: (room: string, name: string, title?: string | null) => {
    const params: Record<string, unknown> = { p_room: room, p_name: name };
    if (title) params.p_title = title;
    return rpc<void>('set_creature_name', params);
  },
  survivorReadMessages: (mg:string) => rpc<{id:number;nickname:string;body:string}[]>('survivor_read_messages',{p_minigame:mg}),
  survivorSendMessage: (mg:string,body:string) => rpc<void>('survivor_send_message',{p_minigame:mg,p_body:body}),
  survivorPreview: (mg: string) => rpc<{greens:number[];whiteRow:number;whiteCol:number}|null>('survivor_preview', {p_minigame:mg}),
  survivorChoose: (mg: string,col: number) => rpc<{row:number;retry:boolean;failed:boolean;lastOutcome:string}>('survivor_choose',{p_minigame:mg,p_col:col}),
  submitLineConnect: (mg: string, paths: number[][][]) => rpc<boolean>('submit_line_connect', { p_minigame: mg, p_paths: paths }),
  minigameEntry: (mg: string, target?: string, guess?: number) => {
    const params: Record<string, unknown> = { p_minigame: mg, p_target: target ?? null, p_guess: guess ?? null };
    return rpc<void>('submit_minigame_entry', params);
  },
  castVote: (room: string, side: Side) => rpc<void>('cast_vote', { p_room: room, p_side: side }),
  voteArchitect: (room: string, candidate: string) =>
    rpc<boolean>('vote_architect', { p_room: room, p_candidate: candidate }),
  results: (room: string) => rpc<GameResults>('get_results', { p_room: room }),
};
