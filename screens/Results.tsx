import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CanvasBoard } from '../components/Canvas';
import {
  Avatar, Btn, Card, Chip, Eyebrow, Float, GemIcon, Muted, Pulse, Reveal, RoomExitButton, Screen, SectionLabel, Title, Text, useToast,
} from '../components/ui';
import { api } from '../lib/api';
import { PARTY_MISSIONS } from '../lib/partyMissions';
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

type MatchMoment={at:string;type:'round'|'minigame'|'highlight';data:{player_id?:string|null;leading?:Side;diff?:number;a?:number;b?:number;streak?:number;seconds_to_deadline?:number;round?:number;winner?:Side|null;question?:string;correct_players?:{id:string;name:string;side:Side}[];wrong_players?:{id:string;name:string;side:Side}[];kind?:string;tug_a?:number;tug_b?:number;top_tug_player?:{id:string;name:string;force:number}|null}};
const MINI_GAME_LABELS:Record<string,string>={
 reflex:'Refleks Yarışı',social_guess:'Dostluk Hafızası',math_guess:'Hızlı Matematik ve Tahmin',
 memory:'Hafıza Oyunu',pong:'Pong Düellosu',line_connect:'Çizgi Birleştirme',
 survivor_memory:'Survivor Hafıza Parkuru',song_complete:'Şarkı Tamamlama',tug_of_war:'Halat Çekme',
};
function describeMatch(story:MatchMoment[],players:Ctx['data']['players']){
 type Moment={title:string;body:string;people:string[];accent:string};
 const moments:Moment[]=[];
 let prevWinner:Side|null=null,streak=0;
 const finished=story.filter(x=>x.type!=='highlight').sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const miniGames=finished.filter(x=>x.type==='minigame');
 const miniTotals=new Map<string,{a:number;b:number;draw:number}>();
 for(const m of miniGames){
  const kind=m.data.kind??'unknown';
  const count=miniTotals.get(kind)??{a:0,b:0,draw:0};
  if(m.data.winner==='A')count.a++;else if(m.data.winner==='B')count.b++;else count.draw++;
  miniTotals.set(kind,count);
 }
 const namedTeam=(side:Side|null|undefined)=>side==='A'?'Mavi takım':side==='B'?'Kırmızı takım':'İki takım';
 for(const moment of [...story].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))){
  const d=moment.data;
  if(moment.type==='highlight'){
   if(d.kind==='tug_lead_change'){
    moments.push({title:'🚀 Halatta büyük geri dönüş',body:`Önce geriye düşen ${namedTeam(d.leading)}, halatı yeniden kendi tarafına çekti. Öne geçtiği an kuvvetler Mavi ${d.a??0} – Kırmızı ${d.b??0} idi. Arenada dengeler değişti!`,people:[],accent:'#FFD58A'});
   }else if(d.kind==='wrong_streak'){
    const p=players.find(p=>p.id===d.player_id);
    if(p)moments.push({title:'🙈 Üç yanlışlık seri',body:`${p.nickname} arka arkaya üç değerlendirilmiş cevapta hedefi tutturamadı. Jüri notu: Israrına saygımız sonsuz, cevap anahtarına biraz daha yakın duralım!`,people:[p.id],accent:'#FFB6CB'});
   }else if(d.kind==='last_second_win'){
    moments.push({title:'⏰ Son saniye heyecanı',body:`${d.round}. soru turu kapanışa çok az kala sonuçlandı; ${namedTeam(d.winner)} bu turun galibi oldu. Kronometreyle yarışılan anlardan biri!`,people:[],accent:'#A7F4D2'});
   }
   continue;
  }
  if(moment.type==='round'){
   const winners=d.correct_players??[],misses=d.wrong_players??[];
   if(winners.length&&misses.length){
    const hit=winners[0],miss=misses.find(p=>p.side!==hit.side);
    if(miss)moments.push({title:'🎯 Aynı soruda iki ayrı kader',body:`${hit.name} doğru cevabı bulurken ${miss.name} aynı soruda yanıldı. Jüri bu turda bir alkış, bir de teselli dağıtıyor.`,people:[hit.id,miss.id],accent:'#B8F7DA'});
   }
   if(d.winner){
    streak=d.winner===prevWinner?streak+1:1;
    if(prevWinner&&prevWinner!==d.winner)moments.push({title:'🔄 Soru turunda dengeler değişti',body:`${d.round}. turda ${namedTeam(d.winner)}, bir önceki turun kazananı ${namedTeam(prevWinner)} karşısında üstün geldi. Soru tahtasında rüzgâr tersine döndü.`,people:winners.map(p=>p.id),accent:'#FFE2A3'});
    if(streak===3)moments.push({title:'🔥 Üç soruluk galibiyet serisi',body:`${namedTeam(d.winner)} arka arkaya üç soru turunu kazandı. Rakip ekip için strateji molası vakti!`,people:winners.map(p=>p.id),accent:'#FFB9C6'});
    prevWinner=d.winner;
   }
  }else if(d.kind==='tug_of_war'){
   const a=Number(d.tug_a??0),b=Number(d.tug_b??0),top=d.top_tug_player;
   moments.push({title:'🪢 Halat Çekme: kuvvet savaşı',body:`Halatın iki ucunda Mavi ${a}, Kırmızı ${b} net kuvvet topladı. ${top?`${top.name}, ${top.force} kuvvetle bireysel katkıda öne çıktı.`:'Bu turda bireysel kuvvet verisi bulunamadı.'} ${a===b?'Kuvvetler eşitlendi!':`${namedTeam(d.winner)} karşılaşmayı kazandı.`}`,people:top?[top.id]:[],accent:'#99E6FF'});
  }
 }
 // Each minigame type gets a single meaningful recap, rather than repeating a generic line per match.
 for(const [kind,score] of miniTotals){
  if(kind==='tug_of_war')continue;
  const label=MINI_GAME_LABELS[kind]??'Mini oyun';
  const count=score.a+score.b+score.draw;
  const winner=score.a>score.b?'A':score.b>score.a?'B':null;
  const scoreLine=`Mavi ${score.a} – Kırmızı ${score.b}${score.draw?` · ${score.draw} beraberlik`:''}`;
  const descriptions:Record<string,string>={
   reflex:'Milisaniyelerin konuştuğu refleks mücadelesinde parmaklar yarıştı.',
   social_guess:'Arkadaşları ne kadar iyi tanıdıkları bu oyunda sınandı.',
   math_guess:'Hızlı hesaplar ve yakın tahminler bu turda belirleyiciydi.',
   memory:'Hafızası kuvvetli olanların avantaj sağladığı bir mücadele yaşandı.',
   pong:'Topun peşinde geçen Pong düellosunda raketler iş başındaydı.',
   line_connect:'Çizgileri doğru bağlamak ve bulmacayı çözmek takımların hedefiydi.',
   survivor_memory:'Survivor parkurunda hafıza ve doğru kare seçimleri yarıştı.',
   song_complete:'Eksik şarkı adlarını tamamlamak için müzik bilgisi devreye girdi.',
  };
  const detail=descriptions[kind]??'Bu mini oyunda takımlar karşı karşıya geldi.';
  moments.push({title:`🎮 ${label}`,body:`${count} karşılaşma oynandı. ${detail} Sonuç: ${scoreLine}. ${winner?`Bu oyunda ${namedTeam(winner)} daha fazla galibiyet aldı.`:'Takımlar bu oyunda galibiyet sayısını eşitledi.'}`,people:[],accent:'#D3B8FF'});
 }
 if(finished.length>=2){
  const last=finished[finished.length-1];
  const lastGame=last.data.kind?MINI_GAME_LABELS[last.data.kind]??'mini oyun':'soru turu';
  const rounds=finished.filter(x=>x.type==='round').length;
  moments.push({title:'🎬 Final düdüğü',body:`Maçın son kayıtlı karşılaşması ${lastGame} oldu. Toplam ${rounds} soru turu ve ${miniGames.length} mini oyun tamamlandı. Jüri, bu gece yalnızca kayıtlara geçenleri anlattı.`,people:[],accent:'#FFD99C'});
 }
 const special=moments.filter(m=>/geri dönüş|yanlışlık seri|Son saniye/.test(m.title));
 return [...special,...moments.filter(m=>!special.includes(m))].slice(0,12);
}

