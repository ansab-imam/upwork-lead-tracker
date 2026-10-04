import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg' | 'none';
  hoverable?: boolean;
}

const paddingMap = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padding = 'md',
  hoverable = false,
}) => {
  return (
    <div
      className={`
        bg-white rounded-2xl border border-slate-100
        ${paddingMap[padding]}
        ${hoverable ? 'hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer' : ''}
        ${className}
      `}
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
    >
      {children}
    </div>
  );
};
