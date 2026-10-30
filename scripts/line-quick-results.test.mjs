import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('PostgreSQL: 30-second line round, all-finish resolution, named winner, timeout, pause and single award',async()=>{
 const db=new PGlite();
 try {
  await db.exec(readFileSync(new URL('./fixtures/gameplay-schema.sql',import.meta.url),'utf8'));
  await db.exec('begin;');
  await db.exec(readFileSync(new URL('../supabase/migrations/20261030205609_seven_device_gameplay_fixes.sql',import.meta.url),'utf8').split('-- Physical closure')[0]);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261030225835_line_connect_quick_results.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('./line-quick-results.sql',import.meta.url),'utf8'));
  await db.exec('rollback;');
 } finally {await db.close();}
});
