import type { Player, RoomData } from './types';

/** Only lobby, pre-play briefings and completed-round results are safe to edit. */
export function canManagePlayers(data: RoomData): boolean {
  if (data.room.closed_at) return false;
  if (data.room.phase === 'lobby') return true;
  if (data.room.phase === 'question') {
    const open = data.rounds.find(round => round.status === 'open');
    return open ? !open.opens_at : data.rounds.some(round => round.status === 'resolved');
  }
  if (data.room.phase === 'minigame') {
    const game = data.minigames[data.minigames.length - 1];
    return !!game && (game.status === 'done' || game.status === 'live' && !game.starts_at);
  }
  return false;
}

export function removalClosesRoom(data: RoomData, target: Player): boolean {
  return data.room.phase !== 'lobby' && target.team_side !== null &&
    data.players.filter(player => player.team_side === target.team_side).length <= 1;
}
