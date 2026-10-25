import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { PongArena, PongFrameState } from './PongArena';
import { serverNow } from '../lib/serverTime';
import { Card, Eyebrow, Muted, Text, Title, Tap } from './ui';
import { alpha, colors } from '../lib/theme';
import type { Ctx, Minigame } from '../lib/types';

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
 const {data,me}=ctx;
 const {width:screenWidth}=useWindowDimensions();
 const width=Math.min(520,Math.max(225,screenWidth-94));
 const height=Math.max(240,Math.min(320,Math.round(width*0.78)));
 const [state,setState]=useState<State|null>((mg.pong_state as State|null)??null);
 const [reaction,setReaction]=useState<string|null>(null);
 const [goal,setGoal]=useState<{side:'A'|'B';score:number}|null>(null);
 const [controlError,setControlError]=useState<string|null>(null);
 const [gameError,setGameError]=useState<string|null>(null);
 const [held,setHeld]=useState({up:false,down:false});
 const [choiceBusy,setChoiceBusy]=useState(false);
 const [clock,setClock]=useState(serverNow());
 const cheerChannel=useRef<ReturnType<typeof supabase.channel>|null>(null);
 const previousScores=useRef<{a:number;b:number}|null>(null);
 const activeDirections=useRef(new Set<number>());
 const heartbeats=useRef<Record<number,ReturnType<typeof setInterval>>>({});
 const sendQueue=useRef<Record<number,Promise<void>>>({});
 const stopped=useRef(false);
 const players=useMemo(()=>data.players,[data.players]);
 const playerName=(id?:string)=>players.find(p=>p.id===id)?.nickname??'Oyuncu';

 const goAt=mg.starts_at?Date.parse(mg.starts_at):0;
 const countdown=live&&goAt?Math.max(0,Math.ceil((goAt-clock)/1000)):0;
 const active=live&&goAt>0&&countdown===0&&!data.room.paused;
 const myIds=players.filter(p=>p.user_id===me.user_id).map(p=>p.id);
 if(!myIds.includes(me.id))myIds.push(me.id);
 const mySlot=state?(['a1','a2','b1','b2'] as const).find(k=>myIds.includes(state[k])):undefined;
 const mySide=mySlot?.startsWith('a')?'A':mySlot?.startsWith('b')?'B':null;
 const solo=!!mySide&&state?.['mode'+mySide]==='solo';
 const directions=useMemo(()=>mySlot?(solo?dirs:[mySlot.endsWith('1')?-1:1]):[],[mySlot,solo]);
 const teamSize=players.filter(p=>p.team_side===me.team_side).length;
 const needsModeChoice=live&&!mg.starts_at&&teamSize===2&&players.length===3;

 useEffect(()=>{
  stopped.current=false;previousScores.current=null;setGameError(null);setGoal(null);
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
  cheerChannel.current=channel;
  channel.subscribe();
  return ()=>{cheerChannel.current=null;void supabase.removeChannel(channel);};
 },[mg.id]);

 // Ağ güncellemeleri yalnızca oyun durumunu sabitler; 60 FPS çizim PongArena içinde yapılır.
 useEffect(()=>{
  if(!live)return;
  let mounted=true,inFlight=false,failures=0;
  stopped.current=false;
  const poll=async()=>{
   if(!mounted||inFlight||stopped.current)return;
   inFlight=true;
   try{
    if(me.is_host&&mg.starts_at){
     const {data:updated,error}=await supabase.rpc('pong_tick',{p_minigame:mg.id});
     if(!mounted)return;
     if(error){
      failures++;
      if(failures>=3){stopped.current=true;setGameError('Oyun senkronizasyonu durdu: '+error.message);}
     }else{
      failures=0;
      if(updated)setState(updated as State);
      else stopped.current=true;
     }
    }else{
     const {data:updated,error}=await supabase.from('room_minigames').select('pong_state,status').eq('id',mg.id).single();
     if(!mounted)return;
     if(error){failures++;if(failures>=3)setGameError('Bağlantı hatası: '+error.message);}
     else{
      failures=0;
      if(updated?.pong_state)setState(updated.pong_state as State);
      if(updated?.status==='done')stopped.current=true;
     }
    }
   }catch(e){
    if(mounted)setGameError('Bağlantı kesildi: '+String(e));
   }finally{inFlight=false;}
  };
  void poll();
  const timer=setInterval(poll,me.is_host&&mg.starts_at?150:340);
  return ()=>{mounted=false;clearInterval(timer);};
 },[live,me.is_host,mg.id,mg.starts_at]);

 // İstek sırası aynı düğme için korunur: basma ardından bırakma sunucuya ters sırada gitmez.
 const sendHeld=(direction:number,pressed:boolean)=>{
  const prev=sendQueue.current[direction]??Promise.resolve();
  const next=prev.catch(()=>{}).then(async()=>{
   const {error}=await supabase.rpc('pong_set_held',{p_minigame:mg.id,p_direction:direction,p_pressed:pressed});
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
  },900);
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
  <Card accent={colors.cyan} style={styles.gameCard}>
   <Eyebrow color={colors.cyan}>PONG DÜELLOSU</Eyebrow>
   <View style={styles.score}>
    <Text style={styles.teamA}>TAKIM A</Text>
    <Title size={32}>{state?.scoreA??0} : {state?.scoreB??0}</Title>
    <Text style={styles.teamB}>TAKIM B</Text>
   </View>
   {needsModeChoice&&<View style={styles.choice}>
    <Title size={17}>Takımın kaç kişi oynasın?</Title>
    <Muted>İki takım arkadaşının aynı seçimi yapması gerekir.</Muted>
    <View style={styles.controls}>
     <Tap onPress={()=>void chooseMode('solo')} disabled={choiceBusy} style={styles.control}><Text style={styles.controlText}>1 KİŞİ</Text></Tap>
     <Tap onPress={()=>void chooseMode('duo')} disabled={choiceBusy} style={styles.control}><Text style={styles.controlText}>2 KİŞİ</Text></Tap>
    </View>
    <Muted>Senin seçimin: {state?.modeVotes?.[me.id]==='solo'?'1 kişi':state?.modeVotes?.[me.id]==='duo'?'2 kişi':'Henüz yok'}</Muted>
   </View>}
   {gameError&&<Muted style={styles.error}>{gameError}</Muted>}
   {countdown>0&&<View style={styles.countdown}><Text style={styles.countdownNumber}>{countdown}</Text><Muted>Hazır ol! Maç başlıyor…</Muted></View>}
   {goal&&<View style={styles.goalBanner}><Title size={19}>⚽ GOOOL! TAKIM {goal.side} 🎉</Title></View>}
   {mg.starts_at && state ? <PongArena state={state} width={width} height={height} playing={active} mySide={mySide} allowedDirections={directions} held={held}/> : !state ? <Muted>Maç hazırlanıyor…</Muted> : null}
   <View style={styles.teams}>
    <View style={{flex:1}}>
     <Text style={styles.teamA}> {state?.modeA==='solo'?'▲▼':'▲'} {playerName(state?.a1)}</Text>
     {state?.modeA!=='solo'&&<Text style={styles.teamA}>▼ {playerName(state?.a2)}</Text>}
    </View>
    <View style={{flex:1,alignItems:'flex-end'}}>
     <Text style={styles.teamB}>{state?.modeB==='solo'?'▲▼':'▲'} {playerName(state?.b1)}</Text>
     {state?.modeB!=='solo'&&<Text style={styles.teamB}>▼ {playerName(state?.b2)}</Text>}
    </View>
   </View>
   {mySlot&&active?<View style={styles.buttonsArea}>
    <Title size={16} style={{textAlign:'center'}}>{solo?'İki yön de sende ▲ ▼':directions[0]===-1?'YUKARI yönü sende ▲':'AŞAĞI yönü sende ▼'}</Title>
    <View style={styles.controls}>
     {directions.map(direction=><Pressable
      key={direction}
      onPressIn={()=>startHold(direction)}
      onPressOut={()=>stopHold(direction)}
      style={[styles.control,Platform.OS==='web'?({touchAction:'none',userSelect:'none',WebkitUserSelect:'none'} as any):null,
       held[direction===-1?'up':'down']&&styles.controlHeld]}
     ><Text selectable={false} style={styles.controlText}>{direction===-1?'▲  YUKARI':'▼  AŞAĞI'}</Text></Pressable>)}
    </View>
    <Muted style={{textAlign:'center'}}>Hareket ettirmek için tuşa basılı tut.</Muted>
    {controlError&&<Muted style={styles.error}>Kontrol hatası: {controlError}</Muted>}
   </View>:<Muted style={{textAlign:'center'}}>{countdown>0?'Geri sayım bitince kontroller açılır.':live&&!mg.starts_at?'Kuralları oku; yönetici oyunu başlatacak.':live&&mySlot?'Kontroller hazırlanıyor…':live?'Seyircisin! Arkadaşlarını destekle.':'Maç tamamlandı.'}</Muted>}
   {!live&&state&&<View style={styles.results}>
    <Title size={18}>⚽ Gol Kralı</Title>
    {top.length?<Text style={styles.starText}>{top.map(([id])=>playerName(id)).join(' · ')} — {high} gol katkısı</Text>:<Muted>Oyuncu bazında gol katkısı kaydı yok.</Muted>}
    <Muted>Gol katkısı son çubuk temasındaki yönlendiriciye yazılır.</Muted>
    <Title size={18}>🏅 Savunma Yıldızları</Title>
    <Muted>A: {state.savesA??0} · B: {state.savesB??0} kurtarış</Muted>
    <Text style={styles.starText}>{(state.savesA??0)===(state.savesB??0)?'Takımlar eşit savunma yaptı.':(state.savesA??0)>(state.savesB??0)?'Takım A: '+playerName(state.a1)+(state.a1===state.a2?'':' ve '+playerName(state.a2)):'Takım B: '+playerName(state.b1)+(state.b1===state.b2?'':' ve '+playerName(state.b2))}</Text>
   </View>}
  </Card>
  <Card style={{gap:10}}>
   <Title size={16}>Canlı Tepkiler {reaction??''}</Title>
   <View style={styles.reactions}>{emojiList.map(emoji=><Tap key={emoji} onPress={()=>cheer(emoji)} style={styles.reaction}><Text style={{fontSize:24}}>{emoji}</Text></Tap>)}</View>
  </Card>
 </View>;
});
const styles=StyleSheet.create({
 wrapper:{gap:12},gameCard:{gap:10,paddingHorizontal:10},
 score:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 teamA:{color:colors.cyan,fontSize:13,fontWeight:'800'},
 teamB:{color:colors.gold,fontSize:13,fontWeight:'800'},
 teams:{flexDirection:'row',justifyContent:'space-between',gap:12,paddingHorizontal:4},
 controls:{flexDirection:'row',gap:10},
 control:{flex:1,backgroundColor:'#17395C',borderColor:colors.cyan,borderWidth:1.5,borderRadius:14,alignItems:'center',justifyContent:'center',minHeight:72,paddingHorizontal:8},
 controlHeld:{backgroundColor:alpha(colors.cyan,0.28),borderColor:colors.mint},
 controlText:{color:'#FFFFFF',fontSize:15,fontWeight:'900'},
 buttonsArea:{gap:8},
 choice:{gap:8,paddingVertical:8},
 countdown:{alignItems:'center',gap:4,padding:10,borderRadius:14,backgroundColor:alpha(colors.cyan,0.15)},
 countdownNumber:{fontSize:54,fontWeight:'900',color:colors.cyan},
 goalBanner:{alignItems:'center',padding:8,borderRadius:12,backgroundColor:alpha(colors.gold,0.2)},
 results:{alignItems:'center',gap:8,padding:16,borderRadius:14,backgroundColor:alpha(colors.gold,0.12)},
 starText:{color:colors.gold,fontSize:14,fontWeight:'800',textAlign:'center'},
 reactions:{flexDirection:'row',justifyContent:'space-around',gap:5},
 reaction:{backgroundColor:'#203148',padding:8,borderRadius:12},
 error:{color:colors.gold,textAlign:'center'}
});
