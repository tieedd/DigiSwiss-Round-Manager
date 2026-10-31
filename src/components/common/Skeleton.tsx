import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'rect' | 'circle' | 'text';
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rect',
  width,
  height,
}) => {
  const variantClass =
    variant === 'circle'
      ? 'rounded-full'
      : variant === 'text'
      ? 'rounded h-4 my-1'
      : 'rounded-btn';

  return (
    <div
      style={{ width, height }}
      className={`bg-dark-surface-high/60 animate-pulse ${variantClass} ${className}`}
    />
  );
};
