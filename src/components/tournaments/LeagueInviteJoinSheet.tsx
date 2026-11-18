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
import { normalizeLeagueInviteInput } from '../../utils/leagueInviteLogic';
import { formatSeasonLabel } from '../../utils/seasonLogic';
import {
  Ticket,
  AlertCircle,
  Trophy,
  Calendar,
  MapPin,
  UserCheck,
  Search,
} from 'lucide-react';

interface LeagueInviteJoinSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: { uid: string; name: string } | null;
  onRegistered: (tournament: Tournament, inviteCode: string) => void;
}

export const LeagueInviteJoinSheet: React.FC<LeagueInviteJoinSheetProps> = ({
  isOpen,
  onClose,
  currentUser,
  onRegistered,
}) => {
  const [rawInput, setRawInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [joining, setJoining] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [lookupResult, setLookupResult] =
    useState<LeagueInviteLookupResult | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRawInput('');
      setChecking(false);
      setJoining(false);
      setLookupError('');
      setLookupResult(null);
    }
  }, [isOpen]);

  const normalizedPreview = normalizeLeagueInviteInput(rawInput);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || checking || joining) return;

    setChecking(true);
    setLookupError('');
    setLookupResult(null);
    try {
      const res = await lookupLeagueInviteForPlayer(rawInput, currentUser.uid);
      if (!res.valid) {
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

  const handleConfirmJoin = async () => {
    if (
      !currentUser ||
      !lookupResult?.valid ||
      !lookupResult.tournament ||
      joining
    ) {
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
      onRegistered(lookupResult.tournament, lookupResult.code);
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
    if (checking || joining) return;
    onClose();
  };

  const previewSeasonLabel =
    lookupResult?.invite?.seasonLabel ||
    formatSeasonLabel(lookupResult?.tournament?.season);

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={handleClose}
      title="Masukkan Kode Undangan Liga"
      zIndexClass="z-[60]"
    >
      <div className="flex flex-col gap-3 py-1 pb-2">
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
            disabled={checking || joining}
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
            disabled={checking || joining || !rawInput.trim()}
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

        {lookupResult?.valid && lookupResult.tournament && (
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
          disabled={checking || joining}
          onClick={handleClose}
        >
          Tutup
        </Button>
      </div>
    </BottomSheet>
  );
};
