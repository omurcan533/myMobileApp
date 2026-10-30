import type { GameResults, Player, RoomData } from './types';

type FriendScore = {player_id:string;correct:number;attempts:number};
type AgeScore = {player_id:string;correct:number;total:number};

export function shortMatchRecap(results: GameResults, en = false): string {
  const score = `A ${results.teams.A.score}–${results.teams.B.score} B`;
  if (!results.official_winner) return en ? `${score}: A tie; even the trophy refused to pick a side.` : `${score}: Berabere; kupa bile taraf tutamadı.`;
  const winner = results.official_winner;
  const loser = winner === 'A' ? 'B' : 'A';
  return en ? `${score}: Team ${winner} takes the trophy, Team ${loser} starts collecting rematch excuses.`
    : `${score}: Takım ${winner} kupayı aldı, Takım ${loser} rövanş bahanesi arıyor.`;
}

/** One short, playful observation per person; only recorded individual actions count. */
export function shortPlayerQuip(player: Player, index: number, data: RoomData, friends: FriendScore[], ages: AgeScore[], en = false): string {
  const answers = data.answers.filter(answer => answer.player_id === player.id);
  const correct = answers.filter(answer => answer.is_correct === true).length;
  const wrong = answers.filter(answer => answer.is_correct === false).length;
  if (wrong > correct) return en ? `${wrong} misses; you really took a stand against the answer key.` : `${wrong} yanlış; cevap anahtarına muhalefetin takdire şayan.`;
  if (correct && !wrong) return en ? `${correct} correct, zero misses; are you related to the answer key?` : `${correct} doğru, sıfır yanlış; cevap anahtarının kuzeni misin?`;
  if (correct > wrong) return en ? `${correct} correct; the confidence finally came with receipts.` : `${correct} doğru; özgüven bu kez boş çıkmadı.`;
  if (correct) return en ? `${correct} hits, ${wrong} misses; even your chaos has a balanced budget.` : `${correct} doğru, ${wrong} yanlış; kaosun bile hesaplı.`;
  const friend = friends.find(score => score.player_id === player.id && score.attempts > 0);
  if (friend) return friend.correct === friend.attempts
    ? en ? `${friend.correct}/${friend.attempts} on friendship; the group chat has a human backup.` : `Dostlukta ${friend.correct}/${friend.attempts}; grubun yedeğini beynine almışsın.`
    : en ? `${friend.correct}/${friend.attempts} on friendship; maybe open the group chat once in a while?` : `Dostlukta ${friend.correct}/${friend.attempts}; grup sohbetini arada açıyor musun?`;
  const age = ages.find(score => score.player_id === player.id && score.total > 0);
  if (age) return en ? `${age.correct}/${age.total} age guesses; your census-office application is under review.` : `Yaş tahmininde ${age.correct}/${age.total}; nüfus müdürlüğü başvurunu incelemeye aldı.`;
  const suggestions = answers.filter(answer => answer.is_correct === null).length;
  if (suggestions) return en ? `${suggestions} suggestions; coaching the captain is free, apparently.` : `${suggestions} öneri; kaptana akıl vermek bedava tabii.`;
  const entries = data.entries.filter(entry => entry.player_id === player.id).length;
  if (entries) return en ? `${entries} minigame entries; your fingers are claiming overtime.` : `${entries} mini oyun kaydı; parmaklara mesai yazılmış.`;
  if (player.is_architect) return en ? 'You were the architect; who approved this creature’s building permit?' : 'Mimar sensin; bu yaratığın imar iznini kim verdi?';
  if (player.is_captain) return en ? 'Captain on deck, personal stats on shore leave.' : 'Kaptan köşkte, kişisel istatistikler izinde.';
  const quiet = en ? ['The mystery guest; very few footprints in the match records.', 'Stealth mode worked; the stats barely spotted you.']
    : ['Maçın gizli karakteri; kayıtlarda az iz, bol gizem.', 'Gizlilik modu başarılı; istatistikler seni zor yakaladı.'];
  return quiet[index % quiet.length];
}
