import { createClient } from '@supabase/supabase-js';
import { createDeletionHandler } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) throw new Error('Account deletion service is not configured');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
Deno.serve(createDeletionHandler({
  async getUser(token) {
    const { data, error } = await client.auth.getUser(token);
    if (error && error.status && error.status >= 500) throw error;
    return error ? null : data.user;
  },
  async deleteUser(id) {
    const { error } = await client.auth.admin.deleteUser(id, false);
    if (error && error.code !== 'user_not_found') throw error;
  },
  async setToken(userId, hash) {
    const { error } = await client.rpc('account_deletion_set_token', { p_user: userId, p_hash: hash });
    if (error) throw error;
  },
  async resolveToken(hash) {
    const { data, error } = await client.rpc('account_deletion_resolve_token', { p_hash: hash });
    if (error) throw error;
    return data;
  },
}));
