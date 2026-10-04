import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useSidebar } from '../../hooks/useSidebar';
import type { PageId } from '../../App';
import type { UserProfile } from '../../hooks/useAuth';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: PageId;
  onNavigate: (page: PageId, highlight?: string) => void;
  profile: UserProfile;
  onSignOut: () => void;
  isAdmin: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ children, currentPage, onNavigate, profile, onSignOut, isAdmin }) => {
  const { collapsed, toggle, mobileOpen, openMobile, closeMobile } = useSidebar();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar
        collapsed={collapsed} onToggle={toggle}
        mobileOpen={mobileOpen} onMobileClose={closeMobile}
        currentPage={currentPage} onNavigate={onNavigate}
        profile={profile} onSignOut={onSignOut} isAdmin={isAdmin}
      />
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <Header onMobileMenuOpen={openMobile} currentPage={currentPage} onNavigate={onNavigate} />
        <main className="flex-1 overflow-y-auto p-3 md:p-4 pb-8">
          {children}
        </main>
      </div>
    </div>
  );
};
