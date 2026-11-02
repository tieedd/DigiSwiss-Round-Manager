import React from 'react';
import { Card } from '../components/common/Card';
import { Shield, Sparkles, Layers, FileCode, CheckCircle2 } from 'lucide-react';
import { CURRENT_APP_VERSION } from '../services/versionService';

interface SettingsViewProps {
  onNavigateConnection: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onNavigateConnection }) => {
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
    </div>
  );
};
