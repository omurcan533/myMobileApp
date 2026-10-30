import { getLanguage, useLanguage } from '../lib/i18n';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { PongArena, PongFrameState } from './PongArena';
import { serverNow } from '../lib/serverTime';
import { Card, Eyebrow, Muted, Text, Title, Tap } from './ui';
import { alpha, colors } from '../lib/theme';
import type { Ctx, Minigame } from '../lib/types';
import {usePlaySize} from './PlayLayout';
import { createPongDiagnostics } from '../lib/pongDiagnostics';

type State = PongFrameState & {
 a1:string; a2:string; b1:string; b2:string;
 modeA?:'solo'|'duo'; modeB?:'solo'|'duo';
 modeVotes?:Record<string,string>;
 savesA?:number; savesB?:number; goalsByPlayer?:Record<string,number>;
};
type Props = {ctx:Ctx;mg:Minigame;live:boolean;onControlHoldChange?:(holding:boolean)=>void};
const emojiList=['👏','🔥','😂','😱','❤️'];
const dirs=[-1,1];

export const PongDuel=memo(function PongDuel({ctx,mg,live,onControlHoldChange}:Props){
 useLanguage();
 const en=getLanguage()==='en';
 const loc=(tr:string,english:string)=>en?english:tr;
 const {data,me}=ctx;
 const {width:screenWidth,height:screenHeight}=useWindowDimensions();
 const area=usePlaySize();
 const width=Math.min(520,Math.max(180,area.active?area.width-24:screenWidth-94));
 const height=area.active?Math.max(100,Math.min(320,Math.round(width*0.78),area.height-250)):Math.max(165,Math.min(320,Math.round(width*0.78),Math.round(screenHeight*0.34)));
 const compactControls=screenHeight<780;
 const matchSeconds=Math.max(0,Math.ceil((Date.parse(data.room.phase_ends_at??'')-serverNow())/1000));
 const [state,setState]=useState<State|null>((mg.pong_state as State|null)??null);
 const [reaction,setReaction]=useState<string|null>(null);
 const [goal,setGoal]=useState<{side:'A'|'B';score:number}|null>(null);
 const [controlError,setControlError]=useState<string|null>(null);
 const [gameError,setGameError]=useState<string|null>(null);
 const [serverFinished,setServerFinished]=useState(false);
 const [held,setHeld]=useState({up:false,down:false});
 const [choiceBusy,setChoiceBusy]=useState(false);
 const [clock,setClock]=useState(serverNow());
 const cheerChannel=useRef<ReturnType<typeof supabase.channel>|null>(null);
 const previousScores=useRef<{a:number;b:number}|null>(null);
 const activeDirections=useRef(new Set<number>());
 const heartbeats=useRef<Record<number,ReturnType<typeof setInterval>>>({});
 const sendQueue=useRef<Record<number,Promise<void>>>({});
 const stopped=useRef(false);
 const timing=useRef(createPongDiagnostics());
 const players=useMemo(()=>data.players,[data.players]);
 const playerName=(id?:string)=>players.find(p=>p.id===id)?.nickname??loc('Oyuncu','Player');

 const goAt=mg.starts_at?Date.parse(mg.starts_at):0;
 const countdown=live&&goAt?Math.max(0,Math.ceil((goAt-clock)/1000)):0;
 const active=live&&!serverFinished&&goAt>0&&countdown===0&&!data.room.paused;
 const myIds=players.filter(p=>p.user_id===me.user_id).map(p=>p.id);
 if(!myIds.includes(me.id))myIds.push(me.id);
 const mySlot=state?(['a1','a2','b1','b2'] as const).find(k=>myIds.includes(state[k])):undefined;
 const mySide=mySlot?.startsWith('a')?'A':mySlot?.startsWith('b')?'B':null;
 const solo=!!mySide&&state?.[mySide==='A'?'modeA':'modeB']==='solo';
 const directions=useMemo(()=>mySlot?(solo?dirs:[mySlot.endsWith('1')?-1:1]):[],[mySlot,solo]);
 const teamSize=players.filter(p=>p.team_side===me.team_side).length;
 const needsModeChoice=live&&!mg.starts_at&&teamSize===2&&players.length===3;

 useEffect(()=>{
  stopped.current=false;previousScores.current=null;setGameError(null);setGoal(null);setServerFinished(false);
  setState((mg.pong_state as State|null)??null);
 },[mg.id]);
 useEffect(()=>{
  const incoming=mg.pong_state as State|null;
  if(!incoming)return;
  setState(old=>{
   if(!old)return incoming;
   const oldTick=Date.parse(old.tick??'');
   const newTick=Date.parse(incoming.tick??'');
   if(Number.isFinite(oldTick)&&Number.isFinite(newTick)&&newTick<oldTick)return old;
   return incoming;
  });
 },[mg.pong_state]);
 useEffect(()=>{
  if(!live||!goAt||serverNow()>=goAt){setClock(serverNow());return;}
  const interval=setInterval(()=>setClock(serverNow()),120);
  return ()=>clearInterval(interval);
 },[live,goAt]);
 useEffect(()=>{
  if(!state)return;
  const old=previousScores.current;
  if(old){
   if(state.scoreA>old.a)setGoal({side:'A',score:state.scoreA});
   else if(state.scoreB>old.b)setGoal({side:'B',score:state.scoreB});
  }
  previousScores.current={a:state.scoreA,b:state.scoreB};
 },[state?.scoreA,state?.scoreB,mg.id]);
 useEffect(()=>{
  if(!goal)return;
  const timeout=setTimeout(()=>setGoal(null),2100);
  return ()=>clearTimeout(timeout);
 },[goal]);
 useEffect(()=>{
  const channel=supabase.channel('pong-'+mg.id);
  channel.on('broadcast',{event:'cheer'},({payload})=>setReaction(String(payload?.emoji??'👏')));
  channel.on('broadcast',{event:'pong_frame'},({payload})=>{
   const frame=payload?.state as State|undefined;
   if(!frame||typeof frame.x!=='number'||typeof frame.tick!=='string')return;
   timing.current('broadcastSnapshotAge',serverNow()-Date.parse(frame.tick));
   setState(previous=>{
    if(previous&&Date.parse(frame.tick!)<=Date.parse(previous.tick??''))return previous;
    return frame;
   });
  });
  cheerChannel.current=channel;
  channel.subscribe();
  return ()=>{cheerChannel.current=null;void supabase.removeChannel(channel);};
 },[mg.id]);

 // Ağ güncellemeleri yalnızca oyun durumunu sabitler; 60 FPS çizim PongArena içinde yapılır.
 useEffect(()=>{
  if(!live)return;
  let mounted=true,inFlight=false,failures=0;
  stopped.current=false;
  const applySnapshot=(incoming:State)=>setState(previous=>{
   if(!previous)return incoming;
   const nextTime=Date.parse(incoming.tick??'');
   const prevTime=Date.parse(previous.tick??'');
   if(Number.isFinite(nextTime)&&Number.isFinite(prevTime)&&nextTime<=prevTime)return previous;
   return incoming;
  });
  const poll=async()=>{
   if(!mounted||inFlight||stopped.current)return;
   inFlight=true;
   try{
    if(me.is_host&&mg.starts_at){
     const sentAt=performance.now();
     const {data:updated,error}=await supabase.rpc('pong_tick',{p_minigame:mg.id});
     timing.current('tickRoundTrip',performance.now()-sentAt);
     if(!mounted)return;
     if(error){
      failures++;
      if(failures>=3){stopped.current=true;setGameError('Oyun senkronizasyonu durdu: '+error.message);}
     }else{
      failures=0;
      if(updated){
       applySnapshot(updated as State);
       void cheerChannel.current?.send({type:'broadcast',event:'pong_frame',payload:{state:updated}});
      }
      else {stopped.current=true;setServerFinished(true);}
     }
    }else{
     const {data:updated,error}=await supabase.from('room_minigames').select('pong_state,status').eq('id',mg.id).single();
     if(!mounted)return;
     if(error){failures++;if(failures>=3)setGameError(loc('Bağlantı hatası: ','Connection error: ')+error.message);}
     else{
      failures=0;
      if(updated?.pong_state)applySnapshot(updated.pong_state as State);
      if(updated?.status==='done'){stopped.current=true;setServerFinished(true);}
      // Sunucu yöneticinin sekmesi uykuya girerse, başka bir oda üyesi fiziği sürdürür.
      const lastTick=updated?.pong_state?.tick?Date.parse(updated.pong_state.tick):NaN;
      if(mg.starts_at&&!data.room.paused&&updated?.status==='live'&&Number.isFinite(lastTick)&&serverNow()-lastTick>950){
       const {data:recovered,error:failoverError}=await supabase.rpc('pong_tick',{p_minigame:mg.id});
       if(recovered&&mounted)applySnapshot(recovered as State);
       if(failoverError)console.warn('Pong host failover:',failoverError.message);
      }
     }
    }
   }catch(e){
    if(mounted)setGameError(loc('Bağlantı kesildi: ','Connection lost: ')+String(e));
   }finally{inFlight=false;}
  };
  void poll();
  const timer=setInterval(poll,me.is_host&&mg.starts_at?125:1000);
  return ()=>{mounted=false;clearInterval(timer);};
 },[live,me.is_host,mg.id,mg.starts_at,data.room.paused]);

 // İstek sırası aynı düğme için korunur: basma ardından bırakma sunucuya ters sırada gitmez.
 const sendHeld=(direction:number,pressed:boolean)=>{
  const prev=sendQueue.current[direction]??Promise.resolve();
  const queuedAt=performance.now();
  const next=prev.catch(()=>{}).then(async()=>{
   const sentAt=performance.now();
   timing.current('controlQueueWait',sentAt-queuedAt);
   const {error}=await supabase.rpc('pong_set_held',{p_minigame:mg.id,p_direction:direction,p_pressed:pressed});
   timing.current('controlRoundTrip',performance.now()-sentAt);
   if(error){
    setControlError(error.message);
    console.warn('Pong control:',error.message);
   }else setControlError(null);
  });
  sendQueue.current[direction]=next;
 };
 const syncHolding=()=>{
  const up=activeDirections.current.has(-1),down=activeDirections.current.has(1);
  setHeld({up,down});
  onControlHoldChange?.(up||down);
 };
 const stopHold=(direction:number)=>{
  if(!activeDirections.current.has(direction))return;
  activeDirections.current.delete(direction);
  clearInterval(heartbeats.current[direction]);
  delete heartbeats.current[direction];
  syncHolding();
  sendHeld(direction,false);
 };
 const startHold=(direction:number)=>{
  if(!active||!directions.includes(direction)||activeDirections.current.has(direction))return;
  activeDirections.current.add(direction);
  syncHolding();
  sendHeld(direction,true);
  heartbeats.current[direction]=setInterval(()=>{
   if(activeDirections.current.has(direction))sendHeld(direction,true);
  },1200);
 };
 useEffect(()=>{
  if(active)return;
  Array.from(activeDirections.current).forEach(stopHold);
 },[active]);
 useEffect(()=>()=>{Array.from(activeDirections.current).forEach(stopHold);},[mg.id]);

 const chooseMode=async(mode:'solo'|'duo')=>{
  if(choiceBusy)return;
  setChoiceBusy(true);
  const {data:updated,error}=await supabase.rpc('pong_choose_mode',{p_minigame:mg.id,p_mode:mode});
  if(updated)setState(updated as State);
  if(error)setControlError(error.message);
  setChoiceBusy(false);
 };
 const cheer=(emoji:string)=>{
  setReaction(emoji);
  void cheerChannel.current?.send({type:'broadcast',event:'cheer',payload:{emoji}});
 };
 const goals=Object.entries(state?.goalsByPlayer??{}).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]);
 const high=goals[0]?.[1]??0;
 const top=goals.filter(([,n])=>n===high);
 return <View style={styles.wrapper}>
  <Card accent={colors.cyan} style={[styles.gameCard,area.active&&{padding:8,gap:5}]}>
   <View style={styles.matchHeading}>
    <Eyebrow color={colors.cyan}>{loc('PONG DÜELLOSU','PONG DUEL')}</Eyebrow>
    {live&&mg.starts_at&&<Text style={styles.matchTime}>◷ {Number.isFinite(matchSeconds)?matchSeconds:300} {loc('sn','sec')}</Text>}
   </View>
   <View style={styles.score}>
    <Text style={styles.teamA}>{loc('TAKIM A','TEAM A')}</Text>
    <Title size={32}>{state?.scoreA??0} : {state?.scoreB??0}</Title>
    <Text style={styles.teamB}>{loc('TAKIM B','TEAM B')}</Text>
   </View>
   {needsModeChoice&&<View style={styles.choice}>
    <Title size={17}>{loc('Takımın kaç kişi oynasın?','How many players on your team?')}</Title>
    <Muted>{loc('İkiniz de 1 kişi seçerseniz tek oyuncu kontrol eder. Seçim tamamlanmazsa kurucu mevcut iki kişilik düzenle başlatabilir.','If both choose 1 player, one player controls the paddle. Otherwise the host can start with the current two-player setup.')}</Muted>
    <View style={styles.controls}>
     <Tap onPress={()=>void chooseMode('solo')} disabled={choiceBusy} style={styles.control}><Text style={styles.controlText}>{loc('1 KİŞİ','1 PLAYER')}</Text></Tap>
     <Tap onPress={()=>void chooseMode('duo')} disabled={choiceBusy} style={styles.control}><Text style={styles.controlText}>{loc('2 KİŞİ','2 PLAYERS')}</Text></Tap>
    </View>
    <Muted>{loc('Senin seçimin:','Your choice:')} {state?.modeVotes?.[me.id]==='solo'?loc('1 kişi','1 player'):state?.modeVotes?.[me.id]==='duo'?loc('2 kişi','2 players'):loc('Henüz yok','Not chosen yet')}</Muted>
   </View>}
   {gameError&&<Muted style={styles.error}>{gameError}</Muted>}
   {mg.starts_at && state ? (
    <View style={styles.arenaContainer}>
     <PongArena key={mg.id} state={state} width={width} height={height} playing={active} mySide={mySide} allowedDirections={directions} held={held}/>
     {countdown>0&&<View pointerEvents="none" style={styles.countdownOverlay}><Text style={styles.countdownNumber}>{countdown}</Text><Muted>{loc('Hazır ol! Maç başlıyor…','Get ready! Match starting…')}</Muted></View>}
     {goal&&<View pointerEvents="none" style={styles.goalOverlay}><Title size={19}>⚽ {loc('GOOOL! TAKIM','GOAL! TEAM')} {goal.side} 🎉</Title></View>}
    </View>
   ) : !state ? <Muted>{loc('Maç hazırlanıyor…','Preparing match…')}</Muted> : null}
   {!area.active&&<View style={styles.teams}>
    <View style={{flex:1}}>
     <Text style={styles.teamA}> {state?.modeA==='solo'?'▲▼':'▲'} {playerName(state?.a1)}</Text>
     {state?.modeA!=='solo'&&<Text style={styles.teamA}>▼ {playerName(state?.a2)}</Text>}
    </View>
    <View style={{flex:1,alignItems:'flex-end'}}>
     <Text style={styles.teamB}>{state?.modeB==='solo'?'▲▼':'▲'} {playerName(state?.b1)}</Text>
     {state?.modeB!=='solo'&&<Text style={styles.teamB}>▼ {playerName(state?.b2)}</Text>}
    </View>
   </View>}
   {mySlot&&live&&mg.starts_at?<View style={[styles.buttonsArea,Platform.OS==='web'&&({touchAction:'none',overscrollBehavior:'contain'} as any)]}>
    <Title size={16} style={{textAlign:'center'}}>{solo?loc('İki yön de sende ▲ ▼','You control both directions ▲ ▼'):directions[0]===-1?loc('YUKARI yönü sende ▲','You control UP ▲'):loc('AŞAĞI yönü sende ▼','You control DOWN ▼')}</Title>
    <View style={[styles.paddleControls,area.active&&{flexDirection:'row',gap:8}]}>
     {directions.map(direction=><Pressable
      key={direction}
      onPressIn={()=>startHold(direction)}
      onPressOut={()=>stopHold(direction)}
      hitSlop={4}
      pressRetentionOffset={160}
      onTouchMove={Platform.OS==='web'?(event:any)=>event.preventDefault?.():undefined}
      disabled={!active}
      style={[styles.paddleControl,area.active&&{flex:1,width:undefined,minHeight:64},compactControls&&!area.active&&styles.compactPaddleControl,Platform.OS==='web'?({touchAction:'none',userSelect:'none',WebkitUserSelect:'none',WebkitTouchCallout:'none',overscrollBehavior:'none'} as any):null,
       held[direction===-1?'up':'down']&&styles.controlHeld]}
     ><Text selectable={false} style={styles.paddleControlText}>{direction===-1?loc('▲  YUKARI','▲  UP'):loc('▼  AŞAĞI','▼  DOWN')}</Text></Pressable>)}
    </View>
    {!compactControls&&<Muted style={{textAlign:'center'}}>{loc('Hareket ettirmek için tuşa basılı tut.','Hold the button to move.')}</Muted>}
    {controlError&&<Muted style={styles.error}>{loc('Kontrol hatası:','Control error:')} {controlError}</Muted>}
   </View>:<Muted style={{textAlign:'center'}}>{countdown>0?loc('Geri sayım bitince kontroller açılır.','Controls unlock after the countdown.'):live&&!mg.starts_at?loc('Kuralları oku; yönetici oyunu başlatacak.','Read the rules; the host will start the game.'):live&&mySlot?loc('Kontroller hazırlanıyor…','Preparing controls…'):live?loc('Seyircisin! Arkadaşlarını destekle.','You are spectating! Cheer on your friends.'):loc('Maç tamamlandı.','Match complete.')}</Muted>}
   {(!live||serverFinished)&&state&&<View style={styles.results}>
    <Title size={18}>{loc('⚽ Gol Kralı','⚽ Top Scorer')}</Title>
    {top.length?<Text style={styles.starText}>{top.map(([id])=>playerName(id)).join(' · ')} — {high} {loc('gol katkısı','goal contributions')}</Text>:<Muted>{loc('Oyuncu bazında gol katkısı kaydı yok.','No player goal contributions recorded.')}</Muted>}
    <Muted>{loc('Gol katkısı son çubuk temasındaki yönlendiriciye yazılır.','Goal contributions go to the player controlling the last paddle touch.')}</Muted>
    <Title size={18}>{loc('🏅 Savunma Yıldızları','🏅 Defensive Stars')}</Title>
    <Muted>A: {state.savesA??0} · B: {state.savesB??0} {loc('kurtarış','saves')}</Muted>
    <Text style={styles.starText}>{(state.savesA??0)===(state.savesB??0)?loc('Takımlar eşit savunma yaptı.','Both teams defended equally.'):(state.savesA??0)>(state.savesB??0)?loc('Takım A: ','Team A: ')+playerName(state.a1)+(state.a1===state.a2?'':loc(' ve ',' and ')+playerName(state.a2)):loc('Takım B: ','Team B: ')+playerName(state.b1)+(state.b1===state.b2?'':loc(' ve ',' and ')+playerName(state.b2))}</Text>
   </View>}
  </Card>
  <Card style={{gap:area.active?4:10,padding:area.active?6:16}}>
   {!area.active&&<Title size={16}>{loc('Canlı Tepkiler','Live Reactions')} {reaction??''}</Title>}
   <View style={styles.reactions}>{emojiList.map(emoji=><Tap key={emoji} onPress={()=>cheer(emoji)} style={styles.reaction}><Text style={{fontSize:24}}>{emoji}</Text></Tap>)}</View>
  </Card>
 </View>;
});
const styles=StyleSheet.create({
 wrapper:{gap:12},gameCard:{gap:7,paddingHorizontal:10},
 matchHeading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},
 matchTime:{color:colors.cyan,fontSize:15,fontWeight:'900'},
 compactPaddleControl:{minHeight:76},
 score:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 teamA:{color:colors.cyan,fontSize:13,fontWeight:'800'},
 teamB:{color:colors.gold,fontSize:13,fontWeight:'800'},
 teams:{flexDirection:'row',justifyContent:'space-between',gap:12,paddingHorizontal:4},
 controls:{flexDirection:'row',gap:10},
 paddleControls:{flexDirection:'column',gap:12,width:'100%'},
 paddleControl:{width:'100%',minHeight:112,backgroundColor:'#17395C',borderColor:colors.cyan,borderWidth:2,borderRadius:18,alignItems:'center',justifyContent:'center',paddingHorizontal:12},
 paddleControlText:{color:'#FFFFFF',fontSize:23,fontWeight:'900'},
 control:{flex:1,backgroundColor:'#17395C',borderColor:colors.cyan,borderWidth:1.5,borderRadius:14,alignItems:'center',justifyContent:'center',minHeight:72,paddingHorizontal:8},
 controlHeld:{backgroundColor:alpha(colors.cyan,0.28),borderColor:colors.mint},
 controlText:{color:'#FFFFFF',fontSize:15,fontWeight:'900'},
 buttonsArea:{gap:8},
 choice:{gap:8,paddingVertical:8},
 arenaContainer:{position:'relative',alignItems:'center',justifyContent:'center'},
 countdownOverlay:{position:'absolute',top:16,alignSelf:'center',alignItems:'center',gap:4,paddingHorizontal:22,paddingVertical:10,borderRadius:14,backgroundColor:'rgba(7,23,44,0.92)',zIndex:3},
 countdownNumber:{fontSize:54,fontWeight:'900',color:colors.cyan},
 goalOverlay:{position:'absolute',top:12,alignSelf:'center',alignItems:'center',paddingHorizontal:16,paddingVertical:9,borderRadius:12,backgroundColor:'rgba(65,48,15,0.94)',zIndex:4},
 results:{alignItems:'center',gap:8,padding:16,borderRadius:14,backgroundColor:alpha(colors.gold,0.12)},
 starText:{color:colors.gold,fontSize:14,fontWeight:'800',textAlign:'center'},
 reactions:{flexDirection:'row',justifyContent:'space-around',gap:5},
 reaction:{backgroundColor:'#203148',padding:8,borderRadius:12},
 error:{color:colors.gold,textAlign:'center'}
});
