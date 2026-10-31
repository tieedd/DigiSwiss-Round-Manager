import React from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  message,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center text-center p-6 my-4 ${className}`}>
      <div className="w-12 h-12 rounded-full bg-dark-surface-high border border-dark-border flex items-center justify-center text-dark-muted mb-3">
        <Icon size={24} className="stroke-[1.5]" />
      </div>
      <p className="text-body text-dark-muted max-w-xs mb-4">{message}</p>
      {actionLabel && onAction && (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
