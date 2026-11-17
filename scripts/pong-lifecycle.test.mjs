import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const frame=(tick,extra={})=>({x:0.5,y:0.5,scoreA:0,scoreB:0,a1:'a',a2:'a',b1:'b',b2:'c',tick:new Date(tick).toISOString(),...extra});
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
function nodes(tree,type){
 if(!tree||typeof tree!=='object')return [];
 if(Array.isArray(tree))return tree.flatMap(t=>nodes(t,type));
 return [...(tree.type===type?[tree]:[]),...nodes(tree.props?.children,type)];
}

// Execute the real component with deterministic hook, network and timer adapters.
function mount({live=false,startsAt=new Date(1000).toISOString(),endpoint}={}){
 const slots=[],pending=new Map(),listeners=new Map(),timers=new Map(),calls=[],sockets=[];
 const WebSocket=class {
  constructor(url){this.url=url;this.readyState=1;this.sent=[];sockets.push(this);}
  send(payload){this.sent.push(JSON.parse(payload));}
  close(){this.readyState=3;this.onclose?.();}
  message(message){this.onmessage?.({data:JSON.stringify(message)});}
 };
 let index=0,dirty=false,nextTimer=1,subscriptions=0,removed=0;
 const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const react={__esModule:true,Fragment:'Fragment',memo:f=>f,
  createElement:(type,props,...children)=>({type,props:{...props,children}}),
  useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{const next=typeof v==='function'?v(slots[i]):v;if(!Object.is(slots[i],next)){slots[i]=next;dirty=true;}}];},
  useRef(initial){const i=index++;return slots[i]??={current:initial};},
  useMemo(fn,deps){const i=index++;if(!slots[i]||!equal(slots[i].deps,deps))slots[i]={deps,value:fn()};return slots[i].value;},
  useCallback(fn,deps){return react.useMemo(()=>fn,deps);},
  useEffect(fn,deps){const i=index++;if(!slots[i]||!equal(slots[i].deps,deps))pending.set(i,{fn,deps});},
 };react.default=react;
 const channel={on(_kind,{event},fn){listeners.set(event,fn);return this;},subscribe(){subscriptions++;return this;},send:async()=>{}};
 const supabase={auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})},channel:()=>channel,removeChannel:async()=>{removed++;},
  rpc:async(name,args)=>{calls.push([name,args]);return {data:frame(1000,{modeA:'solo',modeVotes:{a:'solo'}}),error:null};},
  from:()=>({select:()=>({eq:()=>({single:()=>new Promise(()=>{})})})}),
 };
 const modules={react,'react-native':{Platform:{OS:'web'},Pressable:'Pressable',View:'View',StyleSheet:{create:x=>x},useWindowDimensions:()=>({width:390,height:844})},
  '../lib/i18n':{useLanguage(){},getLanguage:()=> 'en'},'../lib/supabase':{supabase},'./PongArena':{PongArena:'PongArena'},
  '../lib/serverTime':{serverNow:()=>20000},'./ui':new Proxy({},{get:(_,k)=>k}),
  '../lib/theme':{alpha:()=>'',colors:{cyan:'#fff',gold:'#fff',mint:'#fff'}},'./PlayLayout':{usePlaySize:()=>({active:false})},
  '../lib/pongDiagnostics':{createPongDiagnostics:()=>()=>{}},
 };
 const addTimer=(fn,ms)=>{const id=nextTimer++;timers.set(id,{fn,ms});return id;};
 const exports={};
 const source=ts.transpileModule(readFileSync(new URL('../components/PongDuel.tsx',import.meta.url),'utf8')+'\nexport { PongMatch };',{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
 vm.runInNewContext(source,{exports,process:{env:{EXPO_PUBLIC_PONG_SERVER_URL:endpoint}},WebSocket,require:name=>{assert.ok(name in modules,name);return modules[name];},setInterval:addTimer,clearInterval:id=>timers.delete(id),setTimeout:addTimer,clearTimeout:id=>timers.delete(id),performance:{now:()=>20000},console});
 const me={id:'a',user_id:'ua',nickname:'A',team_side:'A',is_host:false};
 const props={live,mg:{id:'game',starts_at:startsAt,pong_state:frame(1000)},ctx:{me,data:{room:{paused:false,phase_ends_at:new Date(300000).toISOString()},players:[me,{id:'b',user_id:'ub',nickname:'B',team_side:'A'},{id:'c',nickname:'C',team_side:'B'}]}}};
 return {props,calls,timers,sockets,
  get subscriptions(){return subscriptions;},get removed(){return removed;},
  broadcast:state=>listeners.get('pong_frame')({payload:{state}}),
  render(){let tree;let attempts=0;do{dirty=false;index=0;tree=exports.PongMatch(props);assert.ok(++attempts<10,'render must settle');}while(dirty);for(const [i,e]of pending){slots[i]?.cleanup?.();slots[i]={deps:e.deps,cleanup:e.fn()};}pending.clear();return tree;},
  close(){for(const slot of slots)slot?.cleanup?.();},
 };
}

test('Pong rejects stale room snapshots after a newer broadcast, but accepts the next authoritative frame',()=>{
 const h=mount();try{
  h.render();h.broadcast(frame(3000,{scoreA:2}));
  assert.equal(nodes(h.render(),'PongArena')[0].props.state.scoreA,2);
  h.props.mg={...h.props.mg,pong_state:frame(2000,{scoreA:1})};
  assert.equal(nodes(h.render(),'PongArena')[0].props.state.scoreA,2);
  h.props.mg={...h.props.mg,pong_state:frame(4000,{scoreA:3})};
  assert.equal(nodes(h.render(),'PongArena')[0].props.state.scoreA,3);
  assert.equal(h.subscriptions,1,'state refreshes must not reconnect broadcast');
 }finally{h.close();}
 assert.equal(h.removed,1);
 assert.equal(h.timers.size,0);
});

test('a mode-choice reply with the same tick survives unrelated renders and unchanged room props',async()=>{
 const h=mount({live:true,startsAt:null});try{
  const tree=h.render();const choice=nodes(tree,'Tap')[0];
  choice.props.onPress();await flush();
  const after=h.render();
  const serialized=JSON.stringify(after);
  assert.ok(serialized.includes('1 player'),'confirmed choice must be visible');
  assert.equal(h.calls[0][0],'pong_choose_mode');
  // The solo mode removes the second team-A paddle label.
  assert.ok(serialized.includes('▲▼'));
  assert.ok(JSON.stringify(h.render()).includes('▲▼'));
  assert.equal(h.subscriptions,1);
 }finally{h.close();}
 assert.equal(h.timers.size,0);
});

test('Pong releases a held direction when paused and clears its heartbeat on teardown',async()=>{
 const h=mount({live:true});try{
  let tree=h.render();
  const control=nodes(tree,'Pressable').find(n=>n.props.onPressIn);
  assert.ok(control);control.props.onPressIn();await flush();h.render();
  assert.ok(h.calls.some(([name,args])=>name==='pong_set_held'&&args.p_pressed===true));
  h.props.ctx={...h.props.ctx,data:{...h.props.ctx.data,room:{...h.props.ctx.data.room,paused:true}}};
  tree=h.render();await flush();
  assert.ok(h.calls.some(([name,args])=>name==='pong_set_held'&&args.p_pressed===false));
  assert.ok(![...h.timers.values()].some(t=>t.ms===1200),'release must stop the hold heartbeat');
  assert.equal(h.subscriptions,1);
 }finally{h.close();}
 assert.equal(h.timers.size,0);
});


test('dedicated Pong sends controls over the socket and ignores legacy broadcast frames',async()=>{
 const h=mount({live:true,endpoint:'wss://game.example/pong'});try{
  h.render();await flush();
  const socket=h.sockets[0];
  socket.onopen();
  assert.equal(socket.sent[0].type,'join');
  assert.equal(socket.sent[0].token,'test-token');
  socket.message({type:'frame',state:frame(2000,{scoreA:1}),paused:false});
  const tree=h.render();
  const arena=nodes(tree,'PongArena')[0];
  assert.equal(arena.props.renderDelayMs,115);
  assert.equal(arena.props.authoritativePaddles,true);
  socket.message({type:'pong',id:19960,serverTime:80000});
  assert.equal(arena.props.now(),80020);
  const control=nodes(tree,'Pressable').find(n=>n.props.onPressIn);
  assert.equal(control.props.disabled,false);
  control.props.onPressIn();
  control.props.onPressOut();
  assert.deepEqual(socket.sent.filter(m=>m.type==='hold').map(m=>[m.type,m.direction,m.pressed]),[
   ['hold',-1,true],['hold',-1,false],
  ]);
  h.broadcast(frame(5000,{scoreA:4}));
  assert.equal(nodes(h.render(),'PongArena')[0].props.state.scoreA,1);
  socket.message({type:'finished',state:frame(6000,{scoreA:5})});
  assert.equal(nodes(h.render(),'PongArena')[0].props.state.scoreA,5);
  assert.deepEqual(h.calls,[]);
 }finally{h.close();}
 assert.equal(h.timers.size,0);
});
