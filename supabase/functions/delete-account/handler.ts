// Pure HTTP handler: independently testable without credentials or a deployed function.
export interface DeletionService {
  getUser(token: string): Promise<{ id: string } | null>;
  deleteUser(id: string): Promise<void>;
  setToken(userId: string, hash: string): Promise<void>;
  resolveToken(hash: string): Promise<string | null>;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, data: object) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
export async function hashCode(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export function createDeletionHandler(service: DeletionService) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    let body: Record<string, unknown>;
    try {
      const reader = req.body?.getReader();
      if (!reader) return reply(400, { error: 'invalid_request' });
      const decoder = new TextDecoder();
      let raw = '', size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) { await reader.cancel(); return reply(413, { error: 'request_too_large' }); }
        raw += decoder.decode(value, { stream: true });
      }
      body = JSON.parse(raw + decoder.decode());
    } catch { return reply(400, { error: 'invalid_request' }); }
    if (!body || Array.isArray(body) || typeof body !== 'object'
      || Object.keys(body).some(k => !['action', 'confirmation', 'code'].includes(k))) {
      return reply(400, { error: 'invalid_request' });
    }
    if (body.action !== 'issue_code' && body.action !== 'delete' && body.action !== 'redeem_code') {
      return reply(400, { error: 'invalid_request' });
    }
    if (body.action !== 'issue_code' && body.confirmation !== 'DELETE') {
      return reply(400, { error: 'confirmation_required' });
    }
    try {
      if (body.action === 'redeem_code') {
        if (typeof body.code !== 'string' || body.code.length > 100) return reply(400, { error: 'invalid_code' });
        const code = body.code.replace(/[\s-]/g, '').toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(code)) return reply(400, { error: 'invalid_code' });
        const id = await service.resolveToken(await hashCode(code));
        if (!id) return reply(400, { error: 'invalid_code' });
        await service.deleteUser(id);
        return reply(200, { deleted: true });
      }
      const match = /^Bearer ([^\s]+)$/i.exec(req.headers.get('Authorization') ?? '');
      if (!match) return reply(401, { error: 'not_authenticated' });
      const user = await service.getUser(match[1]);
      if (!user) return reply(401, { error: 'not_authenticated' });
      if (body.action === 'issue_code') {
        const code = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
        await service.setToken(user.id, await hashCode(code));
        return reply(200, { code });
      }
      // User ID always comes from a freshly verified Supabase Auth user, never from request data.
      await service.deleteUser(user.id);
      return reply(200, { deleted: true });
    } catch {
      // Do not expose database details, bearer tokens, deletion codes or user IDs in logs/responses.
      return reply(503, { error: 'deletion_unavailable' });
    }
  };
}
