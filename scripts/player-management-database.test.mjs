import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('PostgreSQL: intermission removal, host checks, last-team confirmation and role/control repair',async()=>{
 const db=new PGlite();
 try {
  await db.exec(readFileSync(new URL('./fixtures/gameplay-schema.sql',import.meta.url),'utf8'));
  await db.exec('begin;');
  await db.exec(readFileSync(new URL('../supabase/migrations/20261030205609_seven_device_gameplay_fixes.sql',import.meta.url),'utf8').split('-- Physical closure')[0]);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261030223506_intermission_player_management.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('./player-management-regression.sql',import.meta.url),'utf8'));
  await db.exec('rollback;');
 } finally { await db.close(); }
});
