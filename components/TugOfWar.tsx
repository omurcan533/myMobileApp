import { getLanguage, useLanguage } from '../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {View,Pressable,useWindowDimensions} from 'react-native';
import {api} from '../lib/api';
import {TugArena} from './TugArena';
import {supabase} from '../lib/supabase';
import {Card,Muted,Text,Title} from './ui';
import type {Player} from '../lib/types';
import {usePlaySize} from './PlayLayout';
import {colors,teamColor} from '../lib/theme';
import {serverNow} from '../lib/serverTime';

type TugState={a:number;b:number;players:{nickname:string;side:string;force:number}[]};
export function TugOfWar({event,players,myId,isHost,main=false,paused=false,pausedAt=null}:{event:any;players:Player[];myId:string;isHost:boolean;main?:boolean;paused?:boolean;pausedAt?:string|null}){
 useLanguage();
 const en=getLanguage()==='en';
 const loc=(tr:string,enText:string)=>en?enText:tr;
 const team=(side:string)=>loc(`Takım ${side}`,`Team ${side}`);
 const teamLabel=(side:string)=>loc(`TAKIM ${side}`,`TEAM ${side}`);
 const outcome=(side:string)=>loc(`Takım ${side} ${remaining===0?'KAZANDI':'ÖNDE'}`,`Team ${side} ${remaining===0?'WON':'LEADS'}`);
 const {width,height}=useWindowDimensions();
 const wide=width>height&&width>=600;
 const area=usePlaySize(); const compact=area.active;
 const [now,setNow]=useState(serverNow);
 const [startedAt,setStartedAt]=useState<string>(event.created_at);
 const [state,setState]=useState<TugState>({a:0,b:0,players:[]});
 const [feedback,setFeedback]=useState('');
 const [lastHit,setLastHit]=useState<boolean|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const lastPull=useRef(0);
 useEffect(()=>{
  if(event.created_at!==startedAt){const initial=setTimeout(()=>{setStartedAt(event.created_at);setFeedback('');setError('');setNow(serverNow());},0);return()=>clearTimeout(initial);}
 },[event.created_at,startedAt]);
 const channel=useRef<ReturnType<typeof supabase.channel>|null>(null);
 const refresh=async()=>{try{const s=main?await api.minigameTugState(event.id):await api.partyTugState(event.id);if(s)setState({a:s.a,b:s.b,players:'players' in s&&Array.isArray(s.players)?s.players:[]});}catch{}};
 useEffect(()=>{
  const initial=setTimeout(()=>{void refresh();},0);
  const timer=setInterval(()=>setNow(serverNow()),40);
  const sync=setInterval(refresh,700);
  const ch=supabase.channel('tug:'+event.id);
  ch.on('broadcast',{event:'pull'},()=>{refresh();}).subscribe();
  channel.current=ch;
  return()=>{clearTimeout(initial);clearInterval(timer);clearInterval(sync);supabase.removeChannel(ch);channel.current=null;};
 },[event.id]);
 const durationMatch=String(event.prompt??'').match(/^Halat çekme süresi: (30|60|90|120) saniye\./);
 const duration=main?(event.target_num||60):(durationMatch?Number(durationMatch[1]):60);
 const clockNow=main&&paused&&pausedAt?Date.parse(pausedAt):now;
 const elapsed=Math.max(0,(clockNow-Date.parse(startedAt))/1000);
 const remaining=event.status==='done'?0:Math.max(0,Math.ceil(duration-elapsed));
 // Her telefonda akıcı yerel ibre. Dokunma sonucu ağ beklemeden gösterilir.
 const elapsedMs=Math.max(0,clockNow-Date.parse(startedAt));
 const cycle=Math.floor(elapsedMs/2800);
 const phase=(elapsedMs%2800)/2800;
 const seed=[...(event.id+startedAt+cycle)].reduce((n,ch)=>(Math.imul(n,31)+ch.charCodeAt(0))|0,17)>>>0;
 const target=0.13+(seed%74)/100;
 const narrow=seed%4===0;
 const low=narrow?0.3:0.06,high=narrow?0.7:0.94;
 const position=low+(high-low)*(1-Math.cos(phase*2*Math.PI))/2;
 const distance=Math.abs(position-target);
 const hit=distance<=0.085;
 const force=hit?Math.round(35+65*(1-distance/0.085)):-45;
 const me=players.find(p=>p.id===myId);
 const side=me?.team_side;
 const difference=state.a-state.b;
 const leading=difference===0?null:difference>0?'A':'B';
 const pull=async()=>{
  if(busy||(main&&paused)||remaining===0||!side||(main&&serverNow()<Date.parse(startedAt))||Date.now()-lastPull.current<470)return;
  lastPull.current=Date.now();
  setFeedback(hit?loc('🎯 İSABET! +','🎯 HIT! +')+force+loc(' kuvvet',' force'):loc('💥 ISKALADIN! -45 kuvvet','💥 MISS! -45 force'));
  setLastHit(hit);
  setBusy(true);setError('');
  try{
   if(main)await api.minigameTugPull(event.id,force);else await api.partyTugPull(event.id,force);
   channel.current?.send({type:'broadcast',event:'pull',payload:{at:Date.now()}}).catch(()=>{});
   await refresh();
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 };
 const replay=async()=>{
  if(!isHost||busy||remaining>0)return;
  setBusy(true);setError('');
  try{
   const next=await api.partyTugReplay(event.id);
   setStartedAt(next);setNow(serverNow());setState({a:0,b:0,players:[]});setFeedback('');lastPull.current=0;
   channel.current?.send({type:'broadcast',event:'pull',payload:{replay:true}}).catch(()=>{});
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 const winner=state.a===state.b?loc('Berabere','Draw'):state.a>state.b?loc('A Takımı','Team A'):loc('B Takımı','Team B');
 return <View style={{gap:compact?6:12}}>
  {main&&paused&&<Title size={20}>{loc('⏸️ OYUN DURAKLATILDI','⏸️ GAME PAUSED')}</Title>}
  {main&&clockNow<Date.parse(startedAt)&&<Title size={20}>⏳ {loc('Başlıyor:','Starting in:')} {Math.ceil((Date.parse(startedAt)-now)/1000)}</Title>}
  <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
   <View style={{flex:1}}><Title size={wide?28:23}>{loc('🏟️ HALAT ARENASI','🏟️ TUG ARENA')}</Title>{!compact&&<Muted>{loc('TAKIMLARIN BÜYÜK MÜCADELESİ','THE ULTIMATE TEAM BATTLE')} · {duration} {loc('SANİYE','SECONDS')}</Muted>}</View>
   <View style={{backgroundColor:remaining<10?'#803344':'#203653',padding:12,borderRadius:14}}><Text style={{color:'#FFFFFF',fontSize:24,fontWeight:'900'}}>⏱ {remaining}</Text></View>
  </View>
  <View style={{height:7,backgroundColor:'#283850',borderRadius:6,overflow:'hidden'}}><View style={{width:`${Math.min(100,elapsedMs/(duration*10))}%`,height:7,backgroundColor:'#FFD177'}}/></View>
  <Card accent={teamColor(leading)} style={{gap:compact?2:7,padding:compact?6:16,alignItems:'center'}}>
   <Title size={compact?18:24} color={teamColor(leading)}>{leading?outcome(leading):loc('BERABERE','DRAW')}</Title>
   <Text style={{color:colors.text,fontSize:compact?13:18,fontWeight:'900'}}>{leading?`${Math.abs(difference)} ${loc('kuvvet fark','force difference')}`:loc('Kuvvetler eşit','Forces are equal')}</Text>
   <Text style={{color:teamColor(side),fontWeight:'800'}}>{loc('Sen:','You:')} {side?team(side):loc('Seyirci','Spectator')}{side&&leading?side===leading?loc(' · Takımın önde',' · Your team leads'):loc(' · Takımın geride',' · Your team trails'):''}</Text>
   {!compact&&<Muted>{remaining>0?loc('Süre bitene kadar sonuç değişebilir.','The outcome can change until time runs out.'):loc('Sonuç toplam kuvvete göre belirlendi.','The result is based on total force.')}</Muted>}
  </Card>
  <View style={{backgroundColor:'#101C31',borderWidth:2,borderColor:'#3A5373',borderRadius:22,padding:compact?4:wide?24:14,gap:compact?4:14}}>
   {!compact&&<View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
    <View><Text style={{color:colors.teamA,fontSize:wide?21:16,fontWeight:'900'}}>{teamLabel('A')}</Text><Title size={wide?34:27} color={colors.teamA}>{state.a}</Title></View>
    <Title size={20} color="#FFDC89">VS</Title>
    <View style={{alignItems:'flex-end'}}><Text style={{color:colors.teamB,fontSize:wide?21:16,fontWeight:'900'}}>{teamLabel('B')}</Text><Title size={wide?34:27} color={colors.teamB}>{state.b}</Title></View>
   </View>}
   <TugArena blue={state.a} red={state.b} time={clockNow} wide={wide} height={compact?Math.max(80,Math.min(150,area.height*0.24)):undefined}/>
   {!compact&&<Muted>{loc('Takımların kuvvetleri anlık güncellenir. Iskalama kendi takımının puanını düşürür.','Team force updates live. Missing reduces your team score.')}</Muted>}
  </View>
  {remaining>0?<Card style={{gap:compact?6:12,padding:compact?10:16}}>
   <View style={{flexDirection:'row',justifyContent:'space-between'}}><Title size={17}>{loc('🎯 REFLEKS TESTİ','🎯 REFLEX TEST')}</Title><Text style={{color:hit?'#5BFFC2':'#FFC98B',fontWeight:'800'}}>{hit?loc('● HEDEFTE','● ON TARGET'):loc('● BEKLE','● WAIT')}</Text></View>
   <View style={{height:compact?38:60,backgroundColor:'#172640',borderRadius:15,overflow:'hidden',justifyContent:'center',borderWidth:2,borderColor:'#3B516E'}}>
    <View style={{position:'absolute',left:`${(target-0.085)*100}%`,width:'17%',height:'100%',backgroundColor:'#119F78',borderLeftWidth:2,borderRightWidth:2,borderColor:'#8DFFDC'}}/>
    <View style={{position:'absolute',left:`${position*95}%`,width:8,height:'100%',backgroundColor:'#FFFFFF',borderRadius:5}}/>
   </View>
   {!compact&&<Muted>{loc('Yeşilde yakala: +35 ila +100 kuvvet. Dışarıda bas: -45 kuvvet. Hedef her geçişte yakalanamayabilir!','Hit the green zone: +35 to +100 force. Miss: -45 force. The target may be unreachable on some passes!')}</Muted>}
   <Pressable onPress={pull} disabled={busy||(main&&paused)||!side||(main&&clockNow<Date.parse(startedAt))} style={{padding:20,alignItems:'center',borderRadius:16,borderWidth:2,borderColor:'#82FFD4',backgroundColor:busy||(main&&paused)?'#42576D':'#109777'}}><Text style={{color:'#FFFFFF',fontSize:23,fontWeight:'900'}}>{loc('✊ HALATI ÇEK!','✊ PULL THE ROPE!')}</Text></Pressable>
   {!!feedback&&<Text style={{color:lastHit?'#A0FFDA':'#FFB0B0',fontSize:17,fontWeight:'900',textAlign:'center'}}>{feedback}</Text>}
  </Card>:<Card style={{gap:10}}>
   <Title size={24}>🏆 {winner}</Title>
   <Text style={{color:'#E8F1FF'}}>{team('A')}: {state.a} · {team('B')}: {state.b} {loc('kuvvet','force')}</Text>
   <Muted>{loc('Etkinliği oda kurucusu bitirdiğinde ana oyun devam eder.','The main game continues when the host ends this event.')}</Muted>
   {isHost&&!main&&<Pressable onPress={replay} disabled={busy} style={{padding:17,alignItems:'center',borderRadius:15,backgroundColor:busy?'#42576D':'#13A785'}}><Text style={{color:'#FFFFFF',fontSize:18,fontWeight:'900'}}>{busy?loc('Hazırlanıyor…','Preparing…'):loc('🔁 TEKRAR OYNA','🔁 PLAY AGAIN')}</Text></Pressable>}
   {!isHost&&!main&&<Muted>{loc('Tekrar oynamak için kurucuyu bekle.','Wait for the host to replay.')}</Muted>}
  </Card>}
  {!wide&&!compact&&<Muted>{loc('📱 Telefonu yatay çevirerek arenayı daha geniş görebilirsin.','📱 Rotate your phone for a wider arena view.')}</Muted>}
  {!!error&&<Text style={{color:'#FF8592'}}>{error}</Text>}
 </View>;
}
