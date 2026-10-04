// Admin-only user management. Runs on Supabase's servers, where the
// service role key is available, so the browser never needs it.
//
// POST { action: 'create', email, password, full_name, role }
// POST { action: 'delete', user_id }
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // Who is calling, and are they an admin?
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user: caller } } = await admin.auth.getUser(token);
  if (!caller) return json({ error: 'Not signed in' }, 401);

  const { data: callerProfile } = await admin.from('user_profiles').select('role, super_admin').eq('id', caller.id).single();
  if (callerProfile?.role !== 'admin') return json({ error: 'Admins only' }, 403);
  const callerIsSuper = !!callerProfile.super_admin;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }

  if (body.action === 'create') {
    const email = String(body.email ?? '').trim();
    const password = String(body.password ?? '');
    const full_name = String(body.full_name ?? '').trim();
    const level = body.level === 'superadmin' ? 'superadmin' : (body.level ?? body.role) === 'admin' ? 'admin' : 'user';
    const role = level === 'user' ? 'user' : 'admin';
    const super_admin = level === 'superadmin';
    if (!email || password.length < 6 || !full_name) {
      return json({ error: 'Name, email and a password of at least 6 characters are required' }, 400);
    }
    if (role === 'admin' && !callerIsSuper) {
      return json({ error: 'Only a super admin can create admins.' }, 403);
    }

    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) return json({ error: error?.message ?? 'Failed to create user' }, 400);

    const { error: profErr } = await admin.from('user_profiles').insert({
      id: data.user.id, email, full_name, role, super_admin, created_by: caller.id,
    });
    if (profErr) {
      // Don't leave a login behind without a profile
      await admin.auth.admin.deleteUser(data.user.id);
      return json({ error: profErr.message }, 400);
    }
    return json({ ok: true, user_id: data.user.id });
  }

  if (body.action === 'delete') {
    const userId = String(body.user_id ?? '');
    if (!userId) return json({ error: 'user_id is required' }, 400);
    if (userId === caller.id) return json({ error: "You can't delete your own account" }, 400);

    const { data: target } = await admin.from('user_profiles').select('role').eq('id', userId).maybeSingle();
    if (target?.role === 'admin' && !callerIsSuper) {
      return json({ error: 'Only a super admin can remove admins.' }, 403);
    }

    const { error: profErr } = await admin.from('user_profiles').delete().eq('id', userId);
    if (profErr) return json({ error: profErr.message }, 400);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && !/not found/i.test(error.message)) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action' }, 400);
});