type CeremonyAward={id:string;icon:string;title:string;player:string;playerId:string;reason:string;color:string};
function buildCeremonyAwards(
 data:Ctx['data'],story:MatchMoment[],
 friendScores:{player_id:string;correct:number;attempts:number}[],
 ageScores:{player_id:string;correct:number;total:number}[],
):CeremonyAward[]{
 const players=data.players.filter(p=>!p.is_bot);
 const awards:CeremonyAward[]=[];
 const add=(id:string,icon:string,title:string,playerId:string,reason:string,color:string)=>{
  const p=players.find(p=>p.id===playerId);
  if(p)awards.push({id,icon,title,player:p.nickname,playerId:p.id,reason,color});
 };
 // Each prize requires a measurable achievement; ties are resolved by player id for stable results.
 const stats=players.map(p=>{
  const answers=data.answers.filter(a=>a.player_id===p.id&&a.is_correct!==null);
  const correct=answers.filter(a=>a.is_correct===true).length;
  const wrong=answers.filter(a=>a.is_correct===false).length;
  const friend=friendScores.find(x=>x.player_id===p.id);
  const age=ageScores.find(x=>x.player_id===p.id);
  const reactions=data.entries.filter(x=>x.player_id===p.id&&typeof x.reaction_ms==='number'&&(x.reaction_ms as number)>0).map(x=>x.reaction_ms as number);
  return {id:p.id,correct,wrong,friendCorrect:friend?.correct??0,friendAttempts:friend?.attempts??0,ageCorrect:age?.correct??0,ageTotal:age?.total??0,reaction:reactions.length?Math.min(...reactions):null};
 }).sort((a,b)=>a.id.localeCompare(b.id));
 const bestCorrect=[...stats].sort((a,b)=>b.correct-a.correct||a.wrong-b.wrong||a.id.localeCompare(b.id))[0];
 if(bestCorrect?.correct>0)add('hero','👑','Maçın Kahramanı',bestCorrect.id,`${bestCorrect.correct} doğru cevapla soru turlarının en çok isabet sağlayan oyuncusu. Tahtı hak etmiş; tacı düşürmesin!`,'#FFDB8A');
 const bestBrain=[...stats].filter(x=>x.friendAttempts>0||x.ageTotal>0).sort((a,b)=>(b.friendCorrect+b.ageCorrect)-(a.friendCorrect+a.ageCorrect)||a.id.localeCompare(b.id))[0];
 if(bestBrain&&(bestBrain.friendCorrect+bestBrain.ageCorrect)>0)add('brain','🧠','Takımın Beyni',bestBrain.id,`Dostluk Hafızası ve yaş tahminlerinde toplam ${bestBrain.friendCorrect+bestBrain.ageCorrect} doğru. Arkadaş grubunun gizli veri tabanı olabilir.`,'#A3E7FF');
 const fastest=[...stats].filter(x=>x.reaction!==null).sort((a,b)=>(a.reaction??Infinity)-(b.reaction??Infinity)||a.id.localeCompare(b.id))[0];
 if(fastest&&fastest.reaction!==null)add('reflex','⚡','Refleks Canavarı',fastest.id,`Kaydedilmiş en hızlı tepki: ${fastest.reaction} ms. Parmaklar önden gidiyor, beyin yetişmeye çalışıyor!`,'#B6FFD8');
 const mistakes=story.filter(x=>x.type==='highlight'&&x.data.kind==='wrong_streak'&&x.data.player_id);
 if(mistakes.length){
  const counts=new Map<string,number>();
  for(const m of mistakes)counts.set(m.data.player_id!,1+(counts.get(m.data.player_id!)??0));
  const [id,count]=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0];
  add('unlucky','🤡','Maçın Talihsizi',id,`${count} kez üç yanlışlık seri kaydı. Bu bir beceriksizlik hükmü değil, jürinin tatlı şanssızlık madalyası!`,'#FFC3D7');
 }else{
  const mostWrong=[...stats].sort((a,b)=>b.wrong-a.wrong||a.id.localeCompare(b.id))[0];
  if(mostWrong?.wrong>=3)add('unlucky','🤡','Maçın Talihsizi',mostWrong.id,`${mostWrong.wrong} yanlış cevapla jüriye en fazla malzemeyi verdi. Cesaret puanı ise tam!`,'#FFC3D7');
 }
 const comeback=story.filter(x=>x.type==='highlight'&&x.data.kind==='tug_lead_change');
 if(comeback.length){
  const lead=comeback[comeback.length-1].data.leading;
  const bestTug=story.filter(x=>x.type==='minigame'&&x.data.kind==='tug_of_war'&&x.data.top_tug_player).map(x=>x.data.top_tug_player!).sort((a,b)=>b.force-a.force)[0];
  if(bestTug){
   const player=players.find(p=>p.id===bestTug.id);
   if(player?.team_side===lead)add('comeback','🔥','Geri Dönüş Ustası',bestTug.id,`Halatta büyük geri dönüş kaydedildi. ${bestTug.force} net kuvvetle öne çıkan isimlerden biri; zafer takımın ortak emeği.`,'#FFBC88');
  }
 }
 return awards;
}

