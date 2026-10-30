import { translate, useLanguage } from '../lib/i18n';
import React,{useCallback,useEffect,useState} from 'react';
import {TextInput,View} from 'react-native';
import {api} from '../lib/api';
import {Btn,Card,Muted,Text,Title} from './ui';
import type {Player} from '../lib/types';
export const QUESTIONS=[['zodiac','Burcun ne?'],['siblings','Kaç kardeşin var?'],['shoe','Ayakkabı numaran kaç?'],['team','Hangi takımı tutuyorsun?'],['school','İlkokul numaran neydi?'],['age','Yaşın kaç?']] as const;
export function FriendFactsLobby({roomId,players,onReady}:{roomId:string;players:Player[];onReady:(v:boolean)=>void}){
useLanguage();
const [facts,setFacts]=useState<Record<string,string>>({});
const [progress,setProgress]=useState<{player_id:string;count:number}[]>([]);
const [reveal,setReveal]=useState<{player_id:string;question_key:string;answer:string}[]>([]);
const [saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
const playerIds=players.map(p=>p.id).join(',');
const refresh=useCallback(async()=>{try{const p=await api.friendFactProgress(roomId);setProgress(p);const ids=playerIds.split(',').filter(Boolean);const ready=ids.length>=2&&ids.every(id=>(p.find(v=>v.player_id===id)?.count??0)>=6);onReady(ready);if(ready)setReveal(await api.friendFactReveal(roomId));}catch(e){setError((e as Error).message);}},[roomId,playerIds,onReady]);
useEffect(()=>{const initial=setTimeout(()=>{void refresh();},0);const t=setInterval(()=>{void refresh();},5000);return()=>{clearTimeout(initial);clearInterval(t);};},[refresh]);
const save=async()=>{if(QUESTIONS.some(([k])=>!facts[k]?.trim())){setError(translate("Tüm soruları cevapla."));return;}setBusy(true);try{await api.saveFriendFacts(roomId,facts);setSaved(true);await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
const ready=players.length>=2&&players.every(p=>(progress.find(x=>x.player_id===p.id)?.count??0)>=6);
return <Card style={{gap:12}}><Title size={21}>{translate("Beni Ne Kadar Tanıyorsun?")}</Title><Muted>{translate("Herkes cevaplasın. Sonra cevapları birlikte okuyup aklınızda tutun.")}</Muted>
{!saved&&QUESTIONS.map(([k,label])=><View key={k} style={{gap:5}}><Text style={{ color: '#F2F7FF', fontWeight: '600' }} >{translate(label)}</Text><TextInput value={facts[k]??''} onChangeText={v=>setFacts(s=>({...s,[k]:v}))} maxLength={60} placeholder={translate("Cevabını yaz")} placeholderTextColor="#9AA8B9" style={{color:'white',borderWidth:1,borderColor:'#536D91',borderRadius:12,padding:12}}/></View>)}
{!saved?<Btn title={translate("Cevapları Kaydet")} onPress={save} loading={busy} tone="success"/>:<Text style={{ color: '#5EF0C0', fontWeight: '700' }}>{translate("✓ Cevapların kaydedildi.")}</Text>}
<Text style={{ color: '#E8F2FF', fontWeight: '700' }}>{translate('Hazır:')} {progress.filter(p=>p.count>=6).length}/{players.length}</Text>
{players.map(p=><Text key={p.id} style={{ color: '#E8F2FF' }}>{(progress.find(x=>x.player_id===p.id)?.count??0)>=6?'✅':'⌛'} {p.nickname}</Text>)}
{ready&&reveal.length>0&&<View style={{gap:12}}><Title size={20}>{translate("Herkesin Cevapları")}</Title><Muted>{translate("Birazdan bunları hatırlaman gerekecek!")}</Muted>{players.map(p=><View key={p.id} style={{padding:12,backgroundColor:'#152A48',borderRadius:12,gap:4}}><Title size={17}>{p.nickname}</Title>{QUESTIONS.filter(([k])=>k!=='age').map(([k,q])=><Text key={k} style={{ color: '#E8F2FF' }}>{translate(q)} {reveal.find(f=>f.player_id===p.id&&f.question_key===k)?.answer??'—'}</Text>)}</View>)}</View>}
{!!error&&<Text style={{color:'#F27889'}}>{error}</Text>}<Btn title={translate("Yenile")} tone="ghost" onPress={refresh}/></Card>;
}