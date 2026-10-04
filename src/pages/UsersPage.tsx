import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Shield, User as UserIcon, X, Eye, EyeOff, Check, Crown, Pencil } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { supabase } from '../utils/supabase';
import { accessLevel, ACCESS_LABEL, type AccessLevel, type UserProfile } from '../hooks/useAuth';

async function callAdminUsers(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    // Surface the function's own error message when it sent one
    const detail = await (error as any).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  return data;
}

interface UsersPageProps {
  currentProfile: UserProfile;
}

export const UsersPage: React.FC<UsersPageProps> = ({ currentProfile }) => {
  const [users,      setUsers]      = useState<UserProfile[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [msg,        setMsg]        = useState('');

  // Form state
  const [fullName,   setFullName]   = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [role,       setRole]       = useState<AccessLevel>('user');
  const [showPw,     setShowPw]     = useState(false);

  // Super admins manage everyone; admins manage normal users only.
  // The database enforces the same rules (guard_user_profile_changes).
  const iAmSuper  = accessLevel(currentProfile) === 'superadmin';
  const grantable: AccessLevel[] = iAmSuper ? ['user', 'admin', 'superadmin'] : ['user'];
  const canManage = (u: UserProfile) => iAmSuper || u.role !== 'admin';

  const fetchUsers = async () => {
    const { data } = await supabase.from('user_profiles').select('*').order('created_at');
    if (data) setUsers(data as UserProfile[]);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);



  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setMsg('');
    try {
      // Login + profile are created server-side by the admin-users Edge Function
      await callAdminUsers({
        action: 'create',
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        level: role,
        role: role === 'user' ? 'user' : 'admin',
      });
      // Older copies of the helper only know admin/user — set the flag here too
      if (role === 'superadmin') {
        await supabase.from('user_profiles').update({ super_admin: true }).eq('email', email.trim());
      }

      setMsg(`✓ User "${fullName}" created successfully.`);
      await fetchUsers();
      setFullName(''); setEmail(''); setPassword(''); setRole('user'); setShowForm(false);
    } catch (err: any) {
      setMsg(`✗ ${err?.message ?? 'Failed to create user.'}`);
    } finally { setSaving(false); }
  };

  const handleUpdateRole = async (userId: string, level: AccessLevel) => {
    setMsg('');
    const patch = { role: level === 'user' ? 'user' : 'admin', super_admin: level === 'superadmin' } as const;
    const { error } = await supabase.from('user_profiles').update(patch).eq('id', userId);
    if (error) { setMsg(`✗ ${error.message}`); return; }
    setUsers(p => p.map(u => u.id === userId ? { ...u, ...patch } : u));
  };

  const handleRename = async (user: UserProfile) => {
    const next = window.prompt(`New name for ${user.full_name}:`, user.full_name)?.trim();
    if (!next || next === user.full_name) return;
    setMsg('');
    const { error } = await supabase.from('user_profiles').update({ full_name: next }).eq('id', user.id);
    if (error) { setMsg(`✗ ${error.message}`); return; }
    setUsers(p => p.map(u => u.id === user.id ? { ...u, full_name: next } : u));
    // The sidebar shows your own name — reload so it updates
    if (user.id === currentProfile.id) window.location.reload();
  };

  const handleDelete = async (user: UserProfile) => {
    if (!window.confirm(`Delete user "${user.full_name}"? They will lose access immediately.`)) return;
    setMsg('');
    try {
      // Remove the profile as the signed-in user first, so the database's
      // super admin rules apply even where an older helper is deployed…
      const { error: profErr } = await supabase.from('user_profiles').delete().eq('id', user.id);
      if (profErr) throw profErr;
      // …then the helper removes the login, so they really can't sign in
      await callAdminUsers({ action: 'delete', user_id: user.id });
      setUsers(p => p.filter(u => u.id !== user.id));
    } catch (err: any) {
      setMsg(`✗ ${err?.message ?? 'Failed to delete user.'}`);
    }
  };

  return (
    <div className="space-y-5 w-full pb-10">
      <PageHeader title="User Management" subtitle={`${users.length} users · Admin only`}
        actions={
          <button onClick={()=>setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200">
            <Plus size={14}/> Add User
          </button>
        }
      />

      {msg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium ${msg.startsWith('✓')?'bg-emerald-50 border-emerald-200 text-emerald-700':'bg-red-50 border-red-200 text-red-600'}`}>
          {msg}
        </div>
      )}

      {/* Users table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {['User','Email','Role','Created','Actions'].map(h=>(
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12 text-sm text-slate-400">Loading users...</td></tr>
            ) : users.map(u=>(
              <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-bold flex-shrink-0">
                      {u.full_name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{u.full_name}</p>
                      {u.id === currentProfile.id && <span className="text-xs text-blue-500 font-medium">You</span>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3"><p className="text-sm text-slate-600">{u.email}</p></td>
                <td className="px-4 py-3">
                  {u.id === currentProfile.id || !iAmSuper ? (
                    accessLevel(u) === 'superadmin' ? (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-purple-700 bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-full w-fit">
                        <Crown size={11}/> Super Admin
                      </span>
                    ) : u.role === 'admin' ? (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full w-fit">
                        <Shield size={11}/> Admin
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full w-fit">User</span>
                    )
                  ) : (
                    <select value={accessLevel(u)} onChange={e=>handleUpdateRole(u.id, e.target.value as AccessLevel)}
                      className={`text-xs font-bold px-2.5 py-1 rounded-full border cursor-pointer outline-none ${accessLevel(u)==='superadmin'?'bg-purple-100 text-purple-700 border-purple-200':u.role==='admin'?'bg-amber-100 text-amber-700 border-amber-200':'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="superadmin">Super Admin</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-3">
                  <p className="text-xs text-slate-500">{new Date(u.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {(u.id === currentProfile.id || canManage(u)) && (
                      <button onClick={()=>handleRename(u)} title="Edit name"
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">
                        <Pencil size={14}/>
                      </button>
                    )}
                    {u.id !== currentProfile.id && canManage(u) && (
                      <button onClick={()=>handleDelete(u)} title="Delete user"
                        className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 size={14}/>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Role info */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { role: 'Super Admin', icon: <Crown size={16}/>, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-100',
            perms: ['Everything an Admin can do','Create, promote and remove admins','Make other super admins','Can\'t be removed by admins','At least one always exists'] },
          { role: 'Admin', icon: <Shield size={16}/>, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100',
            perms: ['Full access to all modules','Create, edit, delete anything','Manage normal users','Access Transactions module','Cannot manage other admins'] },
          { role: 'User', icon: <UserIcon size={16}/>, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100',
            perms: ['Access all modules except Transactions','Create and edit proposals, leads, tasks','Cannot delete critical data','Cannot manage users','Cannot view Transactions'] },
        ].map(({role: r, icon, color, bg, perms})=>(
          <div key={r} className={`${bg} border rounded-2xl p-4`}>
            <div className={`flex items-center gap-2 mb-3 ${color}`}>{icon}<span className="text-sm font-bold">{r} Role</span></div>
            <ul className="space-y-1.5">
              {perms.map(p=>(
                <li key={p} className="flex items-center gap-2 text-xs text-slate-600">
                  <Check size={11} className={color}/>{p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Add user modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl shadow-2xl w-full max-w-md" style={{boxShadow:'0 24px 64px rgba(0,0,0,0.2)'}}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800" style={{fontFamily:"'Space Grotesk',sans-serif"}}>Add New User</h2>
              <button type="button" onClick={()=>{setFullName('');setEmail('');setPassword('');setRole('user');setShowForm(false);setMsg('');}} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={16} className="text-slate-500"/></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Full Name</label>
                <input value={fullName} onChange={e=>setFullName(e.target.value)} required placeholder="John Smith"
                  className="mt-1.5 w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-blue-400"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Email Address</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="name@example.com"
                  className="mt-1.5 w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-blue-400"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Password</label>
                <div className="relative mt-1.5">
                  <input type={showPw?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Min 6 characters"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 pr-10 text-sm outline-none focus:border-blue-400"/>
                  <button type="button" onClick={()=>setShowPw(s=>!s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {showPw?<EyeOff size={15}/>:<Eye size={15}/>}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Role</label>
                <div className="flex gap-2 mt-1.5">
                  {grantable.map(r=>(
                    <button key={r} type="button" onClick={()=>setRole(r)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${role===r?r==='superadmin'?'bg-purple-100 border-purple-300 text-purple-700':r==='admin'?'bg-amber-100 border-amber-300 text-amber-700':'bg-blue-100 border-blue-300 text-blue-700':'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                      {r==='superadmin'?<Crown size={14}/>:r==='admin'?<Shield size={14}/>:<UserIcon size={14}/>}
                      {ACCESS_LABEL[r]}
                    </button>
                  ))}
                </div>
                {!iAmSuper && <p className="text-xs text-slate-400 mt-1.5">Only a super admin can create admins.</p>}
              </div>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button type="button" onClick={()=>{setFullName('');setEmail('');setPassword('');setRole('user');setShowForm(false);setMsg('');}} className="flex-1 py-2.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 font-medium">Cancel</button>
              <button type="submit" disabled={saving||!fullName||!email||!password}
                className="flex-1 py-2.5 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-xl font-medium shadow-sm shadow-blue-200">
                {saving?'Creating...':'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
