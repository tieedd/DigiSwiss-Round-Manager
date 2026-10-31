import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  fullWidth = false,
  isLoading = false,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses =
    'relative inline-flex items-center justify-center font-medium rounded-btn min-h-[48px] px-4 py-2.5 text-body transition-all duration-150 focus:outline-none select-none disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary:
      'bg-accent text-[#0B0F14] font-semibold hover:bg-accent-hover active:bg-accent-active',
    secondary:
      'bg-dark-surface text-dark-text border border-dark-border hover:bg-dark-surface-high hover:border-dark-border active:bg-dark-surface',
    text:
      'bg-transparent text-dark-muted hover:text-dark-text active:text-accent',
    danger:
      'bg-status-red/10 text-status-red border border-status-red/30 hover:bg-status-red/20 active:bg-status-red/30',
  };

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${widthClass} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="inline-flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>Memuat...</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-2">
          {icon && <span className="flex-shrink-0">{icon}</span>}
          <span>{children}</span>
        </span>
      )}
    </button>
  );
};
