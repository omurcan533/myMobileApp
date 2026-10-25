import React,{useEffect,useState} from 'react';
import {ActivityIndicator,StyleSheet,View,Pressable,TextInput,Animated} from 'react-native';
import {api} from '../lib/api';
import {Card,Muted,Title,Text,Btn} from './ui';

type Preview={greens:number[];whiteRow:number;whiteCol:number};
type Reveal={row:number;greenCol:number;whiteCol:number;selectedCol:number;outcome:string};
type Progress={row:number;retry:boolean;failed:boolean;attempt?:number;lastCol?:number;lastOutcome?:string;reveal?:Reveal};
export function SurvivorMemoryGame({id,startsAt,live,paused,isCaptain,side,state,onError}:{
 id:string;startsAt:string|null;live:boolean;paused:boolean;isCaptain:boolean;side:'A'|'B'|null;
 state?:Record<string,Progress>|null;onError?:(message:string)=>void;
}){
 const [preview,setPreview]=useState<Preview|null>(null);
 const [clock,setClock]=useState(Date.now());
 const [busy,setBusy]=useState(false);
 const [feedback,setFeedback]=useState('');
 const [localProgress,setLocalProgress]=useState<Progress|null>(null);
 const [flipped,setFlipped]=useState<Reveal|null>(null);
 const [revealedRows,setRevealedRows]=useState<Record<number,Reveal>>({});
 const [animationBusy,setAnimationBusy]=useState(false);
 const flipScale=React.useRef(new Animated.Value(1)).current;
 const flash=React.useRef(new Animated.Value(0)).current;
 const animationRef=React.useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{if(animationRef.current)clearTimeout(animationRef.current)},[]);
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
 const serverProgress = side ? state?.[side] : undefined;
 const own = localProgress && (localProgress.attempt ?? 0) >= (serverProgress?.attempt ?? 0)
  ? localProgress
  : serverProgress;
 const opponent=side?state?.[side==='A'?'B':'A']:undefined;
 useEffect(()=>{
  if(own?.reveal){
   const reveal=own.reveal;
   setRevealedRows(prev=>{
    if(reveal.outcome==='red')return {};
    if(reveal.outcome==='white')return Object.fromEntries(Object.entries(prev).filter(([row])=>Number(row)<(own?.row??0))) as Record<number,Reveal>;
    return prev[reveal.row]?.selectedCol===reveal.selectedCol && prev[reveal.row]?.outcome===reveal.outcome?prev:{...prev,[reveal.row]:reveal};
   });
  }
 },[own?.attempt,own?.reveal?.row,own?.reveal?.selectedCol,own?.reveal?.outcome]);
 const choose=async(col:number)=>{
  if(!live||paused||previewing||!isCaptain||busy||animationBusy||(own?.row??0)>=7)return;
  setBusy(true);
  try{
   const result=await api.survivorChoose(id,col);
   setLocalProgress(result);
   const reveal=result.reveal;
   if(reveal){
    setRevealedRows(prev=>reveal.outcome==='red'?{}:reveal.outcome==='white'?(Object.fromEntries(Object.entries(prev).filter(([row])=>Number(row)<result.row)) as Record<number,Reveal>):{...prev,[reveal.row]:reveal});
    setAnimationBusy(true);
    setFlipped(reveal);
    flipScale.setValue(0.8);
    Animated.spring(flipScale,{toValue:1,useNativeDriver:true,friction:5}).start();
    if(reveal.outcome!=='green'){
     flash.setValue(0);
     Animated.sequence([
      Animated.timing(flash,{toValue:1,duration:130,useNativeDriver:false}),
      Animated.timing(flash,{toValue:0,duration:450,useNativeDriver:false}),
     ]).start();
    }
    setFeedback(reveal.outcome==='green'?'DOĞRU! Yeşil fayansı buldun.':reveal.outcome==='white'?'BEYAZ FAYANS! Bir önceki sıraya dönüyorsun.':'YANLIŞ! Kırmızı fayans. En başa dönüyorsun!');
    if(animationRef.current)clearTimeout(animationRef.current);
    animationRef.current=setTimeout(()=>{setFlipped(null);setAnimationBusy(false)},1100);
   }
  }catch(e){onError?.((e as Error).message)}finally{setBusy(false)}
 };
 return <Card style={{gap:12}}>
  <Title size={23}>Survivor Hafıza Parkuru</Title>
  <Muted>7 sıra · Her sırada 1 yeşil. Renkleri ezberle. Kırmızıya basarsan en başa, beyaza basarsan bir önceki sıraya dönersin. Yalnızca kaptan seçim yapar.</Muted>
  {previewing?<Text style={styles.notice}>Fayansları ezberle! {Math.ceil((Date.parse(startsAt!)-clock)/1000)} sn</Text>:<Text style={styles.notice}>{!startsAt?'Başlaması bekleniyor':isCaptain?'Sıra sende, kaptan!':'Kaptan oynuyor — takımına doğru yolu söyle.'}</Text>}
  <Animated.View style={[styles.grid,{transform:[{scale:flipScale}],backgroundColor:flash.interpolate({inputRange:[0,1],outputRange:['transparent','#A82D41']})}]}>
   {Array.from({length:7},(_,row)=>Array.from({length:5},(_,col)=>{
    const visible=previewing&&preview;
    const rowReveal=flipped?.row===row?flipped:revealedRows[row];
    const wrongSelection=rowReveal?.outcome==='red'||rowReveal?.outcome==='white';
    const revealRow=!!rowReveal;
    const color=visible?(preview.greens[row]===col?'#36C88A':preview.whiteRow===row&&preview.whiteCol===col?'#F4F6FA':'#E65869'):wrongSelection?(rowReveal?.selectedCol===col?(rowReveal.outcome==='white'?'#F4F6FA':'#E65869'):'#2D4262'):revealRow?(rowReveal?.greenCol===col?'#36C88A':rowReveal?.whiteCol===col?'#F4F6FA':'#E65869'):'#2D4262';
    const current=(own?.row??0)===row;
    return <Pressable key={row+'-'+col} disabled={!current||previewing||!isCaptain||busy||animationBusy||!live||paused}
      onPress={()=>choose(col)}
      style={[styles.tile,{backgroundColor:color,borderColor:rowReveal?.selectedCol===col&&rowReveal.outcome==='green'?'#B9FF68':current&&!previewing?'#9BE7FF':'#4B6382',borderWidth:rowReveal?.selectedCol===col&&rowReveal.outcome==='green'?4:2,opacity:1}]}>
      {revealRow&&rowReveal?.selectedCol===col?<Text style={[styles.symbol,{color:rowReveal?.outcome==='white'?'#15233B':'#fff'}]}>{rowReveal?.outcome==='green'?'✓':'✕'}</Text>:null}
      {previewing&&preview?.whiteRow===row&&preview.whiteCol===col?<Text style={{color:'#102039',fontWeight:'bold'}}>★</Text>:null}
    </Pressable>
   }))}
  </Animated.View>
  <Text style={styles.notice}>Takımın: {Math.min(7,own?.row??0)}/7 · Rakip: {Math.min(7,opponent?.row??0)}/7</Text>
  {feedback?<Text style={[styles.notice,{color:flipped?.outcome==='red'?'#FF7A88':'#BCEEFF'}]}>{feedback}</Text>:null}
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
