import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'surface' | 'surface-high';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'surface',
  padding = 'md',
  className = '',
  ...props
}) => {
  const bgClass = variant === 'surface-high' ? 'bg-dark-surface-high' : 'bg-dark-surface';

  const paddingClasses = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-4', // 16px standar
    lg: 'p-5',
  };

  return (
    <div
      className={`rounded-card border border-dark-border ${bgClass} ${paddingClasses[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
