import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('account deletion atomically removes own rooms and linked data, cleans court FKs and preserves other users',async()=>{
 const db=new PGlite();try{
 await db.exec(read('./fixtures/account-deletion-schema.sql'));
 await db.exec(read('../supabase/migrations/20261103223650_account_deletion_cleanup.sql'));
 await db.exec(`insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}');
 insert into auth.sessions values('${id(1)}'),('${id(2)}');
 insert into rooms(id,host_user_id) values('${id(10)}','${id(1)}'),('${id(20)}','${id(2)}');
 insert into players(id,room_id,user_id,team_side,is_captain,is_architect) values
 ('${id(11)}','${id(10)}','${id(1)}','A',true,true),('${id(12)}','${id(10)}','${id(2)}','B',true,true),
 ('${id(21)}','${id(20)}','${id(1)}','A',true,true),('${id(22)}','${id(20)}','${id(2)}','B',true,true),('${id(23)}','${id(20)}','${id(3)}','A',false,false);
 update rooms set paused=true,paused_at=now()-interval '10 seconds',phase_ends_at=now()+interval '20 seconds',
 captain_rolls='{"A":{"rolls":[{"player_id":"${id(21)}","nickname":"erase me"},{"player_id":"${id(23)}","nickname":"keep me"}]}}',captain_duel='{"turn_player_id":"${id(21)}"}' where id='${id(20)}';
 insert into room_rounds values('${id(25)}','${id(20)}','open',now()-interval '30 seconds',now()+interval '20 seconds',0);
 insert into room_minigames(id,room_id,status,starts_at,pong_state) values('${id(26)}','${id(20)}','live',now()-interval '30 seconds','{"slots":{"A":"${id(21)}","B":"${id(22)}"}}');
 insert into party_events values('${id(30)}','${id(20)}','${id(21)}','open');
 insert into party_court_cases values('${id(30)}','${id(21)}','${id(22)}','${id(23)}');
 insert into party_court_ballots values('${id(30)}','${id(21)}');insert into party_court_speeches values('${id(30)}','${id(21)}','private speech');
 insert into match_highlights values('${id(31)}','${id(20)}','${id(21)}','{"nickname":"erase me"}');
 insert into round_answers values('${id(21)}','private answer');insert into survivor_team_messages values('${id(21)}','private message');insert into friend_facts values('${id(21)}','private fact');
 select public.account_deletion_set_token('${id(1)}','${'a'.repeat(64)}');
 `);
 await db.exec(`delete from auth.users where id='${id(1)}'`);
 const count=async table=>(await db.query(`select count(*)::int as n from ${table}`)).rows[0].n;
 assert.equal(await count('auth.users'),2);assert.equal(await count('auth.sessions'),1);assert.equal(await count('rooms'),1);assert.equal(await count('players'),2);
 for(const t of ['party_events','party_court_cases','party_court_ballots','party_court_speeches','match_highlights','round_answers','survivor_team_messages','friend_facts','app_privacy.deletion_tokens'])assert.equal(await count(t),0,t);
 const room=(await db.query('select * from rooms')).rows[0];assert.equal(room.host_user_id,id(2));assert.equal(room.paused,false);assert.ok(!JSON.stringify(room.captain_rolls).includes(id(21)));assert.ok(!JSON.stringify(room.captain_rolls).includes('erase me'));assert.ok(JSON.stringify(room.captain_rolls).includes('keep me'));
 const replacement=(await db.query(`select * from players where id='${id(23)}'`)).rows[0];assert.equal(replacement.is_captain,true);assert.equal(replacement.is_architect,true);
 const round=(await db.query('select * from room_rounds')).rows[0];assert.ok(Number(round.paused_ms)>=10000);
 const game=(await db.query('select * from room_minigames')).rows[0];assert.equal(game.pong_state.slots.A,undefined);assert.equal(game.pong_state.slots.B,id(22));
 await assert.rejects(()=>db.exec(`insert into rooms(id,host_user_id) values('${id(99)}','${id(1)}')`),e=>e.code==='23503');
 await db.exec('set role authenticated');
 await assert.rejects(()=>db.query(`select public.account_deletion_resolve_token('${'a'.repeat(64)}')`),e=>e.code==='42501');
 await assert.rejects(()=>db.exec('delete from auth.users'),e=>e.code==='42501');
 }finally{await db.close();}
});
