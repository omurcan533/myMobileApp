import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('PostgreSQL: seven-player finish/pull, optional Pong votes, replay, answer timing and room closure',async()=>{
 const db=new PGlite();
 try {
  await db.exec(readFileSync(new URL('./fixtures/gameplay-schema.sql',import.meta.url),'utf8'));
  await db.exec('begin;');
  // Cron is verified separately in Supabase; PGlite intentionally has no background scheduler.
  const migration=readFileSync(new URL('../supabase/migrations/20261030205609_seven_device_gameplay_fixes.sql',import.meta.url),'utf8').split('-- Physical closure')[0];
  await db.exec(migration);
  await db.exec(readFileSync(new URL('./seven-device-regression.sql',import.meta.url),'utf8'));
  await db.exec('rollback;');
 } finally { await db.close(); }
});
