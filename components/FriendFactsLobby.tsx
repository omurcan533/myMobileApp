import React,{useEffect,useState} from 'react';
import {TextInput,View} from 'react-native';
import {api} from '../lib/api';
import {Btn,Card,Muted,Text,Title} from './ui';
import type {Player} from '../lib/types';
export const QUESTIONS=[['zodiac','Burcun ne?'],['siblings','Kaç kardeşin var?'],['shoe','Ayakkabı numaran kaç?'],['team','Hangi takımı tutuyorsun?'],['school','İlkokul numaran neydi?'],['age','Yaşın kaç?']] as const;
export function FriendFactsLobby({roomId,players,onReady}:{roomId:string;players:Player[];onReady:(v:boolean)=>void}){
const [facts,setFacts]=useState<Record<string,string>>({});
const [progress,setProgress]=useState<{player_id:string;count:number}[]>([]);
const [reveal,setReveal]=useState<{player_id:string;question_key:string;answer:string}[]>([]);
const [saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
const refresh=async()=>{try{const p=await api.friendFactProgress(roomId);setProgress(p);const ready=players.length>=2&&players.every(x=>(p.find(v=>v.player_id===x.id)?.count??0)>=6);onReady(ready);if(ready)setReveal(await api.friendFactReveal(roomId));}catch(e){setError((e as Error).message);}};
useEffect(()=>{refresh();const t=setInterval(refresh,5000);return()=>clearInterval(t);},[roomId,players.map(p=>p.id).join(',')]);
const save=async()=>{if(QUESTIONS.some(([k])=>!facts[k]?.trim())){setError('Tüm soruları cevapla.');return;}setBusy(true);try{await api.saveFriendFacts(roomId,facts);setSaved(true);await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
const ready=players.length>=2&&players.every(p=>(progress.find(x=>x.player_id===p.id)?.count??0)>=6);
return <Card style={{gap:12}}><Title size={21}>Beni Ne Kadar Tanıyorsun?</Title><Muted>Herkes cevaplasın. Sonra cevapları birlikte okuyup aklınızda tutun.</Muted>
{!saved&&QUESTIONS.map(([k,label])=><View key={k} style={{gap:5}}><Text>{label}</Text><TextInput value={facts[k]??''} onChangeText={v=>setFacts(s=>({...s,[k]:v}))} maxLength={60} placeholder="Cevabını yaz" placeholderTextColor="#9AA8B9" style={{color:'white',borderWidth:1,borderColor:'#536D91',borderRadius:12,padding:12}}/></View>)}
{!saved?<Btn title="Cevapları Kaydet" onPress={save} loading={busy} tone="success"/>:<Text>✓ Cevapların kaydedildi.</Text>}
<Text>Hazır: {progress.filter(p=>p.count>=6).length}/{players.length}</Text>
{players.map(p=><Text key={p.id}>{(progress.find(x=>x.player_id===p.id)?.count??0)>=6?'✅':'⌛'} {p.nickname}</Text>)}
{ready&&reveal.length>0&&<View style={{gap:12}}><Title size={20}>Herkesin Cevapları</Title><Muted>Birazdan bunları hatırlaman gerekecek!</Muted>{players.map(p=><View key={p.id} style={{padding:12,backgroundColor:'#152A48',borderRadius:12,gap:4}}><Title size={17}>{p.nickname}</Title>{QUESTIONS.filter(([k])=>k!=='age').map(([k,q])=><Text key={k}>{q} {reveal.find(f=>f.player_id===p.id&&f.question_key===k)?.answer??'—'}</Text>)}</View>)}</View>}
{!!error&&<Text style={{color:'#F27889'}}>{error}</Text>}<Btn title="Yenile" tone="ghost" onPress={refresh}/></Card>;
}