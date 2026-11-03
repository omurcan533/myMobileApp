import { translate } from '../lib/i18n';
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
 if(!court)return <Muted>{translate("Mahkeme salonu hazırlanıyor…")} {error}</Muted>;
 const name=(id:string)=>players.find(p=>p.id===id)?.nickname??translate("Oyuncu");
 const roles=[{id:court.prosecutor_id,title:translate("⚔️ Savcı"),tip:translate("İddianı komik ve kısa bir şekilde anlat.")},
  {id:court.defender_id,title:translate("🛡️ Avukat"),tip:translate("Sanığı savunacak yaratıcı bir bahane bul.")},
  {id:court.defendant_id,title:translate("🙋 Sanık"),tip:translate("Son sözünü söyle, jüriyi ikna et!")}];
 const myRole=roles.find(r=>r.id===myId);
 const roleTips:Record<string,string[]> = {
  prosecutor:[
   translate("İddianı bir dedektif gibi anlat ama kanıtın komik olsun."),
   translate("Jüriyi güldürecek kadar dramatik bir giriş yap."),
   translate("Suçlamanı tek bir aşırı şüpheli ayrıntıya bağla.")
  ],
  defender:[
   translate("Savunmanda beklenmedik ama zararsız bir bahane bul."),
   translate("Olayı sanığın açısından anlatıp herkesi şaşırt."),
   translate("Savcıya nazikçe “itiraz ediyorum” diyecek bir an yakala.")
  ],
  defendant:[
   translate("Son sözünde olayı daha da absürt bir şekilde açıklamayı dene."),
   translate("Jüriye kendini savunurken aşırı ciddi davran."),
   translate("Suçlamayı beklenmedik bir yanlış anlaşılmaya bağla.")
  ],
  jury:[
   translate("İfadelerdeki en komik çelişkiyi yakalamaya çalış."),
   translate("Oylamadan önce çapraz sorgu sorularından birini kullan."),
   translate("Karar verirken en ikna edici bahaneyi değil, en komik açıklamayı da düşün.")
  ]
 };
 const roleKey=myRole?.id===court.prosecutor_id?'prosecutor':myRole?.id===court.defender_id?'defender':myRole?.id===court.defendant_id?'defendant':'jury';
 const roleTipIndex=Array.from(eventId+myId).reduce((sum,char)=>sum+char.charCodeAt(0),0)%roleTips[roleKey].length;
 const alreadySpoke=court.speeches.some(s=>s.player_id===myId);
 const verdict=court.stage==='verdict';
 const guilty=court.guilty_votes??0,innocent=court.innocent_votes??0;
 // Derive the sentence from the shared event ID so every device sees the same result.
 const sentences=[
  translate("20 saniye boyunca kendini üçüncü şahıs olarak savun."),
  translate("Bir sonraki cümleye haber spikeri gibi başla."),
  translate("Grubun seçtiği bir nesneye 10 saniyelik övgü konuşması yap."),
  translate("Kendi suçlamana üç maddelik aşırı ciddi bir açıklama getir."),
  translate("Bir sonraki tur boyunca kendine komik bir mahkeme unvanı tak."),
  translate("Sanık sandalyesinden dramatik bir film repliğiyle kalk.")
 ];
 const sentenceIndex=Array.from(eventId).reduce((sum,char)=>sum+char.charCodeAt(0),0)%sentences.length;
 const questionCards=[
  translate("Sanığın anlattığı hikâyedeki en şüpheli ayrıntı ne?"),
  translate("Savcı, elinde bu iddiayı destekleyen ne kadar sağlam kanıt var?"),
  translate("Avukat, bu bahaneyi mantıklı kılan tek ayrıntı ne?"),
  translate("Sanık, aynı olay tekrar yaşansa yine aynısını yapar mı?"),
  translate("Bu olayın en komik ama bir o kadar da şüpheli kısmı hangisi?"),
  translate("Jüriyi ikna etmek için tek bir cümle daha söyleyecek olsan ne derdin?"),
  translate("Olayı gören bir arkadaş şimdi burada olsa ne anlatırdı?"),
  translate("Bu suçlama bir film olsaydı adı ne olurdu?")
 ];
 // Shared, deterministic prompts: every player sees the same cross-examination cards.
 const questionStart=Array.from(eventId).reduce((sum,char)=>sum+char.charCodeAt(0),0)%questionCards.length;
 const visibleQuestions=[0,1,2].map(offset=>questionCards[(questionStart+offset*3)%questionCards.length]);
 const sillyEvidence=[
  translate("Olaydan hemen sonra “Ben zaten onu yapacaktım” dediği iddia ediliyor."),
  translate("Tanıklar, olay sırasında şüpheli bir özgüven gözlemlediğini söylüyor."),
  translate("Olay yerinde açıklanamayan bir atıştırmalık kırıntısı bulundu."),
  translate("Sanığın “Bir dakika, açıklayabilirim” cümlesini prova ettiği öne sürülüyor."),
  translate("Gruptaki mesajlarda üç adet şüpheli kahkaha emojisi tespit edildi."),
  translate("Olaydan sonra sanığın konuyu hızla değiştirdiği iddia ediliyor."),
  translate("Bir tanık, sanığın masum görünmek için gereğinden fazla masum göründüğünü söyledi."),
  translate("Dosyada yalnızca “Bana mantıklı gelmişti” yazan gizemli bir not var.")
 ];
 const evidenceIndex=Array.from(eventId).reduce((sum,char)=>sum+char.charCodeAt(0),0)%sillyEvidence.length;
 return <View style={{gap:13}}>
  <Card style={{backgroundColor:'#251C42',borderWidth:1,borderColor:'#9C77E8',gap:8}}>
   <Title size={21}>{translate("⚖️ Ucube Mahkemesi")}</Title>
   <Text style={{color:'#F3E8FF',fontSize:17,fontWeight:'800'}}>{translate("👤 Sanık:")} {name(court.defendant_id)}</Text>
   {roles.map(r=><Text key={r.id} style={{color:r.id===myId?'#B6FFD8':'#E4DBFF',fontSize:15}}>{r.title}: {name(r.id)}{r.id===myId?translate(" (Sen)"):''}</Text>)}
   <Muted>{translate("Herkesin söz hakkı var: Savcı suçlar, avukat savunur, sanık son sözünü söyler. Ardından sanık dışındaki herkes gizlice oy verir.")}</Muted>
   <View style={{padding:11,borderRadius:12,backgroundColor:'#392B4C',borderWidth:1,borderColor:'#8E6CB7',gap:5}}>
    <Text style={{color:'#EBD8FF',fontWeight:'900'}}>{translate("🕵️ Mahkemenin Absürt Delili")}</Text>
    <Text style={{color:'#FFFFFF',lineHeight:22}}>{sillyEvidence[evidenceIndex]}</Text>
    <Muted>{translate("Bu tamamen hayalî ve komik bir ipucu; gerçek bir kanıt değildir. Tartışmayı başlatmak için kullanın!")}</Muted>
   </View>
  </Card>
  <Card style={{gap:8,backgroundColor:'#20334A',borderWidth:1,borderColor:'#668CB0'}}>
   <Title size={17}>🎯 {myRole?translate("Sana Özel Mahkeme Taktiği"):translate("Jüri Notun")}</Title>
   <Text style={{color:'#FFFFFF',lineHeight:22}}>{roleTips[roleKey][roleTipIndex]}</Text>
   <Muted>{translate("Bu küçük ipucu yalnızca senin ekranında görünür. İstersen kullan, istersen kendi tarzını konuştur!")}</Muted>
  </Card>
  <Card style={{gap:9,backgroundColor:'#15243D'}}>
   <Title size={19}>{translate("🎭 Savunmalar")}</Title>
   {roles.map(r=>{
    const s=court.speeches.find(x=>x.player_id===r.id);
    return <View key={r.id} style={{padding:10,borderRadius:10,backgroundColor:'#25314E',gap:4}}>
      <Text style={{color:'#EEDFFF',fontWeight:'900'}}>{r.title} · {name(r.id)}</Text>
      <Text style={{color:'#FFFFFF',lineHeight:22}}>{s?.body??translate("⏳ Sözünü bekliyoruz…")}</Text>
    </View>;
   })}
   {court.stage==='speeches'&&myRole&&!alreadySpoke&&<View style={{gap:8}}>
    <Muted>{myRole.tip}  {translate("(En fazla 280 karakter.)")}</Muted>
    <TextInput multiline maxLength={280} value={speech} onChangeText={setSpeech} placeholder={translate("Mahkemeye söyleyeceklerin…")} placeholderTextColor="#A8B4D1" style={{color:'#FFFFFF',borderWidth:1,borderColor:'#8E7CC4',borderRadius:12,padding:12,minHeight:80,textAlignVertical:'top'}}/>
    <Btn title={busy?translate("Gönderiliyor…"):translate("🎤 İfadeni Sun")} disabled={busy||!speech.trim()} onPress={()=>send(()=>api.partyCourtSpeak(eventId,speech.trim()))}/>
   </View>}
   {court.stage==='speeches'&&(!myRole||alreadySpoke)&&<Muted>{court.speeches.length}{translate("/3 ifade alındı. Herkes tamamlayınca jüri oylaması başlayacak.")}</Muted>}
  </Card>
  {court.stage==='voting'&&<Card style={{gap:10,backgroundColor:'#1D2947'}}>
   <Title size={20}>{translate("🔎 Çapraz Sorgu")}</Title>
   <Muted>{translate("Oy vermeden önce bu sorulardan birini arkadaşlarına sözlü sorabilirsiniz. Biraz tartışın, sonra kararınızı gizlice verin!")}</Muted>
   {visibleQuestions.map((question,index)=><View key={question} style={{padding:10,borderRadius:10,backgroundColor:'#253653',gap:4}}>
    <Text style={{color:'#E7DFFF',fontWeight:'800'}}>{translate("Soru")} {index+1}</Text>
    <Text style={{color:'#FFFFFF',lineHeight:21}}>{question}</Text>
   </View>)}
   <Muted>{translate("Bu sorular herkeste aynı sırada görünür; cevaplar serbest ve eğlence amaçlıdır.")}</Muted>
  </Card>}
  {court.stage==='voting'&&<Card style={{gap:10,backgroundColor:'#1D2947'}}>
   <Title size={20}>{translate("🗳️ Jüri Kararı")}</Title>
   {myId===court.defendant_id?<Muted>{translate("Sanık kendi davasında oy kullanamaz. Jüri kararını bekle!")}</Muted>:
    court.my_vote!==null?<Muted>{translate("✓ Oyun gizlice kaydedildi. Sonuçlar herkes oy verdiğinde açıklanacak.")}</Muted>:
    <View style={{gap:8}}><Muted>{translate("İddialar tamamen şaka amaçlıdır. Sence sanık suçlu mu?")}</Muted>
     <Btn title={translate("😂 SUÇLU!")} disabled={busy} onPress={()=>send(()=>api.partyCourtVote(eventId,true))}/>
     <Btn title={translate("😇 BERAAT!")} tone="ghost" disabled={busy} onPress={()=>send(()=>api.partyCourtVote(eventId,false))}/>
    </View>}
   <Muted>{translate("Oylar:")} {court.votes_cast}/{court.votes_total}</Muted>
  </Card>}
  {verdict&&<Card style={{gap:9,backgroundColor:'#2C2140',borderWidth:1,borderColor:'#FFD18C'}}>
   <Title size={24}>{translate("🔔 KARAR AÇIKLANDI!")}</Title>
   <Title size={21}>{guilty===innocent?translate("🤝 Jüri ikiye bölündü!"):guilty>innocent?translate("😂 SUÇLU BULUNDU!"):translate("😇 BERAAT ETTİ!")}</Title>
   <Text style={{color:'#FFFFFF',fontSize:17}}>{translate("Suçlu:")} {guilty}  {translate("oy · Beraat:")} {innocent}  {translate("oy")}</Text>
   {guilty>innocent
    ?<View style={{padding:12,borderRadius:12,backgroundColor:'#3C2B52',gap:6}}>
      <Title size={17}>{translate("🎭 Mahkemenin Eğlenceli Kararı")}</Title>
      <Text style={{color:'#FFFFFF',lineHeight:22}}>{sentences[sentenceIndex]}</Text>
      <Muted>{translate("Bu karar tamamen şaka amaçlıdır; sanık isterse pas geçebilir.")}</Muted>
     </View>
    :<Muted>{guilty===innocent?translate("Jüri anlaşamadı; bu kez ceza yok!"):translate("Beraat! Sanık özgür, suçlamalar düşürüldü. 🎉")}</Muted>}
  </Card>}
  {!!error&&<Text style={{color:'#FF9BAA'}}>{error}</Text>}
 </View>;
}
