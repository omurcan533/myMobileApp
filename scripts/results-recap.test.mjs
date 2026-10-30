import test from 'node:test';
import assert from 'node:assert/strict';
import {shortMatchRecap,shortPlayerQuip} from '../lib/resultsRecap.ts';

const player={id:'one',team_side:'A',is_captain:false,is_architect:false};
const data={answers:[],entries:[]};
test('large match records still produce only one short line per person in both languages',()=>{
 const many={answers:Array.from({length:40},(_,i)=>({player_id:'one',is_correct:i%2===0})),entries:Array.from({length:20},()=>({player_id:'one'}))};
 const scenarios=[many,data,{...data,answers:[{player_id:'one',is_correct:true}]},{...data,answers:[{player_id:'one',is_correct:false}]},{...data,answers:[{player_id:'one',is_correct:null}]},{...data,entries:[{player_id:'one',reaction_ms:12000}]}];
 for(const en of [false,true])for(const input of scenarios){
  const line=shortPlayerQuip(player,0,input,[],[],en);
  assert.equal(typeof line,'string');assert.ok(line.length<=120,line);assert.ok(!line.includes('\n'));
 }
});
test('a teammate’s answers cannot become a personal performance claim',()=>{
 const input={...data,answers:Array.from({length:25},()=>({player_id:'other',is_correct:true}))};
 const line=shortPlayerQuip(player,0,input,[],[]);
 assert.ok(!line.includes('25'));assert.equal(line,shortPlayerQuip(player,0,data,[],[]));
});
test('friendship and age remarks only use this player’s recorded attempts',()=>{
 const friends=[{player_id:'other',correct:9,attempts:9},{player_id:'one',correct:2,attempts:4}];
 const ages=[{player_id:'one',correct:1,total:3}];
 assert.ok(shortPlayerQuip(player,0,data,friends,ages).includes('2/4'));
 assert.ok(shortPlayerQuip(player,0,data,[],ages).includes('1/3'));
 assert.equal(shortPlayerQuip(player,0,data,[{player_id:'one',correct:0,attempts:0}],[]),shortPlayerQuip(player,0,data,[],[]));
});
test('winner and tie summaries retain the score without a speech',()=>{
 for(const en of [false,true])for(const winner of ['A','B',null]){
  const line=shortMatchRecap({official_winner:winner,teams:{A:{score:8},B:{score:7}}},en);
  assert.ok(line.includes('8–7'));assert.ok(line.length<130);assert.ok(!line.includes('\n'));
 }
});
