import React, { useState, useEffect } from 'react';
import { Tournament } from '../../types';
import { BottomSheet } from '../common/BottomSheet';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Card } from '../common/Card';
import {
  lookupLeagueInviteForPlayer,
  registerPlayerWithLeagueInvite,
  LeagueInviteLookupResult,
} from '../../services/leagueInviteService';
import {
  checkInviteMatchesTournament,
  normalizeLeagueInviteInput,
} from '../../utils/leagueInviteLogic';
import { formatSeasonLabel } from '../../utils/seasonLogic';
import {
  isQrGalleryPickerSupportedNative,
  isQrScannerSupportedNative,
  pickQrImageNative,
  scanQrCodeNative,
} from '../../services/nativeBridge';
import {
  mapQrBridgeErrorToIndonesianMessage,
  validateScannedLeagueInviteText,
} from '../../utils/qrShareLogic';
import {
  Ticket,
  AlertCircle,
  Trophy,
  Calendar,
  MapPin,
  UserCheck,
  Search,
  QrCode,
  Image as ImageIcon,
} from 'lucide-react';

interface LeagueInviteJoinSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: { uid: string; name: string } | null;
  expectedTournament?: { id: string; name: string };
  onRegistered: (tournament: Tournament) => void;
}

export const LeagueInviteJoinSheet: React.FC<LeagueInviteJoinSheetProps> = ({
  isOpen,
  onClose,
  currentUser,
  expectedTournament,
  onRegistered,
}) => {
  const [rawInput, setRawInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [joining, setJoining] = useState(false);
  const [qrLoading, setQrLoading] = useState<'camera' | 'gallery' | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [lookupResult, setLookupResult] =
    useState<LeagueInviteLookupResult | null>(null);

  const canScanCamera = isQrScannerSupportedNative();
  const canPickGallery = isQrGalleryPickerSupportedNative();

  useEffect(() => {
    if (isOpen) {
      setRawInput('');
      setChecking(false);
      setJoining(false);
      setQrLoading(null);
      setLookupError('');
      setLookupResult(null);
    }
  }, [isOpen]);

  const normalizedPreview = normalizeLeagueInviteInput(rawInput);

  const performLookup = async (codeOrInput: string) => {
    if (!currentUser || checking || joining) return;

    setChecking(true);
    setLookupError('');
    setLookupResult(null);
    try {
      const res = await lookupLeagueInviteForPlayer(codeOrInput, currentUser.uid);
      const lookupTarget = res.tournament
        ? {
            id: res.tournament.id,
            name: res.invite?.tournamentName || res.tournament.name,
          }
        : res.invite?.tournamentId
        ? {
            id: res.invite.tournamentId,
            name: res.invite.tournamentName || 'Liga Lain',
          }
        : null;
      const matchCheck = checkInviteMatchesTournament(expectedTournament, lookupTarget);
      if (!matchCheck.matches) {
        setLookupError(
          matchCheck.error ||
            `Kode ini milik liga ${lookupTarget?.name || 'lain'}, bukan ${expectedTournament?.name}.`
        );
        setLookupResult(null);
      } else if (!res.valid) {
        setLookupError(res.error || 'Kode undangan tidak valid.');
        setLookupResult(null);
      } else {
        setLookupResult(res);
      }
    } catch (err: any) {
      console.error('Gagal memeriksa kode undangan:', err);
      setLookupError(
        err?.message || 'Terjadi kesalahan saat memeriksa kode undangan.'
      );
    } finally {
      setChecking(false);
    }
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLookup(rawInput);
  };

  const handleQrInputAction = async (source: 'camera' | 'gallery') => {
    if (!currentUser || checking || joining || qrLoading !== null) return;
    setQrLoading(source);
    setLookupError('');
    try {
      const res =
        source === 'camera'
          ? await scanQrCodeNative()
          : await pickQrImageNative();

      if (!res.ok) {
        setLookupError(mapQrBridgeErrorToIndonesianMessage(res.error, source));
        return;
      }

      const validation = validateScannedLeagueInviteText(res.text);
      if (!validation.valid) {
        setLookupError(validation.error || 'QR ini bukan undangan DigiSwiss');
        return;
      }

      setRawInput(validation.code);
      setQrLoading(null);
      await performLookup(validation.code);
    } catch (err: any) {
      console.error('Gagal memproses QR undangan:', err);
      setLookupError(mapQrBridgeErrorToIndonesianMessage('failed', source));
    } finally {
      setQrLoading(null);
    }
  };

  const handleConfirmJoin = async () => {
    if (
      !currentUser ||
      !lookupResult?.valid ||
      !lookupResult.tournament ||
      joining
    ) {
      return;
    }

    const joinMatchCheck = checkInviteMatchesTournament(expectedTournament, {
      id: lookupResult.tournament.id,
      name: lookupResult.invite?.tournamentName || lookupResult.tournament.name,
    });
    if (!joinMatchCheck.matches) {
      setLookupError(joinMatchCheck.error || 'Kode undangan tidak cocok dengan turnamen ini.');
      return;
    }

    setJoining(true);
    setLookupError('');
    try {
      await registerPlayerWithLeagueInvite(
        lookupResult.tournament.id,
        lookupResult.code,
        currentUser
      );
      onRegistered(lookupResult.tournament);
    } catch (err: any) {
      console.error('Gagal mendaftar Turnamen Liga:', err);
      const code = err?.code || '';
      if (code === 'permission-denied') {
        setLookupError(
          'Pendaftaran ditolak. Pastikan kode undangan aktif dan turnamen masih dibuka.'
        );
      } else {
        setLookupError(err?.message || 'Gagal mendaftar ke Turnamen Liga.');
      }
    } finally {
      setJoining(false);
    }
  };

  const handleClose = () => {
    if (checking || joining || qrLoading !== null) return;
    onClose();
  };

  const previewSeasonLabel =
    lookupResult?.invite?.seasonLabel ||
    formatSeasonLabel(lookupResult?.tournament?.season);

  const isBusy = checking || joining || qrLoading !== null;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={handleClose}
      title="Masukkan Kode Undangan Liga"
      zIndexClass="z-[60]"
      closeDisabled={isBusy}
    >
      <div className="flex flex-col gap-3 py-1 pb-2">
        {(canScanCamera || canPickGallery) && (
          <div
            className={`grid gap-2 ${
              canScanCamera && canPickGallery ? 'grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {canScanCamera && (
              <Button
                variant="primary"
                type="button"
                isLoading={qrLoading === 'camera'}
                disabled={isBusy || !currentUser}
                onClick={() => handleQrInputAction('camera')}
                icon={<QrCode size={16} />}
                className="!min-h-[44px] !text-caption"
              >
                Scan QR
              </Button>
            )}
            {canPickGallery && (
              <Button
                variant="secondary"
                type="button"
                isLoading={qrLoading === 'gallery'}
                disabled={isBusy || !currentUser}
                onClick={() => handleQrInputAction('gallery')}
                icon={<ImageIcon size={16} />}
                className="!min-h-[44px] !text-caption"
              >
                Pilih dari Galeri
              </Button>
            )}
          </div>
        )}

        <form onSubmit={handleLookup} className="flex flex-col gap-3">
          <Input
            label="Kode Undangan (8 Karakter / Teks QR)"
            placeholder="Contoh: K7P9M2WX atau digiswiss:liga:K7P9M2WX"
            value={rawInput}
            onChange={(e) => {
              setRawInput(e.target.value);
              if (lookupError) setLookupError('');
              if (lookupResult) setLookupResult(null);
            }}
            disabled={isBusy}
            autoCapitalize="characters"
            leftIcon={<Ticket size={16} />}
            helperText={
              normalizedPreview && rawInput.includes(':')
                ? `Kode terdeteksi: ${normalizedPreview}`
                : 'Boleh menempel langsung teks QR "digiswiss:liga:KODE".'
            }
          />

          <Button
            variant="secondary"
            fullWidth
            type="submit"
            isLoading={checking}
            disabled={isBusy || !rawInput.trim()}
            icon={<Search size={16} />}
          >
            Periksa Kode Undangan
          </Button>
        </form>

        {lookupError && (
          <div className="p-3 rounded-btn bg-status-red/10 border border-status-red/30 text-caption text-status-red flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{lookupError}</span>
          </div>
        )}

        {lookupResult?.valid &&
          lookupResult.tournament &&
          checkInviteMatchesTournament(expectedTournament, lookupResult.tournament).matches && (
          <Card
            variant="surface-high"
            className="flex flex-col gap-2.5 border-amber-400/40 bg-amber-500/5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40">
                    LIGA
                  </span>
                  {previewSeasonLabel && (
                    <span className="text-[11px] font-mono font-semibold text-amber-300">
                      {previewSeasonLabel}
                    </span>
                  )}
                </div>
                <h4 className="text-body font-bold text-dark-text mt-1">
                  {lookupResult.invite?.tournamentName ||
                    lookupResult.tournament.name}
                </h4>
                <p className="text-caption text-dark-muted mt-0.5">
                  Organizer:{' '}
                  <strong className="text-dark-text">
                    {lookupResult.invite?.organizerName ||
                      lookupResult.tournament.organizerName}
                  </strong>
                </p>
              </div>
              <Trophy size={20} className="text-amber-300 flex-shrink-0" />
            </div>

            <div className="pt-2 border-t border-dark-border flex items-center justify-between text-caption text-dark-muted gap-2">
              <span className="flex items-center gap-1">
                <Calendar size={13} />
                {lookupResult.tournament.date}
              </span>
              <span className="flex items-center gap-1 truncate">
                <MapPin size={13} />
                {lookupResult.tournament.location}
              </span>
              <span className="font-mono text-[11px] text-accent">
                {lookupResult.tournament.format}
              </span>
            </div>

            <div className="p-2 rounded bg-status-green/10 border border-status-green/30 text-[11px] text-status-green">
              Undangan valid! Anda akan langsung diterima dan diminta mengisi 2 deck liga.
            </div>

            <Button
              variant="primary"
              fullWidth
              type="button"
              isLoading={joining}
              disabled={joining}
              onClick={handleConfirmJoin}
              icon={<UserCheck size={17} />}
            >
              Daftar
            </Button>
          </Card>
        )}

        <Button
          variant="secondary"
          fullWidth
          type="button"
          disabled={isBusy}
          onClick={handleClose}
        >
          Tutup
        </Button>
      </div>
    </BottomSheet>
  );
};
