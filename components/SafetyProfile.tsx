import React,{useRef,useState} from 'react';
import {Linking,View} from 'react-native';
import {Btn,Card,Muted,Sheet,Text,Title} from './ui';
import {COMMUNITY_URL,communitySafety} from '../lib/communitySafety';
import {useLanguage} from '../lib/i18n';
export function SafetyProfile(){
 const en=useLanguage()==='en';const loc=(tr:string,english:string)=>en?english:tr;
 const [open,setOpen]=useState(false),[blocks,setBlocks]=useState<{id:string;label:string}[]>([]),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);const locked=useRef(false);
 const load=async()=>{setError('');setLoaded(false);try{setBlocks(await communitySafety.blocks());setLoaded(true);}catch(e){setError((e as Error).message);}};
 const unblock=async(id:string)=>{if(locked.current)return;locked.current=true;setBusy(true);try{await communitySafety.unblock(id);await load();}catch(e){setError((e as Error).message);}finally{locked.current=false;setBusy(false);}};
 return <Card style={{gap:12}}><Title size={20}>{loc('Güvenlik ve topluluk','Safety and community')}</Title>
 <Muted>{loc('Odadaki Güvenlik düğmesinden içerik ve oyuncu bildirebilirsin.','Report content and players using Safety in any room.')}</Muted>
 <Btn title={loc('Topluluk kuralları','Community rules')} tone="ghost" icon="shield-checkmark-outline" onPress={()=>{void Linking.openURL(COMMUNITY_URL).catch(()=>setError(loc('Sayfa açılamadı.','Could not open the page.')));}}/>
 <Btn title={loc('Engellediğim oyuncular','Blocked players')} tone="ghost" icon="ban-outline" onPress={()=>{setOpen(true);void load();}}/>
 {!open&&!!error&&<Muted>{error}</Muted>}
 <Sheet visible={open} onClose={()=>{if(!locked.current)setOpen(false);}}><Title size={22}>{loc('Engellediğim oyuncular','Blocked players')}</Title>
 <Muted>{loc('Engeli kaldırmak eski odana otomatik katılmaz. Karşı taraf da seni engellediyse aynı odaya giriş engeli devam eder.','Unblocking does not rejoin an old room. If the other player has also blocked you, the room restriction remains.')}</Muted>
 {loaded&&!blocks.length&&<Muted>{loc('Engellediğin oyuncu yok.','You have no blocked players.')}</Muted>}
 {blocks.map(b=><View key={b.id} style={{gap:8}}><Text>{b.label}</Text><Btn title={loc('Engeli kaldır','Unblock')} tone="ghost" disabled={busy} onPress={()=>{void unblock(b.id);}}/></View>)}
 {!!error&&<Text accessibilityRole="alert">{error}</Text>}
 {!loaded&&<Btn title={loc('Yeniden yükle','Reload')} tone="ghost" onPress={()=>{void load();}}/>}
 <Btn title={loc('Kapat','Close')} tone="ghost" disabled={busy} onPress={()=>setOpen(false)}/></Sheet></Card>;
}
