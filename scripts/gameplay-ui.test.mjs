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
