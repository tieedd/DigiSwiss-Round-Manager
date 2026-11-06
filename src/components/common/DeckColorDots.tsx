import React, { useState, useEffect, useRef } from 'react';
import {
  DeckColor,
  DECK_COLOR_HEX,
  getDeckColorLabel
} from '../../utils/deckExportLogic';

export interface DeckColorDotsProps {
  colors?: (DeckColor | string)[] | null;
  size?: 'sm' | 'md' | 'lg';
  maxVisible?: number;
  showLabels?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: 12,
  md: 14,
  lg: 18
};

export const DeckColorDots: React.FC<DeckColorDotsProps> = ({
  colors,
  size = 'sm',
  maxVisible = 4,
  showLabels = false,
  className = ''
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!colors || !Array.isArray(colors) || colors.length === 0) {
    return null;
  }

  const label = getDeckColorLabel(colors);
  const sizePx = SIZE_MAP[size] || 12;
  const overlapPx = Math.max(2, Math.round(sizePx * 0.25)); // ~25% overlap
  const visibleColors = colors.slice(0, maxVisible);
  const hiddenCount = colors.length - maxVisible;

  const handleTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowTooltip(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setShowTooltip(false);
    }, 3000);
  };

  const renderDot = (c: string, index: number, isStandalone = false) => {
    const hex = DECK_COLOR_HEX[c as DeckColor] || '#94A3B8';
    const isHitam = c === 'Hitam';
    const isPutih = c === 'Putih';

    return (
      <span
        key={`${c}-${index}`}
        className="rounded-full flex-shrink-0 relative select-none"
        style={{
          width: `${sizePx}px`,
          height: `${sizePx}px`,
          backgroundColor: hex,
          marginLeft: !isStandalone && index > 0 ? `-${overlapPx}px` : undefined,
          boxShadow: isHitam
            ? '0 0 0 1.5px var(--c-dot-ring, #121821), inset 0 0 0 1px #94A3B8'
            : isPutih
            ? '0 0 0 1.5px var(--c-dot-ring, #121821), inset 0 0 0 1px #CBD5E1'
            : '0 0 0 1.5px var(--c-dot-ring, #121821)',
          zIndex: visibleColors.length - index
        }}
      />
    );
  };

  if (showLabels) {
    return (
      <div
        role="img"
        aria-label={`Warna deck: ${label}`}
        title={label}
        className={`inline-flex flex-wrap items-center gap-2 ${className}`}
      >
        {colors.map((c, idx) => (
          <span key={`${c}-${idx}`} className="inline-flex items-center gap-1.5 text-caption">
            {renderDot(c, idx, true)}
            <span className="text-[11px] font-medium text-dark-text">{c}</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={`Warna deck: ${label}`}
      title={label}
      onClick={handleTap}
      className={`relative inline-flex items-center cursor-pointer select-none py-0.5 ${className}`}
    >
      <div className="inline-flex items-center">
        {visibleColors.map((c, idx) => renderDot(c, idx))}

        {hiddenCount > 0 && (
          <span
            className="flex-shrink-0 rounded-full bg-dark-surface-high border border-dark-border text-dark-muted font-mono font-bold flex items-center justify-center text-[9px] px-1"
            style={{
              height: `${sizePx}px`,
              marginLeft: `-${overlapPx}px`,
              zIndex: 0
            }}
          >
            +{hiddenCount}
          </span>
        )}
      </div>

      {/* Tooltip sementara 3 detik pada tap/klik */}
      {showTooltip && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 bg-dark-bg/95 border border-dark-border text-dark-text rounded text-[10px] font-medium whitespace-nowrap shadow-lg pointer-events-none z-50 animate-fade-in"
        >
          {label}
        </div>
      )}
    </div>
  );
};
