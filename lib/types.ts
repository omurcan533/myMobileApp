export type Side = 'A' | 'B';
export type Phase = 'lobby' | 'team_reveal' | 'question' | 'minigame' | 'building' | 'voting' | 'results';
export type Tier = 'base' | 'body' | 'roof';

export type GameMode = 'quick' | 'standard' | 'long';

export interface Room {
  id: string;
  code: string;
  host_user_id: string;
  mode: GameMode;
  phase: Phase;
  jokers_per_team: number;
  paused: boolean;
  paused_at: string | null;
  phase_started_at: string | null;
  phase_ends_at: string | null;
  midpoint_done: boolean;
  building_ready_a?: boolean;
  building_ready_b?: boolean;
  captain_rolls?: Record<Side, TeamDiceDuel> | null;
  captain_duel?: CaptainDuelState | null;
}

export interface CaptainDuelRoll {
  round: number;
  player_id: string;
  d1: number;
  d2: number;
  total: number;
  rolled_at: string;
}

export interface CaptainDuelState {
  started?: boolean;
  active_side: 'A' | 'B' | 'done';
  round: number;
  tied_player_ids: string[];
  turn_player_id: string | null;
  current_roll: CaptainDuelRoll | null;
  rolls: CaptainDuelRoll[];
  captains: Partial<Record<Side, string>>;
}

export interface DiceRollEntry {
  player_id: string;
  d1: number;
  d2: number;
  total: number;
}

export interface DiceRound {
  round: number;
  rolls: DiceRollEntry[];
  max_total: number;
  tied_player_ids: string[];
}

export interface TeamDiceDuel {
  rounds: DiceRound[];
  winner_player_id: string;
}

export interface Player {
  id: string;
  room_id: string;
  user_id: string;
  nickname: string;
  avatar_id?: string | null;
  team_side: Side | null;
  is_host: boolean;
  is_captain: boolean;
  is_architect: boolean;
  locked_until: string | null;
  joined_at: string;
}

export interface TeamState {
  room_id: string;
  side: Side;
  score: number;
  jokers_left: number;
  credits: number;
  creature_name: string | null;
  creature_title?: string | null;
}

export interface Round {
  id: string;
  room_id: string;
  idx: number;
  tier: Tier;
  kind: 'anagram' | 'riddle' | 'social';
  prompt: string;
  hints: string[];
  piece_id: string;
  status: 'pending' | 'open' | 'resolved';
  opens_at: string | null;
  closes_at: string | null;
  winner_side: Side | null;
  revealed_answer: string | null;
  resolved_at: string | null;
  answer_mask: string | null;
}

export interface RoundReveal {
  id: string;
  round_id: string;
  room_id: string;
  side: Side;
  pos: number;
  letter: string;
}

export interface Answer {
  id: string;
  round_id: string;
  player_id: string;
  side: Side;
  body: string;
  is_final: boolean;
  is_correct: boolean | null;
  created_at: string;
}

export interface Piece {
  id: string;
  slug: string;
  name_tr: string;
  category: string;
  tier: Tier;
  emoji: string;
}

export interface TeamPiece {
  id: string;
  room_id: string;
  side: Side;
  piece_id: string;
  round_id: string | null;
  source: 'question' | 'steal' | 'joker' | 'minigame';
}

export type MinigameKind = 'reflex' | 'social_guess' | 'math_guess' | 'memory';

export interface Minigame {
  id: string;
  room_id: string;
  kind: MinigameKind;
  prompt: string | null;
  target_num?: number | null;
  status: 'pending' | 'live' | 'done';
  starts_at: string | null;
  winner_side: Side | null;
  resolved_at: string | null;
}

export interface MinigameEntry {
  id: string;
  minigame_id: string;
  player_id: string;
  target_player_id: string | null;
  reaction_ms: number | null;
  guess_num?: number | null;
}

export interface CanvasItem {
  id: string;
  room_id: string;
  side: Side;
  team_piece_id: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flip_x: boolean;
  z_index: number;
}

export interface Vote {
  id: string;
  room_id: string;
  voter_id: string;
  voted_side: Side;
}

export interface RoomData {
  room: Room;
  players: Player[];
  teams: TeamState[];
  rounds: Round[];
  answers: Answer[];
  teamPieces: TeamPiece[];
  minigames: Minigame[];
  entries: MinigameEntry[];
  canvas: CanvasItem[];
  votes: Vote[];
  reveals: RoundReveal[];
}

export interface Ctx {
  data: RoomData;
  me: Player;
  catalog: Record<string, Piece>;
  onLeave: () => void;
  exitRoom: () => Promise<void>;
}

export interface GameResults {
  official_winner: Side | null;
  funny_winner: Side | null;
  teams: Record<Side, { score: number; pieces: number; funny_votes: number; creature_name: string | null; creature_title?: string | null }>;
}
