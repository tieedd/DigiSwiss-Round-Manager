import React, { useState, useEffect, useMemo } from 'react';
import { Tournament, TournamentFormat, TournamentType } from '../../types';
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
import {
  checkUniqueLeagueSeasonNumber,
  computeNextSeasonNumber,
  extractYearMonthFromDate,
  formatSeasonLabel,
  getTournamentType,
  INDONESIAN_MONTH_OPTIONS,
} from '../../utils/seasonLogic';
import { ArrowRight, Copy, Lock, Trophy } from 'lucide-react';

export type TournamentFormMode = 'create' | 'edit' | 'duplicate';

export interface TournamentFormSheetProps {
  isOpen: boolean;
  mode: TournamentFormMode;
  tournamentType?: TournamentType;
  organizerId?: string;
  existingTournaments?: ReadonlyArray<
    Pick<Tournament, 'id' | 'name' | 'organizerId' | 'type' | 'season'>
  >;
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
  tournamentType,
  organizerId,
  existingTournaments = [],
  initialValues,
  sourceTournament,
  isLoading = false,
  errorMessage = '',
  zIndexClass = 'z-50',
  onClose,
  onSubmit,
}) => {
  const resolvedType: TournamentType =
    mode === 'edit' || mode === 'duplicate'
      ? getTournamentType(sourceTournament)
      : tournamentType || initialValues?.type || 'regular';
  const isLeague = resolvedType === 'league';

  const effectiveOrganizerId =
    (mode === 'edit'
      ? sourceTournament?.organizerId || organizerId
      : organizerId || sourceTournament?.organizerId) || '';

  const autoNextSeasonNumber = useMemo(
    () => computeNextSeasonNumber(existingTournaments, effectiveOrganizerId),
    [existingTournaments, effectiveOrganizerId]
  );

  const [name, setName] = useState('');
  const [date, setDate] = useState(() => getTodayDateString());
  const [location, setLocation] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('BO3');

  // State khusus Season (Turnamen Liga)
  const [seasonNumberStr, setSeasonNumberStr] = useState('1');
  const [seasonMonth, setSeasonMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [seasonYearStr, setSeasonYearStr] = useState<string>(() =>
    String(new Date().getFullYear())
  );
  const [monthYearManual, setMonthYearManual] = useState(false);

  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const today = getTodayDateString();
    let initName = '';
    let initDate = today;
    let initLocation = '';
    let initFormat: TournamentFormat = isLeague ? 'BO3' : 'BO3';

    if (mode === 'edit' && sourceTournament) {
      initName = sourceTournament.name || '';
      initDate = sourceTournament.date || today;
      initLocation = sourceTournament.location || '';
      initFormat = isLeague ? 'BO3' : sourceTournament.format || 'BO3';
    } else if (mode === 'duplicate' && sourceTournament) {
      initName = initialValues?.name ?? sourceTournament.name ?? '';
      initDate = initialValues?.date ?? today;
      initLocation = initialValues?.location ?? sourceTournament.location ?? '';
      initFormat = isLeague
        ? 'BO3'
        : initialValues?.format ?? sourceTournament.format ?? 'BO3';
    } else {
      initName = initialValues?.name ?? '';
      initDate = initialValues?.date ?? today;
      initLocation = initialValues?.location ?? '';
      initFormat = isLeague ? 'BO3' : initialValues?.format ?? 'BO3';
    }

    setName(initName);
    setDate(initDate);
    setLocation(initLocation);
    setFormat(initFormat);

    if (isLeague) {
      const fromDate = extractYearMonthFromDate(initDate);
      if (mode === 'edit' && sourceTournament?.season) {
        setSeasonNumberStr(String(sourceTournament.season.number));
        setSeasonMonth(sourceTournament.season.month);
        setSeasonYearStr(String(sourceTournament.season.year));
      } else {
        setSeasonNumberStr(String(autoNextSeasonNumber));
        setSeasonMonth(initialValues?.season?.month ?? fromDate.month);
        setSeasonYearStr(String(initialValues?.season?.year ?? fromDate.year));
      }
      setMonthYearManual(mode === 'edit');
    } else {
      setMonthYearManual(false);
    }

    setLocalError('');
  }, [
    isOpen,
    mode,
    resolvedType,
    sourceTournament?.id,
    initialValues?.name,
    initialValues?.date,
    initialValues?.location,
    initialValues?.format,
    initialValues?.season?.month,
    initialValues?.season?.year,
  ]);

  // Sinkronkan pratinjau nomor season otomatis saat daftar liga organizer selesai dimuat
  useEffect(() => {
    if (!isOpen || !isLeague || mode === 'edit') return;
    setSeasonNumberStr(String(autoNextSeasonNumber));
  }, [isOpen, isLeague, mode, autoNextSeasonNumber]);

  const parsedSeason = useMemo(() => {
    const num = Number(seasonNumberStr);
    const yr = Number(seasonYearStr);
    return {
      number: Number.isFinite(num) ? Math.trunc(num) : NaN,
      month: seasonMonth,
      year: Number.isFinite(yr) ? Math.trunc(yr) : NaN,
    };
  }, [seasonNumberStr, seasonMonth, seasonYearStr]);

  const seasonPreviewLabel = useMemo(
    () => (isLeague ? formatSeasonLabel(parsedSeason) : null),
    [isLeague, parsedSeason]
  );

  const permissions = useMemo(() => {
    if (mode === 'edit' && sourceTournament) {
      return getEditableFieldsForStatus(sourceTournament.status, resolvedType);
    }
    return getEditableFieldsForStatus('registration', resolvedType);
  }, [mode, sourceTournament, resolvedType]);

  const editPlan = useMemo(() => {
    if (mode !== 'edit' || !sourceTournament) return null;
    return computeTournamentChanges(sourceTournament, {
      name,
      date,
      location,
      format: isLeague ? 'BO3' : format,
      ...(isLeague ? { type: 'league' as const, season: parsedSeason } : {}),
    });
  }, [mode, sourceTournament, name, date, location, format, isLeague, parsedSeason]);

  const handleNameChange = (nextName: string) => {
    setName(nextName);
    if (localError) setLocalError('');
  };

  const handleDateChange = (nextDate: string) => {
    setDate(nextDate);
    if (isLeague && mode !== 'edit' && !monthYearManual) {
      const fromDate = extractYearMonthFromDate(nextDate);
      setSeasonMonth(fromDate.month);
      setSeasonYearStr(String(fromDate.year));
    }
    if (localError) setLocalError('');
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const values: TournamentFormValues = {
      name,
      date,
      location,
      format: isLeague
        ? 'BO3'
        : permissions.canEditFormat
        ? format
        : sourceTournament?.format || format,
      ...(isLeague ? { type: 'league' as const, season: parsedSeason } : {}),
    };

    const validation = validateTournamentFormInput(values);
    if (!validation.valid) {
      setLocalError(validation.error || 'Data turnamen tidak valid.');
      return;
    }

    if (
      mode === 'edit' &&
      isLeague &&
      permissions.canEditSeasonNumber &&
      sourceTournament &&
      validation.sanitized.season &&
      validation.sanitized.season.number !== sourceTournament.season?.number &&
      existingTournaments.length > 0
    ) {
      const uniq = checkUniqueLeagueSeasonNumber({
        seasonNumber: validation.sanitized.season.number,
        organizerLeagues: existingTournaments,
        organizerId: effectiveOrganizerId,
        excludeTournamentId: sourceTournament.id,
      });
      if (!uniq.unique) {
        setLocalError(
          uniq.error ||
            `Season ${validation.sanitized.season.number} sudah dipakai di liga lain milik Anda.`
        );
        return;
      }
    }

    if (mode === 'edit' && editPlan && !editPlan.hasChanges) {
      return;
    }

    setLocalError('');
    await onSubmit(validation.sanitized);
  };

  const title =
    mode === 'edit'
      ? isLeague
        ? 'Edit Turnamen Liga'
        : 'Edit Turnamen'
      : mode === 'duplicate'
      ? isLeague
        ? 'Duplikat Turnamen Liga'
        : 'Duplikat Turnamen'
      : isLeague
      ? 'Buat Turnamen Liga'
      : 'Buat Turnamen Baru';

  const submitLabel =
    mode === 'edit'
      ? 'Simpan Perubahan'
      : mode === 'duplicate'
      ? 'Simpan & Buat Duplikat'
      : isLeague
      ? 'Simpan & Buat Liga'
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
      closeDisabled={isLoading}
    >
      <form onSubmit={handleFormSubmit} className="flex flex-col gap-3 py-1">
        {isLeague && (
          <div className="p-2.5 rounded-btn bg-amber-500/10 border border-amber-400/30 text-caption text-amber-200 flex items-start gap-2">
            <Trophy size={15} className="flex-shrink-0 mt-0.5 text-amber-300" />
            <span>
              <strong>Turnamen Liga</strong> menggunakan format terkunci{' '}
              <strong>BO3</strong>, minimal <strong>4 peserta</strong> untuk mulai,
              tanpa timer ronde, dan wajib melewati <strong>Top Cut</strong>.
            </span>
          </div>
        )}

        {mode === 'duplicate' && (
          <div className="p-2.5 rounded-btn bg-accent/10 border border-accent/20 text-caption text-accent flex items-start gap-2">
            <Copy size={15} className="flex-shrink-0 mt-0.5" />
            <span>
              Membuat turnamen baru berstatus <strong>Pendaftaran</strong> dengan Kode Gabung baru. Peserta, ronde, pertandingan, dan deck tidak disalin.
            </span>
          </div>
        )}

        <Input
          label={isLeague ? 'Nama Liga' : 'Nama Turnamen'}
          placeholder={
            isLeague
              ? 'Contoh: Digimon Store League Jakarta'
              : 'Contoh: Digimon Evolution Cup 2026'
          }
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          disabled={isLoading}
          maxLength={50}
        />

        <Input
          label="Tanggal Turnamen"
          type="date"
          value={date}
          onChange={(e) => handleDateChange(e.target.value)}
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

        {/* Field Season Khusus Turnamen Liga */}
        {isLeague && (
          <div className="p-3 rounded-btn bg-dark-surface-high border border-dark-border flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-caption font-semibold text-dark-text">
                Pengaturan Season Liga
              </span>
              {seasonPreviewLabel && (
                <span className="text-[11px] font-mono font-bold text-amber-300 bg-amber-500/15 border border-amber-400/35 px-2 py-0.5 rounded">
                  {seasonPreviewLabel}
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-dark-muted flex items-center gap-1">
                  <span>Season ke-</span>
                  {(mode !== 'edit' || !permissions.canEditSeasonNumber) && (
                    <Lock size={10} className="text-amber-300" />
                  )}
                </label>
                {mode !== 'edit' ? (
                  <div className="w-full min-h-[42px] px-2.5 bg-dark-surface/70 border border-dark-border rounded-btn text-caption text-amber-300 font-mono font-bold flex items-center">
                    {autoNextSeasonNumber}
                  </div>
                ) : (
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={seasonNumberStr}
                    onChange={(e) => {
                      if (!permissions.canEditSeasonNumber) return;
                      setSeasonNumberStr(e.target.value);
                      if (localError) setLocalError('');
                    }}
                    disabled={isLoading || !permissions.canEditSeasonNumber}
                    className="w-full min-h-[42px] px-2.5 bg-dark-surface border border-dark-border rounded-btn text-caption text-dark-text font-mono focus:outline-none focus:border-accent disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-dark-muted">
                  Bulan
                </label>
                <select
                  value={seasonMonth}
                  onChange={(e) => {
                    setMonthYearManual(true);
                    setSeasonMonth(Number(e.target.value));
                    if (localError) setLocalError('');
                  }}
                  disabled={isLoading}
                  className="w-full min-h-[42px] px-2 bg-dark-surface border border-dark-border rounded-btn text-caption text-dark-text focus:outline-none focus:border-accent"
                >
                  {INDONESIAN_MONTH_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-dark-muted">
                  Tahun
                </label>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  step={1}
                  value={seasonYearStr}
                  onChange={(e) => {
                    setMonthYearManual(true);
                    setSeasonYearStr(e.target.value);
                    if (localError) setLocalError('');
                  }}
                  disabled={isLoading}
                  className="w-full min-h-[42px] px-2.5 bg-dark-surface border border-dark-border rounded-btn text-caption text-dark-text font-mono focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            {mode !== 'edit' ? (
              <p className="text-[11px] text-dark-muted">
                Season berikutnya: <strong className="text-amber-300 font-mono">{autoNextSeasonNumber}</strong> (dihitung otomatis dari semua liga organizer ini). Bulan &amp; tahun mengikuti tanggal turnamen.
              </p>
            ) : !permissions.canEditSeasonNumber ? (
              <p className="text-[11px] text-status-yellow flex items-center gap-1">
                <Lock size={11} className="flex-shrink-0" />
                <span>Nomor season terkunci karena turnamen sudah dimulai atau selesai.</span>
              </p>
            ) : (
              <p className="text-[11px] text-dark-muted">
                Nomor season masih dapat diubah selama berstatus Pendaftaran dan harus unik di antara liga milik organizer.
              </p>
            )}
          </div>
        )}

        {/* Pemilihan Format (terkunci BO3 untuk Liga, atau terkunci bila status running/finished saat edit) */}
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
              {isLeague ? 'Best of 3 (BO3 - Wajib Liga)' : 'Best of 3 (BO3 - 45 Menit)'}
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
                    Perubahan nama/tanggal/season juga akan memperbarui catatan riwayat & statistik peserta.
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
