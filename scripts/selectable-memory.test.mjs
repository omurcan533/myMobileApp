import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {minigameVariant} from '../lib/minigameVariant.ts';

test('explicit quick memory always renders memory regardless of generated ID',()=>{
 for(const id of ['a','b','c','00000000-0000-0000-0000-000000000001']) assert.equal(minigameVariant('memory',id),'memory');
 assert.equal(minigameVariant('reflex','a'),'memory');
 assert.equal(minigameVariant('reflex','b'),'balance');
 assert.equal(minigameVariant('reflex','c'),'reflex');
 assert.equal(minigameVariant('social_guess','b'),'reflex');
});

test('PostgreSQL: select only memory, schedule it, time it, score it and replay it',async()=>{
 const db=new PGlite();
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 try {
  await db.exec(read('./fixtures/gameplay-schema.sql'));
  await db.exec('begin;');
  await db.exec(read('../supabase/migrations/20261030205609_seven_device_gameplay_fixes.sql').split('-- Physical closure')[0]);
  await db.exec(read('../supabase/migrations/20261030225835_line_connect_quick_results.sql'));
  const start=read('../supabase/migrations/20261029144706_party_gameplay_improvements.sql').match(/CREATE OR REPLACE FUNCTION public\._start_minigame[^]*?end \$function\$/)[0];
  await db.exec(start);
  await db.exec(read('../supabase/migrations/20261030231421_selectable_quick_memory.sql'));
  await db.exec(read('./selectable-memory.sql'));
  await db.exec('rollback;');
 } finally {await db.close();}
});
