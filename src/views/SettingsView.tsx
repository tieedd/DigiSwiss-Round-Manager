import React, { useState } from 'react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { ReauthModal } from '../components/common/ReauthModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Shield,
  Sparkles,
  Layers,
  FileCode,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Database
} from 'lucide-react';
import { CURRENT_APP_VERSION } from '../services/versionService';
import {
  scanOrphanParticipations,
  cleanOrphanParticipations,
  OrphanDocInfo
} from '../services/tournamentCleanupService';

interface SettingsViewProps {
  onNavigateConnection: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onNavigateConnection }) => {
  const { currentUser, userProfile } = useAuth();
  const { success: showToastSuccess, error: showToastError } = useToast();
  const isAdmin = userProfile?.role === 'admin';

  // State Pembersihan Data Yatim
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    orphanDocs: OrphanDocInfo[];
    totalScanned: number;
  } | null>(null);
  const [reauthOpen, setReauthOpen] = useState(false);

  const handleScanOrphans = async () => {
    setScanning(true);
    try {
      const res = await scanOrphanParticipations();
      setScanResult(res);
      if (res.orphanDocs.length === 0) {
        showToastSuccess(`Pemeriksaan selesai (${res.totalScanned} dokumen). Tidak ada data yatim.`);
      }
    } catch (err: any) {
      console.error('Gagal memindai data yatim:', err);
      showToastError(err.message || 'Gagal memindai data yatim.');
    } finally {
      setScanning(false);
    }
  };

  const handleExecuteCleanOrphans = async () => {
    if (!currentUser || !userProfile || !scanResult || scanResult.orphanDocs.length === 0) return;
    setCleaning(true);
    try {
      const ids = scanResult.orphanDocs.map((d) => d.id);
      const deletedCount = await cleanOrphanParticipations(ids, {
        uid: currentUser.uid,
        name: userProfile.displayName || userProfile.username || 'Admin'
      });
      showToastSuccess(`Berhasil menghapus ${deletedCount} data hasil turnamen yang sudah dihapus.`);
      setScanResult(null);
    } catch (err: any) {
      console.error('Gagal membersihkan data yatim:', err);
      showToastError(err.message || 'Gagal membersihkan data yatim.');
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-section-title text-dark-text font-semibold">
          Pengaturan & Informasi
        </h2>
        <p className="text-caption text-dark-muted">
          Parameter aplikasi dan arsitektur DigiSwiss-Round
        </p>
      </div>

      {/* Info Aplikasi */}
      <Card variant="surface" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-btn bg-accent/10 text-accent flex items-center justify-center font-bold text-section-title">
              DS
            </div>
            <div>
              <h3 className="text-body font-semibold text-dark-text">
                DigiSwiss-Round
              </h3>
              <p className="text-caption text-dark-muted font-mono">
                Versi aplikasi: v{CURRENT_APP_VERSION}
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-dark-surface-high text-accent border border-dark-border">
            Spark Tier
          </span>
        </div>
        <p className="text-caption text-dark-muted leading-relaxed pt-2 border-t border-dark-border">
          Manajer turnamen Swiss Round khusus Digimon Card Game (TCG). Dibangun dengan
          arsitektur mobile-first, React, TypeScript, Tailwind CSS, dan Firebase modular SDK.
        </p>
      </Card>

      {/* Kartu Pembersihan Data (Hanya untuk Admin) */}
      {isAdmin && (
        <Card variant="surface" className="flex flex-col gap-3 border-status-red/30 bg-status-red/5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database size={18} className="text-status-red flex-shrink-0 stroke-[1.5]" />
              <h3 className="text-body font-semibold text-dark-text">
                Pembersihan Data
              </h3>
            </div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-status-red/10 text-status-red border border-status-red/20 font-bold">
              Admin
            </span>
          </div>

          <p className="text-caption text-dark-muted leading-relaxed">
            Membersihkan sisa data partisipasi dan hasil dari turnamen yang dihapus sebelum perbaikan ini, agar Statistik dan Riwayat pemain tetap akurat.
          </p>

          {/* Hasil Pemindaian */}
          {scanResult && (
            <div
              className={`p-3 rounded-btn border text-caption flex items-start gap-2.5 ${
                scanResult.orphanDocs.length > 0
                  ? 'bg-status-yellow/10 border-status-yellow/30 text-status-yellow'
                  : 'bg-status-green/10 border-status-green/30 text-status-green'
              }`}
            >
              {scanResult.orphanDocs.length > 0 ? (
                <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
              )}
              <div className="flex flex-col gap-0.5">
                <strong className="font-semibold">
                  {scanResult.orphanDocs.length > 0
                    ? `${scanResult.orphanDocs.length} data hasil turnamen yang sudah dihapus`
                    : 'Tidak ada data yatim ditemukan'}
                </strong>
                <span className="text-[11px] opacity-90">
                  Dari total {scanResult.totalScanned} dokumen partisipasi yang dipindai.
                </span>
              </div>
            </div>
          )}

          {/* Tombol Aksi */}
          <div className="flex items-center gap-2 pt-1 border-t border-dark-border/60">
            <Button
              variant="secondary"
              className="!min-h-[36px] !text-caption flex-1"
              isLoading={scanning}
              onClick={handleScanOrphans}
              icon={<RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />}
            >
              Periksa data yatim
            </Button>

            <Button
              variant="danger"
              className="!min-h-[36px] !text-caption flex-1"
              disabled={!scanResult || scanResult.orphanDocs.length === 0 || cleaning}
              isLoading={cleaning}
              onClick={() => setReauthOpen(true)}
              icon={<Trash2 size={14} />}
            >
              Hapus data yatim
            </Button>
          </div>
        </Card>
      )}

      {/* Prinsip Desain & Integritas Sistem */}
      <div className="flex flex-col gap-2">
        <h3 className="text-body font-semibold text-dark-text px-1">
          Integritas & Keamanan Sistem
        </h3>

        <Card variant="surface" className="flex items-start gap-3">
          <Shield size={18} className="text-status-green flex-shrink-0 mt-0.5 stroke-[1.5]" />
          <div className="text-caption text-dark-muted">
            <strong className="text-dark-text block">Keamanan Berlapis (Default Deny)</strong>
            Aturan keamanan ditegakkan di level server Firestore, bukan hanya penyembunyian antarmuka. Kredensial tidak pernah disimpan di localStorage.
          </div>
        </Card>

        <Card variant="surface" className="flex items-start gap-3">
          <Layers size={18} className="text-accent flex-shrink-0 mt-0.5 stroke-[1.5]" />
          <div className="text-caption text-dark-muted">
            <strong className="text-dark-text block">Efisiensi Kuota Firestore</strong>
            Pemanfaatan onSnapshot hanya saat halaman turnamen dibuka dan pemutusan listener otomatis untuk memastikan batas kuota gratis Spark terjaga.
          </div>
        </Card>

        <Card variant="surface" className="flex items-start gap-3">
          <Sparkles size={18} className="text-info flex-shrink-0 mt-0.5 stroke-[1.5]" />
          <div className="text-caption text-dark-muted">
            <strong className="text-dark-text block">Dukungan Mode Offline</strong>
            Mengaktifkan persistentLocalCache agar data turnamen tetap dapat diakses saat koneksi internet lokal tidak stabil di lokasi turnamen.
          </div>
        </Card>
      </div>

      {/* Tautan Cepat Uji Koneksi */}
      <Card
        variant="surface-high"
        className="cursor-pointer hover:border-accent/40 transition-colors"
        onClick={onNavigateConnection}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileCode size={18} className="text-accent stroke-[1.5]" />
            <span className="text-body font-medium text-dark-text">
              Periksa Status Koneksi Backend
            </span>
          </div>
          <span className="text-caption text-accent font-medium">Buka &rarr;</span>
        </div>
      </Card>

      {/* Reauth Modal untuk Pembersihan Data Yatim */}
      <ReauthModal
        isOpen={reauthOpen}
        onClose={() => setReauthOpen(false)}
        onSuccess={handleExecuteCleanOrphans}
        actionTitle="Konfirmasi Pembersihan Data Yatim"
        actionDescription={`Masukkan password admin Anda untuk menghapus ${scanResult?.orphanDocs.length || 0} data partisipasi dari turnamen yang sudah tidak ada.`}
      />
    </div>
  );
};
