import { useState, useEffect } from 'react';

const STORAGE_KEY = 'leadtracker_sidebar_collapsed';

export function useSidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    // Default collapsed on smaller screens
    if (stored !== null) return stored === 'true';
    return window.innerWidth < 1024;
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  const closeMobile = () => setMobileOpen(false);
  const openMobile = () => setMobileOpen(true);

  // Close mobile menu on resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { collapsed, toggle, mobileOpen, openMobile, closeMobile };
}
