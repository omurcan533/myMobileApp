import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the Pong server lease fences other engines and finalizes points and prizes exactly once', async () => {
  const db = new PGlite();
  try {
    await db.exec(read('./fixtures/gameplay-schema.sql'));
    await db.exec(`
      create role service_role;
      alter table rooms add column closed_at timestamptz;
      create schema app_safety;
      create function app_safety.assert_actor() returns uuid language sql as $$ select auth.uid() $$;
      grant usage on schema app_safety to authenticated;
      grant select, update on rooms, room_minigames to service_role;
    `);
    const resolver = read('../supabase/migrations/20261030231421_selectable_quick_memory.sql')
      .match(/CREATE OR REPLACE FUNCTION public\._resolve_minigame[\s\S]*?\$function\$\s*;/)[0];
    await db.exec(resolver);
    await db.exec(read('../supabase/migrations/20261029140910_pong_settle_input_transitions.sql'));
    await db.exec(read('../supabase/migrations/20261029142330_revert_pong_goal_serve_speed.sql'));
    await db.exec(read('../supabase/migrations/20261117013709_dedicated_pong_server.sql'));
    const row = async (sql, params) => (await db.query(sql, params)).rows[0];
    const { user_id, owner, rival } = await row('select gen_random_uuid() user_id, gen_random_uuid() owner, gen_random_uuid() rival');
    const { id: room } = await row(`
      insert into rooms(code,host_user_id,phase,phase_ends_at)
      values('PONG1',$1,'minigame',now()+interval '30 seconds') returning id
    `, [user_id]);
    const { id: player } = await row("insert into players(room_id,user_id,nickname) values($1,$2,'Paddle') returning id", [room, user_id]);
    await db.query("insert into room_teams(room_id,side) values($1,'A'),($1,'B')", [room]);
    const { id: match } = await row(`
      insert into room_minigames(room_id,kind,status,starts_at,pong_state)
      values($1,'pong','live',now()-interval '1 second',
        jsonb_build_object('x',0.5,'y',0.5,'ay',0.5,'by',0.5,'vx',0.46,'vy',0.23,
          'scoreA',0,'scoreB',0,'tick',now(),'a1',$2::uuid,'modeA','solo')) returning id
    `, [room, player]);
    const settings = await row(`select
      has_function_privilege('authenticated','public.pong_server_sync(uuid,uuid,jsonb)','execute') as client_sync,
      has_function_privilege('anon','public.pong_socket_player(uuid)','execute') as anonymous_join
    `);
    assert.deepEqual(settings, { client_sync: false, anonymous_join: false });
    await assert.rejects(db.query('select pong_socket_player($1)', [match]), /not_in_game/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user_id]);
    assert.equal((await row('select pong_socket_player($1) player', [match])).player, player);
    const sync = async (id, packet = null) => (await row('select pong_server_sync($1,$2,$3::jsonb) data',
      [match, id, packet ? JSON.stringify(packet) : null])).data;
    await db.exec('set role service_role');
    const claim = await sync(owner);
    assert.equal(claim.status, 'live');
    assert.equal((await sync(rival)).status, 'busy');
    assert.equal((await sync(rival, { scoreA: 5 })).status, 'lost');
    await db.exec('reset role');
    await db.query('select pong_set_held($1,-1,true)', [match]);
    const { state } = await row('select pong_tick($1) state', [match]);
    assert.deepEqual(state, claim.state);
    await db.query('select _resolve_minigame($1)', [match]);
    assert.equal((await row('select status from room_minigames where id=$1', [match])).status, 'live');

    await db.query("update room_minigames set pong_server_until=clock_timestamp()-interval '1 second' where id=$1", [match]);
    await db.exec('set role service_role');
    assert.equal((await sync(owner, { scoreA: 5 })).status, 'lost');
    assert.equal((await sync(rival)).status, 'live');
    const done = await sync(rival, { scoreA: 5, a1: 'spoofed' });
    assert.equal(done.status, 'done');
    assert.equal(done.state.a1, player);
    assert.equal((await sync(rival, { scoreA: 5 })).status, 'done');
    await db.exec('reset role');
    assert.equal((await row("select score from room_teams where room_id=$1 and side='A'", [room])).score, 2);
    assert.equal((await row('select count(*)::int pieces from team_pieces where room_id=$1', [room])).pieces, 1);
  } finally {
    await db.close();
  }
});
