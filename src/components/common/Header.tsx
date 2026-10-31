import React from 'react';
import { OnlineIndicator } from './OnlineIndicator';

interface HeaderProps {
  title?: string;
  actions?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'DigiSwiss-Round',
  actions
}) => {
  return (
    <header className="sticky top-0 z-30 w-full bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border safe-top">
      <div className="h-14 px-4 flex items-center justify-between max-w-md mx-auto">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-page-title text-dark-text truncate font-semibold">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <OnlineIndicator showText={false} />
          {actions}
        </div>
      </div>
    </header>
  );
};
