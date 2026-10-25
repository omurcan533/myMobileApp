import React,{useEffect,useState} from 'react';
import {ScrollView,View,TextInput} from 'react-native';
import {api} from '../lib/api';
import {Btn,Card,Muted,Text,Title} from './ui';
import type {Player} from '../lib/types';
const TASKS=['60 saniyede en az iki kişiyi güldür!','Tek ayak üstünde 10 kere zıpla!','30 saniye ünlü birini taklit et!','Komik bir selfie çek; istersen 10 dakika hikâyende paylaş!','30 saniye uydurma bir ürünün reklamını yap!','Bir şarkıyı sadece mırıldanarak anlat!','60 saniye hiç gülmeden dayan!'];
const EVENTS=[['challenge','Şanslı Kişi'],['first_word','İlk Aklına Gelen'],['age_guess','Yaş Tahmini'],['spot_diff','Farkı Bul'],['eye_duel','Göz Göze Düello']] as const;
const SCENES=[['🌳','🐱','🌞','🚗','🌷','🏠','🐶','🚲','🍎'],['🌳','🐱','🌛','🚗','🌻','🏠','🐶','🛴','🍎']];
export function PartyBreak({roomId,players,myId,isHost,canStart}:{roomId:string;players:Player[];myId:string;isHost:boolean;canStart:boolean}){
const [tick,setTick]=useState(Date.now());
useEffect(()=>{const t=setInterval(()=>setTick(Date.now()),1000);return()=>clearInterval(t);},[]);
const [event,setEvent]=useState<any>(null),[showMenu,setShowMenu]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[answer,setAnswer]=useState(''),[age,setAge]=useState<Record<string,string>>({}),[winner,setWinner]=useState<string|null>(null),[ageMedals,setAgeMedals]=useState<any[]>([]);
const refresh=async()=>{try{const e=await api.partyEventCurrent(roomId);setEvent(e);if(!e)setWinner(null);}catch{}};
useEffect(()=>{refresh();const t=setInterval(refresh,2500);return()=>clearInterval(t);},[roomId]);
const run=async(fn:()=>Promise<any>)=>{setBusy(true);setError('');try{await fn();await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
const start=(kind:string)=>run(async()=>{const prompt=kind==='challenge'?TASKS[Math.floor(Math.random()*TASKS.length)]:kind==='first_word'?'Herkes seçilen kişiye baksın ve aklına gelen ilk kelimeyi sırayla söylesin!':kind==='age_guess'?'Herkes diğer oyuncuların yaşını tahmin etsin!':kind==='spot_diff'?'İki resimde kaç fark var?':'Eşleşen oyuncular 60 saniye göz göze baksın. İlk gülen kaybeder!';await api.partyEventStart(roomId,kind,prompt);setShowMenu(false);setAnswer('');setAge({});setWinner(null);});
const votes=event?.votes??[];
const paired=[...players].sort((a,b)=>{const hash=(v:string)=>[...v].reduce((n,ch)=>((n*31+ch.charCodeAt(0))|0),0);return hash((event?.id??'')+a.id)-hash((event?.id??'')+b.id);});
const mine=votes.find((v:any)=>v.player_id===myId);
const allVoted=votes.length>=players.length;
const count=(id:string)=>votes.filter((v:any)=>v.target_id===id).length;
const top=players.filter(p=>count(p.id)>0&&count(p.id)===Math.max(...players.map(x=>count(x.id))));
const chosen=top.length===1?top[0]:null;
const submit=(target:string|null,txt:string|null=null)=>run(()=>api.partyEventVote(event.id,target,txt));
const finish=()=>run(()=>api.partyEventFinish(event.id));
if(!event&&!canStart)return null;
return <View style={{gap:10}}>
{!event?<Card style={{gap:8}}><Title size={18}>🎉 Eğlence Molası</Title><Muted>Ana oyunun arasında arkadaşlarını şaşırtacak bir etkinlik başlat.</Muted>{isHost&&<Btn title={showMenu?'Etkinlikleri Gizle':'Sürpriz Etkinlik Başlat'} onPress={()=>setShowMenu(v=>!v)}/>}
{showMenu&&isHost&&EVENTS.map(([kind,label])=><Btn key={kind} title={label} tone="ghost" disabled={busy||(kind==='eye_duel'&&players.length%2!==0)} onPress={()=>start(kind)}/>)}</Card>:
<Card style={{gap:12}}><Title size={23}>🎲 {EVENTS.find(x=>x[0]===event.kind)?.[1]}</Title><Text style={{fontSize:17}}>{event.prompt}</Text>
{event.kind==='challenge'&&<View style={{gap:8}}><Muted>İki takımın bütün oyuncuları oy verir. Kendine oy veremezsin.</Muted>{!mine?players.filter(p=>p.id!==myId).map(p=><Btn key={p.id} title={p.nickname} tone="ghost" onPress={()=>submit(p.id)}/>):<Text>✓ Oyun kaydedildi. {votes.length}/{players.length} oy</Text>}
{allVoted&&<View style={{gap:8}}><Title size={20}>{chosen?'🎉 Şanslı kişi: '+chosen.nickname:'Beraberlik! Kurucu kura çekebilir.'}</Title>{top.length>1&&isHost&&<Btn title="Beraberliği Kura ile Çöz" onPress={()=>setWinner(top[Math.floor(Math.random()*top.length)].nickname)}/>}{winner&&<Title size={18}>🎲 Seçilen: {winner}</Title>}<Muted>Görev gönüllülük esaslıdır. İsteyen pas geçebilir.</Muted></View>}</View>}
{event.kind==='first_word'&&<View style={{gap:6}}><Title size={20}>{players.find(p=>p.id===event.target_id)?.nickname}</Title><Muted>Herkes sırayla ilk aklına gelen kelimeyi sesli söylesin. Puan yok.</Muted></View>}
{event.kind==='eye_duel'&&<View style={{gap:8}}><Title size={20}>⏱ {Math.max(0,60-Math.floor((tick-Date.parse(event.created_at))/1000))} saniye</Title>{paired.filter((_,i)=>i%2===0).map((p,i)=><Text key={p.id}>👀 {p.nickname} ↔ {paired[i*2+1]?.nickname}</Text>)}<Muted>60 saniyeyi birlikte sayın; ilk dişlerini gösterip gülen kaybeder.</Muted></View>}
{event.kind==='spot_diff'&&<View style={{gap:12}}>{SCENES.map((scene,i)=><View key={i} style={{flexDirection:'row',flexWrap:'wrap',width:240,alignSelf:'center',backgroundColor:'#17334D',padding:12,borderRadius:14}}>{scene.map((v,j)=><Text key={j} style={{width:70,fontSize:32,textAlign:'center'}}>{v}</Text>)}</View>)}{!mine?<View style={{gap:6}}><TextInput value={answer} onChangeText={setAnswer} keyboardType="number-pad" placeholder="Kaç fark var?" placeholderTextColor="#A8B5C8" style={{color:'white',borderWidth:1,borderColor:'#72849D',padding:12,borderRadius:10}}/><Btn title="Tahmin Gönder" onPress={()=>submit(null,answer)} disabled={!answer.trim()}/></View>:<Text>✓ Tahminin: {mine.answer}</Text>}{allVoted&&<Text>Doğru cevap: 3 fark. {votes.filter((v:any)=>v.answer==='3').length} kişi bildi!</Text>}</View>}
{event.kind==='age_guess'&&<View style={{gap:8}}>{!mine?players.filter(p=>p.id!==myId).map(p=><View key={p.id} style={{gap:4}}><Text>{p.nickname}</Text><TextInput value={age[p.id]??''} onChangeText={v=>setAge(s=>({...s,[p.id]:v}))} keyboardType="number-pad" maxLength={3} placeholder="Yaş tahminin" placeholderTextColor="#A8B5C8" style={{color:'white',borderWidth:1,borderColor:'#72849D',padding:10,borderRadius:10}}/></View>):<Text>✓ Tahminlerin kaydedildi.</Text>}{!mine&&<Btn title="Tüm Yaş Tahminlerini Gönder" disabled={players.filter(p=>p.id!==myId).some(p=>!age[p.id])} onPress={()=>submit(null,JSON.stringify(age))}/>}<Muted>Herkesi doğru bilen Üstün Dost Madalyası kazanır. Sonuçlar etkinlik kapanınca hesaplanır.</Muted></View>}
{isHost&&<Btn title="Etkinliği Bitir ve Oyuna Dön" tone="success" onPress={finish} disabled={busy||((event.kind==='challenge'||event.kind==='age_guess'||event.kind==='spot_diff')&&!allVoted)}/>}
</Card>}
{!!error&&<Text style={{color:'#FF8592'}}>{error}</Text>}
</View>;
}
