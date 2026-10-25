import React, { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { alpha, colors } from '../lib/theme';
import { serverNow } from '../lib/serverTime';

export type PongFrameState = {
 x:number; y:number; vx:number; vy:number; ay:number; by:number;
 scoreA:number; scoreB:number; tick?:string;
 holdAUp?:boolean; holdADown?:boolean; holdBUp?:boolean; holdBDown?:boolean;
 holdAUpAt?:string; holdADownAt?:string; holdBUpAt?:string; holdBDownAt?:string;
};
type Props = { state:PongFrameState|null; width:number; height:number; playing:boolean; mySide:'A'|'B'|null; allowedDirections:number[]; held:{up:boolean;down:boolean} };
type Point = {x:number;y:number;ay:number;by:number};
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const num=(value:unknown,def:number)=>Number.isFinite(Number(value))?Number(value):def;
const freshHeld=(s:PongFrameState,key:'holdAUp'|'holdADown'|'holdBUp'|'holdBDown',now:number)=>
 s[key]===true && typeof s[(key+'At') as keyof PongFrameState]==='string'
 && now-Date.parse(String(s[(key+'At') as keyof PongFrameState]))<2500;

function predict(s:PongFrameState,sec:number,playing:boolean,side:Props['mySide'],directions:number[],held:Props['held'],pressedAt:{up:number;down:number},now:number):Point {
 let aUp=playing&&freshHeld(s,'holdAUp',now), aDown=playing&&freshHeld(s,'holdADown',now);
 let bUp=playing&&freshHeld(s,'holdBUp',now), bDown=playing&&freshHeld(s,'holdBDown',now);
 if(side==='A'){if(directions.includes(-1))aUp=playing&&held.up;if(directions.includes(1))aDown=playing&&held.down;}
 if(side==='B'){if(directions.includes(-1))bUp=playing&&held.up;if(directions.includes(1))bDown=playing&&held.down;}
 const localSec=(dir:'up'|'down')=>pressedAt[dir]?clamp((now-pressedAt[dir])/1000,0,sec):sec;
 const upA=side==='A'&&directions.includes(-1)?localSec('up'):sec;
 const downA=side==='A'&&directions.includes(1)?localSec('down'):sec;
 const upB=side==='B'&&directions.includes(-1)?localSec('up'):sec;
 const downB=side==='B'&&directions.includes(1)?localSec('down'):sec;
 const ay=clamp(num(s.ay,0.5)+0.9*((aDown?downA:0)-(aUp?upA:0)),0.105,0.895);
 const by=clamp(num(s.by,0.5)+0.9*((bDown?downB:0)-(bUp?upB:0)),0.105,0.895);
 let x=num(s.x,0.5),y=num(s.y,0.5),vx=num(s.vx,0.46),vy=num(s.vy,0.23);
 if(!playing) return {x,y,ay,by};
 const parts=Math.ceil(sec/0.012),dt=parts?sec/parts:0;
 for(let i=0;i<parts;i++){
  x+=vx*dt;y+=vy*dt;
  if(y<0.025){y=0.05-y;vy=Math.abs(vy);}
  if(y>0.975){y=1.95-y;vy=-Math.abs(vy);}
  if(x<=0.065&&vx<0&&Math.abs(y-ay)<0.115){x=0.13-x;vx=Math.abs(vx)*1.045;vy+=(y-ay)*0.3;}
  if(x>=0.935&&vx>0&&Math.abs(y-by)<0.115){x=1.87-x;vx=-Math.abs(vx)*1.045;vy+=(y-by)*0.3;}
  if(x<0||x>1){x=clamp(x,0,1);break;}
 }
 return {x,y,ay,by};
}

// The authoritative simulation runs in PostgreSQL; only the drawing is predicted locally.
// Animated.Value updates bypass React re-renders, allowing native/web frame-rate rendering.
export const PongArena=memo(function PongArena({state,width,height,playing,mySide,allowedDirections,held}:Props){
 const paddleHeight=height*0.2;
 const ballX=useRef(new Animated.Value(width/2-6)).current;
 const ballY=useRef(new Animated.Value(height/2-6)).current;
 const leftY=useRef(new Animated.Value(height/2-paddleHeight/2)).current;
 const rightY=useRef(new Animated.Value(height/2-paddleHeight/2)).current;
 const snapshot=useRef<{s:PongFrameState;at:number}|null>(null);
 const display=useRef<Point>({x:0.5,y:0.5,ay:0.5,by:0.5});
 const pressedAt=useRef({up:0,down:0});
 const currentHeld=useRef(held);
 const params=useRef({playing,mySide,allowedDirections});
 useEffect(()=>{
  if(held.up&&!currentHeld.current.up)pressedAt.current.up=Date.now();
  if(held.down&&!currentHeld.current.down)pressedAt.current.down=Date.now();
  currentHeld.current=held;
 },[held]);
 useEffect(()=>{params.current={playing,mySide,allowedDirections};},[playing,mySide,allowedDirections]);
 useEffect(()=>{
  if(!state)return;
  const old=snapshot.current?.s;
  snapshot.current={s:state,at:Date.now()};
  if(!old||old.scoreA!==state.scoreA||old.scoreB!==state.scoreB){
   display.current={x:num(state.x,0.5),y:num(state.y,0.5),ay:num(state.ay,0.5),by:num(state.by,0.5)};
  }
 },[state]);
 useEffect(()=>{
  let frame=0,running=true,last=Date.now();
  const draw=()=>{
   if(!running)return;
   const now=Date.now(),delta=clamp((now-last)/1000,0,0.05);
   last=now;
   const snap=snapshot.current;
   if(snap){
    const cfg=params.current;
    const secs=cfg.playing?clamp((now-snap.at)/1000,0,0.42):0;
    const target=predict(snap.s,secs,cfg.playing,cfg.mySide,cfg.allowedDirections,currentHeld.current,pressedAt.current,serverNow());
    const factor=1-Math.exp(-22*delta),old=display.current;
    const next:Point={x:old.x+(target.x-old.x)*factor,y:old.y+(target.y-old.y)*factor,ay:old.ay+(target.ay-old.ay)*factor,by:old.by+(target.by-old.by)*factor};
    display.current=next;
    ballX.setValue(next.x*width-6);ballY.setValue(next.y*height-6);
    leftY.setValue(next.ay*height-paddleHeight/2);rightY.setValue(next.by*height-paddleHeight/2);
   }
   frame=requestAnimationFrame(draw);
  };
  frame=requestAnimationFrame(draw);
  return ()=>{running=false;cancelAnimationFrame(frame);};
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