import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function client({result={data:{deleted:true}},storageFails=false}={}){
 const initial={roomId:'room',nickname:'Player',avatarId:'fox','profile:v1':'stats',appLanguage:'en',soundEnabled:'true','party-auto:room:round':'checked','other-app:data':'keep'};
 const memory=new Map(Object.entries(initial)),calls=[];
 const storage={async getAllKeys(){return [...memory.keys()];},async setItem(k,v){if(storageFails)throw Error('storage unavailable');calls.push(['set',k]);memory.set(k,v);},async multiRemove(keys){calls.push(['remove',...keys]);keys.forEach(k=>memory.delete(k));}};
 const modules={
  '@react-native-async-storage/async-storage':{__esModule:true,default:storage},
  './i18n':{translate:v=>v},
  './supabase':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'fixture-token'}}}),signOut:async args=>{calls.push(['signOut',args.scope]);return {error:null};}},functions:{invoke:async(name,args)=>{calls.push(['invoke',name,args.body]);return result;}}}},
 };
 const exports={};const source=ts.transpileModule(readFileSync(new URL('../lib/accountDeletion.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(source,{exports,require:name=>{assert.ok(name in modules,name);return modules[name];}});
 return {...exports,memory,calls};
}
test('a failed/unconfirmed server deletion preserves the session, recovery path and all local data',async()=>{
 for(const result of [{error:Error('offline')},{data:{deleted:false}},{data:null}]){
  const c=client({result});await assert.rejects(()=>c.deleteAccount());assert.equal(c.calls.length,1);assert.equal(c.memory.get('nickname'),'Player');assert.equal(c.memory.has('accountDeleted:v1'),false);
 }
});
test('confirmed deletion clears only this app data, persists a deleted marker and ends the local session',async()=>{
 const c=client();const res=await c.deleteAccount();assert.equal(res.localCleanupFailed,false);
 assert.equal(c.memory.get('accountDeleted:v1'),'true');assert.equal(c.memory.get('other-app:data'),'keep');assert.equal(c.memory.size,2);
 assert.equal(c.calls.at(-1)[0],'signOut');assert.equal(c.calls.at(-1)[1],'local');assert.equal(c.calls[0][2].confirmation,'DELETE');
});
test('local cleanup failure after committed server deletion is reported separately and sign-out still runs',async()=>{
 const c=client({storageFails:true});assert.equal((await c.deleteAccount()).localCleanupFailed,true);assert.equal(c.calls.at(-1)[0],'signOut');
});
test('creating a recovery code does not erase the profile or sign out',async()=>{
 const code='a'.repeat(64),c=client({result:{data:{code}}});assert.equal(await c.issueDeletionCode(),code);assert.equal(c.memory.get('nickname'),'Player');assert.equal(c.calls.length,1);
});
