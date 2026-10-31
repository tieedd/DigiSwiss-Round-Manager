import React from 'react';

export type StatusVariant = 'green' | 'yellow' | 'red' | 'neutral';

interface StatusBadgeProps {
  label: string;
  variant?: StatusVariant;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  variant = 'neutral',
  className = '',
}) => {
  const dotColor = {
    green: 'bg-status-green',
    yellow: 'bg-status-yellow',
    red: 'bg-status-red',
    neutral: 'bg-dark-muted',
  }[variant];

  const textColor = {
    green: 'text-status-green',
    yellow: 'text-status-yellow',
    red: 'text-status-red',
    neutral: 'text-dark-muted',
  }[variant];

  return (
    <span className={`inline-flex items-center gap-1.5 text-caption font-medium ${textColor} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span>{label}</span>
    </span>
  );
};
