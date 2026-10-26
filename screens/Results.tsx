import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CanvasBoard } from '../components/Canvas';
import {
  Avatar, Btn, Card, Chip, Eyebrow, Float, GemIcon, Muted, Pulse, Reveal, RoomExitButton, Screen, SectionLabel, Title, Text, useToast,
} from '../components/ui';
import { api } from '../lib/api';
import { teamMascot } from '../lib/art';
import { recordGame } from '../lib/profile';
import { alpha, colors, gradients, teamColor, teamName } from '../lib/theme';
import { soundFx } from '../lib/soundEffects';
import { haptic } from '../lib/haptics';
import type { Ctx, GameResults, Side } from '../lib/types';

/** Gerçek oyun olaylarından oyuncuya özgü, kanıta dayalı ve şakacı bir final raporu üretir. */
function playerFinalComment(
 player: {id:string;nickname:string;team_side:Side|null},
 index:number,
 results:GameResults,
 friendScores:{player_id:string;correct:number;attempts:number}[],
 ageScores:{player_id:string;correct:number;total:number}[],
 data:Ctx['data'],
): {headline:string;details:string[];verdict:string;facts:string[]} {
 const side=player.team_side;
 const team=side?results.teams[side]:null;
 const rival=side?results.teams[side==='A'?'B':'A']:null;
 const friend=friendScores.find(x=>x.player_id===player.id);
 const age=ageScores.find(x=>x.player_id===player.id);
 const answers=data.answers.filter(x=>x.player_id===player.id);
 const correct=answers.filter(x=>x.is_correct===true).length;
 const wrong=answers.filter(x=>x.is_correct===false).length;
 const pending=answers.filter(x=>x.is_correct===null).length;
 const finalAnswers=answers.filter(x=>x.is_final).length;
 const roundWins=data.rounds.filter(x=>x.winner_side===side&&x.status==='resolved').length;
 const roundsPlayed=data.rounds.filter(x=>x.status==='resolved').length;
 const pieces=side?data.teamPieces.filter(x=>x.side===side):[];
 const playerMinigameEntries=data.entries.filter(x=>x.player_id===player.id);
 const teamMinigameWins=data.minigames.filter(x=>x.status==='done'&&x.winner_side===side).length;
 const playedMinigames=data.minigames.filter(x=>x.status==='done').length;
 const friendAttempt=friend?.attempts??0;
 const ageTotal=age?.total??0;
 const facts:string[]=[];
 const details:string[]=[];
 if(answers.length){
  facts.push(`Sorular: ${answers.length} yanıt · ${correct} doğru · ${wrong} yanlış`);
  if(correct>0&&wrong===0)details.push(`Sorularda ${correct} doğru yanıtın var, kayıtlarda yanlışın görünmüyor. Jüri notu: Cevap anahtarıyla gizli anlaşman mı var?`);
  else if(correct>wrong)details.push(`Sorularda ${correct} doğruya karşı ${wrong} yanlış: Hesaplı riskler almışsın. Yalnız her özgüvenli cevap doğru cevap sayılmıyor, haberin olsun.`);
  else if(wrong>correct)details.push(`Sorularda ${wrong} yanlış, ${correct} doğru var. Yanıtları cesurca savunmuşsun; doğruluk payı ise biraz tatildeymiş.`);
  else details.push(`Sorularda ${correct} doğru, ${wrong} yanlışla dengeyi kurmuşsun. Jüri, bu istikrarlı kararsızlığı takdir etti.`);
  if(finalAnswers>0)details.push(`${finalAnswers} kez son yanıt vermişsin. Karar anında sorumluluk almışsın; jüri bunu not etti.`);
  if(pending>0)facts.push(`${pending} yanıt henüz değerlendirilmemiş`);
 }else details.push('Soru yanıtı kaydın görünmüyor. Bu tur sessiz gözlemci modunda mıydın, yoksa büyük planı son ana mı sakladın?');
 if(friendAttempt>0){
  facts.push(`Dostluk Hafızası: ${friend!.correct}/${friendAttempt}`);
  if(friend!.correct===friendAttempt)details.push(`Dostluk Hafızası'nda ${friendAttempt} sorunun tamamını bilmişsin. Arkadaş grubunun yürüyen arşivisin; doğum günlerini de hatırlıyorsundur artık.`);
  else if(friend!.correct===0)details.push(`Dostluk Hafızası'nda ${friendAttempt} denemede doğru çıkmamış. Arkadaşlarınla bir kahve içip 'biz birbirimizi tanıyor muyuz?' toplantısı yapmanız gerekebilir.`);
  else details.push(`Dostluk Hafızası'nda ${friend!.correct}/${friendAttempt} doğru: Bazı sırları çözmüşsün ama arkadaşlarının hâlâ sürpriz bölümleri var.`);
 }else facts.push('Dostluk Hafızası: kayıt yok');
 if(ageTotal>0){
  facts.push(`Yaş tahmini: ${age!.correct}/${ageTotal}`);
  if(age!.correct===ageTotal)details.push(`Yaş tahmininde ${ageTotal} isabet! Jüri sana nüfus müdürlüğünden fahri görev teklif ediyor.`);
  else if(age!.correct===0)details.push(`Yaş tahmininde ${ageTotal} soruda isabet yok. Yaş sormadan önce iki kez düşün; bu yeteneğin arkadaş grubunda diplomatik kriz çıkarabilir.`);
  else details.push(`Yaş tahmininde ${age!.correct}/${ageTotal} tutturdun. İnsan sarrafı olmak için biraz daha saha çalışması lazım.`);
 }
 if(playerMinigameEntries.length){
  facts.push(`Mini oyun katılımı: ${playerMinigameEntries.length} kayıt`);
  const reactions=playerMinigameEntries.filter(x=>typeof x.reaction_ms==='number').map(x=>x.reaction_ms as number);
  if(reactions.length){
   const best=Math.min(...reactions);
   details.push(`Refleks kayıtlarında en hızlı tepkin ${best} ms. ${best<350?'Parmakların beyninden önce harekete geçiyor olabilir.':'Bir sonraki tur parmaklara biraz ısınma yaptırmakta fayda var.'}`);
  }else details.push(`${playerMinigameEntries.length} mini oyun katılım kaydın var. Sahnede bulunmuşsun; jüri katılımı görmezden gelmiyor.`);
 }
 if(side&&team&&rival){
  const diff=team.score-rival.score;
  facts.push(`Takım: ${team.score} puan · ${pieces.length} parça`);
  if(results.official_winner===side)details.push(`Takımın ${Math.abs(diff)} puan farkla şampiyon oldu. Kupayı kaldırırken takım arkadaşlarına da yer bırak, tek başına kazanmadın.`);
  else if(results.official_winner!==null)details.push(`Takımın ${Math.abs(diff)} puan farkla geride kaldı. Yenilgi takımın ortak sonucu; tek kişilik günah keçisi aramıyoruz.`);
  else details.push('Takımlar berabere kaldı. Jüri bile kimin daha büyük kaos çıkardığına karar veremedi.');
  if(roundsPlayed>0)details.push(`Takımın ${roundsPlayed} sonuçlanan soru turunun ${roundWins} tanesini kazandı. ${roundWins>roundsPlayed/2?'Sorularda kontrolü ele geçirmişsiniz.':'Sorular size kolay teslim olmamış; mücadele etmişsiniz.'}`);
  if(playedMinigames>0)details.push(`Mini oyunlarda takımın ${playedMinigames} sonuçlanan karşılaşmanın ${teamMinigameWins} tanesini aldı. ${teamMinigameWins>0?'Arada güzel refleksler ve takım çalışması da var.':'Bir sonraki karşılaşma için antrenman kampı şart olabilir.'}`);
  if(team.creature_name)details.push(`Ve ortaya çıkan yaratığın adı “${team.creature_name}”. ${team.funny_votes>rival.funny_votes?'Komiklik oylarında da öne çıkmışsınız; jüri kahkahaya teslim.':'İsim iddialı, komiklik jürisi ise biraz daha ikna bekliyor.'}`);
 }
 const highlights=[
  {score:friendAttempt>0?friend!.correct/Math.max(1,friendAttempt)*3:0,text:'🧠 Arkadaş grubunun hafıza kartı'},
  {score:ageTotal>0?age!.correct/Math.max(1,ageTotal)*3:0,text:'🕵️ Yaş Dedektifi'},
  {score:correct>0?correct/Math.max(1,correct+wrong)*2:0,text:'🎯 Cevap Avcısı'},
  {score:playerMinigameEntries.length>0?1:0,text:'🎮 Arena Müdavimi'},
 ];
 const best=highlights.sort((a,b)=>b.score-a.score)[0];
 const headline=best.score>0?best.text:(index%2===0?'🎭 Gizemli Stratejist':'🎪 Sürpriz Faktörü');
 const verdict=results.official_winner===side&&side?'JÜRİ KARARI: Kupa takımının, hikâyenin başrolü ise hepinizsiniz.':correct>0||friend?.correct||age?.correct?'JÜRİ KARARI: Bu turda hem alkış hem tatlı bir taşlama hak ettin.':'JÜRİ KARARI: İstatistikler sınırlı; efsane bir performans uydurmayacağız. Bir sonraki oyunda sahne senin!';
 return {headline,details:details.slice(0,7),verdict,facts};
}

