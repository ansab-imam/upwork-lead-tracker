import React from 'react';
import { ChevronLeft, ChevronRight, X, LogOut, Shield, DatabaseBackup } from 'lucide-react';
import { accessLevel, type UserProfile } from '../../hooks/useAuth';
import { Logo } from '../../assets/logo';
import { NAV_ITEMS } from '../../utils/navigation';
import type { PageId } from '../../App';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  currentPage: PageId;
  onNavigate: (page: PageId, highlight?: string) => void;
  profile: UserProfile;
  onSignOut: () => void;
  isAdmin: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed, onToggle, mobileOpen, onMobileClose, currentPage, onNavigate,
  profile, onSignOut, isAdmin,
}) => {
  const navContent = (forceExpanded = false) => {
    const isCollapsed = collapsed && !forceExpanded;
    return (
      <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden flex flex-col">
        <div className="px-2 space-y-0.5 flex-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <div key={item.id} className="relative group">
                <button
                  onClick={() => { onNavigate(item.id); onMobileClose(); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer select-none text-left
                    ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}
                    ${isCollapsed ? 'justify-center' : ''}`}>
                  {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-blue-600 rounded-r-full" />}
                  <Icon size={18} className={`flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </button>
                {isCollapsed && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                    {item.label}
                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Users — admin only */}
          {isAdmin && (() => {
            const isActive = currentPage === 'users';
            return (
              <button
                onClick={() => { onNavigate('users'); onMobileClose(); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all mt-1
                  ${isActive ? 'bg-amber-50 text-amber-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}
                  ${isCollapsed ? 'justify-center' : ''}`}>
                <Shield size={18} className={isActive ? 'text-amber-600' : 'text-slate-400'} />
                {!isCollapsed && <span>Users</span>}
              </button>
            );
          })()}

          {/* Backup & Restore — admin only */}
          {isAdmin && (() => {
            const isActive = currentPage === 'backup';
            return (
              <button
                onClick={() => { onNavigate('backup'); onMobileClose(); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all mt-1
                  ${isActive ? 'bg-amber-50 text-amber-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}
                  ${isCollapsed ? 'justify-center' : ''}`}>
                <DatabaseBackup size={18} className={isActive ? 'text-amber-600' : 'text-slate-400'} />
                {!isCollapsed && <span>Backup &amp; Restore</span>}
              </button>
            );
          })()}
        </div>

        {/* User info + sign out */}
        {!isCollapsed && (
          <div className="px-2 pt-3 mt-2 border-t border-slate-100">
            <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
              <div className="w-8 h-8 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0">
                {profile.full_name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">{profile.full_name}</p>
                <p className="text-xs text-slate-400">
                  {accessLevel(profile) === 'superadmin' ? '👑 Super Admin' : profile.role === 'admin' ? '⚡ Admin' : 'User'}
                </p>
              </div>
            </div>
            <button onClick={onSignOut}
              className="w-full flex items-center gap-2 px-2 py-2 text-xs text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors font-medium">
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        )}
        {isCollapsed && (
          <div className="px-2 pb-2">
            <button onClick={onSignOut} title="Sign Out"
              className="w-full flex items-center justify-center p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        )}
      </nav>
    );
  };

  return (
    <>
      {/* Desktop */}
      <aside className={`hidden md:flex flex-col h-full bg-white border-r border-slate-100 sidebar-transition overflow-hidden flex-shrink-0 ${collapsed ? 'w-16' : 'w-60'}`}
        style={{ boxShadow: '2px 0 12px rgba(0,0,0,0.04)' }}>
        <div className={`flex items-center h-16 px-4 border-b border-slate-100 flex-shrink-0 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          <Logo collapsed={collapsed} />
          {!collapsed && (
            <button onClick={onToggle} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
              <ChevronLeft size={16} />
            </button>
          )}
        </div>
        {navContent()}
        {collapsed && (
          <div className="flex-shrink-0 px-2 pb-3">
            <button onClick={onToggle} className="w-full flex items-center justify-center p-2.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onMobileClose} />
          <aside className="relative flex flex-col h-full bg-white shadow-xl w-60">
            <div className="flex items-center justify-between h-16 px-4 border-b border-slate-100">
              <Logo collapsed={false} />
              <button onClick={onMobileClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50">
                <X size={18} />
              </button>
            </div>
            {navContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
