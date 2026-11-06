import React, { useState, useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
import {
  AppTheme,
  getCurrentTheme,
  applyThemeToDom
} from '../../utils/themeLogic';

export interface ThemeToggleProps {
  className?: string;
  showText?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = '',
  showText = false
}) => {
  const [theme, setTheme] = useState<AppTheme>('dark');

  useEffect(() => {
    setTheme(getCurrentTheme());
  }, []);

  const toggleTheme = () => {
    const nextTheme: AppTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    applyThemeToDom(nextTheme);
  };

  const isDark = theme === 'dark';

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      {showText && (
        <span className="text-body font-medium text-dark-text select-none">
          {isDark ? 'Mode Gelap' : 'Mode Terang'}
        </span>
      )}

      {/* Button wrapper ensuring min 44x44px touch target */}
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label="Alihkan tema terang atau gelap"
        title={isDark ? 'Beralih ke mode terang' : 'Beralih ke mode gelap'}
        onClick={toggleTheme}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {/* Switch Track */}
        <div
          className={`w-12 h-7 rounded-full p-0.5 flex items-center transition-colors duration-150 ${
            isDark ? 'bg-dark-surface-high border border-dark-border' : 'bg-amber-100 border border-amber-300'
          }`}
        >
          {/* Switch Knob with 150ms transform transition */}
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center shadow-sm transition-transform duration-150 transform ${
              isDark
                ? 'translate-x-0 bg-dark-surface text-accent'
                : 'translate-x-5 bg-white text-amber-600'
            }`}
          >
            {isDark ? (
              <Moon size={13} className="stroke-[2]" />
            ) : (
              <Sun size={13} className="stroke-[2]" />
            )}
          </div>
        </div>
      </button>
    </div>
  );
};
