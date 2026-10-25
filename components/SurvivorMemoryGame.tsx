import React,{useEffect,useState} from 'react';
import {ActivityIndicator,StyleSheet,View,Pressable,TextInput} from 'react-native';
import {api} from '../lib/api';
import {Card,Muted,Title,Text,Btn} from './ui';

type Preview={greens:number[];whiteRow:number;whiteCol:number};
type Progress={row:number;retry:boolean;failed:boolean;lastCol?:number;lastOutcome?:string};
export function SurvivorMemoryGame({id,startsAt,live,paused,isCaptain,side,state,onError}:{
 id:string;startsAt:string|null;live:boolean;paused:boolean;isCaptain:boolean;side:'A'|'B'|null;
 state?:Record<string,Progress>|null;onError?:(message:string)=>void;
}){
 const [preview,setPreview]=useState<Preview|null>(null);
 const [clock,setClock]=useState(Date.now());
 const [busy,setBusy]=useState(false);
 const [feedback,setFeedback]=useState('');
 const [messages,setMessages]=useState<{id:number;nickname:string;body:string}[]>([]);
 const [draft,setDraft]=useState('');
 const [sending,setSending]=useState(false);
 useEffect(()=>{
  if(!side)return;
  let active=true;
  const refresh=()=>api.survivorReadMessages(id).then(rows=>{if(active)setMessages(rows)}).catch(()=>{});
  refresh();const timer=setInterval(refresh,1500);
  return()=>{active=false;clearInterval(timer)};
 },[id,side]);
 const send=async()=>{
  if(!draft.trim()||sending)return;
  setSending(true);
  try{await api.survivorSendMessage(id,draft.trim());setDraft('');setMessages(await api.survivorReadMessages(id))}
  catch(e){onError?.((e as Error).message)}finally{setSending(false)}
 };
 useEffect(()=>{const t=setInterval(()=>setClock(Date.now()),200);return()=>clearInterval(t)},[]);
 const previewing=!!startsAt&&clock<Date.parse(startsAt)&&live;
 useEffect(()=>{
  if(!previewing)return;
  let mounted=true;
  api.survivorPreview(id).then(p=>{if(mounted&&p)setPreview(p)}).catch(e=>onError?.(e.message));
  return()=>{mounted=false};
 },[id,previewing]);
 const own=side?state?.[side]:undefined;
 const opponent=side?state?.[side==='A'?'B':'A']:undefined;
 const choose=async(col:number)=>{
  if(!live||paused||previewing||!isCaptain||busy||own?.failed||(own?.row??0)>=7)return;
  setBusy(true);
  try{
   const result=await api.survivorChoose(id,col);
   setFeedback(result.lastOutcome==='green'?'Doğru fayans!':result.lastOutcome==='white'?'Beyaz fayans! Ek deneme hakkı.':result.failed?'Kırmızı fayans! Parkur sona erdi.':'Kırmızı fayans! Ek hakkın kullanıldı.');
  }catch(e){onError?.((e as Error).message)}finally{setBusy(false)}
 };
 return <Card style={{gap:12}}>
  <Title size={23}>Survivor Hafıza Parkuru</Title>
  <Muted>7 sıra · Her sırada 1 yeşil. Beyaz fayans ek deneme hakkı verir. Önce renkleri ezberle, sonra sadece kaptan fayans seçebilir.</Muted>
  {previewing?<Text style={styles.notice}>Fayansları ezberle! {Math.ceil((Date.parse(startsAt!)-clock)/1000)} sn</Text>:<Text style={styles.notice}>{!startsAt?'Başlaması bekleniyor':isCaptain?'Sıra sende, kaptan!':'Kaptan oynuyor — takımına doğru yolu söyle.'}</Text>}
  <View style={styles.grid}>
   {Array.from({length:7},(_,row)=>Array.from({length:5},(_,col)=>{
    const visible=previewing&&preview;
    const color=visible?(preview.greens[row]===col?'#36C88A':preview.whiteRow===row&&preview.whiteCol===col?'#F4F6FA':'#E65869'):'#2D4262';
    const current=(own?.row??0)===row;
    const cleared=(own?.row??0)>row;
    return <Pressable key={row+'-'+col} disabled={!current||previewing||!isCaptain||busy||!live||paused||!!own?.failed}
      onPress={()=>choose(col)}
      style={[styles.tile,{backgroundColor:color,borderColor:current&&!previewing?'#9BE7FF':'#4B6382',opacity:!previewing&&cleared?0.4:1}]}>
      {!previewing&&cleared?<Text style={styles.symbol}>✓</Text>:null}
      {previewing&&preview?.whiteRow===row&&preview.whiteCol===col?<Text style={{color:'#102039',fontWeight:'bold'}}>★</Text>:null}
    </Pressable>
   }))}
  </View>
  <Text style={styles.notice}>Takımın: {Math.min(7,own?.row??0)}/7 · Rakip: {Math.min(7,opponent?.row??0)}/7</Text>
  {own?.retry?<Muted>Ek deneme hakkın var.</Muted>:null}
  {own?.failed?<Muted>Takımının denemesi bitti. Rakibin sonucu bekleniyor.</Muted>:null}
  {feedback?<Muted>{feedback}</Muted>:null}
  {busy?<ActivityIndicator/>:null}
  <Title size={18}>Takım Sohbeti</Title>
  <Muted>Mesajları yalnızca kendi takımın görebilir. Kaptana hatırladığın yolu söyle!</Muted>
  <View style={styles.messages}>{messages.slice(-8).map(m=><Text key={m.id} style={styles.message}><Text style={styles.nickname}>{m.nickname}: </Text>{m.body}</Text>)}</View>
  <View style={styles.compose}>
   <TextInput value={draft} onChangeText={setDraft} placeholder="Takımına yaz..." placeholderTextColor="#92A3BB" maxLength={140} style={styles.input} editable={live}/>
   <Btn title="Gönder" size="sm" disabled={!live||!draft.trim()||sending} onPress={send}/>
  </View>
 </Card>;
}
const styles=StyleSheet.create({
 notice:{color:'#BCEEFF',fontWeight:'700',textAlign:'center'},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:6,alignSelf:'center',width:'100%',maxWidth:360,justifyContent:'center'},
 tile:{width:'18%',aspectRatio:1,borderRadius:9,borderWidth:2,alignItems:'center',justifyContent:'center'},
 symbol:{fontSize:20,color:'#fff',fontWeight:'800'},
 messages:{gap:6,maxHeight:160,overflow:'hidden'},
 message:{color:'#E5ECF8',fontSize:13},nickname:{color:'#74D9FF',fontWeight:'700'},
 compose:{flexDirection:'row',gap:8,alignItems:'center'},
 input:{flex:1,minHeight:42,borderWidth:1,borderColor:'#4B6382',borderRadius:9,paddingHorizontal:10,color:'#fff'}
});
