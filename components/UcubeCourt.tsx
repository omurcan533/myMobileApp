import React,{useEffect,useState} from 'react';
import {View,TextInput} from 'react-native';
import {api} from '../lib/api';
import {Btn,Card,Muted,Text,Title} from './ui';
import type {Player} from '../lib/types';

type CourtState=Awaited<ReturnType<typeof api.partyCourtState>>;
export function UcubeCourt({eventId,players,myId}:{eventId:string;players:Player[];myId:string}){
 const [court,setCourt]=useState<CourtState|null>(null);
 const [speech,setSpeech]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  const refresh=async()=>{try{const state=await api.partyCourtState(eventId);if(active)setCourt(state);}catch(e){if(active)setError((e as Error).message);}};
  refresh();
  const timer=setInterval(refresh,1800);
  return()=>{active=false;clearInterval(timer);};
 },[eventId]);
 const send=async(fn:()=>Promise<unknown>)=>{
  if(busy)return;
  setBusy(true);setError('');
  try{await fn();setCourt(await api.partyCourtState(eventId));}
  catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 };
 if(!court)return <Muted>Mahkeme salonu hazırlanıyor… {error}</Muted>;
 const name=(id:string)=>players.find(p=>p.id===id)?.nickname??'Oyuncu';
 const roles=[{id:court.prosecutor_id,title:'⚔️ Savcı',tip:'İddianı komik ve kısa bir şekilde anlat.'},
  {id:court.defender_id,title:'🛡️ Avukat',tip:'Sanığı savunacak yaratıcı bir bahane bul.'},
  {id:court.defendant_id,title:'🙋 Sanık',tip:'Son sözünü söyle, jüriyi ikna et!'}];
 const myRole=roles.find(r=>r.id===myId);
 const alreadySpoke=court.speeches.some(s=>s.player_id===myId);
 const verdict=court.stage==='verdict';
 const guilty=court.guilty_votes??0,innocent=court.innocent_votes??0;
 // Derive the sentence from the shared event ID so every device sees the same result.
 const sentences=[
  '20 saniye boyunca kendini üçüncü şahıs olarak savun.',
  'Bir sonraki cümleye haber spikeri gibi başla.',
  'Grubun seçtiği bir nesneye 10 saniyelik övgü konuşması yap.',
  'Kendi suçlamana üç maddelik aşırı ciddi bir açıklama getir.',
  'Bir sonraki tur boyunca kendine komik bir mahkeme unvanı tak.',
  'Sanık sandalyesinden dramatik bir film repliğiyle kalk.'
 ];
 const sentenceIndex=Array.from(eventId).reduce((sum,char)=>sum+char.charCodeAt(0),0)%sentences.length;
 const questionCards=[
  'Sanığın anlattığı hikâyedeki en şüpheli ayrıntı ne?',
  'Savcı, elinde bu iddiayı destekleyen ne kadar sağlam kanıt var?',
  'Avukat, bu bahaneyi mantıklı kılan tek ayrıntı ne?',
  'Sanık, aynı olay tekrar yaşansa yine aynısını yapar mı?',
  'Bu olayın en komik ama bir o kadar da şüpheli kısmı hangisi?',
  'Jüriyi ikna etmek için tek bir cümle daha söyleyecek olsan ne derdin?',
  'Olayı gören bir arkadaş şimdi burada olsa ne anlatırdı?',
  'Bu suçlama bir film olsaydı adı ne olurdu?'
 ];
 // Shared, deterministic prompts: every player sees the same cross-examination cards.
 const questionStart=Array.from(eventId).reduce((sum,char)=>sum+char.charCodeAt(0),0)%questionCards.length;
 const visibleQuestions=[0,1,2].map(offset=>questionCards[(questionStart+offset*3)%questionCards.length]);
 const sillyEvidence=[
  'Olaydan hemen sonra “Ben zaten onu yapacaktım” dediği iddia ediliyor.',
  'Tanıklar, olay sırasında şüpheli bir özgüven gözlemlediğini söylüyor.',
  'Olay yerinde açıklanamayan bir atıştırmalık kırıntısı bulundu.',
  'Sanığın “Bir dakika, açıklayabilirim” cümlesini prova ettiği öne sürülüyor.',
  'Gruptaki mesajlarda üç adet şüpheli kahkaha emojisi tespit edildi.',
  'Olaydan sonra sanığın konuyu hızla değiştirdiği iddia ediliyor.',
  'Bir tanık, sanığın masum görünmek için gereğinden fazla masum göründüğünü söyledi.',
  'Dosyada yalnızca “Bana mantıklı gelmişti” yazan gizemli bir not var.'
 ];
 const evidenceIndex=Array.from(eventId).reduce((sum,char)=>sum+char.charCodeAt(0),0)%sillyEvidence.length;
 return <View style={{gap:13}}>
  <Card style={{backgroundColor:'#251C42',borderWidth:1,borderColor:'#9C77E8',gap:8}}>
   <Title size={21}>⚖️ Ucube Mahkemesi</Title>
   <Text style={{color:'#F3E8FF',fontSize:17,fontWeight:'800'}}>👤 Sanık: {name(court.defendant_id)}</Text>
   {roles.map(r=><Text key={r.id} style={{color:r.id===myId?'#B6FFD8':'#E4DBFF',fontSize:15}}>{r.title}: {name(r.id)}{r.id===myId?' (Sen)':''}</Text>)}
   <Muted>Herkesin söz hakkı var: Savcı suçlar, avukat savunur, sanık son sözünü söyler. Ardından sanık dışındaki herkes gizlice oy verir.</Muted>
   <View style={{padding:11,borderRadius:12,backgroundColor:'#392B4C',borderWidth:1,borderColor:'#8E6CB7',gap:5}}>
    <Text style={{color:'#EBD8FF',fontWeight:'900'}}>🕵️ Mahkemenin Absürt Delili</Text>
    <Text style={{color:'#FFFFFF',lineHeight:22}}>{sillyEvidence[evidenceIndex]}</Text>
    <Muted>Bu tamamen hayalî ve komik bir ipucu; gerçek bir kanıt değildir. Tartışmayı başlatmak için kullanın!</Muted>
   </View>
  </Card>
  <Card style={{gap:9,backgroundColor:'#15243D'}}>
   <Title size={19}>🎭 Savunmalar</Title>
   {roles.map(r=>{
    const s=court.speeches.find(x=>x.player_id===r.id);
    return <View key={r.id} style={{padding:10,borderRadius:10,backgroundColor:'#25314E',gap:4}}>
      <Text style={{color:'#EEDFFF',fontWeight:'900'}}>{r.title} · {name(r.id)}</Text>
      <Text style={{color:'#FFFFFF',lineHeight:22}}>{s?.body??'⏳ Sözünü bekliyoruz…'}</Text>
    </View>;
   })}
   {court.stage==='speeches'&&myRole&&!alreadySpoke&&<View style={{gap:8}}>
    <Muted>{myRole.tip} (En fazla 280 karakter.)</Muted>
    <TextInput multiline maxLength={280} value={speech} onChangeText={setSpeech} placeholder="Mahkemeye söyleyeceklerin…" placeholderTextColor="#A8B4D1" style={{color:'#FFFFFF',borderWidth:1,borderColor:'#8E7CC4',borderRadius:12,padding:12,minHeight:80,textAlignVertical:'top'}}/>
    <Btn title={busy?'Gönderiliyor…':'🎤 İfadeni Sun'} disabled={busy||!speech.trim()} onPress={()=>send(()=>api.partyCourtSpeak(eventId,speech.trim()))}/>
   </View>}
   {court.stage==='speeches'&&(!myRole||alreadySpoke)&&<Muted>{court.speeches.length}/3 ifade alındı. Herkes tamamlayınca jüri oylaması başlayacak.</Muted>}
  </Card>
  {court.stage==='voting'&&<Card style={{gap:10,backgroundColor:'#1D2947'}}>
   <Title size={20}>🔎 Çapraz Sorgu</Title>
   <Muted>Oy vermeden önce bu sorulardan birini arkadaşlarına sözlü sorabilirsiniz. Biraz tartışın, sonra kararınızı gizlice verin!</Muted>
   {visibleQuestions.map((question,index)=><View key={question} style={{padding:10,borderRadius:10,backgroundColor:'#253653',gap:4}}>
    <Text style={{color:'#E7DFFF',fontWeight:'800'}}>Soru {index+1}</Text>
    <Text style={{color:'#FFFFFF',lineHeight:21}}>{question}</Text>
   </View>)}
   <Muted>Bu sorular herkeste aynı sırada görünür; cevaplar serbest ve eğlence amaçlıdır.</Muted>
  </Card>}
  {court.stage==='voting'&&<Card style={{gap:10,backgroundColor:'#1D2947'}}>
   <Title size={20}>🗳️ Jüri Kararı</Title>
   {myId===court.defendant_id?<Muted>Sanık kendi davasında oy kullanamaz. Jüri kararını bekle!</Muted>:
    court.my_vote!==null?<Muted>✓ Oyun gizlice kaydedildi. Sonuçlar herkes oy verdiğinde açıklanacak.</Muted>:
    <View style={{gap:8}}><Muted>İddialar tamamen şaka amaçlıdır. Sence sanık suçlu mu?</Muted>
     <Btn title="😂 SUÇLU!" disabled={busy} onPress={()=>send(()=>api.partyCourtVote(eventId,true))}/>
     <Btn title="😇 BERAAT!" tone="ghost" disabled={busy} onPress={()=>send(()=>api.partyCourtVote(eventId,false))}/>
    </View>}
   <Muted>Oylar: {court.votes_cast}/{court.votes_total}</Muted>
  </Card>}
  {verdict&&<Card style={{gap:9,backgroundColor:'#2C2140',borderWidth:1,borderColor:'#FFD18C'}}>
   <Title size={24}>🔔 KARAR AÇIKLANDI!</Title>
   <Title size={21}>{guilty===innocent?'🤝 Jüri ikiye bölündü!':guilty>innocent?'😂 SUÇLU BULUNDU!':'😇 BERAAT ETTİ!'}</Title>
   <Text style={{color:'#FFFFFF',fontSize:17}}>Suçlu: {guilty} oy · Beraat: {innocent} oy</Text>
   {guilty>innocent
    ?<View style={{padding:12,borderRadius:12,backgroundColor:'#3C2B52',gap:6}}>
      <Title size={17}>🎭 Mahkemenin Eğlenceli Kararı</Title>
      <Text style={{color:'#FFFFFF',lineHeight:22}}>{sentences[sentenceIndex]}</Text>
      <Muted>Bu karar tamamen şaka amaçlıdır; sanık isterse pas geçebilir.</Muted>
     </View>
    :<Muted>{guilty===innocent?'Jüri anlaşamadı; bu kez ceza yok!':'Beraat! Sanık özgür, suçlamalar düşürüldü. 🎉'}</Muted>}
  </Card>}
  {!!error&&<Text style={{color:'#FF9BAA'}}>{error}</Text>}
 </View>;
}
