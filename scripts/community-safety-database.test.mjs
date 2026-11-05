import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const id=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
async function setup(){const db=new PGlite();try{await db.exec(read('./fixtures/account-deletion-schema.sql'));await db.exec(read('./fixtures/safety-schema.sql'));await db.exec(read('./fixtures/safety-existing-rpcs.sql'));await db.exec(read('../supabase/migrations/20261103230138_community_safety.sql'));await db.exec(read('../supabase/migrations/20261105111016_safety_evidence_delete_order.sql'));await db.exec(`insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}');`);return db;}catch(e){await db.close();throw e;}}
const actor=async(db,n)=>db.exec(`select set_config('request.jwt.claim.sub','${id(n)}',false)`);
const accept=async(db,n)=>{await actor(db,n);await db.exec(`select public.community_accept('2026-11-04')`);};
const room=async(db,n,name)=>{await accept(db,n);return (await db.query(`select public.create_room('${name}','standard') as r`)).rows[0].r;};
test('consent and baseline content checks run on server, including direct legacy RPC paths',async()=>{
 const db=await setup();try{
 await actor(db,1);await assert.rejects(db.query("select public.create_room('QA','standard')"),/community_consent_required/);
 await assert.rejects(db.query("select community_accept('fake')"),/invalid_policy_version/);await accept(db,1);
 await assert.rejects(db.query("select public.create_room('fuck','standard')"),/content_not_allowed/);
 const r=await room(db,1,'Ömür QA');assert.ok(r.room_id);
 await db.exec(`insert into app_safety.bans values('${id(1)}','test',now())`);
 await assert.rejects(db.query("select public.create_room('QA','standard')"),/account_restricted/);
 }finally{await db.close();}
});
test('blocking exits shared rooms, prevents either user joining and hides conflicting public rooms; unblock is owned',async()=>{
 const db=await setup();try{
 const r=await room(db,1,'Alice');await accept(db,2);await db.query(`select join_room('${r.code}','Bob')`);await accept(db,3);await db.query(`select join_room('${r.code}','Carol')`);
 const target=(await db.query(`select id from players where user_id='${id(2)}'`)).rows[0].id;
 await actor(db,1);await db.query('select safety_block($1,$2)',[r.room_id,target]);
 assert.equal((await db.query(`select count(*)::int n from players where user_id='${id(1)}'`)).rows[0].n,0);
 await assert.rejects(db.query(`select join_room('${r.code}','Alice')`),/blocked_room/);assert.deepEqual((await db.query('select * from list_open_rooms()')).rows,[]);
 const own=await room(db,1,'Alice');await actor(db,2);await assert.rejects(db.query(`select join_room('${own.code}','Bob')`),/blocked_room/);
 assert.deepEqual((await db.query('select * from safety_blocks()')).rows,[]);
 await db.query('select safety_unblock($1)',[id(1)]);await actor(db,1);assert.equal((await db.query('select * from safety_blocks()')).rows.length,1);
 await db.query('select safety_unblock($1)',[id(2)]);await db.query(`select join_room('${r.code}','Alice')`);
 }finally{await db.close();}
});
test('reports reject outsiders, limit spam, stay private; trusted review redacts/restricts and is audited',async()=>{
 const db=await setup();try{
 const r=await room(db,1,'Alice');await accept(db,2);await db.query(`select join_room('${r.code}','Bob')`);const target=(await db.query(`select id from players where user_id='${id(2)}'`)).rows[0].id;
 await accept(db,3);await assert.rejects(db.query('select safety_report($1,$2,$3,$4,$5)',[r.room_id,target,'player','hate','details']),/not_in_room/);
 await actor(db,1);const report=(await db.query('select safety_report($1,$2,$3,$4,$5) id',[r.room_id,target,'player','harassment','the nickname'])).rows[0].id;
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from app_safety.reports'),/permission denied/);await assert.rejects(db.query('select app_safety.review($1,$2,$3)',[report,'restrict','fake moderator']),/permission denied/);await db.exec('reset role');
 await db.query('select app_safety.review($1,$2,$3)',[report,'redact','Synthetic review']);assert.match((await db.query('select nickname from players where id=$1',[target])).rows[0].nickname,/^Player-/);
 for(let i=0;i<9;i++)await db.query('select safety_report($1,$2,$3,$4,$5)',[r.room_id,target,'player','other','details']);
 await assert.rejects(db.query('select safety_report($1,$2,$3,$4,$5)',[r.room_id,target,'player','other','details']),/report_limit/);
 const banReport=(await db.query("select id from app_safety.reports where status='open' limit 1")).rows[0].id;
 await db.query('select app_safety.review($1,$2,$3)',[banReport,'restrict','Synthetic restriction']);
 await actor(db,2);await assert.rejects(db.query(`select join_room('${r.code}','Bob')`),/account_restricted/);assert.equal((await db.query('select count(*)::int n from app_safety.audit')).rows[0].n,2);
 await db.exec(`delete from auth.users where id in('${id(1)}','${id(2)}')`);assert.equal((await db.query("select count(*)::int n from app_safety.reports where evidence<>'{}'")).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from app_safety.reports where reporter is not null or target_user is not null')).rows[0].n,0);
 }finally{await db.close();}
});
test('blocking during court cleans restrictive FKs, restores pause and transfers architect without duplicate role',async()=>{
 const db=await setup();try{
 const r=await room(db,1,'Alice');await accept(db,2);await db.query(`select join_room('${r.code}','Bob')`);await accept(db,3);await db.query(`select join_room('${r.code}','Carol')`);
 const ps=(await db.query('select id,user_id from players where room_id=$1',[r.room_id])).rows;const [a,b,c]=[1,2,3].map(n=>ps.find(p=>p.user_id===id(n)).id);const event=id(50);
 await db.exec(`update players set team_side='A';update players set is_captain=true,is_architect=true where id='${a}';update rooms set paused=true,paused_at=now()-interval '5 seconds',phase='minigame' where id='${r.room_id}';
 insert into party_events(id,room_id,status,kind,prompt) values('${event}','${r.room_id}','open','ucube_court','test');insert into party_court_cases values('${event}','${a}','${b}','${c}');`);
 await actor(db,1);await db.query('select safety_block($1,$2)',[r.room_id,b]);
 assert.equal((await db.query('select count(*)::int n from party_court_cases')).rows[0].n,0);assert.equal((await db.query('select paused from rooms')).rows[0].paused,false);assert.equal((await db.query('select count(*)::int n from players where is_architect')).rows[0].n,1);
 }finally{await db.close();}
});
