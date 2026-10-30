import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { Card, Muted, Title, Btn } from './ui';
import {usePlaySize} from './PlayLayout';

type Point=[number,number];
export type LineBoard={version:number;level:number;difficulty?:string;pairs:Point[][]};
const COLORS=['#FF6B6B','#65D6FF','#FFD166','#9AE66E','#D6A2FF','#FF9B60'];
const DEMO:LineBoard={version:2,level:1,pairs:[
 [[305,838],[838,695]],[[500,890],[695,838]],[[890,500],[162,695]],
 [[838,305],[110,500]],[[695,162],[500,110]]
]};
const dist=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const intersects=(a:Point,b:Point,c:Point,d:Point)=>{
 const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);
 return ab1*ab2<=0&&cd1*cd2<=0&&
 Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))&&
 Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]));
};
const segmentDistance=(p:Point,a:Point,b:Point)=>{
 const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
 return dist(p,[a[0]+dx*t,a[1]+dy*t]);
};
const complete=(paths:Point[][],board:LineBoard)=>paths.every((p,i)=>p.length>=2&&
 (dist(p[0],board.pairs[i][0])<1&&dist(p[p.length-1],board.pairs[i][1])<1||
 dist(p[0],board.pairs[i][1])<1&&dist(p[p.length-1],board.pairs[i][0])<1));

