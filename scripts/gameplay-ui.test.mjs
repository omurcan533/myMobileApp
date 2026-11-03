import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {memoryFrame} from '../lib/memoryTimeline.ts';

test('memory highlights remain deterministic across skipped frames and delayed callbacks',()=>{
 const sequence=[4,2,1,6,3,0,5],start=1000;
 assert.equal(memoryFrame(sequence,null,start).showing,true);
 for(let i=0;i<sequence.length;i++){
  const frame=memoryFrame(sequence,start,start+500+i*650+100);
  assert.equal(frame.activeStep,sequence[i]);assert.equal(frame.showingStep,i+1);
  assert.equal(memoryFrame(sequence,start,start+500+i*650+500).activeStep,null);
 }
 assert.equal(memoryFrame(sequence,start,start+5200).showing,false);
 assert.equal(memoryFrame(sequence,start,start+100000).activeStep,null);
});

test('a fresh local demonstration can show the sequence after reconnect or tab resume',()=>{
 const sequence=[1,4,2];
 assert.equal(memoryFrame(sequence,0,20000).showing,false);
 assert.equal(memoryFrame(sequence,20000,20600).activeStep,1);
 assert.equal(memoryFrame(sequence,20000,21250).activeStep,4);
});

test('line driver resolves only at deadline or when every human has a valid finish',()=>{
 const source=ts.transpileModule(readFileSync(new URL('../hooks/useGameDriver.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={};
 vm.runInNewContext(source,{exports,require:name=>name.endsWith('/selectors')?{latestMinigame:games=>games.at(-1)}:{}});
 const now=Date.parse('2026-10-30T20:00:00Z');
 const d={room:{phase:'minigame',paused:false,phase_ends_at:new Date(now+5000).toISOString()},minigames:[{id:'game',kind:'line_connect',status:'live',starts_at:new Date(now-5000).toISOString()}],players:[{id:'a',team_side:'A'},{id:'b',team_side:'B'},{id:'bot',team_side:'B',is_bot:true}],entries:[{minigame_id:'game',player_id:'a',reaction_ms:1000}]};
 assert.equal(exports.shouldAdvance(d,now,false,0),false);
 d.entries.push({minigame_id:'other',player_id:'b',reaction_ms:500});
 assert.equal(exports.shouldAdvance(d,now,false,0),false);
 d.entries.push({minigame_id:'game',player_id:'b',reaction_ms:null});
 assert.equal(exports.shouldAdvance(d,now,false,0),false);
 d.entries.at(-1).reaction_ms=1500;
 assert.equal(exports.shouldAdvance(d,now,false,0),true);
 d.room.paused=true;
 assert.equal(exports.shouldAdvance(d,now,false,0),false);
 d.room.paused=false;
 d.entries=[];
 assert.equal(exports.shouldAdvance(d,now+5300,false,0),true);
});

const soundSource=ts.transpileModule(readFileSync(new URL('../lib/soundEffects.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function sound(window){const exports={};vm.runInNewContext(soundSource,{exports,window});return exports.soundFx;}
test('a browser refusing AudioContext cannot throw out of a dice animation effect',()=>{
 const fx=sound({AudioContext:class {constructor(){throw new Error('Audio unavailable');}}});
 for(const method of ['diceRoll','diceStop','teamLaunch','teamLanding','pop','correct'])assert.doesNotThrow(()=>fx[method]());
});
test('an audio context lost after backgrounding can be recreated safely',()=>{
 let constructions=0;
 const fx=sound({AudioContext:class {constructor(){constructions++;this.state='closed';}}});
 assert.doesNotThrow(()=>fx.diceRoll());assert.doesNotThrow(()=>fx.diceStop());
 assert.equal(constructions,2);
});

test('balance completion fires once after commit, never inside a state updater',()=>{
 const source=readFileSync(new URL('../screens/Minigame.tsx',import.meta.url),'utf8');
 const parsed=ts.createSourceFile('Minigame.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const component=parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='BalanceGame');
 assert.ok(component);
 const slots=[],effects=new Map(),timers=new Map();
 let index=0,inUpdater=false,inRender=false,nextId=1,completed=0,successSounds=0;
 const same=(a,b)=>a&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const context={exports:{},React:{createElement:()=>null},
  useState(initial){const i=index++;if(!(i in slots))slots[i]=initial;return [slots[i],update=>{inUpdater=true;try{slots[i]=typeof update==='function'?update(slots[i]):update;}finally{inUpdater=false;}}];},
  useRef(initial){const i=index++;return slots[i]??={current:initial};},
  useEffect(fn,deps){const i=index++;if(!slots[i]||!same(slots[i].deps,deps))effects.set(i,{fn,deps});},
  useEffectEvent:fn=>(...args)=>{assert.equal(inUpdater,false);assert.equal(inRender,false);return fn(...args);},
  setInterval(fn){const id=nextId++;timers.set(id,fn);return id;},clearInterval:id=>timers.delete(id),
  Math:Object.assign(Object.create(Math),{random:()=>0.5}),
  soundFx:{correct(){successSounds++;}},haptic:{success(){}},
  Card:'Card',Text:'Text',Title:'Title',Muted:'Muted',Chip:'Chip',Btn:'Btn',View:'View',s:{},
  colors:{mint:'#fff'},alpha:()=>'',translate:value=>value,
  Eyebrow:'Eyebrow',ProgressBar:'ProgressBar',gradients:{success:[]},
 };
 const code=ts.transpileModule(component.getText(parsed)+'\nexports.BalanceGame=BalanceGame;',{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
 vm.runInNewContext(code,context);
 const props={live:true,go:true,mineDone:false,reactionMs:null,onComplete(){completed++;}};
 const render=()=>{
  index=0;inRender=true;try{context.exports.BalanceGame(props);}finally{inRender=false;}
  for(const [i,e]of effects){slots[i]?.cleanup?.();slots[i]={deps:e.deps,cleanup:e.fn()};}effects.clear();
 };
 render();
 for(let i=0;i<40;i++){for(const tick of [...timers.values()])tick();render();}
 assert.equal(completed,1);assert.equal(successSounds,1);
 props.live=false;render();assert.equal(timers.size,0);
});
