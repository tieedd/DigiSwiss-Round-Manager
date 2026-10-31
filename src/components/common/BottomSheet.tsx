import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Sheet Content */}
      <div className="relative z-10 w-full max-w-md mx-auto bg-dark-surface border-t border-dark-border rounded-t-[16px] p-4 safe-bottom transition-transform duration-200 transform translate-y-0 shadow-none">
        {/* Drag handle pill */}
        <div className="w-10 h-1 bg-dark-border rounded-full mx-auto mb-3" />

        <div className="flex items-center justify-between pb-3 mb-3 border-b border-dark-border">
          <h3 className="text-section-title text-dark-text font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-dark-muted hover:text-dark-text min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2"
            aria-label="Tutup"
          >
            <X size={20} className="stroke-[1.5]" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};
