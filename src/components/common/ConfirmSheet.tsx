import React from 'react';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

export interface ConfirmSheetProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger';
  isLoading?: boolean;
  zIndexClass?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmSheet: React.FC<ConfirmSheetProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Batal',
  variant = 'primary',
  isLoading = false,
  zIndexClass = 'z-[60]',
  onConfirm,
  onCancel,
}) => {
  const handleClose = () => {
    if (isLoading) return;
    onCancel();
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      zIndexClass={zIndexClass}
    >
      <div className="flex flex-col gap-4 py-1">
        <div className="text-body text-dark-text leading-relaxed">{message}</div>

        <div className="flex flex-col gap-2">
          <Button
            variant={variant}
            fullWidth
            type="button"
            isLoading={isLoading}
            disabled={isLoading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            type="button"
            disabled={isLoading}
            onClick={handleClose}
          >
            {cancelLabel}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
};
