import { useState, useEffect, useCallback } from 'react';
import { setActivityUser, logActivity } from './useActivityLog';
import { supabase } from '../utils/supabase';
import type { User } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'user';
  created_at: string;
  created_by?: string;
  // Admins who also manage other admins (see super_admin migration)
  super_admin?: boolean;
}

export type AccessLevel = 'user' | 'admin' | 'superadmin';

export function accessLevel(p: Pick<UserProfile, 'role' | 'super_admin'>): AccessLevel {
  if (p.role !== 'admin') return 'user';
  return p.super_admin ? 'superadmin' : 'admin';
}

export const ACCESS_LABEL: Record<AccessLevel, string> = { user: 'User', admin: 'Admin', superadmin: 'Super Admin' };

export const SETUP_MISSING_MSG =
  "This Lead Tracker database isn't set up yet. Run supabase/setup.sql in the Supabase SQL Editor (see SETUP.md), then sign in again.";

// PostgREST / Postgres codes for "table or function doesn't exist"
export function isMissingSetup(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code ?? '')
    || /could not find the (table|function)|does not exist|schema cache/i.test(error.message ?? '');
}

export function useAuth() {
  const [user,    setUser]    = useState<User | null>(null);
  const _profileRef = { current: null as UserProfile | null };
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle();
      if (error) {
        console.error('fetchProfile error:', error.message);
        if (isMissingSetup(error)) throw new Error(SETUP_MISSING_MSG);
        return null;
      }
      if (data) { setProfile(data as UserProfile); _profileRef.current = data as UserProfile; setActivityUser((data as UserProfile).id, (data as UserProfile).full_name, (data as UserProfile).email); }
      return data as UserProfile | null;
    } catch (e) {
      if (e instanceof Error && e.message === SETUP_MISSING_MSG) throw e;
      console.error('fetchProfile exception:', e); return null;
    }
  };

  useEffect(() => {
    // Get current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id).catch(() => {}).finally(() => setLoading(false));
      else setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) await fetchProfile(session.user.id).catch(() => {});
      else { setProfile(null); setActivityUser('', '', ''); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      let prof: UserProfile | null;
      try { prof = await fetchProfile(data.user.id); }
      catch (e) { await supabase.auth.signOut(); throw e; }
      // If no profile exists yet, create a default one. The database makes the
      // very first user of a brand-new install an admin; everyone else is a user.
      if (!prof) {
        const { error: insErr } = await supabase.from('user_profiles').insert({
          id: data.user.id,
          email: data.user.email ?? email,
          full_name: data.user.user_metadata?.full_name ?? email.split('@')[0],
          role: 'user',
        });
        if (insErr) console.error('create profile error:', insErr.message);
        await fetchProfile(data.user.id);
      }
    }
    return data;
  }, []);

  const signOut = useCallback(async () => {
    if (_profileRef.current) logActivity('signed_out','System','Session',`${_profileRef.current.full_name} signed out`);
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  const isAdmin = profile?.role === 'admin';

  return { user, profile, loading, signIn, signOut, isAdmin };
}
