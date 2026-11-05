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

/** Stable during rerenders, varied by match and seat; claims use only personal records. */
export function shortPlayerQuip(player: Player, index: number, data: RoomData, friends: FriendScore[], ages: AgeScore[], en = false): string {
  const match = [data.room?.id, data.rounds?.at(-1)?.id, data.minigames?.at(-1)?.id].join(':');
  const seed = [...match].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0, 0);
  const pick = (tr: string[], english: string[]) => {
    const pool = en ? english : tr;
    return pool[(seed + index) % pool.length];
  };
  const answers = data.answers.filter(answer => answer.player_id === player.id);
  const correct = answers.filter(answer => answer.is_correct === true).length;
  const wrong = answers.filter(answer => answer.is_correct === false).length;
  if (wrong > correct) return `${wrong} ${en ? 'misses' : 'yanlış'}; ` + pick([
    'cevap anahtarına muhalefetin takdire şayan.', 'yanlış şıkkın sadakat kartını doldurdun.',
    'cevaplarla aranızda yaratıcı farklılıklar var.', 'rövanş için bol malzeme biriktirdin.',
    'tahminlerin alternatif bir evrende doğru olabilir.', 'cevap anahtarı senden köşe bucak kaçıyor.',
    'cesaret tam, koordinatlar biraz kaymış.', 'sorularla aynı frekansı henüz bulamadınız.',
  ], [
    'you took a stand against the answer key.', 'your wrong-answer loyalty card is full.',
    'you and the answers have creative differences.', 'plenty of material for the rematch.',
    'those guesses might work in another universe.', 'the answer key is hiding from you.',
    'full courage, slightly wrong coordinates.', 'you and the questions need to tune in.',
  ]);
  if (correct && !wrong) return `${correct} ${en ? 'correct, zero misses' : 'doğru, sıfır yanlış'}; ` + pick([
    'cevap anahtarının kuzeni misin?', 'hata payını evde unutmuşsun.', 'sorular sana önceden selam mı verdi?',
    'kalem değil, lazer kullanmışsın.', 'yanlışlar bugün senden izinli.', 'cevap anahtarı seni referans göstermiş.',
    'bu kadar temizlikten sonra masayı da silersin.', 'soruların savunması çöktü.',
  ], [
    'related to the answer key?', 'you left your margin of error at home.', 'did the questions know you already?',
    'that was a laser, not a pencil.', 'mistakes took the day off.', 'the answer key lists you as a reference.',
    'that was a clean sweep.', 'the questions ran out of defenses.',
  ]);
  if (correct > wrong) return `${correct} ${en ? 'correct' : 'doğru'}; ` + pick([
    'özgüven bu kez boş çıkmadı.', 'beynin bugün fazla mesai yaptı.', 'soruların çoğuyla el sıkıştın.',
    'takımın gizli motoru ısınmış.', 'cevap avında eli boş dönmedin.', 'bu performansa bir çay borçluyuz.',
    'doğru şıkkın adresini çözmüşsün.', 'birkaç viraj dışında rota sağlam.',
  ], [
    'the confidence came with receipts.', 'your brain worked overtime.', 'most questions shook your hand.',
    'the team engine is warmed up.', 'you came back with answers.', 'that performance earned a tea break.',
    'you found the right answer’s address.', 'a few turns, but a solid route.',
  ]);
  if (correct) return `${correct} ${en ? 'hits' : 'doğru'}, ${wrong} ${en ? 'misses' : 'yanlış'}; ` + pick([
    'kaosun bile hesaplı.', 'denge işini fazla ciddiye aldın.', 'cevap terazisi tam ortada.',
    'bir ileri, bir yanlış şık.', 'istatistiklerin tahterevalli oynuyor.', 'doğruyla yanlışı küstürmedin.',
  ], [
    'even your chaos has a balanced budget.', 'you took balance very seriously.', 'the answer scales are level.',
    'one step forward, one wrong option.', 'your stats are on a seesaw.', 'you kept both sides happy.',
  ]);
  const friend = friends.find(score => score.player_id === player.id && score.attempts > 0);
  if (friend) return `${en ? 'Friendship' : 'Dostlukta'} ${friend.correct}/${friend.attempts}; ` + (friend.correct === friend.attempts
    ? pick(['grubun yedeğini beynine almışsın.', 'grup sohbetinin arama motorusun.', 'arkadaşlarının kullanım kılavuzu sende.', 'bu hafızayla doğum günleri sana emanet.'],
      ['the group has a human backup.', 'you are the group chat’s search engine.', 'you have everyone’s user manual.', 'birthday reminders are in safe hands.'])
    : pick(['grup sohbetini arada açıyor musun?', 'arkadaşların yeni bir güncelleme almış.', 'bir kahve buluşmasıyla verileri tazele.', 'grup sohbetinde biraz geriye kaydır.'],
      ['open the group chat once in a while?', 'your friends installed an update.', 'a coffee meetup could refresh that data.', 'try scrolling back in the group chat.']));
  const age = ages.find(score => score.player_id === player.id && score.total > 0);
  if (age) return `${en ? 'Age guesses' : 'Yaş tahmininde'} ${age.correct}/${age.total}; ` + pick([
    'nüfus müdürlüğü başvurunu incelemeye aldı.', 'doğum günü mumlarını saymak serbestti.', 'takvimle aranızdaki görüşmeler sürüyor.', 'yaşlar değil, tahminler konuşulsun.',
  ], ['the census office is reviewing your application.', 'counting birthday candles was allowed.', 'negotiations with the calendar continue.', 'let the guesses do the talking.']);
  const suggestions = answers.filter(answer => answer.is_correct === null).length;
  if (suggestions) return `${suggestions} ${en ? 'suggestions' : 'öneri'}; ` + pick([
    'kaptana akıl vermek bedava tabii.', 'takımın fikir musluğu açık kalmış.', 'beyin fırtınasında şemsiye açtırdın.', 'kaptanın gelen kutusunu doldurdun.',
  ], ['coaching the captain is free, apparently.', 'the team’s idea tap is running.', 'that brainstorm needed an umbrella.', 'you filled the captain’s inbox.']);
  const entries = data.entries.filter(entry => entry.player_id === player.id).length;
  if (entries) return `${entries} ${en ? 'minigame entries' : 'mini oyun kaydı'}; ` + pick([
    'parmaklara mesai yazılmış.', 'ekran senden dinlenme molası istiyor.', 'dokunmatik ekranla yakın arkadaş oldun.', 'parmak sporları federasyonu seni izliyor.',
    'başparmağın rövanşa hazırlanıyor.', 'ekranla aranızdaki trafik yoğundu.',
  ], ['your fingers are claiming overtime.', 'the screen needs a break from you.', 'you befriended the touchscreen.', 'the finger sports federation is watching.',
    'your thumb is preparing for a rematch.', 'that screen saw plenty of traffic.']);
  if (player.is_architect) return pick([
    'Mimar sensin; bu yaratığın imar iznini kim verdi?', 'Mimarın hayal gücü ruhsat beklemiyor.', 'Bu çizim masasında cetvel bile şaşırdı.', 'Yaratığın planı sende, açıklaması henüz yok.',
  ], ['You were the architect; who approved the building permit?', 'This architect’s imagination needs no permit.', 'Even the ruler looked surprised.', 'You have the blueprint, but no explanation yet.']);
  if (player.is_captain) return pick([
    'Kaptan köşkte, kişisel istatistikler izinde.', 'Dümen sende; seyir defteri biraz gizemli.', 'Kaptanın strateji defteri şifreli kalmış.', 'Takımın pusulası sensin; kuzey nerede?',
  ], ['Captain on deck, personal stats on shore leave.', 'You held the wheel; the logbook is a mystery.', 'The captain’s strategy book stayed encrypted.', 'You are the team compass; where is north?']);
  return pick([
    'Maçın gizli karakteri; kayıtlarda az iz, bol gizem.', 'Gizlilik modu başarılı; istatistikler seni zor yakaladı.',
    'Atölyenin gizemli konuğu; rövanşta sahne senin.', 'İstatistiklere görünmeden dolaşma yeteneği açıldı.',
    'Maç kayıtlarında kısa bir konuk oyunculuk.', 'Kayıtlar sessiz; sonraki maçın fragmanını bekliyoruz.',
    'Atölyede ayak izin az, merak uyandırman çok.', 'Bu maçın kapalı kutusu sensin.',
  ], ['The mystery guest; few footprints in the match records.', 'Stealth mode worked; the stats barely spotted you.',
    'The workshop’s mystery guest; the rematch stage is yours.', 'You unlocked the skill of dodging the stats.',
    'A brief guest appearance in the match records.', 'Quiet records; waiting for your next-match trailer.',
    'Few footprints, plenty of mystery.', 'You are this match’s unopened box.']);
}
