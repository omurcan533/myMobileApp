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

// Run the simulation forward on every rendered frame, not once per network packet.
function step(p:Point,v:{vx:number;vy:number},dt:number,playing:boolean,controls:{aUp:boolean;aDown:boolean;bUp:boolean;bDown:boolean}):Point {
 if(!playing)return p;
 let ay=clamp(p.ay+0.9*dt*(Number(controls.aDown)-Number(controls.aUp)),0.105,0.895);
 let by=clamp(p.by+0.9*dt*(Number(controls.bDown)-Number(controls.bUp)),0.105,0.895);
 let x=p.x+v.vx*dt,y=p.y+v.vy*dt;
 if(y<0.025){y=0.025;v.vy=Math.abs(v.vy);}
 if(y>0.975){y=0.975;v.vy=-Math.abs(v.vy);}
 if(x<=0.065&&v.vx<0&&Math.abs(y-ay)<0.115){x=0.065;v.vx=Math.abs(v.vx)*1.045;v.vy+=(y-ay)*0.3;}
 if(x>=0.935&&v.vx>0&&Math.abs(y-by)<0.115){x=0.935;v.vx=-Math.abs(v.vx)*1.045;v.vy+=(y-by)*0.3;}
 return {x:clamp(x,0,1),y:clamp(y,0.025,0.975),ay,by};
}
// The authoritative simulation runs in PostgreSQL; only the drawing is predicted locally.
// Animated.Value updates bypass React re-renders, allowing native/web frame-rate rendering.
export const PongArena=memo(function PongArena({state,width,height,playing,mySide,allowedDirections,held}:Props){
 const paddleHeight=height*0.2;
 const ballX=useRef(new Animated.Value(width/2-6)).current;
 const ballY=useRef(new Animated.Value(height/2-6)).current;
 const leftY=useRef(new Animated.Value(height/2-paddleHeight/2)).current;
 const rightY=useRef(new Animated.Value(height/2-paddleHeight/2)).current;
 const display=useRef<Point>({x:0.5,y:0.5,ay:0.5,by:0.5});
 const velocity=useRef({vx:0.46,vy:0.23});
 const lastScore=useRef('');
 const serverState=useRef<PongFrameState|null>(null);
 // Local paddle collisions are rendered immediately. Older server frames must not
 // reverse that bounce while the authoritative simulation catches up.
 const pendingBounce=useRef<{direction:number;at:number}|null>(null);
 const currentHeld=useRef(held);
 const params=useRef({playing,mySide,allowedDirections});
 useEffect(()=>{
  currentHeld.current=held;
 },[held]);
 useEffect(()=>{params.current={playing,mySide,allowedDirections};},[playing,mySide,allowedDirections]);
 useEffect(()=>{
  if(!state)return;
  const old=serverState.current;
  const nextTick=Date.parse(state.tick??'');
  const prevTick=Date.parse(old?.tick??'');
  // Ignore old network replies, which otherwise rewind the ball.
  if(old&&Number.isFinite(nextTick)&&Number.isFinite(prevTick)&&nextTick<prevTick)return;
  serverState.current=state;
  const key=state.scoreA+':'+state.scoreB;
  if(!old||key!==lastScore.current){
   display.current={x:num(state.x,0.5),y:num(state.y,0.5),ay:num(state.ay,0.5),by:num(state.by,0.5)};
   velocity.current={vx:num(state.vx,0.46),vy:num(state.vy,0.23)};
   lastScore.current=key;
   pendingBounce.current=null;
  }else{
   // Correct once per fresh server packet. Never pull every frame toward an old packet.
   const p=display.current;
   const age=Number.isFinite(nextTick)?clamp((serverNow()-nextTick)/1000,0,0.35):0;
   const synced=step(
    {x:num(state.x,0.5),y:num(state.y,0.5),ay:num(state.ay,0.5),by:num(state.by,0.5)},
    {vx:num(state.vx,0.46),vy:num(state.vy,0.23)},age,params.current.playing,
    {aUp:freshHeld(state,'holdAUp',serverNow()),aDown:freshHeld(state,'holdADown',serverNow()),
     bUp:freshHeld(state,'holdBUp',serverNow()),bDown:freshHeld(state,'holdBDown',serverNow())}
   );
   const x=synced.x,y=synced.y;
   const error=Math.hypot(x-p.x,y-p.y);
   const vx=num(state.vx,0.46),vy=num(state.vy,0.23);
   const localV=velocity.current;
   const pending=pendingBounce.current;
   if(pending){
    if(Math.sign(vx)===pending.direction){
     // Server has confirmed the locally predicted paddle hit.
     pendingBounce.current=null;
    }else if(serverNow()-pending.at<700){
     // This frame still describes the ball approaching the paddle. Updating
     // position or velocity would visibly pin it to the paddle and re-bounce.
     return;
    }else{
     // A prediction was wrong (the paddle missed); trust the server again.
     pendingBounce.current=null;
     display.current={...p,x,y};
     localV.vx=vx;
     localV.vy=vy;
     return;
    }
   }
   const flippedX=Math.sign(vx)!==Math.sign(localV.vx);
   const flippedY=Math.sign(vy)!==Math.sign(localV.vy);
   if(flippedX){
    // A late server bounce must not teleport a ball that already bounced locally.
    // Correct only when our prediction missed the collision entirely.
    if((vx>0&&p.x<0.08)||(vx<0&&p.x>0.92)){
     display.current={...p,x,y};
    }else if(error>0.20&&p.x>0.12&&p.x<0.88){
     display.current={...p,x:p.x+(x-p.x)*0.10,y:p.y+(y-p.y)*0.10};
    }
    localV.vx=vx;
    localV.vy=vy;
   }else{
    if(error>0.35){
     // Severe divergence (missed goal or long browser suspension).
     display.current={...p,x,y};
    }else if(error>0.065){
     display.current={...p,x:p.x+(x-p.x)*0.12,y:p.y+(y-p.y)*0.12};
    }
    if(flippedY)localV.vy=vy;
    localV.vx=vx;
   }
  }
 },[state]);
 useEffect(()=>{
  let frame=0,running=true,last=Date.now();
  const draw=()=>{
   if(!running)return;
   const now=Date.now();
   const dt=clamp((now-last)/1000,0,0.05);
   last=now;
   const s=serverState.current;
   if(s){
    const cfg=params.current,pressed=currentHeld.current;
    const valid=(key:'holdAUp'|'holdADown'|'holdBUp'|'holdBDown')=>cfg.playing&&freshHeld(s,key,serverNow());
    const controls={
     aUp:cfg.mySide==='A'&&cfg.allowedDirections.includes(-1)?pressed.up:valid('holdAUp'),
     aDown:cfg.mySide==='A'&&cfg.allowedDirections.includes(1)?pressed.down:valid('holdADown'),
     bUp:cfg.mySide==='B'&&cfg.allowedDirections.includes(-1)?pressed.up:valid('holdBUp'),
     bDown:cfg.mySide==='B'&&cfg.allowedDirections.includes(1)?pressed.down:valid('holdBDown'),
    };
    const p=display.current;
    const previousDirection=Math.sign(velocity.current.vx);
    let next=step(p,velocity.current,dt,cfg.playing,controls);
    if(Math.sign(velocity.current.vx)!==previousDirection &&
       ((previousDirection<0&&next.x<=0.065)||(previousDirection>0&&next.x>=0.935))){
     pendingBounce.current={direction:Math.sign(velocity.current.vx),at:serverNow()};
    }
    // No stale-packet correction inside the animation loop.
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