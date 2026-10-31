import React, { useState } from 'react';
import { TournamentMatch } from '../../types';
import { BottomSheet } from '../../components/common/BottomSheet';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { PastMatchRecord, validateManualSwap } from '../../utils/swissPairing';
import { ArrowLeftRight, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ManualSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  matches: TournamentMatch[];
  pastMatches: PastMatchRecord[];
  onSwap: (
    matchA: TournamentMatch,
    playerAKey: 'p1' | 'p2',
    matchB: TournamentMatch,
    playerBKey: 'p1' | 'p2',
    force: boolean
  ) => Promise<{ success: boolean; warning?: string }>;
}

export const ManualSwapModal: React.FC<ManualSwapModalProps> = ({
  isOpen,
  onClose,
  matches,
  pastMatches,
  onSwap,
}) => {
  // Hanya pertimbangkan match yang bukan BYE untuk penukaran pemain aktif
  const validMatches = matches.filter((m) => m.p2Id !== null);

  const [selectedA, setSelectedA] = useState<{ matchId: string; playerKey: 'p1' | 'p2' } | null>(null);
  const [selectedB, setSelectedB] = useState<{ matchId: string; playerKey: 'p1' | 'p2' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  // Flatten all selectable players
  const playerOptions: Array<{
    match: TournamentMatch;
    key: 'p1' | 'p2';
    playerId: string;
    playerName: string;
    table: number;
  }> = [];

  for (const m of validMatches) {
    playerOptions.push({
      match: m,
      key: 'p1',
      playerId: m.p1Id,
      playerName: m.p1Name,
      table: m.table,
    });
    if (m.p2Id) {
      playerOptions.push({
        match: m,
        key: 'p2',
        playerId: m.p2Id,
        playerName: m.p2Name,
        table: m.table,
      });
    }
  }

  const optA = selectedA
    ? playerOptions.find((o) => o.match.id === selectedA.matchId && o.key === selectedA.playerKey)
    : null;
  const optB = selectedB
    ? playerOptions.find((o) => o.match.id === selectedB.matchId && o.key === selectedB.playerKey)
    : null;

  // Real-time Rematch Validation
  let validationWarning = '';
  if (optA && optB) {
    if (optA.match.id === optB.match.id) {
      validationWarning = 'Kedua pemain berada di meja yang sama. Menukar posisi p1 dan p2 di meja yang sama tidak mengubah pasangan.';
    } else {
      const oppA = optB.key === 'p1' ? optB.match.p2Id : optB.match.p1Id;
      const oppB = optA.key === 'p1' ? optA.match.p2Id : optA.match.p1Id;

      const checkA = validateManualSwap(optA.playerId, oppA, pastMatches);
      const checkB = validateManualSwap(optB.playerId, oppB, pastMatches);

      if (!checkA.isValid || !checkB.isValid) {
        validationWarning =
          'Peringatan: Penukaran ini akan menyebabkan tanding ulang (rematch) antara pemain yang sudah pernah bertemu di ronde sebelumnya!';
      }
    }
  }

  const handleExecuteSwap = async () => {
    if (!optA || !optB) {
      setError('Pilih dua pemain dari meja berbeda untuk ditukar.');
      return;
    }
    if (optA.match.id === optB.match.id) {
      setError('Pilih pemain dari meja yang berbeda.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await onSwap(optA.match, optA.key, optB.match, optB.key, true);
      if (res.success) {
        onClose();
      } else {
        setError(res.warning || 'Gagal menukar pasangan.');
      }
    } catch (err: any) {
      setError(err.message || 'Gagal menukar pemain.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Tukar Pairing Manual">
      <div className="flex flex-col gap-4 py-2 pb-6">
        <p className="text-caption text-dark-muted">
          Pilih dua pemain dari meja yang berbeda untuk ditukar posisinya sebelum pertandingan dimulai.
        </p>

        {/* Pemilihan Pemain A */}
        <div className="flex flex-col gap-1.5">
          <label className="text-caption font-semibold text-accent">Pemain Pertama (A)</label>
          <select
            value={selectedA ? `${selectedA.matchId}_${selectedA.playerKey}` : ''}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) {
                setSelectedA(null);
              } else {
                const [matchId, playerKey] = val.split('_');
                setSelectedA({ matchId, playerKey: playerKey as 'p1' | 'p2' });
              }
              setError('');
            }}
            className="w-full bg-dark-surface border border-dark-border rounded-btn px-3 py-2.5 text-caption text-dark-text focus:outline-none focus:border-accent"
          >
            <option value="">-- Pilih Pemain A --</option>
            {playerOptions.map((opt) => (
              <option
                key={`${opt.match.id}_${opt.key}`}
                value={`${opt.match.id}_${opt.key}`}
                disabled={selectedB?.matchId === opt.match.id && selectedB?.playerKey === opt.key}
              >
                Meja {opt.table}: {opt.playerName}
              </option>
            ))}
          </select>
        </div>

        {/* Pemilihan Pemain B */}
        <div className="flex flex-col gap-1.5">
          <label className="text-caption font-semibold text-accent">Pemain Kedua (B)</label>
          <select
            value={selectedB ? `${selectedB.matchId}_${selectedB.playerKey}` : ''}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) {
                setSelectedB(null);
              } else {
                const [matchId, playerKey] = val.split('_');
                setSelectedB({ matchId, playerKey: playerKey as 'p1' | 'p2' });
              }
              setError('');
            }}
            className="w-full bg-dark-surface border border-dark-border rounded-btn px-3 py-2.5 text-caption text-dark-text focus:outline-none focus:border-accent"
          >
            <option value="">-- Pilih Pemain B --</option>
            {playerOptions.map((opt) => (
              <option
                key={`${opt.match.id}_${opt.key}`}
                value={`${opt.match.id}_${opt.key}`}
                disabled={selectedA?.matchId === opt.match.id && selectedA?.playerKey === opt.key}
              >
                Meja {opt.table}: {opt.playerName}
              </option>
            ))}
          </select>
        </div>

        {/* Tampilan Pratinjau Tukar */}
        {optA && optB && (
          <Card variant="surface-high" className="flex flex-col gap-2 p-3">
            <span className="text-[11px] font-mono text-dark-muted uppercase">Rencana Penukaran:</span>
            <div className="flex items-center justify-between text-caption">
              <div>
                <span className="font-semibold text-dark-text">{optA.playerName}</span>
                <span className="text-[11px] text-dark-muted block">Meja {optA.table}</span>
              </div>
              <ArrowLeftRight size={16} className="text-accent" />
              <div className="text-right">
                <span className="font-semibold text-dark-text">{optB.playerName}</span>
                <span className="text-[11px] text-dark-muted block">Meja {optB.table}</span>
              </div>
            </div>

            {validationWarning && (
              <div className="mt-2 p-2 rounded bg-status-yellow/10 border border-status-yellow/30 flex items-start gap-2 text-status-yellow text-[11px]">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{validationWarning}</span>
              </div>
            )}
          </Card>
        )}

        {error && (
          <p className="text-caption text-status-red text-center">{error}</p>
        )}

        <div className="flex flex-col gap-2 mt-2">
          <Button
            variant="primary"
            fullWidth
            onClick={handleExecuteSwap}
            disabled={!optA || !optB || optA.match.id === optB.match.id}
            isLoading={loading}
            icon={<ArrowLeftRight size={16} />}
          >
            Konfirmasi Tukar Pairing
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={onClose}
            disabled={loading}
          >
            Batal
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
};
