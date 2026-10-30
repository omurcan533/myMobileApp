import { translate, useLanguage } from '../lib/i18n';
import React,{useEffect,useState} from 'react';
import {TextInput,View} from 'react-native';
import {api} from '../lib/api';
import {Btn,Card,Muted,Text,Title} from './ui';
import {QUESTIONS} from './FriendFactsLobby';
import type {Player} from '../lib/types';
export function FriendMemoryQuiz({minigameId,players,live,canPlay}:{minigameId:string;players:Player[];live:boolean;canPlay:boolean}){
useLanguage();
const [question,setQuestion]=useState<{target_id:string;question_key:string;answered:boolean;correct:boolean|null}|null>(null);
const [guess,setGuess]=useState(''),[result,setResult]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
useEffect(()=>{let active=true;api.friendQuizQuestion(minigameId).then(q=>{if(active){setQuestion(q);setResult(q?.answered?q.correct:null);}}).catch(()=>{});return()=>{active=false;};},[minigameId]);
if(!question)return null;
const target=players.find(p=>p.id===question.target_id)?.nickname??translate("Arkadaşın");
const label=QUESTIONS.find(([k])=>k===question.question_key)?.[1]??translate("Cevabı neydi?");
const send=async()=>{if(!guess.trim()||busy)return;setBusy(true);try{const ok=await api.submitFriendGuess(minigameId,guess.trim());setResult(ok);setQuestion(q=>q?{...q,answered:true,correct:ok}:q);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
return <Card style={{gap:10}}><Title size={20}>{translate("🧠 Dostluk Hafızası")}</Title><Muted>{translate("Oyun başında arkadaşının verdiği cevabı hatırlıyor musun? Her oyuncunun bir tahmin hakkı var.")}</Muted>
<Text style={{fontSize:18,fontWeight:'700'}}>{target}: {label}</Text>
{question.answered?<Text style={{color:result?'#42DDA7':'#F27889'}}>{result?translate("🎖 Doğru hatırladın!"):translate("Bu kez hatırlayamadın.")}</Text>:<View style={{gap:8}}><TextInput value={guess} onChangeText={setGuess} maxLength={60} placeholder={translate("Hatırladığın cevabı yaz...")} placeholderTextColor="#9AA8B9" style={{borderWidth:1,borderColor:'#536D91',color:'white',borderRadius:12,padding:12}} editable={live&&canPlay&&!busy}/><Btn title={translate("Tahmin Et")} tone="success" disabled={!live||!canPlay||!guess.trim()||busy} loading={busy} onPress={send}/></View>}
{!!error&&<Text style={{color:'#F27889'}}>{error}</Text>}</Card>;
}