/** Accessible, skippable client-side ceremony; each phone can watch at its own pace. */
/** Responsive, skippable award stage with animated spotlights and confetti. */
function AwardStage({awards,players,closing,onFinish}:{awards:CeremonyAward[];players:Ctx['data']['players'];closing:string;onFinish:()=>void}){
 const {width,height}=useWindowDimensions();
 const compact=height<720||width<350;
 const [step,setStep]=useState(0);
 const fade=useRef(new Animated.Value(0)).current;
 const lift=useRef(new Animated.Value(24)).current;
 const scale=useRef(new Animated.Value(0.88)).current;
 const sparkle=useRef(new Animated.Value(0)).current;
 const total=awards.length+2;
 const opening=step===0,closingScene=step===total-1;
 const award=!opening&&!closingScene?awards[step-1]:null;
 const next=()=>setStep(s=>Math.min(s+1,total-1));
 useEffect(()=>{
  fade.setValue(0);lift.setValue(24);scale.setValue(0.88);sparkle.setValue(0);
  const entrance=Animated.parallel([
   Animated.timing(fade,{toValue:1,duration:550,easing:Easing.out(Easing.cubic),useNativeDriver:true}),
   Animated.spring(lift,{toValue:0,friction:7,tension:55,useNativeDriver:true}),
   Animated.spring(scale,{toValue:1,friction:5,tension:65,useNativeDriver:true}),
   Animated.timing(sparkle,{toValue:1,duration:1900,easing:Easing.out(Easing.quad),useNativeDriver:true}),
  ]);
  entrance.start();
  if(award){soundFx.victory();haptic.success();}
  return ()=>entrance.stop();
 },[step,fade,lift,scale,sparkle]);
 // The closing scene stays until the user chooses to leave; no abrupt exit mid-speech.
 useEffect(()=>{
  if(closingScene)return;
  const timer=setTimeout(next,opening?3000:6500);
  return ()=>clearTimeout(timer);
 },[step,opening,closingScene]);
 const player=award?players.find(p=>p.id===award.playerId):null;
 const tint=player?.team_side?teamColor(player.team_side):'#FFCF78';
 const avatarSize=compact?100:136;
 const particles=Array.from({length:18},(_,i)=>({
  x:((i*73+19)%100)/100,
  y:((i*43+13)%42)/100,
  color:['#FFD46C','#8EF5D1','#D3A7FF','#FF94B4','#85D5FF'][i%5],
  tilt:i%2===0?'-18deg':'22deg',
 }));
 return <Screen>
  <View style={{flex:1,backgroundColor:'#081329'}}>
   <LinearGradient colors={['#1D1B45','#0A1B34','#081329']} style={StyleSheet.absoluteFill}/>
   <View pointerEvents="none" style={{position:'absolute',top:80,left:-65,width:width*0.65,height:height*0.62,transform:[{rotate:'-23deg'}],opacity:0.24}}>
    <LinearGradient colors={['#FFE6A3','rgba(255,225,154,0)']} style={{flex:1,borderTopRightRadius:170,borderTopLeftRadius:170}}/>
   </View>
   <View pointerEvents="none" style={{position:'absolute',top:80,right:-65,width:width*0.65,height:height*0.62,transform:[{rotate:'23deg'}],opacity:0.22}}>
    <LinearGradient colors={['#B6A5FF','rgba(173,151,255,0)']} style={{flex:1,borderTopRightRadius:170,borderTopLeftRadius:170}}/>
   </View>
   {award&&<View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {particles.map((p,i)=><Animated.View key={i} style={{position:'absolute',left:`${p.x*92+4}%`,top:`${p.y*100+15}%`,width:i%3===0?9:6,height:i%3===0?14:10,borderRadius:2,backgroundColor:p.color,opacity:sparkle.interpolate({inputRange:[0,0.2,0.85,1],outputRange:[0,1,1,0]}),transform:[{translateY:sparkle.interpolate({inputRange:[0,1],outputRange:[-20,Math.min(height*0.5,350)]})},{rotate:p.tilt}]}}/>)}
   </View>}
   <View style={{paddingHorizontal:18,paddingTop:compact?12:24,paddingBottom:10,gap:10}}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8}}>
     <View style={{flex:1,gap:3}}><Text style={{color:'#8EF5D1',fontSize:10,fontWeight:'900',letterSpacing:1.4}}>✦ UCUBE ATÖLYESİ ✦</Text><Title size={compact?23:27}>🏆 Ödül Gecesi</Title></View>
     <Pressable onPress={onFinish} accessibilityRole="button" accessibilityLabel="Töreni atla ve sonuçları göster" style={{paddingVertical:10,paddingHorizontal:14,borderRadius:22,borderWidth:1,borderColor:'#8092B2',backgroundColor:'#1A2D4B'}}><Text style={{color:'#FFFFFF',fontWeight:'900'}}>Atla ↗</Text></Pressable>
    </View>
    <View style={{flexDirection:'row',gap:4}}>{Array.from({length:total},(_,i)=><View key={i} style={{height:5,flex:1,borderRadius:5,backgroundColor:i<=step?'#FFCE73':'#354765'}}/>)}</View>
    <Text style={{color:'#D2E0F7',fontSize:12,fontWeight:'800'}}>{opening?'Perde açılıyor…':closingScene?'🎤 Jürinin kapanış konuşması':`🏅 Ödül ${step} / ${awards.length}`}</Text>
   </View>
   <ScrollView key={step} style={{flex:1}} contentContainerStyle={{flexGrow:1,justifyContent:'center',paddingHorizontal:20,paddingVertical:compact?12:20}} showsVerticalScrollIndicator={false}>
    <Animated.View style={{opacity:fade,transform:[{translateY:lift},{scale}],alignItems:'center',gap:compact?10:17}}>
     <Text style={{fontSize:compact?43:58,textAlign:'center'}}>{opening?'🎭':closingScene?'🎤':award?.icon}</Text>
     <Text style={{color:'#FFE1A5',fontSize:compact?12:14,fontWeight:'900',letterSpacing:1.3,textAlign:'center'}}>{opening?'BU GECE SAHNE SİZİN':closingScene?'JÜRİDEN SON SÖZ':award?.title.toLocaleUpperCase('tr-TR')}</Text>
     {award&&<View style={{alignItems:'center',gap:7}}>
      <View style={{width:avatarSize+22,height:avatarSize+22,borderRadius:(avatarSize+22)/2,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:award.color,backgroundColor:'#101F3B'}}>
       <View style={{width:avatarSize,height:avatarSize,borderRadius:avatarSize/2,borderWidth:4,borderColor:tint,backgroundColor:'#263D63',alignItems:'center',justifyContent:'center',shadowColor:award.color,shadowOpacity:0.7,shadowRadius:22,elevation:10}}>
        <Text style={{fontSize:avatarSize*0.41,color:'#FFFFFF',fontWeight:'900'}}>{award.player.trim().slice(0,1).toLocaleUpperCase('tr-TR')}</Text>
       </View>
       <View style={{position:'absolute',bottom:0,right:0,backgroundColor:'#FFCE78',borderRadius:30,padding:7}}><Text style={{fontSize:20}}>🏅</Text></View>
      </View>
      {player?.team_side&&<Text style={{color:tint,fontSize:12,fontWeight:'800'}}>{teamName(player.team_side)} TAKIMI</Text>}
     </View>}
     <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={2} style={{color:'#FFFFFF',fontSize:compact?25:32,fontWeight:'900',textAlign:'center',width:'100%'}}>{opening?'Hazır mısınız?':closingScene?'Bu gece unutulmazdı!':award?.player}</Text>
     <View style={{width:'100%',backgroundColor:'#152845',borderRadius:18,borderWidth:1,borderColor:'#647A9C',padding:compact?14:19}}>
      <Text style={{color:'#F4F8FF',fontSize:compact?14:16,lineHeight:compact?22:26,textAlign:'center'}}>{opening?'Spot ışıkları yandı, jüri dosyaları açıldı! Ödüller gerçek oyun performansına göre açıklanıyor.':closingScene?closing:award?.reason}</Text>
     </View>
     <Text style={{color:'#C6D6EF',fontSize:12,textAlign:'center'}}>{opening?'İlk ödül birazdan açıklanıyor…':closingScene?'🎉 Ucube Jürisi alkışlarla kapanıyor!':'👏 Alkışlar sahnedeki oyuncuya!'}</Text>
    </Animated.View>
   </ScrollView>
   <View style={{paddingHorizontal:18,paddingBottom:compact?16:26,paddingTop:10,gap:10,backgroundColor:'rgba(8,19,41,0.85)'}}>
    <Pressable accessibilityRole="button" onPress={closingScene?onFinish:next} style={{paddingVertical:16,borderRadius:15,backgroundColor:'#F8CC78',alignItems:'center'}}>
     <Text style={{color:'#1A263A',fontSize:16,fontWeight:'900'}}>{closingScene?'📊 Tüm Sonuçları Gör':'Sonraki Sahne →'}</Text>
    </Pressable>
    <Text style={{color:'#AABEDB',fontSize:11,textAlign:'center'}}>{closingScene?'Kapanış konuşmasını istediğin kadar okuyabilirsin.':'Sahneler otomatik ilerler · Atla ile sonuçlara geç'}</Text>
   </View>
  </View>
 </Screen>;
}

