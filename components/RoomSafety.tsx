import React,{useRef,useState} from 'react';
import {View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Btn,Card,Input,Muted,Sheet,Text,Title} from './ui';
import {communitySafety,type ReportReason,type ReportSubject} from '../lib/communitySafety';
import {useLanguage} from '../lib/i18n';
import {colors} from '../lib/theme';
import type {Ctx,Player} from '../lib/types';
type Selection={subject:ReportSubject;player:Player|null;label:string};
export function RoomSafety({ctx}:{ctx:Ctx}){
 const en=useLanguage()==='en';const loc=(tr:string,english:string)=>en?english:tr;const insets=useSafeAreaInsets();
 const [open,setOpen]=useState(false),[target,setTarget]=useState<Selection|null>(null),[blocking,setBlocking]=useState(false),[reason,setReason]=useState<ReportReason>('harassment'),[details,setDetails]=useState(''),[success,setSuccess]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);const locked=useRef(false);
 const close=()=>{if(!locked.current){setOpen(false);setTarget(null);setBlocking(false);setError('');setSuccess('');setDetails('');}};
 const select=(selection:Selection)=>{setTarget(selection);setBlocking(false);setDetails('');setError('');setSuccess('');};
 const run=async()=>{if(!target||locked.current)return;locked.current=true;setBusy(true);setError('');try{
  if(blocking&&target.player){await communitySafety.block(ctx.data.room.id,target.player.id);close();ctx.onLeave();}
  else{const id=await communitySafety.report(ctx.data.room.id,target.player?.id??null,target.subject,reason,details);setSuccess(loc('Bildirim kaydedildi. İnceleme referansı: ','Report saved. Review reference: ')+id.slice(0,8));setTarget(null);setDetails('');}
 }catch(e){setError((e as Error).message);}finally{locked.current=false;setBusy(false);}};
 const reasons:[ReportReason,string][]=[['harassment',loc('Taciz / tehdit','Harassment / threats')],['hate',loc('Nefret söylemi','Hate speech')],['sexual',loc('Cinsel içerik','Sexual content')],['personal_data',loc('Özel bilgi paylaşımı','Private information')],['other',loc('Diğer','Other')]];
 return <>
 <View style={{flexShrink:0,backgroundColor:colors.bg,paddingHorizontal:16,paddingTop:4,paddingBottom:insets.bottom+8}}><Btn title={loc('Güvenlik · Bildir / Engelle','Safety · Report / Block')} icon="shield-checkmark-outline" tone="ghost" size="sm" onPress={()=>setOpen(true)}/></View>
 <Sheet visible={open} onClose={close}><Title size={22}>{loc('Oyuncu ve içerik güvenliği','Player and content safety')}</Title>
 {!target?<>
 {!!success&&<Text accessibilityRole="alert">{success}</Text>}
 <Muted>{loc('Bildirilecek oyuncuyu veya içeriği seç. Bildirimler özel kuyruğa kaydedilir; hemen kaldırılma garantisi verilmez.','Choose a player or content to report. Reports are saved to a private queue; immediate removal is not guaranteed.')}</Muted>
 {ctx.data.players.filter(p=>p.id!==ctx.me.id&&!p.is_bot).map(p=><Btn key={p.id} title={p.nickname} tone="ghost" icon="person-outline" onPress={()=>select({subject:'player',player:p,label:p.nickname})}/>)}
 {(['A','B'] as const).map(side=><Btn key={side} title={loc(`Takım ${side} · Yaratık adı / başlığı`,`Team ${side} · Creature name / title`)} tone="ghost" icon="construct-outline" onPress={()=>select({subject:side==='A'?'team_A':'team_B',player:null,label:loc(`Takım ${side} içeriği`,`Team ${side} content`)})}/>)}
 <Btn title={loc('Odadaki diğer içerik','Other room content')} icon="flag-outline" tone="ghost" onPress={()=>select({subject:'room',player:null,label:loc('Oda içeriği','Room content')})}/>
 </>:blocking?<>
 <Title size={18}>{loc('Bu oyuncuyu engelle?','Block this player?')}</Title><Text>{target.label}</Text>
 <Muted>{loc('Bu oyuncuyla paylaştığın odalardan ayrılırsın. Takımın oyuncusuz kalırsa veya oyun kontrolleri sürdürülemezse oda kapanabilir. Aynı anonim hesaplarla tekrar aynı odaya girilemez. Engeli Profil bölümünden kaldırabilirsin.','You will leave rooms shared with this player. The room may close if your team has no players left or game controls cannot continue. These anonymous accounts cannot share a room again. You can unblock in Profile.')}</Muted>
 <Btn title={loc('Engelle ve odadan ayrıl','Block and leave room')} tone="danger" disabled={busy} loading={busy} onPress={()=>{void run();}}/>
 <Btn title={loc('Vazgeç','Cancel')} tone="ghost" disabled={busy} onPress={()=>setBlocking(false)}/>
 </>:<>
 <Card><Text>{target.label}</Text></Card><Muted>{loc('Takma ad, mesaj veya oyun içeriğini tarif et. Gereksiz kişisel bilgi, parola veya silme kodu yazma. İnceleme için ilgili içerik kopyası özel olarak saklanabilir.','Describe the nickname, message or gameplay content. Do not include unnecessary personal information, passwords or deletion codes. A relevant content copy may be privately retained for review.')}</Muted>
 <View style={{gap:6}}>{reasons.map(([value,label])=><Btn key={value} title={(reason===value?'✓ ':'')+label} tone="ghost" disabled={busy} onPress={()=>setReason(value)}/>)}</View>
 <Input value={details} onChangeText={setDetails} placeholder={loc('Ne oldu? (isteğe bağlı)','What happened? (optional)')} accessibilityLabel={loc('Bildirim ayrıntısı','Report details')} multiline maxLength={1000} editable={!busy}/>
 <Btn title={loc('Bildirimi gönder','Submit report')} icon="flag" disabled={busy} loading={busy} onPress={()=>{void run();}}/>
 {target.player&&<Btn title={loc('Oyuncuyu engelle','Block player')} icon="ban" tone="danger" disabled={busy} onPress={()=>setBlocking(true)}/>}
 <Btn title={loc('Seçime dön','Back to selection')} tone="ghost" disabled={busy} onPress={()=>setTarget(null)}/>
 </>}
 {!!error&&<Text accessibilityRole="alert" style={{color:colors.red}}>{error}</Text>}
 <Btn title={loc('Kapat','Close')} tone="ghost" disabled={busy} onPress={close}/>
 </Sheet></>;
}
