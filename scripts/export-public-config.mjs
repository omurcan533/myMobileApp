import { existsSync, writeFileSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
const key=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || new URL(url).protocol!=='https:') throw new Error('Public backend URL/key required for account deletion page');
let publicKey=key.startsWith('sb_publishable_');
if (!publicKey && key.split('.').length===3) {
  try { publicKey=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon'; } catch { /* Reject malformed keys. */ }
}
if (!publicKey) throw new Error('Only a publishable or anon key may be exported');
writeFileSync('public/backend-config.json',JSON.stringify({url,key})+'\n');