function ceremonyClosing(awards:CeremonyAward[],moments:ReturnType<typeof describeMatch>,res:GameResults):string{
 const champ=res.official_winner?teamName(res.official_winner):'İki takım';
 const highlight=moments.find(m=>/geri dönüş|Son saniyede|yanlışlık seri/.test(m.title))??moments[0];
 const star=awards.find(a=>a.id==='hero')??awards[0];
 const winner=res.official_winner?`${champ} kupayı kaldırdı`:'Kupa beraberlikle paylaşıldı';
 const intro=`${winner}. Ama jüriye sorarsanız bu gecenin asıl kazananı, birbirine takılmayı bilen arkadaş grubu!`;
 const detail=highlight?` Unutulmaz anımız: ${highlight.title.replace(/^[^\\p{L}]+/u,'').trim()}. Bu sahne maç kayıtlarına geçti.`:' Herkesin kendine göre bir hikâyesi vardı; kayıtların söylemediğini biz de uydurmadık.';
 const outro=star?` ${star.player}, “${star.title}” unvanını kaptı. Diğerleri, bir sonraki oyunda jüriyi şaşırtmak için hazırlansın!`:' Bu turda kişisel ödül için yeterli veri yoktu; bir sonraki oyun yeni sürprizler getirsin!';
 return intro+detail+outro+' 🎉 Ucube Jürisi dağılmıştır!';
}