export function LineConnectGame({onWin,disabled=false,board:given}:{
 onWin?:(paths:Point[][])=>void|Promise<void>;disabled?:boolean;board?:LineBoard|null;
}) {
 const area=usePlaySize();
 const boardSize=Math.max(150,Math.min(390,area.width-32,area.height-160));
 const board=given?.version===2&&given.pairs?.length===6?given:DEMO;
 const [paths,setPaths]=useState<Point[][]>(()=>board.pairs.map(()=>[]));
 const [active,setActive]=useState<number|null>(null);
 const [completed,setCompleted]=useState(false);
 const [boardWidth,setBoardWidth]=useState(0);
 const pathsRef=useRef<Point[][]>(board.pairs.map(()=>[]));
 const activeRef=useRef<number|null>(null);
 const completedRef=useRef(false);
 const widthRef=useRef(0);
 const disabledRef=useRef(disabled);
 const boardRef=useRef(board);
 const winRef=useRef(onWin);
 const lastTouch=useRef<Point|null>(null);
 
 useEffect(()=>{widthRef.current=boardWidth;disabledRef.current=disabled;boardRef.current=board;winRef.current=onWin;},[boardWidth,disabled,board,onWin]);

 const commit=useCallback((next:Point[][])=>{
  pathsRef.current=next;setPaths(next);
  if(!completedRef.current&&complete(next,boardRef.current)){
   completedRef.current=true;setCompleted(true);
   activeRef.current=null;setActive(null);
   winRef.current?.(next.map(path=>path.map(p=>[Math.round(p[0]),Math.round(p[1])] as Point)));
  }
 },[]);
 const endpointAt=useCallback((p:Point)=>{
  for(let i=0;i<boardRef.current.pairs.length;i++)
   for(let j=0;j<2;j++)if(dist(p,boardRef.current.pairs[i][j])<=46)return {color:i,point:boardRef.current.pairs[i][j]};
  return null;
 },[]);
 const canAdd=useCallback((color:number,p:Point)=>{
  const all=pathsRef.current, path=all[color],prev=path[path.length-1];
  if(!prev||dist(prev,p)<1)return false;
  const segmentA=prev,segmentB=p;
  for(let i=0;i<all.length;i++){
   const points=all[i];
   for(let j=1;j<points.length;j++){
    if(i===color&&j===points.length-1)continue;
    if(intersects(segmentA,segmentB,points[j-1],points[j]))return false;
   }
  }
  for(let i=0;i<boardRef.current.pairs.length;i++)if(i!==color)
   for(const dot of boardRef.current.pairs[i])
    if(segmentDistance(dot,segmentA,segmentB)<35)return false;
  return true;
 },[]);
 const advance=useCallback((point:Point)=>{
  if(disabledRef.current||completedRef.current)return;
  const color=activeRef.current;
  if(color===null)return;
  const path=pathsRef.current[color],last=path[path.length-1];
  if(!last)return;
  const end=boardRef.current.pairs[color].find(dot=>dist(dot,path[0])>1);
  if(!end)return;
  if(dist(point,end)<=44){
   if(canAdd(color,end)){
    commit(pathsRef.current.map((p,i)=>i===color?[...p,end]:p));
    activeRef.current=null;setActive(null);
   }
   return;
  }
  // Pulling backwards erases the last portion of the line.
  if(path.length>2&&dist(point,path[path.length-2])<19){
   commit(pathsRef.current.map((p,i)=>i===color?p.slice(0,-1):p));
   return;
  }
  if(dist(last,point)<14||path.length>=238)return;
  if(canAdd(color,point))commit(pathsRef.current.map((p,i)=>i===color?[...p,point]:p));
 },[canAdd,commit]);
 const begin=useCallback((point:Point)=>{
  if(disabledRef.current||completedRef.current)return;
  const end=endpointAt(point);
  if(end){
   const color=end.color;
   if(activeRef.current===color&&pathsRef.current[color].length&&dist(pathsRef.current[color][0],end.point)>1){
    advance(end.point);return;
   }
   activeRef.current=color;setActive(color);
   commit(pathsRef.current.map((p,i)=>i===color?[end.point]:p));
  }else advance(point);
 },[advance,commit,endpointAt]);
 const coords=useCallback((x:number,y:number):Point|null=>{
  const width=widthRef.current;
  if(!width||x<0||y<0||x>width||y>width)return null;
  return [x/width*1000,y/width*1000];
 },[]);
 const start=useCallback((x:number,y:number)=>{
  const p=coords(x,y);lastTouch.current=p;
  if(p)begin(p);
 },[begin,coords]);
 const move=useCallback((x:number,y:number)=>{
  const p=coords(x,y),previous=lastTouch.current;
  if(!p)return;
  const steps=previous?Math.min(32,Math.max(1,Math.ceil(dist(p,previous)/16))):1;
  for(let i=1;i<=steps;i++){
   const t=i/steps;
   advance(previous?[previous[0]+(p[0]-previous[0])*t,previous[1]+(p[1]-previous[1])*t]:p);
  }
  lastTouch.current=p;
 },[advance,coords]);
 const startRef=useRef(start),moveRef=useRef(move);
 useEffect(()=>{startRef.current=start;moveRef.current=move;},[start,move]);
 const pan=useMemo(()=>PanResponder.create({
  onStartShouldSetPanResponder:()=>true,
  onMoveShouldSetPanResponder:()=>true,
  onPanResponderGrant:e=>startRef.current(e.nativeEvent.locationX,e.nativeEvent.locationY),
  onPanResponderMove:e=>moveRef.current(e.nativeEvent.locationX,e.nativeEvent.locationY),
  onPanResponderRelease:()=>{lastTouch.current=null;},
  onPanResponderTerminate:()=>{lastTouch.current=null;},
  onPanResponderTerminationRequest:()=>false,
 }),[]);
 const reset=()=>{const fresh=board.pairs.map(()=>[] as Point[]);pathsRef.current=fresh;setPaths(fresh);activeRef.current=null;setActive(null);completedRef.current=false;setCompleted(false);lastTouch.current=null;};
 return <Card style={{gap:area.active?6:12,padding:area.active?10:16}}>
  <Title size={area.active?18:22}>Çizgi Birleştirme · Bölüm {board.level}</Title>
  <Muted>{board.difficulty ? `Zorluk: ${board.difficulty} · ` : ''}{paths.filter((p,i)=>p.length>=2&&dist(p[p.length-1],board.pairs[i][0])<1||p.length>=2&&dist(p[p.length-1],board.pairs[i][1])<1).length} / 6 renk tamamlandı</Muted>
  {!area.active&&<Muted>6 renkli nokta çiftini boş alanda birleştir. Çizgiler birbirini kesemez ve başka renkteki noktalardan geçemez. Parmağını sürükle; gerekirse bir renge yeniden başla.</Muted>}
  <View {...pan.panHandlers} onLayout={e=>setBoardWidth(e.nativeEvent.layout.width)} style={[styles.board,area.active&&{width:boardSize}]}>
   <Svg pointerEvents="none" width="100%" height="100%" viewBox="0 0 1000 1000">
    {paths.map((path,i)=>path.length>1?<Polyline key={i} points={path.map(p=>p.join(',')).join(' ')} fill="none" stroke={COLORS[i]} strokeWidth={24} strokeLinecap="round" strokeLinejoin="round"/>:null)}
    {board.pairs.map((pair,i)=>pair.map((p,j)=><React.Fragment key={i+'-'+j}>
     <Circle cx={p[0]} cy={p[1]} r={42} fill={COLORS[i]} fillOpacity={0.15}/>
     <Circle cx={p[0]} cy={p[1]} r={28} fill={COLORS[i]} stroke="#fff" strokeOpacity={0.5} strokeWidth={3}/>
    </React.Fragment>))}
   </Svg>
  </View>
  <Muted>{completed?'Tebrikler, tüm renkler birleşti!':active===null?'Bir renkli noktaya dokunup sürükle.':'Çizgiyi sürükleyerek tamamla. Başka bir renge dokunarak değiştirebilirsin.'}</Muted>
  <Btn size="sm" title="Sıfırla" tone="ghost" icon="refresh" onPress={reset}/>
 </Card>;
}
const styles=StyleSheet.create({board:{width:'100%',maxWidth:390,aspectRatio:1,alignSelf:'center',borderRadius:16,overflow:'hidden',backgroundColor:'#0C1930',borderWidth:1,borderColor:'#36415A',...({touchAction:'none'} as unknown as ViewStyle)}});
