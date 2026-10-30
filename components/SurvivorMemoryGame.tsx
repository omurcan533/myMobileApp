import { translate, useLanguage } from '../lib/i18n';
import React,{useEffect,useState} from 'react';
import {ActivityIndicator,StyleSheet,View,Pressable,TextInput,Animated,Keyboard,Platform,ViewStyle} from 'react-native';
import {api,GameError} from '../lib/api';
import {serverNow} from '../lib/serverTime';
import {haptic} from '../lib/haptics';
import {Card,Muted,Title,Text,Btn,Sheet} from './ui';
import {usePlaySize} from './PlayLayout';

type Preview={greens:number[];whiteRow:number;whiteCol:number};
type Reveal={row:number;greenCol:number;whiteCol:number;selectedCol:number;outcome:string};
type Progress={row:number;retry:boolean;failed:boolean;attempt?:number;lastCol?:number;lastOutcome?:string;reveal?:Reveal};
export function SurvivorMemoryGame({id,startsAt,live,paused,isCaptain,side,state,onError}:{
 id:string;startsAt:string|null;live:boolean;paused:boolean;isCaptain:boolean;side:'A'|'B'|null;
 state?:Record<string,Progress>|null;onError?:(message:string)=>void;
}){
 useLanguage();
 const area=usePlaySize();
 const [chatOpen,setChatOpen]=useState(false);
 const tileSize=Math.max(28,Math.min(58,Math.floor((area.width-60)/5),Math.floor((area.height-220)/7)));
 const [preview,setPreview]=useState<Preview|null>(null);
 const [clock,setClock]=useState(serverNow);
 const [pending,setPending]=useState<{row:number;col:number}|null>(null);
 const busy=pending!==null;
 const [feedback,setFeedback]=useState('');
 const [localProgress,setLocalProgress]=useState<Progress|null>(null);
 const [flipped,setFlipped]=useState<Reveal|null>(null);
 const [revealedRows,setRevealedRows]=useState<Record<number,Reveal>>({});
 const requestBusy=React.useRef(false);
 const mounted=React.useRef(true);
 const playState=React.useRef({live,paused});
 useEffect(()=>{playState.current={live,paused}},[live,paused]);
 const flash=React.useRef(new Animated.Value(0)).current;
 const animationRef=React.useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(animationRef.current)clearTimeout(animationRef.current)}},[]);
 const [messages,setMessages]=useState<{id:number;nickname:string;body:string}[]>([]);
 const [draft,setDraft]=useState('');
 const [sending,setSending]=useState(false);
 useEffect(()=>{
  if(!side||!chatOpen)return;
  let active=true;
  const refresh=()=>api.survivorReadMessages(id).then(rows=>{if(active)setMessages(rows)}).catch(()=>{});
  refresh();const timer=setInterval(refresh,1500);
  return()=>{active=false;clearInterval(timer)};
 },[id,side,chatOpen]);
 const closeChat=()=>{Keyboard.dismiss();setChatOpen(false)};
 const send=async()=>{
  if(!draft.trim()||sending)return;
  setSending(true);
  try{await api.survivorSendMessage(id,draft.trim());setDraft('');setMessages(await api.survivorReadMessages(id))}
  catch(e){onError?.((e as Error).message)}finally{setSending(false)}
 };
 // Match the shared server clock. Wake at the exact start boundary, then stop
 // ticking the board; a live match needs no countdown-driven grid renders.
 useEffect(()=>{
  if(!live||!startsAt)return;
  const remaining=Date.parse(startsAt)-serverNow();
  const tick=remaining>0?setInterval(()=>setClock(serverNow()),100):undefined;
  const boundary=setTimeout(()=>{if(tick)clearInterval(tick);setClock(serverNow())},Math.max(0,remaining)+1);
  return()=>{if(tick)clearInterval(tick);clearTimeout(boundary)};
 },[live,startsAt]);
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
 const choose=async(row:number,col:number)=>{
  if(!live||paused||!startsAt||serverNow()<Date.parse(startsAt)||!isCaptain||requestBusy.current||row!==(own?.row??0)||row>=7)return;
  requestBusy.current=true;
  setPending({row,col});
  void haptic.selection();
  try{
   const result=await (async()=>{
    try{return await api.survivorChoose(id,col)}catch(error){
     // A clock estimate can be a little early. Only retry a server-rejected
     // start-boundary request; never retry an ambiguous network failure.
     const elapsed=serverNow()-Date.parse(startsAt);
     if(!(error instanceof GameError)||error.code!=='game_not_live'||elapsed<0||elapsed>750)throw error;
     await new Promise(resolve=>setTimeout(resolve,150));
     if(!mounted.current||!playState.current.live||playState.current.paused)throw error;
     return api.survivorChoose(id,col);
    }
   })();
   if(!mounted.current)return;
   setLocalProgress(result);
   const reveal=result.reveal;
   if(reveal){
    setRevealedRows(prev=>reveal.outcome==='red'?{}:reveal.outcome==='white'?(Object.fromEntries(Object.entries(prev).filter(([row])=>Number(row)<result.row)) as Record<number,Reveal>):{...prev,[reveal.row]:reveal});
    setFlipped(reveal);
    if(reveal.outcome!=='green'){
     flash.setValue(0);
     Animated.sequence([
      Animated.timing(flash,{toValue:1,duration:80,useNativeDriver:true}),
      Animated.timing(flash,{toValue:0,duration:180,useNativeDriver:true}),
     ]).start();
    }
    setFeedback(translate(reveal.outcome==='green'?'DOĞRU! Yeşil fayansı buldun.':reveal.outcome==='white'?'BEYAZ FAYANS! Bir önceki sıraya dönüyorsun.':'YANLIŞ! Kırmızı fayans. En başa dönüyorsun!'));
    if(animationRef.current)clearTimeout(animationRef.current);
    animationRef.current=setTimeout(()=>setFlipped(null),200);
   }
  }catch(e){if(mounted.current&&playState.current.live){setFeedback((e as Error).message);onError?.((e as Error).message)}}finally{requestBusy.current=false;if(mounted.current)setPending(null)}
 };
 return <Card style={{gap:area.active?6:12,padding:area.active?10:16}}>
  <Title size={area.active?18:23}>{translate('Survivor Hafıza Parkuru')}</Title>
  {!area.active&&<Muted>{translate('7 sıra · Her sırada 1 yeşil. Renkleri ezberle. Kırmızıya basarsan en başa, beyaza basarsan bir önceki sıraya dönersin. Yalnızca kaptan seçim yapar.')}</Muted>}
  {previewing?<Text style={styles.notice}>{translate('Fayansları ezberle!')} {Math.ceil((Date.parse(startsAt!)-clock)/1000)} {translate('sn')}</Text>:<Text style={styles.notice}>{!live?translate('Parkur tamamlandı'):paused?translate('Oyun duraklatıldı'):!startsAt?translate('Başlaması bekleniyor'):isCaptain?`${translate('Sıra')} ${Math.min(7,(own?.row??0)+1)} / 7 · ${translate('Dokun ve ilerle')}`:translate('Kaptan oynuyor — takımına doğru yolu söyle.')}</Text>}
  <View style={[styles.grid,area.active&&{width:tileSize*5+24}]}>
   <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:'#A82D41',opacity:flash}]}/>
   {Array.from({length:7},(_,row)=>Array.from({length:5},(_,col)=>{
    const visible=previewing&&preview;
    const rowReveal=flipped?.row===row?flipped:revealedRows[row];
    const wrongSelection=rowReveal?.outcome==='red'||rowReveal?.outcome==='white';
    const revealRow=!!rowReveal;
    const color=visible?(preview.greens[row]===col?'#36C88A':preview.whiteRow===row&&preview.whiteCol===col?'#F4F6FA':'#E65869'):wrongSelection?(rowReveal?.selectedCol===col?(rowReveal.outcome==='white'?'#F4F6FA':'#E65869'):'#2D4262'):revealRow?(rowReveal?.greenCol===col?'#36C88A':rowReveal?.whiteCol===col?'#F4F6FA':'#E65869'):'#2D4262';
    const current=(own?.row??0)===row;
    const selected=pending?.row===row&&pending.col===col;
    return <Pressable key={row+'-'+col} testID={`survivor-tile-${row}-${col}`} accessibilityRole="button" accessibilityLabel={`${translate('Sıra')} ${row+1}, ${translate('kutu')} ${col+1}`} accessibilityState={{busy:selected}}
      disabled={!current||previewing||!startsAt||!isCaptain||busy||!live||paused}
      // RN Web uses delayPressIn (50ms by default); native uses unstable_pressDelay.
      {...(Platform.OS==='web'?{delayPressIn:0}:{unstable_pressDelay:0})}
      hitSlop={2} pressRetentionOffset={8} onPressIn={()=>void choose(row,col)}
      style={[styles.tile,webTouchStyle,area.active&&{width:tileSize,height:tileSize}, {backgroundColor:selected?'#FFD166':color,borderColor:selected?'#FFFFFF':rowReveal?.selectedCol===col&&rowReveal.outcome==='green'?'#B9FF68':current&&!previewing?'#9BE7FF':'#4B6382',borderWidth:selected||rowReveal?.selectedCol===col&&rowReveal.outcome==='green'?3:2,opacity:1}]}>
      {selected?<ActivityIndicator size="small" color="#15233B"/>:revealRow&&rowReveal?.selectedCol===col?<Text style={[styles.symbol,{color:rowReveal?.outcome==='white'?'#15233B':'#fff'}]}>{rowReveal?.outcome==='green'?'✓':'✕'}</Text>:null}
      {previewing&&preview?.whiteRow===row&&preview.whiteCol===col?<Text style={{color:'#102039',fontWeight:'bold'}}>★</Text>:null}
    </Pressable>
   }))}
  </View>
  <Text style={styles.notice} >{translate('Takımın:')} {Math.min(7,own?.row??0)}/7 · {translate('Rakip:')} {Math.min(7,opponent?.row??0)}/7</Text>
  <View style={styles.feedback}><Text accessibilityLiveRegion="polite" numberOfLines={2} style={[styles.notice,{fontSize:12,color:busy?'#FFD166':flipped?.outcome==='red'?'#FF7A88':'#BCEEFF'}]}>{busy?translate('Dokunuşun alındı · Sonuç bekleniyor…'):feedback||' '}</Text></View>
  <Btn title={translate('Takım Sohbeti')} size="sm" tone="ghost" onPress={()=>setChatOpen(true)}/>
  <Sheet visible={chatOpen} onClose={closeChat}>
  <Title size={18}>{translate('Takım Sohbeti')}</Title>
  <Muted>{translate('Mesajları yalnızca kendi takımın görebilir. Kaptana hatırladığın yolu söyle!')}</Muted>
  <View style={styles.messages}>{messages.slice(-8).map(m=><Text key={m.id} style={styles.message}><Text style={styles.nickname}>{m.nickname}: </Text>{m.body}</Text>)}</View>
  <View style={styles.compose}>
   <TextInput value={draft} onChangeText={setDraft} placeholder={translate('Takımına yaz...')} placeholderTextColor="#92A3BB" maxLength={140} style={styles.input} editable={live}/>
   <Btn title={translate('Gönder')} size="sm" disabled={!live||!draft.trim()||sending} onPress={send}/>
  </View>
  <Btn title={translate('Oyuna Dön')} size="sm" onPress={closeChat}/>
  </Sheet>
 </Card>;
}
const styles=StyleSheet.create({
 feedback:{minHeight:32,justifyContent:'center'},
 notice:{color:'#BCEEFF',fontWeight:'700',textAlign:'center'},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:6,alignSelf:'center',width:'100%',maxWidth:360,justifyContent:'center'},
 tile:{width:'18%',aspectRatio:1,borderRadius:9,borderWidth:2,alignItems:'center',justifyContent:'center'},
 symbol:{fontSize:20,color:'#fff',fontWeight:'800'},
 messages:{gap:6,maxHeight:160,overflow:'hidden'},
 message:{color:'#E5ECF8',fontSize:13},nickname:{color:'#74D9FF',fontWeight:'700'},
 compose:{flexDirection:'row',gap:8,alignItems:'center'},
 input:{flex:1,minHeight:42,borderWidth:1,borderColor:'#4B6382',borderRadius:9,paddingHorizontal:10,color:'#fff'}
});
const webTouchStyle:ViewStyle|undefined=Platform.OS==='web'?({touchAction:'manipulation',userSelect:'none',WebkitUserSelect:'none'} as unknown as ViewStyle):undefined;
