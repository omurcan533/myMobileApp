import React, { useMemo, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Card, Muted, Text, Title, Btn } from './ui';
import { colors } from '../lib/theme';

type Cell = [number, number];
type Pair = { color: string; start: Cell; end: Cell };
const SIZE = 6;
// A deliberately challenging fixed board. Each path must avoid other paths.
const PAIRS: Pair[] = [
  { color: '#FF6B6B', start: [0,0], end: [5,1] },
  { color: '#65D6FF', start: [0,3], end: [4,5] },
  { color: '#FFD166', start: [2,0], end: [5,3] },
  { color: '#9AE66E', start: [1,2], end: [3,4] },
];
const key = ([r,c]: Cell) => r * SIZE + c;
const endpoints = new Map<number,number>();
PAIRS.forEach((p,i)=>{endpoints.set(key(p.start),i);endpoints.set(key(p.end),i);});
const adjacent = (a:number,b:number) => Math.abs(Math.floor(a/SIZE)-Math.floor(b/SIZE))+Math.abs(a%SIZE-b%SIZE)===1;

export function LineConnectGame({ onWin, disabled = false }: { onWin?: (paths: number[][]) => void; disabled?: boolean }) {
 const [paths,setPaths]=useState<number[][]>(()=>PAIRS.map(()=>[]));
 const [active,setActive]=useState<number|null>(null);
 const [completed,setCompleted]=useState(false);
 const occupied=useMemo(()=>new Map(paths.flatMap((path,i)=>path.map(cell=>[cell,i] as const))),[paths]);
 const tap=(cell:number)=>{
  if(disabled||completed)return;
  const endpoint=endpoints.get(cell);
  if(endpoint!==undefined){
   const next=paths.map(p=>[...p]);
   next[endpoint]=[cell];
   setPaths(next);setActive(endpoint);return;
  }
  if(active===null)return;
  if(occupied.has(cell))return;
  const path=paths[active];
  if(!path.length||!adjacent(path[path.length-1],cell))return;
  const next=paths.map(p=>[...p]);
  next[active]=[...path,cell];
  setPaths(next);
 };
 const finish=(cell:number)=>{
  if(active===null||disabled||completed)return;
  const endpoint=endpoints.get(cell);
  if(endpoint!==active)return;
  const path=paths[active];
  if(!path.length||!adjacent(path[path.length-1],cell)||path.includes(cell))return;
  const next=paths.map(p=>[...p]);
  next[active]=[...path,cell];
  setPaths(next);setActive(null);
  const allConnected=next.every((p,i)=>p.length>1&&key(PAIRS[i].start)!==p[p.length-1]&&
   (p[0]===key(PAIRS[i].start)?p[p.length-1]===key(PAIRS[i].end):p[p.length-1]===key(PAIRS[i].start)));
  if(allConnected){setCompleted(true);onWin?.(next);}
 };
 const press=(cell:number)=>{
  const e=endpoints.get(cell);
  if(e!==undefined&&active===e&&paths[e].length>0&&paths[e][0]!==cell){finish(cell);return;}
  tap(cell);
 };
 return <Card style={{gap:12}}>
  <Title size={22}>Çizgi Birleştirme</Title>
  <Muted>Aynı renkli noktaları sırayla birleştir. Çizgiler kesişemez. Bir noktaya dokunarak başla, komşu karelere dokunarak ilerle.</Muted>
  <View style={styles.board}>
   {Array.from({length:SIZE*SIZE},(_,cell)=>{
    const owner=occupied.get(cell)??endpoints.get(cell);
    const isDot=endpoints.has(cell);
    return <Pressable key={cell} onPress={()=>press(cell)} style={[styles.cell,{backgroundColor:owner===undefined?'#15233B':PAIRS[owner].color+'55',borderColor:owner===undefined?'#36415A':PAIRS[owner].color}]}>
     {isDot?<View style={[styles.dot,{backgroundColor:PAIRS[endpoints.get(cell)!].color}]}/>:owner!==undefined?<View style={[styles.line,{backgroundColor:PAIRS[owner].color}]}/>:null}
    </Pressable>;
   })}
  </View>
  <Muted>{completed?'Bulmaca tamamlandı!':active===null?'Başlamak için renkli bir noktaya dokun.':'Komşu karelere dokunarak çizgiyi ilerlet.'}</Muted>
  <Btn title="Sıfırla" tone="ghost" icon="refresh" onPress={()=>{setPaths(PAIRS.map(()=>[]));setActive(null);setCompleted(false);}}/>
 </Card>;
}
const styles=StyleSheet.create({
 board:{width:'100%',maxWidth:390,aspectRatio:1,flexDirection:'row',flexWrap:'wrap',alignSelf:'center',gap:2},
 cell:{width:'16%',height:'16%',borderWidth:1,borderRadius:7,alignItems:'center',justifyContent:'center'},
 dot:{width:'62%',height:'62%',borderRadius:99},
 line:{width:'55%',height:'55%',borderRadius:6}
});
