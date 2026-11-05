import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(setImmediate);};
function mount(file,props,service){
 const slots=[],effects=[];let index=0;
 const react={__esModule:true,Fragment:'Fragment',createElement:(type,props,...children)=>({type,props:{...props,children}}),
 useState(v){const i=index++;if(!(i in slots))slots[i]=v;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
 useRef(v){const i=index++;return slots[i]??={current:v};},useCallback:f=>f,
 useEffect(f,deps){const i=index++;if(!slots[i]||deps.some((v,j)=>v!==slots[i][j])){slots[i]=deps;effects.push(f);}}};react.default=react;
 const modules={react,'react-native':{View:'View',ScrollView:'ScrollView',Linking:{openURL:async()=>{}}},'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:0})},'./ui':new Proxy({},{get:(_,k)=>k}),'./PrivacyInfo':{PrivacyInfo:'PrivacyInfo'},'../lib/communitySafety':{communitySafety:service,COMMUNITY_URL:'https://example.test/community'},'../lib/i18n':{useLanguage:()=> 'en'},'../lib/theme':{colors:{bg:'#050a14',red:'#ff0000'}}};
 const exports={};const js=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
 vm.runInNewContext(js,{exports,require:n=>{assert.ok(n in modules,n);return modules[n];},console});const C=exports.CommunityGate??exports.RoomSafety;
 return {render(){index=0;const tree=C(props);for(const f of effects.splice(0))f();return tree;}};
}
const nodes=t=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.props?.children)];
const button=(t,title)=>{const b=nodes(t).find(n=>n.type==='Btn'&&n.props.title===title);assert.ok(b,title);return b.props;};
const ctx={data:{room:{id:'room'},teams:[],players:[{id:'me',user_id:'a',nickname:'Alice'},{id:'target',user_id:'b',nickname:'Bob'}]},me:{id:'me'},onLeave(){}};
test('consent gate keeps gameplay closed until explicit successful server acceptance',async()=>{
 let accepted=false,calls=0;const h=mount('../components/CommunityGate.tsx',{children:'gameplay',onAccountDeleted(){}},{status:async()=>({accepted,restricted:false}),accept:async()=>{calls++;accepted=true;}});
 h.render();await flush();let tree=h.render();assert.ok(button(tree,'Accept the rules and continue'));assert.equal(nodes(tree).some(n=>n.props?.children?.includes('gameplay')),false);assert.equal(calls,0);
 button(tree,'Accept the rules and continue').onPress();await flush();tree=h.render();assert.equal(calls,1);assert.ok(nodes(tree).some(n=>n.props?.children?.includes('gameplay')));
});
test('failed acceptance and restricted accounts never expose gameplay; privacy/deletion remains available',async()=>{
 const h=mount('../components/CommunityGate.tsx',{children:'gameplay',onAccountDeleted(){}},{status:async()=>({accepted:false,restricted:false}),accept:async()=>{throw Error('offline');}});h.render();await flush();button(h.render(),'Accept the rules and continue').onPress();await flush();assert.ok(button(h.render(),'Accept the rules and continue'));
 const banned=mount('../components/CommunityGate.tsx',{children:'gameplay',onAccountDeleted(){}},{status:async()=>({accepted:true,restricted:true})});banned.render();await flush();const tree=banned.render();assert.ok(nodes(tree).some(n=>n.type==='PrivacyInfo'));assert.equal(nodes(tree).some(n=>n.props?.title==='Accept the rules and continue'),false);
});
test('report submits the selected subject once, even on duplicate taps; submitted details are preserved on failure',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r;});const calls=[];const h=mount('../components/RoomSafety.tsx',{ctx},{report:async(...a)=>{calls.push(a);await pending;return 'abcd1234-rest';}});
 button(h.render(),'Safety · Report / Block').onPress();button(h.render(),'Bob').onPress();let t=h.render();nodes(t).find(n=>n.type==='Input').props.onChangeText('visible message');t=h.render();const submit=button(t,'Submit report');submit.onPress();submit.onPress();assert.equal(calls.length,1);assert.deepEqual(calls[0],['room','target','player','harassment','visible message']);resolve();await flush();assert.ok(nodes(h.render()).some(n=>n.props?.children?.some(x=>typeof x==='string'&&x.includes('abcd1234'))));
 const failed=mount('../components/RoomSafety.tsx',{ctx},{report:async()=>{throw Error('offline');}});button(failed.render(),'Safety · Report / Block').onPress();button(failed.render(),'Bob').onPress();nodes(failed.render()).find(n=>n.type==='Input').props.onChangeText('keep details');button(failed.render(),'Submit report').onPress();await flush();assert.equal(nodes(failed.render()).find(n=>n.type==='Input').props.value,'keep details');
});
test('block requires a separate confirmation; failed server block never leaves and successful block leaves once',async()=>{
 for(const fail of [true,false]){let calls=0,left=0;const h=mount('../components/RoomSafety.tsx',{ctx:{...ctx,onLeave(){left++;}}},{block:async()=>{calls++;if(fail)throw Error('offline');}});
 button(h.render(),'Safety · Report / Block').onPress();button(h.render(),'Bob').onPress();button(h.render(),'Block player').onPress();assert.equal(calls,0);const confirm=button(h.render(),'Block and leave room');confirm.onPress();confirm.onPress();await flush();assert.equal(calls,1);assert.equal(left,fail?0:1);}
});
