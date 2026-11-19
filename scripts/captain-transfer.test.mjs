import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('captain can transfer only to a human teammate and loses transfer authority', async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync(new URL('./fixtures/gameplay-schema.sql', import.meta.url), 'utf8'));
    await db.exec('alter table rooms add column if not exists closed_at timestamptz; alter table players add column if not exists is_bot boolean default false;');
    await db.exec(readFileSync(new URL('../supabase/migrations/20261119141247_transfer_team_captain.sql', import.meta.url), 'utf8'));
    await db.exec(`
      insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
      insert into rooms(id,code,host_user_id,phase) values('00000000-0000-0000-0000-000000000004','TEST1','00000000-0000-0000-0000-000000000001','minigame');
      insert into players(id,room_id,user_id,nickname,team_side,is_captain)
        select id,'00000000-0000-0000-0000-000000000004',id,'Test',
        case when id::text like '%003' then 'B'::team_side else 'A'::team_side end,
        id::text like '%001' from auth.users;
      set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
    `);
    const room = '00000000-0000-0000-0000-000000000004';
    const current = '00000000-0000-0000-0000-000000000001';
    const teammate = '00000000-0000-0000-0000-000000000002';
    const opponent = '00000000-0000-0000-0000-000000000003';
    const transfer = target => db.query('select transfer_team_captain($1,$2)', [room, target]);
    await assert.rejects(transfer(opponent), /invalid_captain_target/);
    await assert.rejects(transfer(current), /invalid_captain_target/);
    await db.query('update players set is_bot=true where id=$1', [teammate]);
    await assert.rejects(transfer(teammate), /invalid_captain_target/);
    await db.query('update players set is_bot=false where id=$1', [teammate]);
    await transfer(teammate);
    assert.deepEqual((await db.query('select id from players where is_captain')).rows, [{ id: teammate }]);
    await assert.rejects(transfer(current), /not_captain/);
    assert.equal((await db.query("select has_function_privilege('anon','transfer_team_captain(uuid,uuid)','execute') as allowed")).rows[0].allowed, false);
  } finally {
    await db.close();
  }
});
