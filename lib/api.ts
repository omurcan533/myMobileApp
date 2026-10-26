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
  botSurvivorStep: (room:string)=>rpc<boolean>('bot_survivor_step',{p_room:room}),
  advanceTestBots: (room:string)=>rpc<{action:string;count?:number}>('advance_test_bots',{p_room:room}),
  setTestBots: (room:string,count:number)=>rpc<number>('set_test_bots',{p_room:room,p_count:count}),
  testBotsVote: (event:string)=>rpc<number>('test_bots_vote',{p_event:event}),
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
  friendMemoryLeaderboard: (room:string)=>rpc<{player_id:string;nickname:string;correct:number;attempts:number}[]>('friend_memory_leaderboard',{p_room:room}),
  partyEventCurrent: (room:string)=>rpc<any>('party_event_current',{p_room:room}),
  partyEventStart: (room:string,kind:string,prompt:string)=>rpc<string>('party_event_start',{p_room:room,p_kind:kind,p_prompt:prompt}),
  partyEventVote: (event:string,target:string|null,answer:string|null=null)=>rpc<void>('party_event_vote',{p_event:event,p_target:target,p_answer:answer}),
  partyEventFinish: (event:string)=>rpc<void>('party_event_finish',{p_event:event}),
  partyTugPull: (event:string,force:number)=>rpc<{accepted:boolean;force:number}>('party_tug_pull',{p_event:event,p_force:force}),
  partyTugState: (event:string)=>rpc<{a:number;b:number;players:{nickname:string;side:string;force:number}[]}|null>('party_tug_state',{p_event:event}),
  partyTugReplay: (event:string)=>rpc<string>('party_tug_replay',{p_event:event}),
  minigameTugState: (id:string)=>rpc<{a:number;b:number}|null>('minigame_tug_state',{p_minigame:id}),
  minigameTugPull: (id:string,force:number)=>rpc<{accepted:boolean;force:number}>('minigame_tug_pull',{p_minigame:id,p_force:force}),
  minigameTugDuration: (id:string,seconds:number)=>rpc<void>('minigame_tug_duration',{p_minigame:id,p_seconds:seconds}),
  minigameTugReplay: (id:string,seconds:number)=>rpc<string>('minigame_tug_replay',{p_minigame:id,p_seconds:seconds}),
  minigameTugContinue: (id:string)=>rpc<void>('minigame_tug_continue',{p_minigame:id}),
  partyLastAgeEvent: (room:string)=>rpc<string|null>('party_last_age_event',{p_room:room}),
  partyAgeResults: (event:string)=>rpc<{player_id:string;correct:number;total:number}[]>('party_age_results',{p_event:event}),
  saveFriendFacts: (room: string, facts: Record<string,string>) => rpc<void>('save_friend_facts',{p_room:room,p_facts:facts}),
  friendFactProgress: (room: string) => rpc<{player_id:string;count:number}[]>('friend_fact_progress',{p_room:room}),
  friendFactReveal: (room: string) => rpc<{player_id:string;question_key:string;answer:string}[]>('friend_fact_reveal',{p_room:room}),
  friendQuizQuestion: (mg: string) => rpc<{target_id:string;question_key:string;answered:boolean;correct:boolean|null}|null>('friend_quiz_question',{p_minigame:mg}),
  submitFriendGuess: (mg: string,guess: string) => rpc<boolean>('submit_friend_guess',{p_minigame:mg,p_guess:guess}),
  submitSongAnswer: (mg: string, answer: string) => rpc<boolean>('submit_song_answer', { p_minigame: mg, p_answer: answer }),
  submitLineConnect: (mg: string, paths: number[][][]) => rpc<boolean>('submit_line_connect', { p_minigame: mg, p_paths: paths }),
  minigameEntry: (mg: string, target?: string, guess?: number) => {
    const params: Record<string, unknown> = { p_minigame: mg, p_target: target ?? null, p_guess: guess ?? null };
    return rpc<void>('submit_minigame_entry', params);
  },
  castVote: (room: string, side: Side) => rpc<void>('cast_vote', { p_room: room, p_side: side }),
  voteArchitect: (room: string, candidate: string) =>
    rpc<boolean>('vote_architect', { p_room: room, p_candidate: candidate }),
  matchStory: (room: string) => rpc<{at:string;type:'round'|'minigame';data:any}[]>('party_match_story',{p_room:room}),
  results: (room: string) => rpc<GameResults>('get_results', { p_room: room }),
};