type MatchMoment={at:string;type:'round'|'minigame';data:{round?:number;winner?:Side|null;question?:string;correct_players?:{id:string;name:string;side:Side}[];wrong_players?:{id:string;name:string;side:Side}[];kind?:string;tug_a?:number;tug_b?:number;top_tug_player?:{id:string;name:string;force:number}|null}};
function describeMatch(story:MatchMoment[],players:Ctx['data']['players']){
 const moments:{title:string;body:string;people:string[];accent:string}[]=[];
 let prevWinner:Side|null=null,streak=0;
 for(const moment of story){
  const d=moment.data;
  if(moment.type==='round'){
   const winners=d.correct_players??[],misses=d.wrong_players??[];
   if(winners.length&&misses.length){
    const hit=winners[0],miss=misses.find(p=>p.side!==hit.side);
    if(miss)moments.push({title:'🎯 Aynı soruda iki ayrı kader',body:`${hit.name} doğru cevabı bulurken ${miss.name} aynı turda yanıldı. ${hit.name} alkışı topladı, ${miss.name} ise jüriye yeni malzeme verdi.`,people:[hit.id,miss.id],accent:'#B8F7DA'});
   }
   if(d.winner){
    streak=d.winner===prevWinner?streak+1:1;
    if(prevWinner&&prevWinner!==d.winner)moments.push({title:'🔄 İpler el değiştirdi',body:`${d.round}. soruda ${d.winner} takımı önceki turun kazananı ${prevWinner} takımının serisini kesti. Maçın ritmi burada değişti.`,people:winners.map(p=>p.id),accent:'#FFE2A3'});
    if(streak===3)moments.push({title:'🔥 Üç turluk seri',body:`${d.winner} takımı arka arkaya üç soru turunu kazandı. Rakip takımın strateji toplantısı için acil gündem oluştu.`,people:winners.map(p=>p.id),accent:'#FFB9C6'});
    prevWinner=d.winner;
   }
  }else if(d.kind==='tug_of_war'){
   const a=Number(d.tug_a??0),b=Number(d.tug_b??0),top=d.top_tug_player;
   moments.push({title:'🪢 Halat arenasında güç gösterisi',body:`Mavi takım ${a}, kırmızı takım ${b} net kuvvet üretti. ${top?`${top.name} tek başına ${top.force} net kuvvetle öne çıktı.`:'Bireysel kuvvet kaydı bulunmuyor.'} ${a===b?'Halatın ortasında tam bir düğüm yaşandı.':'Kazanan tarafı en çok toplam kuvvet farkı belirledi.'}`,people:top?[top.id]:[],accent:'#99E6FF'});
  }else if(d.winner){
   moments.push({title:'🎮 Mini oyunda sahne değişti',body:`${d.kind??'Mini oyun'} karşılaşmasını ${d.winner} takımı kazandı. Soru turlarından farklı bir alanda puan toplamak, rakibe küçük bir hatırlatma oldu: Bu maç tek bir beceriyle kazanılmıyor.`,people:[],accent:'#D3B8FF'});
  }
 }
 if(story.length>=2){
  const last=story[story.length-1];
  moments.push({title:'🎬 Final düdüğü',body:`Maçın kayıtlı son karşılaşması ${last.type==='round'?'soru turu':'mini oyun'} oldu. ${story.length} sonuçlanmış karşılaşma üzerinden bu hikâye oluşturuldu; anlatılmayan olaylar uydurulmadı.`,people:[],accent:'#FFD99C'});
 }
 return moments.slice(0,12);
}

