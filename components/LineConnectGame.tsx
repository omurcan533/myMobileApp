import React, { useCallback, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { Card, Muted, Title, Btn } from './ui';

type Cell = [number, number];
type Pair = { color: string; start: Cell; end: Cell };
const SIZE = 6;
const PAIRS: Pair[] = [
 { color: '#FF6B6B', start: [0,0], end: [5,4] },
 { color: '#65D6FF', start: [0,3], end: [4,5] },
 { color: '#FFD166', start: [2,0], end: [5,3] },
 { color: '#9AE66E', start: [1,2], end: [3,4] },
];
const key = ([r,c]: Cell) => r*SIZE+c;
const endpoints = new Map<number,number>();
PAIRS.forEach((p,i)=>{endpoints.set(key(p.start),i);endpoints.set(key(p.end),i);});
const adjacent=(a:number,b:number)=>Math.abs(Math.floor(a/SIZE)-Math.floor(b/SIZE))+Math.abs(a%SIZE-b%SIZE)===1;
const isComplete=(paths:number[][])=>paths.every((p,i)=>p.length>1&&
 (p[0]===key(PAIRS[i].start)&&p[p.length-1]===key(PAIRS[i].end)||
  p[0]===key(PAIRS[i].end)&&p[p.length-1]===key(PAIRS[i].start)));

export function LineConnectGame({ onWin, disabled=false }: { onWin?:(paths:number[][])=>void; disabled?:boolean }) {
 const [paths,setPaths]=useState<number[][]>(()=>PAIRS.map(()=>[]));
 const [active,setActive]=useState<number|null>(null);
 const [completed,setCompleted]=useState(false);
 const [boardWidth,setBoardWidth]=useState(0);
 const pathsRef=useRef<number[][]>(PAIRS.map(()=>[]));
 const activeRef=useRef<number|null>(null);
 const completedRef=useRef(false);
 const disabledRef=useRef(disabled);
 const winRef=useRef(onWin);
 const widthRef=useRef(0);
 const lastPoint=useRef<{x:number;y:number}|null>(null);
 disabledRef.current=disabled;winRef.current=onWin;widthRef.current=boardWidth;

 const commit=useCallback((next:number[][])=>{
  pathsRef.current=next;
  setPaths(next);
  if(!completedRef.current&&isComplete(next)){
   completedRef.current=true;
   setCompleted(true);
   activeRef.current=null;
   setActive(null);
   winRef.current?.(next);
  }
 },[]);
 const choose=useCallback((cell:number)=>{
  if(disabledRef.current||completedRef.current)return;
  const end=endpoints.get(cell);
  const current=activeRef.current;
  if(end!==undefined){
   if(current===end){
    const path=pathsRef.current[end];
    if(path.length&&path[0]!==cell&&adjacent(path[path.length-1],cell)){
     commit(pathsRef.current.map((p,i)=>i===end?[...p,cell]:p));
     activeRef.current=null;setActive(null);
     return;
    }
   }
   // Only start or restart at an endpoint; don't steal another color's endpoint.
   const next=pathsRef.current.map((p,i)=>i===end?[cell]:p);
   activeRef.current=end;setActive(end);commit(next);
   return;
  }
  if(current===null)return;
  const path=pathsRef.current[current];
  if(!path.length)return;
  const last=path[path.length-1];
  if(path.length>1&&cell===path[path.length-2]){
   commit(pathsRef.current.map((p,i)=>i===current?p.slice(0,-1):p));
   return;
  }
  if(!adjacent(last,cell))return;
  if(endpoints.has(cell))return;
  if(pathsRef.current.some((p,i)=>i!==current&&p.includes(cell)))return;
  if(path.includes(cell))return;
  commit(pathsRef.current.map((p,i)=>i===current?[...p,cell]:p));
 },[commit]);
 const pointToCell=useCallback((x:number,y:number)=>{
  const width=widthRef.current;
  if(width<=0||x<0||y<0||x>=width||y>=width)return null;
  const row=Math.min(SIZE-1,Math.floor(y/width*SIZE));
  const col=Math.min(SIZE-1,Math.floor(x/width*SIZE));
  return row*SIZE+col;
 },[]);
 const trace=useCallback((x:number,y:number)=>{
  const previous=lastPoint.current;
  const steps=previous?Math.max(1,Math.ceil(Math.hypot(x-previous.x,y-previous.y)/Math.max(1,widthRef.current/18))):1;
  for(let i=previous?1:0;i<=steps;i++){
   const t=i/steps;
   const cell=pointToCell(previous?previous.x+(x-previous.x)*t:x,previous?previous.y+(y-previous.y)*t:y);
   if(cell!==null)choose(cell);
  }
  lastPoint.current={x,y};
 },[choose,pointToCell]);
 const startRef=useRef<(x:number,y:number)=>void>(()=>{});
 const moveRef=useRef<(x:number,y:number)=>void>(()=>{});
 const endRef=useRef<()=>void>(()=>{});
 startRef.current=(x,y)=>{lastPoint.current=null;trace(x,y);};
 moveRef.current=(x,y)=>trace(x,y);
 endRef.current=()=>{lastPoint.current=null;};
 const pan=useRef(PanResponder.create({
  onStartShouldSetPanResponder:()=>true,
  onMoveShouldSetPanResponder:()=>true,
  onPanResponderGrant:e=>startRef.current(e.nativeEvent.locationX,e.nativeEvent.locationY),
  onPanResponderMove:e=>moveRef.current(e.nativeEvent.locationX,e.nativeEvent.locationY),
  onPanResponderRelease:()=>endRef.current(),
  onPanResponderTerminate:()=>endRef.current(),
  onPanResponderTerminationRequest:()=>false,
 })).current;
 const reset=()=>{const fresh=PAIRS.map(()=>[] as number[]);pathsRef.current=fresh;setPaths(fresh);activeRef.current=null;setActive(null);completedRef.current=false;setCompleted(false);lastPoint.current=null;};
 return <Card style={{gap:12}}>
  <Title size={22}>Çizgi Birleştirme</Title>
  <Muted>Renkli noktaya basılı tutup diğer aynı renkli noktaya sürükle. Parmağını geri çekerek çizgiyi silebilirsin. İstersen karelere tek tek de dokunabilirsin.</Muted>
  <View {...pan.panHandlers} onLayout={e=>setBoardWidth(e.nativeEvent.layout.width)} style={styles.board}>
   {Array.from({length:SIZE*SIZE},(_,cell)=>{
    const owner=paths.findIndex(path=>path.includes(cell));
    const endpoint=endpoints.get(cell);
    const colorIndex=owner>=0?owner:endpoint;
    const color=colorIndex===undefined?undefined:PAIRS[colorIndex].color;
    return <View key={cell} pointerEvents="none" style={[styles.cell,{width:boardWidth? (boardWidth-10)/SIZE:'16%',height:boardWidth?(boardWidth-10)/SIZE:45,backgroundColor:color?color+'55':'#15233B',borderColor:color??'#36415A'}]}>
     {endpoint!==undefined?<View style={[styles.dot,{backgroundColor:PAIRS[endpoint].color}]}/>:owner>=0?<View style={[styles.line,{backgroundColor:PAIRS[owner].color}]}/>:null}
    </View>;
   })}
  </View>
  <Muted>{completed?'Bulmaca tamamlandı!':active===null?'Bir renkli noktadan başlayıp sürükle.':'Çizgiyi ilerlet veya parmağını geri çek.'}</Muted>
  <Btn title="Sıfırla" tone="ghost" icon="refresh" onPress={reset}/>
 </Card>;
}
const styles=StyleSheet.create({
 board:{width:'100%',maxWidth:390,aspectRatio:1,flexDirection:'row',flexWrap:'wrap',alignSelf:'center',gap:2,touchAction:'none' as any},
 cell:{borderWidth:1,borderRadius:7,alignItems:'center',justifyContent:'center'},
 dot:{width:'62%',height:'62%',borderRadius:99},
 line:{width:'55%',height:'55%',borderRadius:6},
});
