import React from 'react';
import Svg,{Defs,LinearGradient,Stop,Rect,Circle,Path,Line,G,Ellipse,Polygon,Text as SvgText} from 'react-native-svg';
import {colors} from '../lib/theme';

const BLUE=colors.teamA,RED=colors.teamB;
function Fighter({x,side,step,effort,slip}:{x:number;side:'A'|'B';step:number;effort:number;slip:number}){
 const flip=side==='B';
 const color=flip?RED:BLUE;
 const pulse=Math.sin(step+(flip?1.8:0));
 const sway=pulse*(2+effort*4);
 const footSlip=slip*(5+Math.abs(pulse)*4);
 const lean=(flip?-1:1)*(4+effort*10);
 return <G transform={`translate(${x+footSlip},${sway})`}><G transform={`rotate(${lean+pulse*effort*2},0,135)`}>
  <Ellipse cx="0" cy="168" rx="34" ry="8" fill="#081525" opacity=".5"/>
  <Path d="M -12 130 L -20 163 L -5 165 L 3 141 L 12 165 L 26 164 L 12 126 Z" fill="#253149" stroke="#10182B" strokeWidth="3"/>
  <Path d="M -22 163 L -3 163 L -2 169 L -24 169 Z M 10 163 L 29 163 L 31 169 L 11 169 Z" fill="#131A2A"/>
  <Path d="M -20 88 Q 0 77 20 88 L 24 130 Q 0 145 -23 130 Z" fill={color} stroke="#11243B" strokeWidth="3"/>
  <Path d="M -16 99 L 16 99 M -15 109 L 15 109" stroke="#FFFFFF" strokeWidth="3" opacity=".24"/>
  <Path d={flip?'M -17 96 L -45 114 L -32 122 L -5 110':'M 17 96 L 45 114 L 32 122 L 5 110'} fill="#E5A87E" stroke="#925D4C" strokeWidth="3"/>
  <Path d={flip?'M 17 97 L 39 113 L 31 121 L 9 111':'M -17 97 L -39 113 L -31 121 L -9 111'} fill="#E5A87E" stroke="#925D4C" strokeWidth="3"/>
  <Rect x="-9" y="70" width="18" height="20" rx="5" fill="#DDA47F"/>
  <Circle cx="0" cy="57" r="23" fill="#E6B08B" stroke="#A96F55" strokeWidth="2"/>
  <Path d="M -22 52 Q -20 26 0 30 Q 25 30 23 52 L 15 42 L 3 47 L -8 39 Z" fill={flip?'#2C1C31':'#182B4B'}/>
  <Circle cx="-7" cy="57" r="2.5" fill="#17243B"/><Circle cx="9" cy="57" r="2.5" fill="#17243B"/>
  <Path d="M -6 69 Q 1 73 9 68" stroke="#8D4D4A" strokeWidth="2.5" fill="none"/>
  <Path d="M -20 90 Q 0 80 20 90" fill="none" stroke="#FFFFFF" opacity=".45" strokeWidth="2"/>
 </G></G>;
}
export function TugArena({blue,red,time,wide,height}:{blue:number;red:number;time:number;wide:boolean;height?:number}){
 const diff=blue-red;
 const magnitude=Math.abs(blue)+Math.abs(red);
 // Kuvvet farkı büyüdükçe ilerleme yavaşlar; 200-300 puanda arena dolmaz.
 // tanh eğrisi asimptotik olarak yaklaşır, asla aniden %100'e kilitlenmez.
 const advantage=Math.tanh(diff/1000);
 const shift=-advantage*60;
 const move=shift;
 const step=time/240;
 const strength=Math.min(1,magnitude/1300);
 const blueEffort=Math.min(1,0.25+strength+(diff<0?0.2:0));
 const redEffort=Math.min(1,0.25+strength+(diff>0?0.2:0));
 const blueSlip=diff<0?Math.abs(advantage):0;
 const redSlip=diff>0?Math.abs(advantage):0;
 const tugWave=Math.sin(time/110)*Math.min(2.5,0.5+strength*2);
 const tension=2+strength*5;
 const intensity=Math.abs(advantage);
 return <Svg width="100%" height={height??(wide?290:215)} viewBox="0 0 720 270" preserveAspectRatio="xMidYMid meet">
  <Defs>
   <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#101D39"/><Stop offset="1" stopColor="#355073"/></LinearGradient>
   <LinearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#344A4A"/><Stop offset="1" stopColor="#142A31"/></LinearGradient>
   <LinearGradient id="rope" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#F6D796"/><Stop offset=".5" stopColor="#B78140"/><Stop offset="1" stopColor="#70461D"/></LinearGradient>
  </Defs>
  <Rect width="720" height="270" rx="18" fill="url(#sky)"/>
  <Path d="M0 110 L 90 78 L 175 108 L 275 71 L 380 110 L 470 80 L 580 106 L 720 75 L720 180 L0 180Z" fill="#1D3756"/>
  <Path d="M0 160 Q 100 140 200 160 T 400 160 T 720 150 L720 270 L0 270Z" fill="#243E4E"/>
  {Array.from({length:13},(_,i)=><G key={i}><Circle cx={22+i*57} cy={i%2?132:142} r="11" fill={i%3?'#6B8EA0':'#C38A89'} opacity=".65"/><Rect x={12+i*57} y={146+(i%2?0:10)} width="21" height="24" rx="5" fill={i%2?'#2C5B83':'#7B405F'} opacity=".65"/></G>)}
  <Rect y="177" width="720" height="93" fill="url(#ground)"/>
  {Array.from({length:12},(_,i)=><Line key={i} x1={i*70-30} y1="258" x2={i*70+35} y2="185" stroke="#58706B" strokeWidth="1" opacity=".25"/>)}
  <Rect x="356" y="176" width="8" height="90" fill="#FFD68A" opacity=".9"/>
  <Ellipse cx="360" cy="205" rx="64" ry="13" fill="#0A1723" opacity=".35"/>
  <G transform={`translate(${move},0)`}>
   <Fighter x={145} side="A" step={step} effort={blueEffort} slip={blueSlip}/>
   <Fighter x={230} side="A" step={step+.9} effort={blueEffort} slip={blueSlip}/>
   <Fighter x={490} side="B" step={step+.6} effort={redEffort} slip={-redSlip}/>
   <Fighter x={575} side="B" step={step+1.5} effort={redEffort} slip={-redSlip}/>
   <Path d={`M 150 116 Q 270 ${126-tension} 360 ${119+tugWave} Q 460 ${111-tension} 570 119`} fill="none" stroke="#3A291F" strokeWidth="13" strokeLinecap="round"/>
   <Path d={`M 150 114 Q 270 ${124-tension} 360 ${117+tugWave} Q 460 ${109-tension} 570 117`} fill="none" stroke="url(#rope)" strokeWidth="8" strokeLinecap="round"/>
   {Array.from({length:23},(_,i)=><Line key={i} x1={165+i*17} y1="110" x2={169+i*17} y2="124" stroke="#FFF0C4" strokeWidth="2" opacity=".45"/>)}
   <Polygon points="360,113 370,142 350,142" fill="#FFE16D" stroke="#4B321E" strokeWidth="3"/>
   <Circle cx="360" cy="116" r="7" fill="#F9DE92" stroke="#6B4527" strokeWidth="3"/>
  </G>
  {strength>0.08&&[145,230,490,575].map((x,i)=>{const slip=i<2?blueSlip:redSlip;const puff=(Math.sin(step*1.7+i*1.8)+1)/2;return <G key={i} opacity={Math.min(.65,(.12+slip*.5+strength*.15)*puff)}><Ellipse cx={x+move+(i<2?8:-8)} cy={194-puff*12} rx={8+puff*9} ry={4+puff*5} fill="#C8B7A1"/><Circle cx={x+move+(i<2?19:-19)} cy={185-puff*16} r={2+puff*4} fill="#D9C3A2"/></G>;})}
  <Rect x="16" y="12" width="125" height="36" rx="12" fill="#542238" stroke={BLUE} strokeWidth="2"/>
  <SvgText x="78" y="36" fill={BLUE} fontSize="18" fontWeight="900" textAnchor="middle">A: {blue}</SvgText>
  <Rect x="579" y="12" width="125" height="36" rx="12" fill="#0D355A" stroke={RED} strokeWidth="2"/>
  <SvgText x="641" y="36" fill={RED} fontSize="18" fontWeight="900" textAnchor="middle">B: {red}</SvgText>
  <Rect x="232" y="18" width="256" height="16" rx="8" fill="#111D2E" stroke="#8398A7" strokeWidth="1"/>
  <Rect x="360" y="21" width={Math.max(0,120*intensity)} height="10" rx="4" fill={diff>=0?BLUE:RED} transform={diff>=0?`translate(${-120*intensity},0)`:undefined}/>
  <Line x1="360" y1="16" x2="360" y2="37" stroke="#FFF0B0" strokeWidth="3"/>
  <SvgText x="360" y="62" fill="#FFE9AF" fontSize="14" fontWeight="800" textAnchor="middle">{diff===0?'BERABERE':diff>0?'◀ TAKIM A ÖNDE':'TAKIM B ÖNDE ▶'}</SvgText>
 </Svg>;
}
