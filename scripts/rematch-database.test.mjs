import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('rematch creates one opt-in lobby with the original settings and prefers unseen puzzles', async () => {
  const db = new PGlite();
  try {
    await db.exec(read('./fixtures/gameplay-schema.sql'));
    await db.exec(read('./fixtures/localization-schema.sql'));
    await db.exec(`
      alter table rooms add column solo_since timestamptz default now();
      create or replace function gen_room_code() returns text language sql as $$
        select upper(substring(gen_random_uuid()::text,1,5))
      $$;
      create schema app_safety;
      create function app_safety.assert_actor(boolean) returns uuid language plpgsql as $$
      begin
        if auth.uid() is null then raise exception 'not_authenticated'; end if;
        return auth.uid();
      end;
      $$;
    `);
    await db.exec(read('./fixtures/safety-existing-rpcs.sql'));
    await db.exec(read('../supabase/migrations/20261103112518_english_game_content.sql'));
    await db.exec(read('../supabase/migrations/20261117001430_fresh_questions_and_room_rematch.sql'));

    const row = async (sql, params) => (await db.query(sql, params)).rows[0];
    const [host, guest, outsider] = (await db.query(
      'insert into auth.users select gen_random_uuid() from generate_series(1,3) returning id'
    )).rows.map(user => user.id);
    const as = id => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    const replay = async id => (await row('select enter_room_rematch($1) as result', [id])).result;

    await as(host);
    const { result: original } = await row("select create_room_localized('Host','quick','en') as result");
    await as(guest);
    await db.query("select join_room($1,'Guest')", [original.code]);
    await db.query(`
      update rooms set phase='results', selected_games=array['anagram'],
        selected_games_locked=true, friend_facts_enabled=true, jokers_per_team=3 where id=$1
    `, [original.room_id]);
    await assert.rejects(replay(original.room_id), /rematch_not_ready/);

    await as(host);
    const next = await replay(original.room_id);
    assert.equal((await replay(original.room_id)).room_id, next.room_id);
    assert.deepEqual(await row(`
      select mode, phase, game_language, selected_games, selected_games_locked,
        friend_facts_enabled, jokers_per_team from rooms where id=$1
    `, [next.room_id]), {
      mode: 'quick', phase: 'lobby', game_language: 'en', selected_games: ['anagram'],
      selected_games_locked: true, friend_facts_enabled: true, jokers_per_team: 3,
    });
    assert.deepEqual(await row('select phase, rematch_room_id from rooms where id=$1', [original.room_id]), {
      phase: 'results', rematch_room_id: next.room_id,
    });
    await as(outsider);
    await assert.rejects(replay(original.room_id), /not_in_room/);
    await as(guest);
    assert.equal((await replay(original.room_id)).room_id, next.room_id);

    await db.exec(`
      update questions set active=false;
      insert into questions(kind,tier,prompt,answer,language)
      select 'anagram','base','Puzzle '||n,'word'||n,'en' from generate_series(1,6) n;
    `);
    const openPrior = (cutoff, timestamp) => db.query(`
      insert into room_rounds(room_id,idx,tier,kind,question_id,prompt,piece_id,opens_at)
      select $1,row_number() over (order by q.answer),q.tier,q.kind,q.id,q.prompt,p.id,${timestamp}
      from questions q join pieces p on p.tier=q.tier where q.active and q.answer <= $2
    `, [original.room_id, cutoff]);
    await openPrior('word2', "now() - interval '1 day' - make_interval(days => right(q.answer,1)::int)");
    await openPrior('word6', "now() + interval '1 day'");
    await as(host);
    const prepare = async id => {
      await db.query("update players set team_side=case when is_host then 'A'::team_side else 'B'::team_side end where room_id=$1", [id]);
      await db.query("update rooms set phase='team_reveal',selected_games=array['anagram'] where id=$1", [id]);
      await db.query('select start_game($1)', [id]);
      const { rows } = await db.query(
        'select q.answer from room_rounds r join questions q on q.id=r.question_id where r.room_id=$1 order by q.answer', [id]
      );
      return rows.map(question => question.answer);
    };
    assert.deepEqual(await prepare(next.room_id), ['word3', 'word4', 'word5', 'word6']);

    await db.query('update room_rounds set opens_at=null where room_id=$1', [next.room_id]);
    await openPrior('word6', "now() - make_interval(hours => right(q.answer,1)::int)");
    const { result: fallback } = await row("select create_room_localized('Host','quick','en') as result");
    assert.deepEqual(await prepare(fallback.room_id), ['word3', 'word4', 'word5', 'word6']);
  } finally {
    await db.close();
  }
});
