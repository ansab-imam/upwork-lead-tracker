import React, { useState } from 'react';
import { Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';

interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onLogin(email.trim(), password);
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err?.message?.includes('Invalid') || err?.message?.includes('invalid') ? 'Incorrect email or password.' : (err?.message ?? 'Login failed. Check console for details.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
            <span className="text-white text-2xl font-black" style={{fontFamily:"'Space Grotesk',sans-serif"}}>L</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800" style={{fontFamily:"'Space Grotesk',sans-serif"}}>Lead Tracker</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your workspace</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm" style={{boxShadow:'0 4px 24px rgba(0,0,0,0.06)'}}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</label>
              <input
                type="email" value={email} onChange={e=>setEmail(e.target.value)} required
                placeholder="you@example.com" autoComplete="email" autoFocus
                className="mt-1.5 w-full border border-slate-200 rounded-xl px-3.5 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Password</label>
              <div className="relative mt-1.5">
                <input
                  type={showPw ? 'text' : 'password'} value={password} onChange={e=>setPassword(e.target.value)} required
                  placeholder="••••••••" autoComplete="current-password"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-3 pr-10 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                />
                <button type="button" onClick={()=>setShowPw(s=>!s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                <AlertCircle size={14} className="text-red-500 flex-shrink-0"/>
                <p className="text-xs text-red-600 font-medium">{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading || !email || !password}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm shadow-blue-200">
              {loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Signing in...</> : <><LogIn size={16}/>Sign In</>}
            </button>
          </form>
        </div>

        <p className="text-xs text-slate-400 text-center mt-6">
          Access is by invitation only. Contact your administrator.
        </p>
      </div>
    </div>
  );
};
