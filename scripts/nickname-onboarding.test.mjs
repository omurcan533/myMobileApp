import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const flush=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
function mount(file,props,{saved=null,storageFails=false,rooms=[]}={}){
 const slots=[],effects=[],writes=[],calls=[];let index=0;
 const react={__esModule:true,createElement:(type,props,...children)=>({type,props:{...props,children}}),Fragment:'Fragment',
  useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
  useRef(initial){const i=index++;return slots[i]??={current:initial};},
  useEffect(fn,deps){const i=index++;if(!slots[i]||deps.some((d,j)=>d!==slots[i][j])){slots[i]=deps;effects.push(fn);}},
 };react.default=react;
 const ui=new Proxy({},{get:(_,name)=>name});
 const chain={on(){return this;},subscribe(){return this;}};
 const storage={getItem:async()=>saved,setItem:async(k,v)=>{if(storageFails)throw Error('unavailable');writes.push([k,v]);}};
 const modules={
  react,'react-native':{Platform:{OS:'web'},StyleSheet:{create:v=>v},useWindowDimensions:()=>({width:400}),AppState:{addEventListener:()=>({remove(){}})}},
  '@react-native-async-storage/async-storage':{__esModule:true,default:storage},'expo-linear-gradient':{LinearGradient:'Gradient'},'@expo/vector-icons':{Ionicons:'Icon'},
  '../components/ui':ui,'./ui':ui,'../components/NicknameStep':{NicknameStep:'NicknameStep',validNickname:v=>v.trim().length>0},
  '../lib/art':{avatarFor:()=>'',art:{fox:''},AVATAR_OPTIONS:[]},'../lib/theme':{colors:new Proxy({},{get:()=> '#FFFFFF'}),gradients:{gold:[],primary:[]},alpha:()=>''},
  '../lib/i18n':{useLanguage:()=> 'tr',t:k=>k,translate:v=>v},'../lib/profile':{getProfile:async()=>({games:0,wins:0,lastRoom:null}),levelOf:()=>({level:1,progress:0})},
  '../lib/soundEffects':{soundFx:{isEnabled:()=>true}},'../lib/supabase':{supabase:{channel:()=>chain,removeChannel:async()=>{}}},
  '../lib/coalescedTask':{coalescedTask:fn=>fn},'../lib/api':{api:{openRooms:async()=>rooms,createRoom:async(...args)=>{calls.push(['create',...args]);return {room_id:'room'};},joinRoom:async(...args)=>{calls.push(['join',...args]);return {room_id:'room'};}}},
 };
 // Toast is the only UI hook used by Home.
 modules['../components/ui']=new Proxy({useToast:()=>({show(){},toast:null})},{get:(o,k)=>o[k]??k});
 const exports={};
 const source=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
 vm.runInNewContext(source,{exports,require:name=>{assert.ok(name in modules,name);return modules[name];},setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout,console});
 const component=exports.HomeScreen??exports.NicknameStep;
 return {writes,calls,exports,render(){index=0;const tree=component(props);for(const effect of effects.splice(0))effect();return tree;}};
}
function nodes(tree,type){if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(t=>nodes(t,type));return [...(tree.type===type?[tree]:[]),...nodes(tree.props?.children,type)];}
const homeProps={avatarId:'fox',onEnter(){},onAvatarChange(){}};

test('first-time and whitespace-only saved names must complete the name screen before seeing rooms',async()=>{
 for(const saved of [null,'   ']){
  const h=mount('../screens/Home.tsx',homeProps,{saved});
  assert.equal(nodes(h.render(),'NicknameStep').length,0);
  await flush();let tree=h.render();const step=nodes(tree,'NicknameStep')[0];assert.ok(step);
  assert.equal(nodes(tree,'Input').length,0);
  await step.props.onContinue('Deniz');tree=h.render();
  assert.equal(nodes(tree,'NicknameStep').length,0);assert.deepEqual(h.writes,[['nickname','Deniz']]);
 }
});
test('a saved name bypasses onboarding after storage hydration',async()=>{
 const h=mount('../screens/Home.tsx',homeProps,{saved:'  Ömür  '});h.render();await flush();const tree=h.render();
 assert.equal(nodes(tree,'NicknameStep').length,0);assert.ok(nodes(tree,'Input').some(n=>n.props.value==='Ömür'));
});
test('deleting a name routes room creation through the name screen and resumes with the confirmed name',async()=>{
 const h=mount('../screens/Home.tsx',homeProps,{saved:'Ömür'});h.render();await flush();let tree=h.render();
 nodes(tree,'Input').find(n=>n.props.value==='Ömür').props.onChangeText('   ');tree=h.render();
 const create=nodes(tree,'Btn').find(n=>n.props.title==='roomCreate');assert.ok(create);await create.props.onPress();
 assert.equal(h.calls.length,0);tree=h.render();await nodes(tree,'NicknameStep')[0].props.onContinue('Deniz');await flush();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0][1],'Deniz');
});
test('name step rejects whitespace, focuses its input, trims names and prevents duplicate submission',async()=>{
 let release;const gate=new Promise(r=>{release=r;});const names=[];
 const h=mount('../components/NicknameStep.tsx',{initialValue:'   ',avatarId:'fox',onContinue:async name=>{names.push(name);await gate;}});
 let tree=h.render();assert.equal(nodes(tree,'Input')[0].props.autoFocus,true);
 nodes(tree,'Btn')[0].props.onPress();assert.equal(names.length,0);tree=h.render();assert.ok(nodes(tree,'Text').some(n=>n.props.accessibilityRole==='alert'));
 nodes(tree,'Input')[0].props.onChangeText('  Deniz  ');tree=h.render();nodes(tree,'Btn')[0].props.onPress();nodes(tree,'Btn')[0].props.onPress();
 assert.deepEqual(names,['Deniz']);release();await flush();
});
test('the selected public room is preserved while a missing name is filled in',async()=>{
 const h=mount('../screens/Home.tsx',homeProps,{saved:'Ömür',rooms:[{code:'ABCDE',phase:'lobby',mode:'standard',player_count:2,host_nickname:'Host'}]});
 h.render();await flush();let tree=h.render();nodes(tree,'Input').find(n=>n.props.value==='Ömür').props.onChangeText('');tree=h.render();
 nodes(tree,'Btn').find(n=>n.props.title==='Katıl').props.onPress();assert.equal(h.calls.length,0);
 await nodes(h.render(),'NicknameStep')[0].props.onContinue('Deniz');await flush();assert.deepEqual(h.calls,[['join','ABCDE','Deniz']]);
});
test('name validation accepts Turkish and Unicode names and enforces the server character limit',()=>{
 const {validNickname}=mount('../components/NicknameStep.tsx',{}).exports;
 assert.equal(validNickname('  Ömür Can  '),true);assert.equal(validNickname('\t\n'),false);
 assert.equal(validNickname('😀'.repeat(20)),true);assert.equal(validNickname('a'.repeat(21)),false);
});
test('failed name persistence stays on the step with an inline error and permits retry',async()=>{
 let fail=true;const h=mount('../components/NicknameStep.tsx',{initialValue:'Deniz',avatarId:'fox',onContinue:async()=>{if(fail)throw Error('storage');}});
 nodes(h.render(),'Btn')[0].props.onPress();await flush();let tree=h.render();assert.ok(nodes(tree,'Text').some(n=>n.props.accessibilityRole==='alert'));
 fail=false;nodes(tree,'Btn')[0].props.onPress();await flush();tree=h.render();assert.equal(nodes(tree,'Text').filter(n=>n.props.accessibilityRole==='alert').length,0);
});