export function ResultsScreen({ ctx }: { ctx: Ctx }) {
  const { data, me, catalog, exitRoom } = ctx;
  const { width } = useWindowDimensions();
  const colW = (width - 36 - 14) / 2; // sütun genişliği
  const [res, setRes] = useState<GameResults | null>(null);
  const [matchStory,setMatchStory]=useState<MatchMoment[]>([]);
  const [secretResults,setSecretResults]=useState<{player_id:string;key:number;status:string}[]>([]);
  const [revealing, setRevealing] = useState(false);
  const [friendScores,setFriendScores]=useState<{player_id:string;nickname:string;correct:number;attempts:number}[]>([]);
  const [ceremonyDismissed,setCeremonyDismissed]=useState(false);
  const [ceremonyReady,setCeremonyReady]=useState(false);
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

  useEffect(()=>{api.matchStory(data.room.id).then(setMatchStory).catch(()=>{});api.partySecretMissionResults(data.room.id).then(setSecretResults).catch(()=>{});},[data.room.id]);
  useEffect(()=>{const timer=setTimeout(()=>setCeremonyReady(true),1300);return ()=>clearTimeout(timer);},[data.room.id]);

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
  const ceremonyAwards=buildCeremonyAwards(data,matchStory,friendScores,ageScores);
  const isOfficialMine = res.official_winner && me.team_side === res.official_winner;
  const isFunnyMine = res.funny_winner && me.team_side === res.funny_winner;
  const champ = res.official_winner;
  const champColor = champ ? teamColor(champ) : colors.gold;
  const funny = res.funny_winner;
  const funnyColor = funny ? teamColor(funny) : colors.violet;

  if(ceremonyReady&&!ceremonyDismissed){return <AwardStage awards={ceremonyAwards} players={data.players} closing={ceremonyClosing(ceremonyAwards,matchMoments,res)} onFinish={()=>setCeremonyDismissed(true)}/>;}

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

        <Pressable accessibilityRole="button" onPress={()=>setCeremonyDismissed(false)} style={{backgroundColor:'#46375D',borderColor:'#BFA1F2',borderWidth:1,borderRadius:15,padding:15,alignItems:'center'}}><Text style={{color:'#FFFFFF',fontSize:15,fontWeight:'900'}}>🎬 Ödül Törenini Yeniden İzle</Text></Pressable>

        {/* ================= ÖDÜL TÖRENİ ================= */}
        <Card accent={colors.gold} style={{gap:13,backgroundColor:'#17253D',borderWidth:1,borderColor:'#8A6B39'}}>
          <Title size={24}>🏆 Ucube Ödül Töreni</Title>
          <Text style={{color:'#E8F0FF',fontSize:14,lineHeight:23}}>Jüri kupaları gerçek maç kayıtlarına göre dağıtıyor. Her ödülün altında neden kazanıldığı yazıyor; yeterli veri yoksa ödül uydurulmuyor.</Text>
          {ceremonyAwards.length?ceremonyAwards.map(award=><View key={award.id} style={{backgroundColor:'#0B192E',borderWidth:1,borderColor:'#425473',borderRadius:16,padding:14,gap:7}}>
            <Text style={{color:award.color,fontSize:17,fontWeight:'900'}}>{award.icon} {award.title}</Text>
            <Text style={{color:'#FFFFFF',fontSize:19,fontWeight:'900'}}>{award.player}</Text>
            <Text style={{color:'#DCEBFF',fontSize:14,lineHeight:23}}>{award.reason}</Text>
          </View>):<Text style={{color:'#D6E5FA',lineHeight:23}}>Henüz ödül dağıtmak için yeterli doğrulanmış oyuncu performansı bulunmuyor.</Text>}
        </Card>

        {/* ================= GİZLİ GÖREV İFŞASI ================= */}
        <Card accent={colors.violet} style={{gap:12,backgroundColor:'#1B2142',borderWidth:1,borderColor:'#7054A9'}}>
          <Title size={23}>🕵️ Gizli Görevler Açıklanıyor!</Title>
          <Text style={{color:'#E6DEFF',fontSize:14,lineHeight:23}}>Herkesin maç boyunca sakladığı görevler şimdi ortaya çıkıyor. Tamamlama oyuncunun kendi beyanına dayanır.</Text>
          {secretResults.length?secretResults.map(m=>{
            const player=data.players.find(p=>p.id===m.player_id);
            return <View key={m.player_id} style={{backgroundColor:'#111D38',borderRadius:12,padding:13,gap:6,borderWidth:1,borderColor:'#4E547D'}}>
              <Text style={{color:'#FFFFFF',fontSize:16,fontWeight:'900'}}>{m.status==='done'?'🏅':m.status==='skipped'?'⏭️':'🔒'} {player?.nickname??'Oyuncu'}</Text>
              <Text style={{color:'#E8F0FF',fontSize:14,lineHeight:22}}>{PARTY_MISSIONS[m.key]??'Gizli görev'}</Text>
              <Text style={{color:m.status==='done'?'#9BF0C6':'#CAD3EB',fontWeight:'800'}}>{m.status==='done'?'Başardığını bildirdi':m.status==='skipped'?'Pas geçti':'Tamamlandığı bildirilmedi'}</Text>
            </View>;
          }):<Text style={{color:'#CBD8EF'}}>Bu maç için gizli görev kaydı bulunmuyor.</Text>}
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
