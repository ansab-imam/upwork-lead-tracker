import React from 'react';

interface LogoProps {
  collapsed?: boolean;
  size?: number;
}

// Lead Tracker logo: node motif mark plus wordmark
export const Logo: React.FC<LogoProps> = ({ collapsed = false, size = 32 }) => {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        {/* Background */}
        <rect width="32" height="32" rx="8" fill="#2563EB" />
        {/* Hub center dot */}
        <circle cx="16" cy="16" r="3" fill="white" />
        {/* Spokes */}
        <line x1="16" y1="8" x2="16" y2="13" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <line x1="16" y1="19" x2="16" y2="24" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <line x1="8" y1="16" x2="13" y2="16" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <line x1="19" y1="16" x2="24" y2="16" stroke="white" strokeWidth="2" strokeLinecap="round" />
        {/* Diagonal spokes */}
        <line x1="10.5" y1="10.5" x2="13.9" y2="13.9" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        <line x1="18.1" y1="18.1" x2="21.5" y2="21.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        <line x1="21.5" y1="10.5" x2="18.1" y2="13.9" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        <line x1="13.9" y1="18.1" x2="10.5" y2="21.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        {/* Outer nodes */}
        <circle cx="16" cy="8" r="1.5" fill="white" opacity="0.9" />
        <circle cx="16" cy="24" r="1.5" fill="white" opacity="0.9" />
        <circle cx="8" cy="16" r="1.5" fill="white" opacity="0.9" />
        <circle cx="24" cy="16" r="1.5" fill="white" opacity="0.9" />
      </svg>
      {!collapsed && (
        <span
          className="font-display text-lg font-700 tracking-tight"
          style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}
        >
          <span className="text-blue-600">Lead</span>
          <span className="text-slate-800">Tracker</span>
        </span>
      )}
    </div>
  );
};

// Favicon-sized version (used in index.html via inline SVG)
export const faviconSVG = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="8" fill="#2563EB"/>
  <circle cx="16" cy="16" r="3" fill="white"/>
  <line x1="16" y1="8" x2="16" y2="13" stroke="white" stroke-width="2" stroke-linecap="round"/>
  <line x1="16" y1="19" x2="16" y2="24" stroke="white" stroke-width="2" stroke-linecap="round"/>
  <line x1="8" y1="16" x2="13" y2="16" stroke="white" stroke-width="2" stroke-linecap="round"/>
  <line x1="19" y1="16" x2="24" y2="16" stroke="white" stroke-width="2" stroke-linecap="round"/>
  <circle cx="16" cy="8" r="1.5" fill="white" opacity="0.9"/>
  <circle cx="16" cy="24" r="1.5" fill="white" opacity="0.9"/>
  <circle cx="8" cy="16" r="1.5" fill="white" opacity="0.9"/>
  <circle cx="24" cy="16" r="1.5" fill="white" opacity="0.9"/>
</svg>`;
