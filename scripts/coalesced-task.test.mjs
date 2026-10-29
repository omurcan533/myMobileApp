import test from 'node:test';
import assert from 'node:assert/strict';
import {coalescedTask} from '../lib/coalescedTask.ts';

test('500 realtime signals never overlap requests and coalesce into one follow-up', async()=>{
 let release;let calls=0;let concurrent=0;let maximum=0;
 const first=new Promise(resolve=>{release=resolve;});
 const load=coalescedTask(async()=>{calls++;concurrent++;maximum=Math.max(maximum,concurrent);if(calls===1)await first;concurrent--;},()=>true);
 const current=load();for(let i=0;i<500;i++)load();
 release();await current;
 assert.equal(calls,2);assert.equal(maximum,1);
});
test('room teardown cancels queued requests',async()=>{
 let active=true;let release;let calls=0;
 const gate=new Promise(resolve=>{release=resolve;});
 const load=coalescedTask(async()=>{calls++;await gate;},()=>active);
 const current=load();load();active=false;release();await current;await load();
 assert.equal(calls,1);
});
test('a rejected request releases the lock for a later retry',async()=>{
 let calls=0;const load=coalescedTask(async()=>{if(++calls===1)throw new Error('offline');},()=>true);
 await assert.rejects(load(),/offline/);await load();assert.equal(calls,2);
});
