import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeletionHandler,hashCode} from '../supabase/functions/delete-account/handler.ts';

function fixture(overrides={}) {
 const codes=new Map(),deleted=[],issued=[];
 const service={
  async getUser(token){return token==='valid-a'?{id:'alice'}:token==='valid-b'?{id:'bob'}:null;},
  async deleteUser(id){deleted.push(id);for(const [hash,user] of codes)if(user===id)codes.delete(hash);},
  async setToken(id,hash){for(const [old,user] of codes)if(user===id)codes.delete(old);codes.set(hash,id);issued.push({id,hash});},
  async resolveToken(hash){return codes.get(hash)??null;},...overrides,
 };
 const handler=createDeletionHandler(service);
 const call=(body,token='valid-a')=>handler(new Request('https://example.test/delete-account',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));
 return {handler,call,deleted,issued,codes};
}
test('only the freshly authenticated caller can delete an account; IDs in request data are rejected',async()=>{
 const f=fixture();
 assert.equal((await f.call({action:'delete',confirmation:'DELETE'},null)).status,401);
 assert.equal((await f.call({action:'delete',confirmation:'DELETE'},'forged')).status,401);
 assert.equal((await f.call({action:'delete',confirmation:'DELETE',user_id:'bob'})).status,400);
 assert.equal((await f.call({action:'delete',confirmation:'yes'})).status,400);
 assert.deepEqual(f.deleted,[]);
 const response=await f.call({action:'delete',confirmation:'DELETE'});
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{deleted:true});assert.deepEqual(f.deleted,['alice']);
});
test('independent concurrent requests never reuse another caller identity',async()=>{
 const f=fixture();await Promise.all([f.call({action:'delete',confirmation:'DELETE'},'valid-a'),f.call({action:'delete',confirmation:'DELETE'},'valid-b')]);
 assert.deepEqual(f.deleted.sort(),['alice','bob']);
});
test('web deletion codes contain 256 random bits; only a hash is stored and codes rotate and die with the account',async()=>{
 const f=fixture();const a=await (await f.call({action:'issue_code'})).json();
 assert.match(a.code,/^[a-f0-9]{64}$/);assert.equal(f.issued[0].hash,await hashCode(a.code));assert.notEqual(f.issued[0].hash,a.code);
 const b=await (await f.call({action:'issue_code'})).json();assert.notEqual(a.code,b.code);
 assert.equal((await f.call({action:'redeem_code',confirmation:'DELETE',code:a.code},null)).status,400);
 assert.equal((await f.call({action:'redeem_code',confirmation:'DELETE',code:'a'.repeat(64)},null)).status,400);
 const formatted=b.code.match(/.{8}/g).join('-').toUpperCase();
 const res=await f.call({action:'redeem_code',confirmation:'DELETE',code:formatted},null);
 assert.equal(res.status,200);assert.deepEqual(f.deleted,['alice']);
 assert.equal((await f.call({action:'redeem_code',confirmation:'DELETE',code:b.code},null)).status,400);
});
test('requests without explicit confirmation, malformed data and GET cannot trigger deletion',async()=>{
 const f=fixture();assert.equal((await f.handler(new Request('https://example.test'))).status,405);
 assert.equal((await f.handler(new Request('https://example.test',{method:'OPTIONS'}))).status,204);
 for(const body of [null,[],42,{action:'delete'},{action:'redeem_code',confirmation:'DELETE',code:5},{action:'unknown'}])assert.equal((await f.call(body)).status,400);
 const invalid=await f.handler(new Request('https://example.test',{method:'POST',body:'not json'}));assert.equal(invalid.status,400);assert.deepEqual(f.deleted,[]);
});
test('failed server deletion never reports success or discloses internals; recovery replies are not cacheable',async()=>{
 const f=fixture({async deleteUser(){throw Error('private database failure for alice');}});
 const res=await f.call({action:'delete',confirmation:'DELETE'});
 assert.equal(res.status,503);assert.deepEqual(await res.json(),{error:'deletion_unavailable'});assert.equal(res.headers.get('Cache-Control'),'no-store');
 assert.equal(res.headers.get('Access-Control-Allow-Origin'),'*');
});
