import React,{useCallback,useEffect,useRef,useState} from 'react';
import {StyleSheet,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Btn} from './ui';

/** Track the real footer button against its scroll viewport on web and native. */
export function useNextShortcut(enabled:boolean,resultKey:string|undefined){
 const anchorRef=useRef<View>(null);
 const viewportRef=useRef<View>(null);
 const frame=useRef<number|null>(null);
 const generation=useRef(0);
 const [measurement,setMeasurement]=useState<{key:string|undefined;visible:boolean;measured:boolean}>({key:undefined,visible:false,measured:false});
 const measure=useCallback(()=>{
  if(!enabled||frame.current!==null)return;
  const version=++generation.current;
  frame.current=requestAnimationFrame(()=>{
   frame.current=null;
   const anchor=anchorRef.current,viewport=viewportRef.current;
   if(!anchor||!viewport)return;
   let target:{y:number;height:number}|undefined;
   let bounds:{y:number;height:number}|undefined;
   const finish=()=>{
    if(version!==generation.current||!target||!bounds||target.height<=0||bounds.height<=0)return;
    const visible=target.y>=bounds.y-1&&target.y+target.height<=bounds.y+bounds.height+1;
    setMeasurement(old=>old.key===resultKey&&old.visible===visible&&old.measured?old:{key:resultKey,visible,measured:true});
   };
   viewport.measureInWindow((_x,y,_width,height)=>{bounds={y,height};finish()});
   anchor.measureInWindow((_x,y,_width,height)=>{target={y,height};finish()});
  });
 },[enabled,resultKey]);
 useEffect(()=>{
  measure();
  return()=>{generation.current++;if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null};
 },[measure]);
 return {anchorRef,viewportRef,measure,show:enabled&&measurement.key===resultKey&&measurement.measured&&!measurement.visible};
}

export function NextShortcut({visible,ready,wait,busy,onPress}:{visible:boolean;ready:boolean;wait:number;busy:boolean;onPress:()=>void}){
 const insets=useSafeAreaInsets();
 if(!visible)return null;
 return <View pointerEvents="box-none" style={[s.wrap,{bottom:Math.max(12,insets.bottom)+8}]}>
  <Btn title={ready?'Sonraki →':`Sonraki · ${wait>0?`${wait} sn`:'Bekle'}`} size="md" tone="primary"
   disabled={!ready||busy} loading={busy} onPress={onPress}/>
 </View>;
}
const s=StyleSheet.create({wrap:{position:'absolute',right:14,maxWidth:220,zIndex:6,shadowColor:'#000',shadowOpacity:0.3,shadowRadius:10,shadowOffset:{width:0,height:4},elevation:8}});
