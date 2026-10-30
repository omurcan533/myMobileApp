import test from 'node:test';
import assert from 'node:assert/strict';
import {canManagePlayers,removalClosesRoom} from '../lib/playerManagement.ts';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const data=(phase)=>({room:{phase},rounds:[],minigames:[],players:[{id:'host',team_side:'A'},{id:'other',team_side:'B'}]});
test('only lobby and question/minigame briefings or results allow player management',()=>{
 assert.equal(canManagePlayers(data('lobby')),true);
 for(const phase of ['team_reveal','building','voting','results'])assert.equal(canManagePlayers(data(phase)),false);
 const q=data('question');assert.equal(canManagePlayers(q),false);
 q.rounds=[{status:'open',opens_at:null}];assert.equal(canManagePlayers(q),true);
 q.rounds[0].opens_at='2026-10-31T00:00:00Z';assert.equal(canManagePlayers(q),false);
 q.rounds[0].status='resolved';assert.equal(canManagePlayers(q),true);
 const m=data('minigame');assert.equal(canManagePlayers(m),false);
 m.minigames=[{status:'live',starts_at:null}];assert.equal(canManagePlayers(m),true);
 m.minigames[0].starts_at='2026-10-31T00:00:00Z';assert.equal(canManagePlayers(m),false);
 m.minigames[0].status='done';assert.equal(canManagePlayers(m),true);
 m.room.closed_at='2026-10-31T00:01:00Z';assert.equal(canManagePlayers(m),false);
});
test('last-team warning accounts for the current roster and is not used in an unassigned lobby',()=>{
 const d=data('question');assert.equal(removalClosesRoom(d,d.players[1]),true);
 d.players.push({id:'mate',team_side:'B'});assert.equal(removalClosesRoom(d,d.players[1]),false);
 d.room.phase='lobby';d.players.pop();assert.equal(removalClosesRoom(d,d.players[1]),false);
 d.room.phase='question';assert.equal(removalClosesRoom(d,{id:'waiting',team_side:null}),false);
});

const source=ts.transpileModule(readFileSync(new URL('../components/PlayerManager.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
function manager(players,remove){
 const slots=[],effects=[],calls=[];let index=0,left=false;
 const react={__esModule:true,Fragment:'Fragment',createElement:(type,props,...children)=>({type,props:{...props,children}}),
  useState(initial){const i=index++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=v;}];},
  useRef(initial){const i=index++;return slots[i]??={current:initial};},
  useEffect(fn,deps){const i=index++;if(!slots[i]||deps.some((v,j)=>v!==slots[i][j])){slots[i]=deps;effects.push(fn);}},
 };react.default=react;
 class GameError extends Error{constructor(code){super(code);this.code=code;}}
 const modules={react,'react-native':{View:'View'},'./ui':new Proxy({useToast:()=>({show(){},toast:null})},{get:(o,k)=>o[k]??k}),
  '../lib/api':{GameError,api:{removeRoomPlayer:async(...args)=>{calls.push(args);return remove?.(args,GameError)??{room_closed:false,removed:true};}}},
  '../lib/art':{avatarFor:()=>''},'../lib/theme':{colors:{text:'white'},teamColor:()=>''},'../lib/i18n':{useLanguage:()=> 'tr'},'../lib/playerManagement':{canManagePlayers,removalClosesRoom}};
 const exports={};vm.runInNewContext(source,{exports,require:name=>modules[name]});
 const ctx={data:{...data('question'),players,rounds:[{status:'resolved'}]},me:{id:'host',is_host:true},onLeave:()=>{left=true;}};
 return {calls,ctx,get left(){return left;},render(){index=0;let tree=exports.PlayerManager({ctx});if(typeof tree?.type==='function')tree=tree.type(tree.props);for(const effect of effects.splice(0))effect();return tree;}};
}
function nodes(tree,type){if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(t=>nodes(t,type));return [...(tree.type===type?[tree]:[]),...nodes(tree.props?.children,type)];}
const roster=[{id:'host',nickname:'Host',team_side:'A',is_host:true},{id:'mate',nickname:'Mate',team_side:'A'},{id:'enemy',nickname:'Enemy',team_side:'B'}];
test('host roster is hidden during live play and from other players',()=>{
 const h=manager(roster);h.ctx.me.is_host=false;assert.equal(h.render(),null);
 h.ctx.me.is_host=true;h.ctx.data.rounds=[{status:'open',opens_at:'2026-10-31T00:00:00Z'}];assert.equal(h.render(),null);
});
test('last-team warning precedes the destructive action and cancel does not call the server',async()=>{
 const h=manager(roster,()=>({room_closed:true}));let tree=h.render();nodes(tree,'Btn')[0].props.onPress();tree=h.render();
 const removeButtons=nodes(tree,'Btn').filter(n=>n.props.title==='Çıkar');assert.equal(removeButtons.length,2);
 removeButtons[1].props.onPress();tree=h.render();assert.ok(nodes(tree,'Muted').some(n=>n.props.children.join('').includes('oda kapanacak')));
 nodes(tree,'Btn').find(n=>n.props.title==='Vazgeç').props.onPress();assert.equal(h.calls.length,0);
 tree=h.render();nodes(tree,'Btn').filter(n=>n.props.title==='Çıkar')[1].props.onPress();tree=h.render();
 nodes(tree,'Btn').find(n=>n.props.title==='Çıkar ve Odayı Kapat').props.onPress();await flush();
 assert.equal(h.calls[0][2],true);assert.equal(h.left,true);
});
test('a stale roster requires a new explicit close confirmation after server rejection',async()=>{
 let attempt=0;const h=manager([...roster,{id:'enemy2',nickname:'Enemy 2',team_side:'B'}],(_,GameError)=>{if(++attempt===1)throw new GameError('team_would_be_empty');return {room_closed:true};});
 let tree=h.render();nodes(tree,'Btn')[0].props.onPress();tree=h.render();nodes(tree,'Btn').filter(n=>n.props.title==='Çıkar')[1].props.onPress();tree=h.render();
 nodes(tree,'Btn').find(n=>n.props.title==='Odadan Çıkar').props.onPress();await flush();assert.equal(h.calls.length,1);assert.equal(h.calls[0][2],false);
 tree=h.render();assert.ok(nodes(tree,'Btn').some(n=>n.props.title==='Çıkar ve Odayı Kapat'));assert.equal(h.left,false);
 nodes(tree,'Btn').find(n=>n.props.title==='Çıkar ve Odayı Kapat').props.onPress();await flush();assert.equal(h.calls.length,2);assert.equal(h.calls[1][2],true);
});