export function ResultsScreen({ ctx }: { ctx: Ctx }) {
  const { data, me, catalog, exitRoom } = ctx;
  const { width } = useWindowDimensions();
  const colW = (width - 36 - 14) / 2; // sütun genişliği
  const [res, setRes] = useState<GameResults | null>(null);
  const [matchStory,setMatchStory]=useState<MatchMoment[]>([]);
  const [revealing, setRevealing] = useState(false);
  const [friendScores,setFriendScores]=useState<{player_id:string;nickname:string;correct:number;attempts:number}[]>([]);
  const [ageScores,setAgeScores]=useState<{player_id:string;correct:number;total:number}[]>([]);
  const { toast, show } = useToast();

  const leave = async () => {
    try {
      await exitRoom();
    } catch (error) {
      show((error as Error).message, 'error');
    }
  };

  useEffect(() => {
    let active = true;
    let revealTimer: ReturnType<typeof setTimeout> | undefined;
    api.results(data.room.id).then((r) => {
      if (!active) return;
      setRevealing(true);
      soundFx.drumRoll();
      revealTimer = setTimeout(() => {
        if (!active) return;
        setRes(r);
        setRevealing(false);
        soundFx.victory();
        haptic.success();
        recordGame(data.room.id, !!r.official_winner && r.official_winner === me.team_side);
      }, 1400);
    }).catch(() => { if (active) setRevealing(false); });
    return () => { active = false; if (revealTimer) clearTimeout(revealTimer); };
  }, [data.room.id, me.team_side]);

  useEffect(()=>{api.matchStory(data.room.id).then(setMatchStory).catch(()=>{});},[data.room.id]);

  useEffect(()=>{api.friendMemoryLeaderboard(data.room.id).then(setFriendScores).catch(()=>{});api.partyLastAgeEvent(data.room.id).then(id=>id?api.partyAgeResults(id).then(setAgeScores):undefined).catch(()=>{});},[data.room.id]);

  if (!res) {
    return (
      <Screen>
        <View style={s.center}>
          <View style={{ alignSelf: 'flex-end', width: '100%', alignItems: 'flex-end' }}>
            <RoomExitButton onExit={exitRoom} />
          </View>
          <Float amount={8}>
            <View style={s.bigIcon}><Ionicons name="flag" size={42} color={colors.gold} /></View>
          </Float>
          <Title size={24}>{revealing ? 'Kazanan Açıklanıyor…' : 'Sonuçlar Hesaplanıyor…'}</Title>
          <Muted>{revealing ? 'Davullar çalıyor! Hazır mısınız?' : 'Puanlar toplanıyor, lütfen bekle.'}</Muted>
        </View>
      </Screen>
    );
  }

  const matchMoments=describeMatch(matchStory,data.players);
  const isOfficialMine = res.official_winner && me.team_side === res.official_winner;
  const isFunnyMine = res.funny_winner && me.team_side === res.funny_winner;
  const champ = res.official_winner;
  const champColor = champ ? teamColor(champ) : colors.gold;
  const funny = res.funny_winner;
  const funnyColor = funny ? teamColor(funny) : colors.violet;

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ================= BAŞLIK ================= */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[s.header, { flex: 1 }]}>
            <Eyebrow live color={colors.mint} dot={colors.mint}>Oyun tamamlandı</Eyebrow>
            <Title size={32}>Sonuçlar</Title>
          </View>
          <RoomExitButton onExit={exitRoom} />
        </View>

        <Card style={{gap:12,backgroundColor:'#12233D',borderColor:'#355275',borderWidth:1}}>
          <Title size={22}>🏅 Dostluk Madalyaları</Title>
          <Text style={{color:'#E4EDFF',fontSize:14,lineHeight:22}}>Dostluk Hafızası · Doğru cevap sıralaması</Text>
          {friendScores.some(x=>x.attempts>0)?[...friendScores].filter(x=>x.attempts>0).sort((a,b)=>b.correct-a.correct||a.attempts-b.attempts).map((p,i)=><View key={p.player_id} style={{backgroundColor:'#1B3150',borderRadius:12,padding:11,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}><Text style={{color:'#FFFFFF',fontSize:14,fontWeight:'700',flex:1}}>{i===0&&p.correct>0?'🥇 ':''}{i+1}. {p.nickname}</Text><Text style={{color:'#C5FFE9',fontSize:14,fontWeight:'800'}}>{p.correct}/{p.attempts} doğru</Text></View>):<Text style={{color:'#C6D8F2',lineHeight:22}}>Bu oyunda Dostluk Hafızası yanıt kaydı bulunmuyor.</Text>}
          {ageScores.filter(x=>Number(x.total)>0&&Number(x.correct)===Number(x.total)).map(x=><Text key={x.player_id} style={{color:'#FFE3A1',lineHeight:22}}>🏆 Üstün Dost Madalyası: {data.players.find(p=>p.id===x.player_id)?.nickname??'Oyuncu'} (Tüm yaşlar doğru!)</Text>)}
        </Card>

        {/* ================= MAÇIN HİKÂYESİ ================= */}
        <Card accent={colors.cyan} style={{gap:13,backgroundColor:'#12243E',borderWidth:1,borderColor:'#32718A'}}>
          <Title size={23}>📖 Maçın Hikâyesi</Title>
          <Text style={{color:'#E0EDFF',fontSize:14,lineHeight:23}}>Aynı soruda karşı karşıya gelen arkadaşlar, seri galibiyetler, takımın geri dönüşleri ve mini oyunların gerçek kayıtlarından seçilmiş maç anları.</Text>
          {matchMoments.length?matchMoments.map((moment,i)=><View key={i} style={{backgroundColor:'#09182D',borderWidth:1,borderColor:'#355470',borderRadius:14,padding:13,gap:7}}>
            <Text style={{color:moment.accent,fontSize:16,fontWeight:'800'}}>{i+1}. {moment.title}</Text>
            <Text style={{color:'#F0F5FF',fontSize:14,lineHeight:23}}>{moment.body}</Text>
          </View>):<Text style={{color:'#CFDFF5',fontSize:14,lineHeight:23}}>Henüz anlatılabilecek yeterli maç olayı bulunamadı. Oyun kayıtları oluştukça hikâye burada belirecek.</Text>}
        </Card>

        {/* ================= OYUNCU FİNAL YORUMLARI ================= */}
        <Card accent={colors.violet} style={{gap:14,backgroundColor:'#14213B',borderWidth:1,borderColor:'#634AA0'}}>
          <Title size={23}>🎤 Ucube Jürisi: Final Taşlaması</Title>
          <Text style={{color:'#DFE8FF',fontSize:14,lineHeight:23}}>Jüri dosyaları açtı! Her oyuncunun gerçek yanıtları, dostluk hafızası, yaş tahminleri ve takım performansı ayrı ayrı incelendi. Yorumlar oyun verilerinden hazırlanır; yapay zekâ tarafından yazılmaz.</Text>
          {data.players.filter(p=>!(p as any).is_bot).map((player,i)=>{
            const report=playerFinalComment(player,i,res,friendScores,ageScores,data);
            const playerMoments=matchMoments.filter(m=>m.people.includes(player.id)).slice(0,2);
            return <View key={player.id} style={{backgroundColor:'#08162B',borderColor:'#334969',borderWidth:1,borderRadius:18,padding:15,gap:11}}>
              <Title size={20} color={'#FFCF70'}>🎭 {player.nickname}</Title>
              <Text style={{color:'#91F4D5',fontSize:13,fontWeight:'800'}}>{report.headline}</Text>
              <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{report.facts.map((fact,j)=><View key={j} style={{backgroundColor:'#203652',borderRadius:9,paddingVertical:6,paddingHorizontal:9}}><Text style={{color:'#EDF6FF',fontSize:12,fontWeight:'700'}}>{fact}</Text></View>)}</View>
              {report.details.map((line,j)=><Text key={j} style={{color:'#F0F5FF',fontSize:14,lineHeight:23}}>{line}</Text>)}
              {playerMoments.map((moment,j)=><View key={'story'+j} style={{backgroundColor:'#1D2D48',borderRadius:10,padding:10,gap:5}}><Text style={{color:'#A9F6DE',fontSize:12,fontWeight:'800'}}>📌 MAÇTAN KANIT: {moment.title}</Text><Text style={{color:'#EAF3FF',fontSize:13,lineHeight:21}}>{moment.body}</Text></View>)}
              <View style={{borderTopWidth:1,borderColor:'#3B5374',paddingTop:10}}><Text style={{color:'#FFDA9A',fontSize:13,lineHeight:21,fontWeight:'800'}}>{report.verdict}</Text></View>
            </View>;
          })}
        </Card>

        {/* ================= RESMİ ŞAMPİYON ================= */}
        <Reveal>
          <View style={[s.champCard, { borderColor: alpha(colors.gold, 0.6) }]}>
            <LinearGradient
              colors={[alpha(champColor, 0.35), 'rgba(10,20,40,0.95)', alpha(colors.gold, 0.12)]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Chip icon="trophy" label="Resmi şampiyon" color={colors.gold} />
            <Pulse amount={1.04}>
              <View style={s.champAvatarWrap}>
                {champ ? (
                  <Avatar source={teamMascot(champ)} size={128} ring={colors.gold} />
                ) : (
                  <View style={[s.bigIcon, { width: 128, height: 128, borderRadius: 64 }]}>
                    <Ionicons name="hand-left" size={56} color={colors.gold} />
                  </View>
                )}
                <View style={s.trophyBadge}>
                  <LinearGradient colors={gradients.gold} style={s.trophyBadgeFill}>
                    <Ionicons name="trophy" size={22} color="#4A2A00" />
                  </LinearGradient>
                </View>
              </View>
            </Pulse>
            <Title size={30} color={champ ? champColor : colors.text}>
              {champ ? teamName(champ) : 'Berabere'}
            </Title>
            {champ && (
              <View style={s.pointsPill}>
                <GemIcon size={18} color={champColor} />
                <Text display style={[s.pointsText, { color: champColor }]}>{res.teams[champ].score}</Text>
                <Text style={s.pointsUnit}>puan ile kazandı</Text>
              </View>
            )}
            {isOfficialMine && <Chip icon="happy" label="Bu bizim!" color={colors.mint} solid />}
          </View>
        </Reveal>

        {/* ================= EN KOMİK TASARIM ================= */}
        <Reveal delay={120}>
          <Card accent={colors.violet} style={s.funnyCard}>
            <View style={s.funnyRow}>
              <View style={[s.funnyIcon, { backgroundColor: alpha(colors.violet, 0.16), borderColor: alpha(colors.violet, 0.5) }]}>
                <Ionicons name={funny ? 'happy' : 'hand-left'} size={30} color={colors.violet} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Eyebrow color={colors.violet}>En komik / çılgın tasarım</Eyebrow>
                <Title size={22} color={funny ? funnyColor : colors.text}>
                  {funny ? teamName(funny) : 'Berabere'}
                </Title>
                {funny ? (
                  <Muted>
                    {res.teams[funny].creature_name ?? 'İsimsiz Ucube'} · {res.teams[funny].funny_votes} oy
                  </Muted>
                ) : (
                  <Muted>Takımlar eşit komiklik oyu aldı</Muted>
                )}
              </View>
            </View>
            {isFunnyMine && <Chip icon="star" label="Bizim yaratık!" color={colors.mint} solid />}
          </Card>
        </Reveal>

        {/* ================= YARATIK SERGİSİ ================= */}
        <SectionLabel>Yaratık sergisi</SectionLabel>
        <View style={s.creatureRow}>
          {(['A', 'B'] as Side[]).map((side) => {
            const tColor = teamColor(side);
            const teamData = res.teams[side];
            return (
              <View key={side} style={[s.creatureCard, { width: colW, borderColor: alpha(tColor, 0.4), shadowColor: tColor }]}>
                <LinearGradient
                  colors={[alpha(tColor, 0.26), 'rgba(8,16,32,0.94)']}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 0.7 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={s.teamHead}>
                  <Avatar source={teamMascot(side)} size={32} ring={tColor} />
                  <Text numberOfLines={1} style={[s.teamChipText, { color: tColor }]}>{teamName(side)}</Text>
                </View>
                <View style={s.canvasWrapper}>
                  <CanvasBoard ctx={ctx} side={side} size={colW - 24} />
                </View>
                <Text display style={s.creatureName} numberOfLines={2}>
                  {teamData.creature_name ?? 'İsimsiz Ucube'}
                </Text>
                {teamData.creature_title && (
                  <View style={{ backgroundColor: alpha(tColor, 0.15), borderWidth: 1, borderColor: alpha(tColor, 0.4), borderRadius: 10, paddingVertical: 2, paddingHorizontal: 8, marginTop: 4 }}>
                    <Text numberOfLines={1} style={{ color: tColor, fontSize: 11, fontWeight: '700', textAlign: 'center' }}>
                      ⚡ {teamData.creature_title}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* ================= TAKIM İSTATİSTİKLERİ ================= */}
        <SectionLabel>Takım istatistikleri</SectionLabel>
        <View style={{ gap: 12 }}>
          {(['A', 'B'] as Side[]).map((side) => {
            const t = res.teams[side];
            const tColor = teamColor(side);
            const pieces = data.teamPieces.filter((p) => p.side === side);
            return (
              <Card key={side} accent={tColor} style={{ gap: 14 }}>
                <View style={s.scoreCardHead}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar source={teamMascot(side)} size={40} ring={tColor} />
                    <Title size={18} color={tColor}>{teamName(side)}</Title>
                  </View>
                  <View style={s.scorePill}>
                    <GemIcon size={18} color={tColor} />
                    <Text display style={s.scorePillValue}>{t.score}</Text>
                    <Text style={s.scorePillUnit}>puan</Text>
                  </View>
                </View>

                <View style={s.piecesTray}>
                  <Text style={s.piecesList}>
                    {pieces.length ? pieces.map((p) => catalog[p.piece_id]?.emoji ?? '❔').join('  ') : 'Henüz parça yok'}
                  </Text>
                </View>

                <View style={s.statsRow}>
                  <View style={s.statItem}>
                    <Text display style={s.statValue}>{t.pieces}</Text>
                    <Text style={s.statLabel}>Parça</Text>
                  </View>
                  <View style={s.statDivider} />
                  <View style={s.statItem}>
                    <Text display style={s.statValue}>{t.funny_votes}</Text>
                    <Text style={s.statLabel}>Komiklik oyu</Text>
                  </View>
                </View>
              </Card>
            );
          })}
        </View>

        {/* ================= ANA MENÜ ================= */}
        <View style={{ marginTop: 10, marginBottom: 16 }}>
          <Btn title="Ana Menüye Dön" tone="gold" icon="home" onPress={leave} />
        </View>
      </ScrollView>
      {toast}
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: { gap: 16, paddingBottom: 36, paddingTop: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  bigIcon: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: alpha(colors.gold, 0.12),
    borderWidth: 1.5,
    borderColor: alpha(colors.gold, 0.5),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  header: { gap: 4, marginTop: 2 },

  champCard: {
    borderRadius: 30,
    borderWidth: 1.5,
    padding: 22,
    alignItems: 'center',
    gap: 14,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    shadowColor: colors.gold,
    shadowOpacity: 0.4,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  champAvatarWrap: { marginTop: 4 },
  trophyBadge: {
    position: 'absolute',
    bottom: -6,
    right: -8,
    shadowColor: colors.gold,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  trophyBadgeFill: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFF1B8',
  },
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.inset,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 100,
  },
  pointsText: { fontSize: 22, fontWeight: '900' },
  pointsUnit: { color: colors.muted, fontSize: 12.5, fontWeight: '600' },

  funnyCard: { gap: 12 },
  funnyRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  funnyIcon: { width: 62, height: 62, borderRadius: 31, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  creatureRow: { flexDirection: 'row', gap: 14 },
  creatureCard: {
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 12,
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  teamHead: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  teamChipText: { fontSize: 13, fontWeight: '700', flex: 1 },
  canvasWrapper: { borderRadius: 18, overflow: 'hidden' },
  creatureName: { color: colors.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },

  scoreCardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.inset,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  scorePillValue: { color: colors.text, fontSize: 20, fontWeight: '900' },
  scorePillUnit: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  piecesTray: {
    backgroundColor: colors.inset,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
  },
  piecesList: { fontSize: 24, textAlign: 'center', color: colors.muted },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: 2 },
  statLabel: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  statValue: { color: colors.text, fontSize: 24, fontWeight: '900' },
  statDivider: { width: 1, height: 32, backgroundColor: colors.border },
});
