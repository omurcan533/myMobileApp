import React,{useEffect,useRef,useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {ScrollView,View,TextInput,Modal,Pressable} from 'react-native';
import {api} from '../lib/api';
import {PARTY_MISSIONS} from '../lib/partyMissions';
import {UcubeCourt} from './UcubeCourt';
import {Btn,Card,Muted,Text,Title} from './ui';
import type {Player} from '../lib/types';
const UCUBE_QUESTIONS=[
 'Kim gizlice ünlü olsa ilk gün viral olup rezil olur?',
 'Kim bir adaya düşse ilk gün liderliğe soyunur?',
 'Kim bir yarışmada kuralları yanlış anlayıp yine de kazanır?',
 'Kim kendi doğum gününü yanlış tarihte kutlar?',
 'Kim yanlışlıkla herkese sesli mesaj gönderir?',
 'Kim bir uzaylıyla ilk arkadaş olan kişi olur?',
 'Kim bir günlüğüne müdür olsa en garip kuralı koyar?',
 'Kim gizli bir ajan olsa kimliğini ilk beş dakikada ele verir?',
 'Kim bir yemek yarışmasında mutfağı birbirine katar?',
 'Kim arkadaş grubunun en komik bahanesini üretir?',
];
const COURT_CHARGES=[
 'Arkadaş grubunun en yaratıcı bahanelerini üretmekle suçlanıyor!',
 'Her fotoğrafta en iyi pozu kapmakla suçlanıyor!',
 'Grubun bütün planlarını son dakika değiştirmekle suçlanıyor!',
 'Bir espriyi herkesten önce anlamış gibi yapmakla suçlanıyor!',
 'Her tartışmada son sözü söylemekle suçlanıyor!',
 'Şarkının sözlerini uydurup özgüvenle söylemekle suçlanıyor!',
 'Sohbette konuyu hiç beklenmedik yere bağlamakla suçlanıyor!',
 'Herkesi güldürüp kendisi hiç gülmemekle suçlanıyor!',
];
const TASKS=[
'60 saniyede aranızdan en az iki kişiyi güldür!',
'Tek ayak üzerinde 10 kere zıpla!',
'30 saniye ünlü birini taklit et!',
'Şimdi komik bir selfie çek! İstersen 10 dakikalığına Instagram hikâyende paylaş.',
'30 saniye uydurma bir ürünün reklamını yap!',
'Bir şarkıyı sadece mırıldanarak anlat!',
'60 saniye hiç gülmeden dayan!',
'Güvenli ve uygun bir ortamdaysanız, tanımadığın birine nazikçe bir soru sor. İstemiyorsan pas geçebilirsin.',
'En çok oy alan 3 kişi el ele tutuşup sesli bir şekilde Selana’yı çağırsın!'
];
const EVENTS=[['challenge','Şanslı Kişi'],['first_word','İlk Aklına Gelen'],['age_guess','Yaş Tahmini'],['spot_diff','Farkı Bul'],['eye_duel','Göz Göze Düello'],['who_is_ucube','Kim Daha Ucube?'],['ucube_court','Ucube Mahkemesi']] as const;
// Aynı olay kimliğinde herkes aynı bulmacayı görür; doğru cevap bulmacadan hesaplanır.
const SCENE_PAIRS = [
  [['🌳','🐱','🌞','🚗','🌷','🏠','🐶','🚲','🍎'],['🌳','🐱','🌛','🚗','🌻','🏠','🐶','🛴','🍎']],
  [['🐻','🎈','🍓','🚀','🌈','🦋','🍕','🎸','🌻'],['🐻','🎈','🍒','🚀','🌦️','🦋','🍔','🎸','🌹']],
  [['🚕','🏖️','🐬','🕶️','🍦','⛵','🐠','🌴','🏐'],['🚕','🏖️','🐳','👒','🍦','🚤','🐠','🌲','🏀']],
  [['🦊','📚','🕯️','☕','🎩','🪴','🧸','🖼️','🐈'],['🐺','📚','💡','☕','👑','🌵','🧸','🖼️','🐈']],
  [['🎪','🤹','🎯','🎠','🍿','🎡','🥁','🎟️','🎭'],['🎪','🤹','🏹','🎠','🍭','🎢','🎺','🎟️','🎭']]
] as const;
const puzzleIndex = (id: string) => [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % SCENE_PAIRS.length;
export function PartyBreak({roomId,players,myId,isHost,canStart,autoKey}:{roomId:string;players:Player[];myId:string;isHost:boolean;canStart:boolean;autoKey?:string|null}){
const [dismissed,setDismissed]=useState(false);
const [mission,setMission]=useState<{key:number;status:'active'|'done'|'skipped'}|null>(null);
const [missionOpen,setMissionOpen]=useState(false);
const [missionBusy,setMissionBusy]=useState(false);
const refreshMission=()=>api.partyMySecretMission(roomId).then(setMission).catch(()=>{});
useEffect(()=>{
 let active=true;
 const check=async()=>{try{const result=await api.partyMySecretMission(roomId);if(active)setMission(result);}catch{}};
 check();
 const timer=setInterval(()=>{if(!mission)check();},3500);
 return ()=>{active=false;clearInterval(timer);};
},[roomId,mission?.key]);
const finishMission=async(status:'done'|'skipped')=>{setMissionBusy(true);try{await api.partySecretMissionFinish(roomId,status);await refreshMission();}catch(e){setError((e as Error).message);}finally{setMissionBusy(false);}};

const [tick,setTick]=useState(Date.now());
useEffect(()=>{const t=setInterval(()=>setTick(Date.now()),1000);return()=>clearInterval(t);},[]);
const [event,setEvent]=useState<any>(null),[showMenu,setShowMenu]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[answer,setAnswer]=useState(''),[age,setAge]=useState<Record<string,string>>({}),[winner,setWinner]=useState<string|null>(null),[ageMedals,setAgeMedals]=useState<any[]>([]);
const refresh=async()=>{try{const e=await api.partyEventCurrent(roomId);setEvent(e);if(!e)setWinner(null);}catch{}};
useEffect(()=>{refresh();const t=setInterval(refresh,2500);return()=>clearInterval(t);},[roomId]);
const run=async(fn:()=>Promise<any>)=>{setBusy(true);setError('');try{await fn();await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
const start=(kind:string)=>run(async()=>{
if(kind==='ucube_court'){
 const charge=COURT_CHARGES[Math.floor(Math.random()*COURT_CHARGES.length)];
 await api.partyCourtStart(roomId,charge);
 setShowMenu(false);return;
}
const prompt=kind==='who_is_ucube'?UCUBE_QUESTIONS[Math.floor(Math.random()*UCUBE_QUESTIONS.length)]:kind==='challenge'?(players.length>=4?TASKS:TASKS.slice(0,-1))[Math.floor(Math.random()*(players.length>=4?TASKS.length:TASKS.length-1))]:kind==='first_word'?'Herkes seçilen kişiye baksın ve aklına gelen ilk kelimeyi sırayla söylesin!':kind==='age_guess'?'Herkes diğer oyuncuların yaşını tahmin etsin!':kind==='spot_diff'?'İki resimde kaç fark var?' :'Eşleşen oyuncular 60 saniye göz göze baksın. İlk gülen kaybeder!';const eventId=await api.partyEventStart(roomId,kind,prompt);if(kind==='challenge'||kind==='who_is_ucube'||kind==='age_guess'||kind==='spot_diff')await api.testBotsVote(eventId);setShowMenu(false);setAnswer('');setAge({});setWinner(null);});
// Bir mini oyun sonrası tek seferlik, ev sahibi kontrollü sürpriz etkinlik.
const autoBusy = useRef(false);
useEffect(() => {
  if (!isHost || !autoKey || players.length < 2 || autoBusy.current) return;
  let cancelled = false;
  const trigger = async () => {
    const key = 'party-auto:' + roomId + ':' + autoKey;
    autoBusy.current = true;
    try {
      if (await AsyncStorage.getItem(key)) return;
      // Her mini oyun için deterministik seçim; aynı tur tekrar denenmez.
      const seed = [...autoKey].reduce((n, ch) => n + ch.charCodeAt(0), 0);
      await AsyncStorage.setItem(key, 'checked');
      if (seed % 3 !== 0 || cancelled) return;
      const current = await api.partyEventCurrent(roomId);
      if (current || cancelled) return;
      const kinds = players.length % 2 === 0
        ? ['challenge', 'first_word', 'spot_diff', 'eye_duel']
        : ['challenge', 'first_word', 'spot_diff'];
      const kind = kinds[seed % kinds.length];
      const available = players.length >= 4 ? TASKS : TASKS.slice(0, -1);
      const prompt = kind === 'challenge'
        ? available[(seed * 7 + 3) % available.length]
        : kind === 'first_word'
          ? 'Herkes seçilen kişiye baksın ve aklına gelen ilk kelimeyi sırayla söylesin!'
          : kind === 'spot_diff'
            ? 'İki resimde kaç fark var?'
            : 'Eşleşen oyuncular 60 saniye göz göze baksın. İlk gülen kaybeder!';
      if (cancelled) return;
      const id = await api.partyEventStart(roomId, kind, prompt);
      if (kind === 'challenge' || kind === 'spot_diff') await api.testBotsVote(id);
      if (!cancelled) await refresh();
    } catch (e) {
      if (!cancelled) setError((e as Error).message);
    } finally {
      autoBusy.current = false;
    }
  };
  trigger();
  return () => { cancelled = true; };
}, [autoKey, roomId, isHost, players.length]);
const votes=event?.votes??[];
const scenes = SCENE_PAIRS[puzzleIndex(event?.id??'')];
const differenceCount = scenes[0].filter((emoji,i)=>emoji!==scenes[1][i]).length;
const paired=[...players].sort((a,b)=>{const hash=(v:string)=>[...v].reduce((n,ch)=>((n*31+ch.charCodeAt(0))|0),0);return hash((event?.id??'')+a.id)-hash((event?.id??'')+b.id);});
const mine=votes.find((v:any)=>v.player_id===myId);
const voteCount=Number(event?.vote_count??votes.length);
const allVoted=voteCount>=players.length;
const myDifferenceAnswer = mine?.answer == null ? null : Number(mine.answer);
const differenceCorrect = myDifferenceAnswer === differenceCount;
const count=(id:string)=>votes.filter((v:any)=>v.target_id===id).length;
const top=players.filter(p=>count(p.id)>0&&count(p.id)===Math.max(...players.map(x=>count(x.id))));
const chosen=top.length===1?top[0]:null;
const threeWinners=event?.prompt?.includes('3 kişi')?[...players].sort((a,b)=>count(b.id)-count(a.id)).slice(0,3):[];
const submit=(target:string|null,txt:string|null=null)=>run(()=>api.partyEventVote(event.id,target,txt));
const finish=()=>run(()=>api.partyEventFinish(event.id));
const secretCard=mission?<Card style={{gap:9,backgroundColor:'#18253D',borderWidth:1,borderColor:'#7057A6'}}>
 <Pressable accessibilityRole="button" onPress={()=>setMissionOpen(v=>!v)} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:5}}>
  <Text style={{color:'#F1E5FF',fontSize:17,fontWeight:'900'}}>🕵️ Gizli Görevin {mission.status==='done'?'✓':mission.status==='skipped'?'—':'🔒'}</Text>
  <Text style={{color:'#D4B8FF',fontWeight:'800'}}>{missionOpen?'Gizle ▲':'Göster ▼'}</Text>
 </Pressable>
 {missionOpen&&<View style={{gap:10}}>
  <Text style={{color:'#FFFFFF',fontSize:15,lineHeight:23}}>{PARTY_MISSIONS[mission.key]??'Gizli görev'}</Text>
  <Muted>Görevini kimseye gösterme! Oyun boyunca deneyebilirsin. Başardığını kendin işaretlersin; puan verilmez, finalde açıklanır. İstediğin zaman pas geçebilirsin.</Muted>
  {mission.status==='active'?<View style={{gap:8}}><Btn title={missionBusy?'Kaydediliyor…':'✓ Görevi Başardım'} disabled={missionBusy} onPress={()=>finishMission('done')}/><Btn title="Pas Geç" tone="ghost" disabled={missionBusy} onPress={()=>finishMission('skipped')}/></View>:<Text style={{color:'#B8FFD9',fontWeight:'800'}}>{mission.status==='done'?'🎉 Tamamlandı! Finalde herkes öğrenecek.':'Görev pas geçildi.'}</Text>}
 </View>}
 </Card>:null;
if(!event&&(!canStart||dismissed))return secretCard;
return <View style={{gap:10}}>
{secretCard}
{!event?<Card style={{gap:8}}><View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}}><Title size={18}>🎉 Eğlence Molası</Title><Pressable accessibilityRole="button" accessibilityLabel="Eğlence molasını kapat" hitSlop={12} onPress={()=>{setShowMenu(false);setDismissed(true);}} style={{padding:8,borderRadius:18,backgroundColor:'#25344D'}}><Text style={{fontSize:19,fontWeight:'800',color:'#FFFFFF'}}>✕</Text></Pressable></View><Muted>Ana oyunun arasında arkadaşlarını şaşırtacak bir etkinlik başlat.</Muted>{isHost&&<Btn title={showMenu?'Etkinlikleri Gizle':'Sürpriz Etkinlik Başlat'} onPress={()=>setShowMenu(v=>!v)}/>}
{showMenu&&isHost&&EVENTS.map(([kind,label])=><Btn key={kind} title={label} tone="ghost" disabled={busy||(kind==='eye_duel'&&players.length%2!==0)||(kind==='ucube_court'&&players.filter(p=>!p.is_bot).length<3)} onPress={()=>start(kind)}/>)}</Card>:
<Modal visible transparent animationType="slide"><View style={{flex:1,backgroundColor:'rgba(0,0,0,0.9)',justifyContent:'center',padding:14}}><ScrollView contentContainerStyle={{paddingVertical:25}}><Card style={{gap:12}}><Title size={23}>🎲 {EVENTS.find(x=>x[0]===event.kind)?.[1]}</Title><Text style={{fontSize:17,color:'#E8F1FF',lineHeight:24}}>{event.prompt}</Text>
{event.kind==='ucube_court'&&<UcubeCourt eventId={event.id} players={players} myId={myId}/>}
{event.kind==='who_is_ucube'&&<View style={{gap:10}}>
 <Muted>Herkes en uygun arkadaşını seçsin. Kendine oy veremezsin. Sonuçlar bütün oylar geldikten sonra açılır.</Muted>
 {!mine?players.filter(p=>p.id!==myId).map(p=><Btn key={p.id} title={p.nickname} tone="ghost" disabled={busy} onPress={()=>submit(p.id)}/>):<Text style={{color:'#B6FFE5',fontWeight:'800'}}>✓ Oyun kaydedildi. Diğerleri bekleniyor: {voteCount}/{players.length}</Text>}
 {allVoted&&<Card style={{gap:10,backgroundColor:'#182943'}}>
  <Title size={21}>🎉 Kim Daha Ucube? Sonuçları</Title>
  {top.length?<Title size={19}>{top.length===1?'👑 En çok oy alan: '+top[0].nickname:'🤝 Beraberlik: '+top.map(p=>p.nickname).join(', ')}</Title>:<Muted>Bu turda oy çıkmadı.</Muted>}
  {[...players].sort((a,b)=>count(b.id)-count(a.id)).map(p=><Text key={p.id} style={{color:'#E9F3FF',fontSize:15}}>{p.nickname}: {count(p.id)} oy</Text>)}
  <Muted>Oylar tamamlandı. Şimdi bu seçimin nedenini birbirinize sorun! 😄</Muted>
 </Card>}
 </View>}
 {event.kind==='challenge'&&<View style={{gap:8}}><Muted>İki takımın bütün oyuncuları oy verir. Kendine oy veremezsin.</Muted>{!mine?players.filter(p=>p.id!==myId).map(p=><Btn key={p.id} title={p.nickname} tone="ghost" onPress={()=>submit(p.id)}/>):<Text style={{color:'#E8F1FF',fontSize:15,lineHeight:22}}>✓ Oyun kaydedildi. {voteCount}/{players.length} oy</Text>}
{allVoted&&<View style={{gap:8}}><Title size={20}>{threeWinners.length?'🎉 Seçilenler: '+threeWinners.map(p=>p.nickname).join(', '):chosen?'🎉 Şanslı kişi: '+chosen.nickname:'Beraberlik! Kurucu kura çekebilir.'}</Title>{top.length>1&&isHost&&<Btn title="Beraberliği Kura ile Çöz" onPress={()=>setWinner(top[Math.floor(Math.random()*top.length)].nickname)}/>}{winner&&<Title size={18}>🎲 Seçilen: {winner}</Title>}<Muted>Görev gönüllülük esaslıdır. İsteyen pas geçebilir.</Muted></View>}</View>}
{event.kind==='first_word'&&<View style={{gap:6}}><Title size={20}>{players.find(p=>p.id===event.target_id)?.nickname}</Title><Muted>Herkes sırayla ilk aklına gelen kelimeyi sesli söylesin. Puan yok.</Muted></View>}
{event.kind==='eye_duel'&&<View style={{gap:8}}><Title size={20}>⏱ {Math.max(0,60-Math.floor((tick-Date.parse(event.created_at))/1000))} saniye</Title>{paired.filter((_,i)=>i%2===0).map((p,i)=><Text style={{color:'#E8F1FF',fontSize:15,lineHeight:22}} key={p.id}>👀 {p.nickname} ↔ {paired[i*2+1]?.nickname}</Text>)}<Muted>60 saniyeyi birlikte sayın; ilk dişlerini gösterip gülen kaybeder.</Muted></View>}
{event.kind==='spot_diff'&&<View style={{gap:12}}>{scenes.map((scene,i)=><View key={i} style={{flexDirection:'row',flexWrap:'wrap',width:240,alignSelf:'center',backgroundColor:'#17334D',padding:12,borderRadius:14}}>{scene.map((v,j)=><Text key={j} style={{width:70,fontSize:32,textAlign:'center'}}>{v}</Text>)}</View>)}{!mine?<View style={{gap:6}}><TextInput value={answer} onChangeText={setAnswer} keyboardType="number-pad" placeholder="Kaç fark var?" placeholderTextColor="#A8B5C8" style={{color:'white',borderWidth:1,borderColor:'#72849D',padding:12,borderRadius:10}}/><Btn title={busy?'Gönderiliyor…':'Tahmin Gönder'} onPress={()=>submit(null,answer)} disabled={busy||answer.trim().length===0||!Number.isInteger(Number(answer.trim()))||Number(answer.trim())<0}/></View>:<Card style={{gap:8}}><Title size={20}>✓ Tahminin kaydedildi: {mine.answer}</Title><Muted>Diğer oyuncular bekleniyor: {voteCount}/{players.length} tahmin tamamlandı.</Muted><Muted>Sonuç, herkes tahminini gönderdiğinde burada açıklanacak. Ekran otomatik kapanmayacak.</Muted></Card>}{allVoted&&<Card style={{gap:10}}><Title size={23}>🏆 Farkı Bul Sonuçları</Title><Title size={20}>Doğru cevap: {differenceCount} fark</Title>{mine&&<Title size={19}>{differenceCorrect?'🎉 Tebrikler, doğru bildin!':'😅 Bu kez olmadı! Senin tahminin: '+mine.answer}</Title>}<Muted>{votes.filter((v:any)=>v.answer===String(differenceCount)).length}/{players.length} oyuncu doğru bildi.</Muted>{players.map(p=>{const vote=votes.find((v:any)=>v.player_id===p.id);return <Text style={{color:'#E8F1FF',fontSize:15,lineHeight:22}} key={p.id}>{vote?.answer===String(differenceCount)?'✅':'❌'} {p.nickname}: {vote?.answer??'—'}</Text>;})}<Muted>Oda kurucusu etkinliği bitirene kadar sonuçlar ekranda kalır.</Muted></Card>}</View>}

{event.kind==='age_guess'&&<View style={{gap:10}}>{!mine?<View style={{gap:8}}><Muted>Diğer oyuncuların yaşlarını tahmin et. Her oyuncu için bir sayı gir.</Muted>{players.filter(p=>p.id!==myId).map(p=><View key={p.id} style={{gap:4}}><Text style={{color:'#E8F1FF'}}>{p.nickname}</Text><TextInput value={age[p.id]??''} onChangeText={v=>setAge(s=>({...s,[p.id]:v}))} keyboardType="number-pad" maxLength={3} placeholder="Yaş tahminin" placeholderTextColor="#A8B5C8" style={{color:'white',borderWidth:1,borderColor:'#72849D',padding:10,borderRadius:10}}/></View>)}<Btn title={busy?'Gönderiliyor…':'Tüm Yaş Tahminlerini Gönder'} disabled={busy||players.filter(p=>p.id!==myId).some(p=>!Number.isInteger(Number((age[p.id]??'').trim()))||(age[p.id]??'').trim().length===0||Number(age[p.id])<1||Number(age[p.id])>120)} onPress={()=>submit(null,JSON.stringify(age))}/></View>:<Card style={{gap:8}}><Title size={20}>✓ Yaş tahminlerin kaydedildi</Title>{players.filter(p=>p.id!==myId).map(p=>{let guess='—';try{guess=String(JSON.parse(mine.answer??'{}')[p.id]??'—');}catch{}return <Text style={{color:'#E8F1FF',fontSize:15,lineHeight:22}} key={p.id}>{p.nickname}: {guess} yaş</Text>;})}<Muted>{voteCount}/{players.length} oyuncu tahminini gönderdi. {allVoted?'Tüm tahminler tamamlandı!':'Diğer oyuncular bekleniyor…'}</Muted></Card>}{allVoted&&<Card style={{gap:8}}><Title size={22}>🏆 Yaş Tahmini Sonuçları</Title><Muted>Herkes tahminini tamamladı. Oyuncuların verdiği cevaplar:</Muted>{players.map(p=>{const vote=votes.find((v:any)=>v.player_id===p.id);let guesses:Record<string,string>={};try{guesses=JSON.parse(vote?.answer??'{}');}catch{}return <View key={p.id} style={{gap:3}}><Title size={17}>👤 {p.nickname}</Title>{players.filter(other=>other.id!==p.id).map(other=><Text key={other.id} style={{color:'#E8F1FF',fontSize:15,lineHeight:23}}>{other.nickname}: {guesses[other.id]??'—'} yaş</Text>)}</View>;})}<Muted>Bu ekranda gerçek yaşlar doğrulanmadığı için doğru/yanlış ve madalya sonucu henüz hesaplanmıyor. Kurucu etkinliği bitirene kadar sonuçlar burada kalır.</Muted></Card>}</View>}
{isHost&&<Btn title="Etkinliği Bitir ve Oyuna Dön" tone="success" onPress={finish} disabled={busy||((event.kind==='challenge'||event.kind==='who_is_ucube'||event.kind==='age_guess'||event.kind==='spot_diff')&&!allVoted)}/>}
</Card></ScrollView></View></Modal>}
{!!error&&<Text style={{color:'#FF8592'}}>{error}</Text>}
</View>;
}
