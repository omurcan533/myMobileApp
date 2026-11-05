import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Linking,ScrollView,View} from 'react-native';
import {Btn,Card,Muted,Screen,Text,Title} from './ui';
import {PrivacyInfo} from './PrivacyInfo';
import {COMMUNITY_URL,communitySafety,type SafetyStatus} from '../lib/communitySafety';
import type {DeletionResult} from '../lib/accountDeletion';
import {useLanguage} from '../lib/i18n';
export function CommunityGate({children,onAccountDeleted}:{children:React.ReactNode;onAccountDeleted:(r:DeletionResult)=>void}){
 const en=useLanguage()==='en';const loc=(tr:string,english:string)=>en?english:tr;
 const [status,setStatus]=useState<SafetyStatus|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const locked=useRef(false);
 const load=useCallback(()=>communitySafety.status().then(next=>{setStatus(next);setError('');},e=>setError((e as Error).message)),[]);
 useEffect(()=>{void load();},[load]);
 const accept=async()=>{if(locked.current)return;locked.current=true;setBusy(true);setError('');try{await communitySafety.accept();await load();}catch(e){setError((e as Error).message);}finally{locked.current=false;setBusy(false);}};
 if(status?.accepted&&!status.restricted)return <>{children}</>;
 return <Screen><ScrollView contentContainerStyle={{padding:20,gap:16}}><Card style={{gap:14}}>
  <Title>{status?.restricted?loc('Hesap kısıtlandı','Account restricted'):loc('Birlikte güvenli oynayalım','Let’s play safely together')}</Title>
  {!status?.restricted&&<><Text>{loc('Taciz, nefret söylemi, cinsel içerik, tehdit ve başkasının özel bilgilerini paylaşmak yasaktır. Takma adların, mesajların ve oyun içinde paylaştığın tüm içerikler bu kurallara tabidir.','Harassment, hate speech, sexual content, threats and sharing someone else’s private information are prohibited. These rules apply to nicknames, messages and all content shared during games.')}</Text>
  <Muted>{loc('Odadaki Güvenlik düğmesinden oyuncu veya içerik bildirebilir, oyuncu engelleyebilirsin. Engelleme mevcut odadan ayrılmanı sağlar ve aynı hesaplar tekrar aynı odaya giremez.','Use Safety in any room to report players or content, or block a player. Blocking leaves the current room and prevents these accounts from sharing a room again.')}</Muted>
  <Muted>{loc('Bildirimler özel inceleme kuyruğuna alınır. İnceleme sonucunda içerik kaldırılabilir veya hesap kısıtlanabilir. Anonim bir kullanıcı yeni hesap açarsa eski engelleme yeni hesabı tanıyamaz.','Reports enter a private review queue. Review may lead to content removal or account restrictions. If an anonymous user creates a new account, an old block cannot identify that new account.')}</Muted></>}
  {status?.restricted&&<Muted>{loc('İtiraz veya destek için yilmazomurcan@gmail.com adresine yazabilirsin. Hesabını silme seçeneği aşağıda kullanılabilir.','For an appeal or support, contact yilmazomurcan@gmail.com. Account deletion remains available below.')}</Muted>}
  <Btn title={loc('Topluluk kurallarını oku','Read community rules')} tone="ghost" icon="document-text-outline" onPress={()=>{void Linking.openURL(COMMUNITY_URL).catch(()=>setError(loc('Sayfa açılamadı. Tekrar dene.','Could not open the page. Try again.')));}}/>
  {!!error&&<Text accessibilityRole="alert">{error}</Text>}
  {!status&&<Btn title={loc('Yeniden kontrol et','Check again')} tone="ghost" onPress={()=>{void load();}}/>}
  {status&&!status.restricted&&<Btn title={loc('Kuralları kabul et ve devam et','Accept the rules and continue')} icon="shield-checkmark" loading={busy} disabled={busy} onPress={()=>{void accept();}}/>}
  <Muted>{loc('Kabul etmeden oyun odası oluşturamaz, katılamaz veya içerik paylaşamazsın.','You must accept before creating or joining rooms or sharing content.')}</Muted>
 </Card><View><PrivacyInfo onAccountDeleted={onAccountDeleted}/></View></ScrollView></Screen>;
}
