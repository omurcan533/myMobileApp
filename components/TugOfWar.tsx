import React,{useEffect,useRef,useState} from 'react';
import {View,Pressable} from 'react-native';
import {api} from '../lib/api';
import {supabase} from '../lib/supabase';
import {Card,Muted,Text,Title} from './ui';
import type {Player} from '../lib/types';

type TugState={a:number;b:number;players:{nickname:string;side:string;force:number}[]};
export function TugOfWar({event,players,myId,isHost}:{event:any;players:Player[];myId:string;isHost:boolean}){
 const [now,setNow]=useState(Date.now());
 const [startedAt,setStartedAt]=useState<string>(event.created_at);
 const [state,setState]=useState<TugState>({a:0,b:0,players:[]});
 const [feedback,setFeedback]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const lastPull=useRef(0);
 useEffect(()=>{
  if(event.created_at!==startedAt){setStartedAt(event.created_at);setState({a:0,b:0,players:[]});setFeedback('');setError('');lastPull.current=0;setNow(Date.now());}
 },[event.created_at]);
 const channel=useRef<ReturnType<typeof supabase.channel>|null>(null);
 const refresh=async()=>{try{const s=await api.partyTugState(event.id);if(s)setState(s);}catch{}};
 useEffect(()=>{
  refresh();
  const timer=setInterval(()=>{setNow(Date.now());refresh();},700);
  const ch=supabase.channel('tug:'+event.id);
  ch.on('broadcast',{event:'pull'},()=>{refresh();}).subscribe();
  channel.current=ch;
  return()=>{clearInterval(timer);supabase.removeChannel(ch);channel.current=null;};
 },[event.id]);
 const elapsed=Math.max(0,(now-Date.parse(startedAt))/1000);
 const remaining=Math.max(0,Math.ceil(35-elapsed));
 // Her telefonda akıcı yerel ibre. Dokunma sonucu ağ beklemeden gösterilir.
 const position=(Math.sin(now/650)+1)/2;
 const accuracy=Math.abs(position-0.5);
 const force=Math.max(0,Math.round(100-accuracy*200));
 const me=players.find(p=>p.id===myId);
 const side=me?.team_side;
 const total=state.a+state.b;
 const rope=total>0?Math.max(-44,Math.min(44,(state.a-state.b)/Math.max(250,total)*85)):0;
 const pull=async()=>{
  if(busy||remaining===0||!side||Date.now()-lastPull.current<470)return;
  lastPull.current=Date.now();
  setFeedback(force>=80?'🎯 Mükemmel! +'+force:force>=45?'💪 İyi çekiş! +'+force:'😬 Zayıf çekiş! +'+force);
  setBusy(true);setError('');
  try{
   await api.partyTugPull(event.id,force);
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
 return <View style={{gap:14}}>
  <Title size={23}>🪢 Halat Çekme</Title>
  <Muted>İbre ortadaki yeşil alana geldiğinde ÇEK! Her oyuncunun kuvveti takımına eklenir.</Muted>
  <Title size={24}>⏱ {remaining} saniye</Title>
  <Card style={{gap:10}}>
   <View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={{color:'#8CDCFD'}}>🔵 A: {state.a}</Text><Text style={{color:'#FFB0C4'}}>🔴 B: {state.b}</Text></View>
   <View style={{height:54,backgroundColor:'#21334D',borderRadius:12,justifyContent:'center',overflow:'hidden'}}>
    <View style={{position:'absolute',left:'50%',width:3,height:54,backgroundColor:'#FFFFFF77'}}/>
    <Text style={{textAlign:'center',fontSize:27,color:'#FFFFFF',transform:[{translateX:rope}]}}>🟦━━━━🪢━━━━🟥</Text>
   </View>
   <Muted>Halatın konumu sunucuda onaylanan toplam kuvvete göre hesaplanır.</Muted>
  </Card>
  {remaining>0?<Card style={{gap:12}}>
   <Title size={17}>🎯 Zamanlamayı yakala</Title>
   <View style={{height:28,backgroundColor:'#33425C',borderRadius:14,overflow:'hidden',justifyContent:'center'}}>
    <View style={{position:'absolute',left:'40%',width:'20%',height:28,backgroundColor:'#16A085'}}/>
    <View style={{position:'absolute',left:(position*94)+'%',width:'6%',height:28,backgroundColor:'#FFFFFF',borderRadius:8}}/>
   </View>
   <Pressable onPress={pull} disabled={busy||!side} style={{padding:19,alignItems:'center',borderRadius:16,backgroundColor:busy?'#42576D':'#13A785'}}><Text style={{color:'#FFFFFF',fontSize:22,fontWeight:'800'}}>✊ ÇEK!</Text></Pressable>
   {!!feedback&&<Text style={{color:'#E8F1FF',textAlign:'center'}}>{feedback}</Text>}
  </Card>:<Card style={{gap:8}}><Title size={23}>🏆 {winner}</Title><Text style={{color:'#E8F1FF'}}>A Takımı: {state.a} kuvvet · B Takımı: {state.b} kuvvet</Text><Muted>Etkinliği oda kurucusu bitirdiğinde ana oyun devam eder.</Muted>{isHost&&<Pressable onPress={replay} disabled={busy} style={{padding:15,alignItems:'center',borderRadius:14,backgroundColor:busy?'#42576D':'#13A785'}}><Text style={{color:'#FFFFFF',fontSize:18,fontWeight:'800'}}>{busy?'Hazırlanıyor…':'🔁 Tekrar Oyna'}</Text></Pressable>}{!isHost&&<Muted>Yeniden oynamak için oda kurucusunun Tekrar Oyna'ya basmasını bekle.</Muted>}</Card>}
  {!!error&&<Text style={{color:'#FF8592'}}>{error}</Text>}
 </View>;
}
