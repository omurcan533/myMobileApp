import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {Scoreboard} from './Scoreboard';
import {PartyBreak} from './PartyBreak';
import {Btn, Muted, Sheet, Text, Title} from './ui';
import {colors, teamColor} from '../lib/theme';
import type {Ctx, Side} from '../lib/types';

export {PlayArea,usePlaySize} from './PlayLayout';

export function PlayHeader({ctx,left,label,instructions,onPause,onJoker,busy=false}:{
 ctx:Ctx;left:number;label:string;instructions:string;onPause:()=>void;onJoker?:()=>void;busy?:boolean;
}){
 const [open,setOpen]=useState(false);
 return <>
  <View style={s.row}>
   {(['A','B'] as Side[]).map((side,i)=><React.Fragment key={side}>
    {i===1&&<View style={s.timer}><Text numberOfLines={1} style={s.label}>{label}</Text><Text accessibilityLabel={`Kalan süre ${Math.ceil(left)} saniye`} style={[s.time,left<10&&{color:colors.red}]}>◷ {Math.max(0,Math.ceil(left))}</Text></View>}
    <Pressable accessibilityRole="button" accessibilityLabel={`Takım ${side}, ${ctx.data.teams.find(t=>t.side===side)?.score??0} puan. Takım bilgilerini aç`} onPress={()=>setOpen(true)} style={[s.team,{borderColor:teamColor(side)}]}>
     <Text numberOfLines={1} style={{color:teamColor(side),fontSize:10,fontWeight:'800'}}>{side}{ctx.me.team_side===side?' · SEN':''}</Text>
     <Text adjustsFontSizeToFit numberOfLines={1} style={s.score}>{ctx.data.teams.find(t=>t.side===side)?.score??0}</Text>
    </Pressable>
   </React.Fragment>)}
   <Pressable accessibilityRole="button" accessibilityLabel="Oyun menüsü ve kurallar" onPress={()=>setOpen(true)} style={s.menu}><Ionicons name="ellipsis-horizontal" color={colors.text} size={22}/></Pressable>
  </View>
  <View style={s.pauseRow}>
   <Btn title={ctx.data.room.paused?'Devam Et':ctx.me.is_captain?'Mola':'Mola · Kaptan'} icon={ctx.data.room.paused?'play':'pause'} size="sm" tone="ghost" disabled={busy||!ctx.me.is_captain} onPress={onPause}/>
  </View>
  <Sheet visible={open} onClose={()=>setOpen(false)}>
   <Title size={20}>Oyun Menüsü</Title>
   <Muted>{instructions}</Muted>
   <Scoreboard ctx={ctx}/>
   <PartyBreak roomId={ctx.data.room.id} players={ctx.data.players} myId={ctx.me.id} isHost={ctx.me.is_host} canStart={false}/>
   {ctx.me.is_captain&&<Btn title={ctx.data.room.paused?'Devam Et':'Mola'} disabled={busy} onPress={()=>{setOpen(false);onPause();}}/>}
   {onJoker&&<Btn title="Joker Kullan" tone="gold" disabled={busy} onPress={()=>{setOpen(false);onJoker();}}/>}
   <Btn title="Oyuna Dön" tone="ghost" onPress={()=>setOpen(false)}/>
  </Sheet>
 </>;
}
const s=StyleSheet.create({
 pauseRow:{flexShrink:0,alignItems:'flex-end',marginBottom:6},
 row:{height:48,flexShrink:0,flexDirection:'row',alignItems:'center',gap:6,marginBottom:6},
 team:{flex:1,minWidth:0,height:44,borderWidth:1,borderRadius:12,backgroundColor:'#101C31',flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingHorizontal:6,gap:4},
 score:{color:colors.text,fontSize:20,fontWeight:'900',flexShrink:1},
 timer:{alignItems:'center',width:64},label:{color:colors.muted,fontSize:9},time:{color:colors.cyan,fontSize:18,fontWeight:'900',fontVariant:['tabular-nums']},
 menu:{width:40,height:44,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:'#101C31'},
});
