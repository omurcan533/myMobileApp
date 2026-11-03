import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');
const compile=file=>ts.transpileModule(read(file),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const copyExports={};vm.runInNewContext(compile('../lib/copy.en.ts'),{exports:copyExports});
const copy=copyExports.ENGLISH_COPY;
function device({locale='en-US',saved=null,storageFails=false}={}){
 const memory=new Map(saved?[['appLanguage',saved]]:[]);const subscribers=new Set();
 const modules={
  './copy.en':{ENGLISH_COPY:copy},
  '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async key=>{if(storageFails)throw Error('Unavailable');return memory.get(key)??null;},setItem:async(key,value)=>memory.set(key,value)}},
  react:{useSyncExternalStore(subscribe,snapshot){subscribe(()=>subscribers.add(snapshot()));return snapshot();}},
 };
 const exports={};
 vm.runInNewContext(compile('../lib/i18n.ts'),{exports,require:name=>{assert.ok(name in modules,name);return modules[name];},Intl:{DateTimeFormat:()=>({resolvedOptions:()=>({locale})})}});
 return {...exports,memory,subscribers};
}

test('device locale selects English or Turkish, saved preference wins and persists across launches',async()=>{
 const tr=device({locale:'tr-TR'});await tr.initializeLanguage();assert.equal(tr.getLanguage(),'tr');
 const en=device({locale:'de-DE'});await en.initializeLanguage();assert.equal(en.getLanguage(),'en');
 await tr.saveLanguage('en');assert.equal(tr.memory.get('appLanguage'),'en');
 const restored=device({locale:'tr-TR',saved:tr.memory.get('appLanguage')});await restored.initializeLanguage();assert.equal(restored.getLanguage(),'en');
 const offline=device({locale:'tr-TR',storageFails:true});await offline.initializeLanguage();assert.equal(offline.getLanguage(),'tr');
});

test('two devices keep independent UI languages and authored templates preserve player text',async()=>{
 const a=device({saved:'tr'}),b=device({saved:'en'});await Promise.all([a.initializeLanguage(),b.initializeLanguage()]);
 assert.equal(a.translate('Oyun dili'),'Oyun dili');assert.equal(b.translate('Oyun dili'),'Game language');
 const nickname='Mimar {0} Türkçe';
 assert.equal(b.format('Mimar ({0}) inşayı tamamlıyor…',nickname),'The architect (Mimar {0} Türkçe) is finishing the build…');
 a.useLanguage();await a.saveLanguage('en');assert.equal(a.subscribers.size,1);
 assert.equal(b.getLanguage(),'en');await a.saveLanguage('tr');assert.equal(b.getLanguage(),'en');
 assert.equal(b.translate('This is already English'),'This is already English');
});

test('all authored translation calls and interpolation slots have English counterparts',()=>{
 const root=new URL('../',import.meta.url);const files=['App.tsx',...['screens','components'].flatMap(dir=>readdirSync(new URL(dir+'/',root)).filter(f=>f.endsWith('.tsx')).map(f=>dir+'/'+f))];
 const missing=[];
 for(const file of files){const source=ts.createSourceFile(file,read('../'+file),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);function visit(n){if(ts.isCallExpression(n)&&['translate','format'].includes(n.expression.getText(source))&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])){const key=n.arguments[0].text;if(!copy[key])missing.push(file+': '+key);}ts.forEachChild(n,visit);}visit(source);}
 assert.deepEqual(missing,[]);
 for(const [source,en]of Object.entries(copy)){
  const slots=s=>[...s.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort();
  assert.deepEqual(slots(en),slots(source),source);
 }
});

test('server game errors use each device language and preserve stable error codes',async()=>{
 for(const language of ['tr','en']){
  const d=device({saved:language});await d.initializeLanguage();
  const exports={};vm.runInNewContext(compile('../lib/api.ts'),{exports,require:name=>name==='./i18n'?d:{supabase:{}}});
  const error=new exports.GameError('room_not_found');
  assert.equal(error.code,'room_not_found');
  assert.equal(error.message,language==='en'?'No room was found with this code.':'Bu kodla bir oda bulunamadı.');
  const unknown=new exports.GameError('Internal database detail');assert.ok(!unknown.message.includes('Internal database'));
 }
});

test('room creation uses the creator preference, while joining never changes the shared language or nickname',async()=>{
 for(const language of ['tr','en']){
  const d=device({saved:language});await d.initializeLanguage();const calls=[];
  const exports={};const supabase={rpc:async(fn,args)=>{calls.push({fn,args});return {data:{room_id:'room',code:'CODE'},error:null};}};
  vm.runInNewContext(compile('../lib/api.ts'),{exports,require:name=>name==='./i18n'?d:{supabase}});
  await exports.api.createRoom('Mimar','custom');
  assert.equal(calls[0].fn,'create_room_localized');assert.equal(calls[0].args.p_language,language);assert.equal(calls[0].args.p_nickname,'Mimar');
  await exports.api.joinRoom('CODE','Kaydet');assert.equal(calls[1].args.p_nickname,'Kaydet');assert.ok(!('p_language' in calls[1].args));
 }
});

test('every server error has an authored English message',()=>{
 const source=ts.createSourceFile('api.ts',read('../lib/api.ts'),ts.ScriptTarget.Latest,true);
 const missing=[];function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='MESSAGES')for(const p of n.initializer.properties){if(!copy[p.initializer.text])missing.push(p.initializer.text);}ts.forEachChild(n,visit);}visit(source);
 assert.deepEqual(missing,[]);
});

test('party activities serialize canonical copy so each UI language can render the same event',async()=>{
 const sent=[];
 for(const language of ['tr','en']){
  const d=device({saved:language});await d.initializeLanguage();const slots=[];let index=0;
  const react={__esModule:true,Fragment:'Fragment',createElement:(type,props,...children)=>({type,props:{...props,children}}),
   useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
   useRef(initial){const i=index++;return slots[i]??={current:initial};},useCallback:fn=>fn,useEffect(){},
  };react.default=react;
  const api={partyEventCurrent:async()=>null,partyEventStart:async(_room,_kind,prompt)=>{sent.push(prompt);return 'event';}};
  const modules={react,'react-native':{View:'View',ScrollView:'ScrollView',TextInput:'TextInput',Modal:'Modal',Pressable:'Pressable'},
   '@react-native-async-storage/async-storage':{__esModule:true,default:{}},'../lib/api':{api},'../lib/i18n':d,'../lib/partyMissions':{PARTY_MISSIONS:[]},'./ui':new Proxy({},{get:(_,name)=>name}),
  };
  const exports={};vm.runInNewContext(compile('../components/PartyBreak.tsx'),{exports,require:name=>{assert.ok(name in modules,name);return modules[name];}});
  const props={roomId:'room',players:[{id:'a'},{id:'b'}],myId:'a',isHost:true,canStart:true};
  const render=()=>{index=0;return exports.PartyBreak(props);};
  const buttons=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(buttons):[...(tree.type==='Btn'?[tree]:[]),...buttons(tree.props?.children)];
  buttons(render()).find(n=>n.props.title===d.translate('Sürpriz Etkinlik Başlat')).props.onPress();
  await buttons(render()).find(n=>n.props.title===d.translate('İlk Aklına Gelen')).props.onPress();
 }
 assert.equal(sent.length,2);assert.equal(sent[0],sent[1]);
 const en=device({saved:'en'});await en.initializeLanguage();assert.notEqual(en.translate(sent[0]),sent[0]);
});
