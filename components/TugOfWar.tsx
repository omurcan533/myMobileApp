import React,{useEffect,useRef,useState} from 'react';
import {View,Pressable,useWindowDimensions} from 'react-native';
import {api} from '../lib/api';
import {TugArena} from './TugArena';
import {supabase} from '../lib/supabase';
import {Card,Muted,Text,Title} from './ui';
import type {Player} from '../lib/types';
import {colors,teamColor} from '../lib/theme';

type TugState={a:number;b:number;players:{nickname:string;side:string;force:number}[]};
export function TugOfWar({event,players,myId,isHost,main=false,paused=false,pausedAt=null}:{event:any;players:Player[];myId:string;isHost:boolean;main?:boolean;paused?:boolean;pausedAt?:string|null}){
 const {width,height}=useWindowDimensions();
 const wide=width>height&&width>=600;
 const [now,setNow]=useState(Date.now());
 const [startedAt,setStartedAt]=useState<string>(event.created_at);
 const [state,setState]=useState<TugState>({a:0,b:0,players:[]});
 const [feedback,setFeedback]=useState('');
 const [lastHit,setLastHit]=useState<boolean|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const lastPull=useRef(0);
 useEffect(()=>{
  if(event.created_at!==startedAt){setStartedAt(event.created_at);setFeedback('');setError('');setNow(Date.now());}
 },[event.created_at]);
 const channel=useRef<ReturnType<typeof supabase.channel>|null>(null);
 const refresh=async()=>{try{const s=main?await api.minigameTugState(event.id):await api.partyTugState(event.id);if(s)setState({a:s.a,b:s.b,players:'players' in s&&Array.isArray(s.players)?s.players:[]});}catch{}};
 useEffect(()=>{
  refresh();
  const timer=setInterval(()=>setNow(Date.now()),40);
  const sync=setInterval(refresh,700);
  const ch=supabase.channel('tug:'+event.id);
  ch.on('broadcast',{event:'pull'},()=>{refresh();}).subscribe();
  channel.current=ch;
  return()=>{clearInterval(timer);clearInterval(sync);supabase.removeChannel(ch);channel.current=null;};
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
  if(busy||(main&&paused)||remaining===0||!side||(main&&Date.now()<Date.parse(startedAt))||Date.now()-lastPull.current<470)return;
  lastPull.current=Date.now();
  setFeedback(hit?'🎯 İSABET! +'+force+' kuvvet':'💥 ISKALADIN! -45 kuvvet');
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
   setStartedAt(next);setNow(Date.now());setState({a:0,b:0,players:[]});setFeedback('');lastPull.current=0;
   channel.current?.send({type:'broadcast',event:'pull',payload:{replay:true}}).catch(()=>{});
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 const winner=state.a===state.b?'Berabere':state.a>state.b?'A Takımı':'B Takımı';
 return <View style={{gap:12}}>
  {main&&paused&&<Title size={20}>⏸️ OYUN DURAKLATILDI</Title>}
  {main&&clockNow<Date.parse(startedAt)&&<Title size={20}>⏳ Başlıyor: {Math.ceil((Date.parse(startedAt)-now)/1000)}</Title>}
  <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
   <View style={{flex:1}}><Title size={wide?28:23}>🏟️ HALAT ARENASI</Title><Muted>TAKIMLARIN BÜYÜK MÜCADELESİ · {duration} SANİYE</Muted></View>
   <View style={{backgroundColor:remaining<10?'#803344':'#203653',padding:12,borderRadius:14}}><Text style={{color:'#FFFFFF',fontSize:24,fontWeight:'900'}}>⏱ {remaining}</Text></View>
  </View>
  <View style={{height:7,backgroundColor:'#283850',borderRadius:6,overflow:'hidden'}}><View style={{width:`${Math.min(100,elapsedMs/(duration*10))}%`,height:7,backgroundColor:'#FFD177'}}/></View>
  <Card accent={teamColor(leading)} style={{gap:7,alignItems:'center'}}>
   <Title size={24} color={teamColor(leading)}>{leading?`Takım ${leading} ${remaining===0?'KAZANDI':'ÖNDE'}`:'BERABERE'}</Title>
   <Text style={{fontSize:18,fontWeight:'900'}}>{leading?`${Math.abs(difference)} kuvvet fark`:'Kuvvetler eşit'}</Text>
   <Text style={{color:teamColor(side),fontWeight:'800'}}>Sen: {side?`Takım ${side}`:'Seyirci'}{side&&leading?side===leading?' · Takımın önde':' · Takımın geride':''}</Text>
   <Muted>{remaining>0?'Süre bitene kadar sonuç değişebilir.':'Sonuç toplam kuvvete göre belirlendi.'}</Muted>
  </Card>
  <View style={{backgroundColor:'#101C31',borderWidth:2,borderColor:'#3A5373',borderRadius:22,padding:wide?24:14,gap:14}}>
   <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
    <View><Text style={{color:colors.teamA,fontSize:wide?21:16,fontWeight:'900'}}>TAKIM A</Text><Title size={wide?34:27} color={colors.teamA}>{state.a}</Title></View>
    <Title size={20} color="#FFDC89">VS</Title>
    <View style={{alignItems:'flex-end'}}><Text style={{color:colors.teamB,fontSize:wide?21:16,fontWeight:'900'}}>TAKIM B</Text><Title size={wide?34:27} color={colors.teamB}>{state.b}</Title></View>
   </View>
   <TugArena blue={state.a} red={state.b} time={clockNow} wide={wide}/>
   <Muted>Takımların kuvvetleri anlık güncellenir. Iskalama kendi takımının puanını düşürür.</Muted>
  </View>
  {remaining>0?<Card style={{gap:12}}>
   <View style={{flexDirection:'row',justifyContent:'space-between'}}><Title size={17}>🎯 REFLEKS TESTİ</Title><Text style={{color:hit?'#5BFFC2':'#FFC98B',fontWeight:'800'}}>{hit?'● HEDEFTE':'● BEKLE'}</Text></View>
   <View style={{height:60,backgroundColor:'#172640',borderRadius:15,overflow:'hidden',justifyContent:'center',borderWidth:2,borderColor:'#3B516E'}}>
    <View style={{position:'absolute',left:`${(target-0.085)*100}%`,width:'17%',height:'100%',backgroundColor:'#119F78',borderLeftWidth:2,borderRightWidth:2,borderColor:'#8DFFDC'}}/>
    <View style={{position:'absolute',left:`${position*95}%`,width:8,height:'100%',backgroundColor:'#FFFFFF',borderRadius:5}}/>
   </View>
   <Muted>Yeşilde yakala: +35 ila +100 kuvvet. Dışarıda bas: -45 kuvvet. Hedef her geçişte yakalanamayabilir!</Muted>
   <Pressable onPress={pull} disabled={busy||(main&&paused)||!side||(main&&clockNow<Date.parse(startedAt))} style={{padding:20,alignItems:'center',borderRadius:16,borderWidth:2,borderColor:'#82FFD4',backgroundColor:busy||(main&&paused)?'#42576D':'#109777'}}><Text style={{color:'#FFFFFF',fontSize:23,fontWeight:'900'}}>✊ HALATI ÇEK!</Text></Pressable>
   {!!feedback&&<Text style={{color:lastHit?'#A0FFDA':'#FFB0B0',fontSize:17,fontWeight:'900',textAlign:'center'}}>{feedback}</Text>}
  </Card>:<Card style={{gap:10}}>
   <Title size={24}>🏆 {winner}</Title>
   <Text style={{color:'#E8F1FF'}}>Takım A: {state.a} · Takım B: {state.b} kuvvet</Text>
   <Muted>Etkinliği oda kurucusu bitirdiğinde ana oyun devam eder.</Muted>
   {isHost&&!main&&<Pressable onPress={replay} disabled={busy} style={{padding:17,alignItems:'center',borderRadius:15,backgroundColor:busy?'#42576D':'#13A785'}}><Text style={{color:'#FFFFFF',fontSize:18,fontWeight:'900'}}>{busy?'Hazırlanıyor…':'🔁 TEKRAR OYNA'}</Text></Pressable>}
   {!isHost&&!main&&<Muted>Tekrar oynamak için kurucuyu bekle.</Muted>}
  </Card>}
  {!wide&&<Muted>📱 Telefonu yatay çevirerek arenayı daha geniş görebilirsin.</Muted>}
  {!!error&&<Text style={{color:'#FF8592'}}>{error}</Text>}
 </View>;
}
