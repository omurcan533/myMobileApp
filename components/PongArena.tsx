import React, { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { alpha, colors } from '../lib/theme';
import { serverNow } from '../lib/serverTime';
import { appendSnapshot, clamp, paddleTarget, sampleTimeline, stepLocalPaddle } from '../lib/pongTimeline';
import type { PongFrameState, PongSnapshot } from '../lib/pongTimeline';
export type { PongFrameState } from '../lib/pongTimeline';

type Props = { state:PongFrameState|null; width:number; height:number; playing:boolean; mySide:'A'|'B'|null; allowedDirections:number[]; held:{up:boolean;down:boolean} };

export const PongArena=memo(function PongArena({state,width,height,playing,mySide,allowedDirections,held}:Props){
 const paddleHeight=height*0.2;
 const ballX=useRef(new Animated.Value(width/2-6)).current;
 const ballY=useRef(new Animated.Value(height/2-6)).current;
 const leftY=useRef(new Animated.Value(height/2-paddleHeight/2)).current;
 const rightY=useRef(new Animated.Value(height/2-paddleHeight/2)).current;
 const history=useRef<PongSnapshot[]>([]);
 const paddles=useRef({A:0.5,B:0.5});
 const params=useRef({playing,mySide,allowedDirections,held});
 useEffect(()=>{params.current={playing,mySide,allowedDirections,held};},[playing,mySide,allowedDirections,held]);
 useEffect(()=>{
  if(!state)return;
  const next=appendSnapshot(history.current,state);
  if(next===history.current)return;
  if(!history.current.length)paddles.current={A:state.ay,B:state.by};
  history.current=next;
 },[state]);
 useEffect(()=>{
  let frame=0,last=performance.now();
  const draw=()=>{
   const clock=performance.now();
   const dt=clamp((clock-last)/1000,0,0.05);
   last=clock;
   const cfg=params.current;
   const latest=history.current[history.current.length-1];
   const sampled=cfg.playing?sampleTimeline(history.current,serverNow()):latest?.state;
   if(sampled&&latest){
    for(const side of ['A','B'] as const){
     const local=cfg.playing&&cfg.mySide===side;
     const now=serverNow();
     const heldOnServer=(direction:'Up'|'Down')=>{
      const key=`hold${side}${direction}` as 'holdAUp'|'holdADown'|'holdBUp'|'holdBDown';
      return latest.state[key]===true&&now-Date.parse(latest.state[`${key}At`]??'')<2500;
     };
     const serverUp=heldOnServer('Up'),serverDown=heldOnServer('Down');
     // In duo mode, the teammate still controls the other direction.
     const up=local&&(cfg.allowedDirections.includes(-1)?cfg.held.up:serverUp);
     const down=local&&(cfg.allowedDirections.includes(1)?cfg.held.down:serverDown);
     const acknowledged=(!cfg.allowedDirections.includes(-1)||serverUp===cfg.held.up)
      &&(!cfg.allowedDirections.includes(1)||serverDown===cfg.held.down);
     const target=local?paddleTarget(latest.state,side,now):(side==='A'?sampled.ay:sampled.by);
     const prior=paddles.current[side];
     paddles.current[side]=local?stepLocalPaddle(prior,dt,up,down,target,acknowledged):target;
    }
    ballX.setValue(sampled.x*width-6);ballY.setValue(sampled.y*height-6);
    leftY.setValue(paddles.current.A*height-paddleHeight/2);
    rightY.setValue(paddles.current.B*height-paddleHeight/2);
   }
   frame=requestAnimationFrame(draw);
  };
  frame=requestAnimationFrame(draw);
  return ()=>cancelAnimationFrame(frame);
 },[width,height,paddleHeight,ballX,ballY,leftY,rightY]);
 if(!state)return null;
 return <View style={[styles.board,{width,height}]}>
  <View style={[styles.midline,{left:width/2}]} />
  <View style={[styles.circle,{left:width/2-25,top:height/2-25}]} />
  <Animated.View style={[styles.paddle,{left:8,height:paddleHeight,backgroundColor:colors.cyan,transform:[{translateY:leftY}]}]} />
  <Animated.View style={[styles.paddle,{right:8,height:paddleHeight,backgroundColor:colors.gold,transform:[{translateY:rightY}]}]} />
  <Animated.View style={[styles.ball,{transform:[{translateX:ballX},{translateY:ballY}]}]} />
 </View>;
});
const styles=StyleSheet.create({
 board:{alignSelf:'center',backgroundColor:'#07172C',borderWidth:2,borderColor:'#607793',borderRadius:14,overflow:'hidden'},
 midline:{position:'absolute',top:0,bottom:0,borderLeftWidth:2,borderStyle:'dashed',borderColor:alpha('#FFFFFF',0.28)},
 circle:{position:'absolute',width:50,height:50,borderWidth:1,borderColor:alpha('#FFFFFF',0.16),borderRadius:25},
 paddle:{position:'absolute',top:0,width:10,borderRadius:6},
 ball:{position:'absolute',top:0,left:0,width:12,height:12,borderRadius:6,backgroundColor:'#FFFFFF'}
});
