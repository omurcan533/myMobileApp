import React,{createContext,useContext,useState} from 'react';
import {View} from 'react-native';
const PlaySize=createContext({width:320,height:500,active:false});
export const usePlaySize=()=>useContext(PlaySize);

/** Measure the space below the HUD, including browser toolbar/keyboard changes. */
export function PlayArea({active,children}:{active:boolean;children:React.ReactNode}){
 const [size,setSize]=useState({width:320,height:500});
 return <View style={{flex:1,minHeight:0}} onLayout={e=>{
  const {width,height}=e.nativeEvent.layout;
  setSize(old=>old.width===width&&old.height===height?old:{width,height});
 }}><PlaySize.Provider value={{...size,active}}>{children}</PlaySize.Provider></View>;
}

