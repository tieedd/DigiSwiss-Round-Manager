import React, { useState, useEffect, useMemo } from 'react';
import { Tournament, TournamentFormat } from '../../types';
import { BottomSheet } from '../common/BottomSheet';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import {
  computeTournamentChanges,
  getEditableFieldsForStatus,
  getTodayDateString,
  TournamentFormValues,
  validateTournamentFormInput,
} from '../../utils/tournamentEditLogic';
import { ArrowRight, Copy, Lock } from 'lucide-react';

export type TournamentFormMode = 'create' | 'edit' | 'duplicate';

export interface TournamentFormSheetProps {
  isOpen: boolean;
  mode: TournamentFormMode;
  initialValues?: Partial<TournamentFormValues>;
  sourceTournament?: Tournament | null;
  isLoading?: boolean;
  errorMessage?: string;
  zIndexClass?: string;
  onClose: () => void;
  onSubmit: (values: TournamentFormValues) => Promise<void> | void;
}

export const TournamentFormSheet: React.FC<TournamentFormSheetProps> = ({
  isOpen,
  mode,
  initialValues,
  sourceTournament,
  isLoading = false,
  errorMessage = '',
  zIndexClass = 'z-50',
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [date, setDate] = useState(() => getTodayDateString());
  const [location, setLocation] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('BO3');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    if (mode === 'edit' && sourceTournament) {
      setName(sourceTournament.name || '');
      setDate(sourceTournament.date || getTodayDateString());
      setLocation(sourceTournament.location || '');
      setFormat(sourceTournament.format || 'BO3');
    } else if (mode === 'duplicate' && sourceTournament) {
      setName(initialValues?.name ?? sourceTournament.name ?? '');
      setDate(initialValues?.date ?? getTodayDateString());
      setLocation(initialValues?.location ?? sourceTournament.location ?? '');
      setFormat(initialValues?.format ?? sourceTournament.format ?? 'BO3');
    } else {
      setName(initialValues?.name ?? '');
      setDate(initialValues?.date ?? getTodayDateString());
      setLocation(initialValues?.location ?? '');
      setFormat(initialValues?.format ?? 'BO3');
    }
    setLocalError('');
  }, [isOpen, mode, sourceTournament?.id, initialValues?.name, initialValues?.date, initialValues?.location, initialValues?.format]);

  const permissions = useMemo(() => {
    if (mode === 'edit' && sourceTournament) {
      return getEditableFieldsForStatus(sourceTournament.status);
    }
    return getEditableFieldsForStatus('registration');
  }, [mode, sourceTournament]);

  const editPlan = useMemo(() => {
    if (mode !== 'edit' || !sourceTournament) return null;
    return computeTournamentChanges(sourceTournament, {
      name,
      date,
      location,
      format,
    });
  }, [mode, sourceTournament, name, date, location, format]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const values: TournamentFormValues = {
      name,
      date,
      location,
      format: permissions.canEditFormat ? format : sourceTournament?.format || format,
    };

    const validation = validateTournamentFormInput(values);
    if (!validation.valid) {
      setLocalError(validation.error || 'Data turnamen tidak valid.');
      return;
    }

    if (mode === 'edit' && editPlan && !editPlan.hasChanges) {
      return;
    }

    setLocalError('');
    await onSubmit(validation.sanitized);
  };

  const title =
    mode === 'edit'
      ? 'Edit Turnamen'
      : mode === 'duplicate'
      ? 'Duplikat Turnamen'
      : 'Buat Turnamen Baru';

  const submitLabel =
    mode === 'edit'
      ? 'Simpan Perubahan'
      : mode === 'duplicate'
      ? 'Simpan & Buat Duplikat'
      : 'Simpan & Buat Turnamen';

  const displayedError = localError || errorMessage;
  const isSubmitDisabled =
    isLoading || (mode === 'edit' && Boolean(editPlan && !editPlan.hasChanges));

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={() => {
        if (!isLoading) onClose();
      }}
      title={title}
      zIndexClass={zIndexClass}
    >
      <form onSubmit={handleFormSubmit} className="flex flex-col gap-3 py-1">
        {mode === 'duplicate' && (
          <div className="p-2.5 rounded-btn bg-accent/10 border border-accent/20 text-caption text-accent flex items-start gap-2">
            <Copy size={15} className="flex-shrink-0 mt-0.5" />
            <span>
              Membuat turnamen baru berstatus <strong>Pendaftaran</strong> dengan Kode Gabung baru. Peserta, ronde, pertandingan, dan deck tidak disalin.
            </span>
          </div>
        )}

        <Input
          label="Nama Turnamen"
          placeholder="Contoh: Digimon Evolution Cup 2026"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (localError) setLocalError('');
          }}
          disabled={isLoading}
          maxLength={50}
        />

        <Input
          label="Tanggal Turnamen"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            if (localError) setLocalError('');
          }}
          disabled={isLoading}
        />

        <Input
          label="Lokasi Turnamen"
          placeholder="Contoh: Arcanum Game Store, Jakarta"
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            if (localError) setLocalError('');
          }}
          disabled={isLoading}
          maxLength={60}
        />

        {/* Pemilihan Format (BO1 atau BO3 saja, terkunci bila status running/finished saat edit) */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-caption font-medium text-dark-text">
              Format Pertandingan
            </label>
            {permissions.isFormatLocked && (
              <span className="inline-flex items-center gap-1 text-[11px] text-status-yellow font-medium">
                <Lock size={12} />
                Terkunci
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isLoading || !permissions.canEditFormat}
              onClick={() => {
                if (permissions.canEditFormat) setFormat('BO1');
              }}
              className={`min-h-[44px] rounded-btn border text-caption font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                format === 'BO1'
                  ? 'border-accent bg-accent/10 text-accent font-semibold'
                  : 'border-dark-border bg-dark-surface-high text-dark-muted hover:text-dark-text'
              }`}
            >
              Best of 1 (BO1 - 25 Menit)
            </button>
            <button
              type="button"
              disabled={isLoading || !permissions.canEditFormat}
              onClick={() => {
                if (permissions.canEditFormat) setFormat('BO3');
              }}
              className={`min-h-[44px] rounded-btn border text-caption font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                format === 'BO3'
                  ? 'border-accent bg-accent/10 text-accent font-semibold'
                  : 'border-dark-border bg-dark-surface-high text-dark-muted hover:text-dark-text'
              }`}
            >
              Best of 3 (BO3 - 45 Menit)
            </button>
          </div>
          {permissions.isFormatLocked && permissions.formatLockReason ? (
            <p className="text-[11px] text-status-yellow mt-0.5 flex items-start gap-1">
              <Lock size={12} className="flex-shrink-0 mt-0.5" />
              <span>{permissions.formatLockReason}</span>
            </p>
          ) : (
            <p className="text-[11px] text-dark-muted mt-0.5">
              *Jumlah ronde akan ditentukan otomatis oleh sistem berdasarkan total peserta saat turnamen dimulai.
            </p>
          )}
        </div>

        {/* Ringkasan Perubahan saat Edit */}
        {mode === 'edit' && editPlan && (
          <div className="p-2.5 rounded-btn bg-dark-surface-high border border-dark-border flex flex-col gap-1.5 text-caption">
            <span className="font-semibold text-dark-text">Ringkasan Perubahan</span>
            {editPlan.hasChanges ? (
              <div className="flex flex-col gap-1">
                {editPlan.changes.map((c) => (
                  <div
                    key={c.field}
                    className="flex items-center justify-between gap-2 text-[11px] py-0.5 border-b border-dark-border/50 last:border-b-0"
                  >
                    <span className="text-dark-muted flex-shrink-0">{c.label}:</span>
                    <span className="flex items-center gap-1 min-w-0 justify-end text-right">
                      <span className="text-status-red line-through truncate max-w-[95px]">
                        {c.oldValue}
                      </span>
                      <ArrowRight size={11} className="text-dark-muted flex-shrink-0" />
                      <span className="text-status-green font-medium truncate max-w-[110px]">
                        {c.newValue}
                      </span>
                    </span>
                  </div>
                ))}
                {editPlan.needsParticipationSync && (
                  <p className="text-[11px] text-accent mt-1">
                    Perubahan nama/tanggal juga akan memperbarui catatan riwayat & statistik peserta.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-dark-muted">
                Belum ada perubahan data. Ubah minimal satu kolom untuk menyimpan.
              </p>
            )}
          </div>
        )}

        {displayedError && (
          <p className="text-caption text-status-red text-center py-1">{displayedError}</p>
        )}

        <div className="flex flex-col gap-2 mt-2">
          <Button
            variant="primary"
            fullWidth
            type="submit"
            isLoading={isLoading}
            disabled={isSubmitDisabled}
          >
            {submitLabel}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            type="button"
            onClick={onClose}
            disabled={isLoading}
          >
            Batal
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
};
