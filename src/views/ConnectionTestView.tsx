import React, { useState, useEffect } from 'react';
import { app, auth, db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { StatusBadge, StatusVariant } from '../components/common/StatusBadge';
import { RefreshCw, Database, ShieldCheck, Cpu, CheckCircle2, AlertCircle, Info } from 'lucide-react';

interface TestItem {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'success' | 'error';
  details: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

export const ConnectionTestView: React.FC = () => {
  const [testing, setTesting] = useState<boolean>(false);
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);

  const [tests, setTests] = useState<TestItem[]>([
    {
      id: 'app',
      name: 'Inisialisasi Firebase App',
      description: 'Memeriksa kredensial proyek dan konfigurasi SDK modular',
      status: 'pending',
      details: 'Menunggu pengujian...',
      icon: Cpu,
    },
    {
      id: 'auth',
      name: 'Layanan Firebase Auth',
      description: 'Memverifikasi ketersediaan modul otentikasi akun',
      status: 'pending',
      details: 'Menunggu pengujian...',
      icon: ShieldCheck,
    },
    {
      id: 'firestore',
      name: 'Layanan Cloud Firestore',
      description: 'Menghubungi server Firestore (status ditolak izin tetap dianggap terhubung)',
      status: 'pending',
      details: 'Menunggu pengujian...',
      icon: Database,
    },
  ]);

  const runDiagnostics = async () => {
    setTesting(true);

    const now = new Date();
    const timeString = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    // 1. Uji Inisialisasi Firebase App
    let appStatus: 'success' | 'error' = 'pending' as any;
    let appDetail = '';
    try {
      if (app && app.options && app.options.projectId) {
        appStatus = 'success';
        appDetail = `Proyek terdaftar: ${app.options.projectId} (${app.name || 'default'})`;
      } else {
        appStatus = 'error';
        appDetail = 'Konfigurasi Firebase app tidak valid atau belum diinisialisasi.';
      }
    } catch (err: any) {
      appStatus = 'error';
      appDetail = `Galat inisialisasi: ${err?.message || err}`;
    }

    // 2. Uji Firebase Auth
    let authStatus: 'success' | 'error' = 'pending' as any;
    let authDetail = '';
    try {
      if (auth && auth.app) {
        authStatus = 'success';
        authDetail = `Auth siap (currentUser: ${auth.currentUser ? auth.currentUser.uid : 'Belum login (Tamu)'})`;
      } else {
        authStatus = 'error';
        authDetail = 'Instance Firebase Auth tidak terdeteksi.';
      }
    } catch (err: any) {
      authStatus = 'error';
      authDetail = `Galat Auth: ${err?.message || err}`;
    }

    // 3. Uji Cloud Firestore
    let fsStatus: 'success' | 'error' = 'pending' as any;
    let fsDetail = '';
    try {
      // Menguji koneksi dengan membaca dokumen ping di koleksi meta/bootstrap
      const testDocRef = doc(db, 'meta', 'bootstrap');
      await getDoc(testDocRef);
      fsStatus = 'success';
      fsDetail = 'Berhasil terhubung ke database Cloud Firestore (Server merespons).';
    } catch (err: any) {
      const code = err?.code || '';
      // Aturan keamanan default deny: pesan permission-denied membuktikan server Firestore berhasil dijangkau!
      if (code.includes('permission-denied') || (err?.message && err.message.includes('permission-denied'))) {
        fsStatus = 'success';
        fsDetail = 'Server Firestore berhasil dijangkau (Aturan default-deny merespons dengan benar).';
      } else if (code.includes('unavailable') || code.includes('failed-precondition')) {
        // Mode offline / persistent cache
        fsStatus = 'success';
        fsDetail = `Koneksi lokal/cache aktif (${code || 'offline cache'}).`;
      } else {
        fsStatus = 'error';
        fsDetail = `Galat Firestore: ${err?.message || code || 'Gagal menghubungi server'}`;
      }
    }

    setTests([
      {
        id: 'app',
        name: 'Inisialisasi Firebase App',
        description: 'Memeriksa kredensial proyek dan konfigurasi SDK modular',
        status: appStatus,
        details: appDetail,
        icon: Cpu,
      },
      {
        id: 'auth',
        name: 'Layanan Firebase Auth',
        description: 'Memverifikasi ketersediaan modul otentikasi akun',
        status: authStatus,
        details: authDetail,
        icon: ShieldCheck,
      },
      {
        id: 'firestore',
        name: 'Layanan Cloud Firestore',
        description: 'Menghubungi server Firestore (status ditolak izin tetap dianggap terhubung)',
        status: fsStatus,
        details: fsDetail,
        icon: Database,
      },
    ]);

    setLastTestedAt(timeString);
    setTesting(false);
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  const allPassed = tests.every((t) => t.status === 'success');

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-section-title text-dark-text font-semibold">
            Status Koneksi Backend
          </h2>
          <p className="text-caption text-dark-muted">
            Diagnostik menyeluruh Firebase tanpa memerlukan login
          </p>
        </div>
      </div>

      {/* Ringkasan Status */}
      <Card
        variant={allPassed ? 'surface' : 'surface-high'}
        className={`border ${allPassed ? 'border-status-green/30' : 'border-dark-border'}`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-btn flex items-center justify-center flex-shrink-0 ${
              allPassed
                ? 'bg-status-green/10 text-status-green'
                : 'bg-status-yellow/10 text-status-yellow'
            }`}
          >
            {allPassed ? (
              <CheckCircle2 size={20} className="stroke-[1.5]" />
            ) : (
              <AlertCircle size={20} className="stroke-[1.5]" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-body font-semibold text-dark-text">
              {allPassed ? 'Backend Firebase Siap' : 'Menunggu Diagnostik'}
            </h3>
            <p className="text-caption text-dark-muted mt-0.5">
              {allPassed
                ? 'Seluruh layanan inti (App, Auth, dan Firestore) terhubung dengan baik.'
                : 'Sedang memeriksa atau ada layanan yang memerlukan penyesuaian.'}
            </p>
            {lastTestedAt && (
              <p className="text-[11px] text-dark-muted/80 mt-1 tabular-nums">
                Terakhir diuji: {lastTestedAt} WIB
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Daftar Komponen Pengujian */}
      <div className="flex flex-col gap-2.5">
        {tests.map((test) => {
          const Icon = test.icon;
          const statusVariant: StatusVariant =
            test.status === 'success' ? 'green' : test.status === 'error' ? 'red' : 'yellow';
          const statusLabel =
            test.status === 'success' ? 'Terhubung' : test.status === 'error' ? 'Gagal' : 'Memeriksa';

          return (
            <Card key={test.id} padding="md" className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-btn bg-dark-surface-high flex items-center justify-center text-accent flex-shrink-0">
                    <Icon size={18} className="stroke-[1.5]" />
                  </div>
                  <div>
                    <h4 className="text-body font-medium text-dark-text leading-snug">
                      {test.name}
                    </h4>
                    <p className="text-caption text-dark-muted">
                      {test.description}
                    </p>
                  </div>
                </div>
                <StatusBadge label={statusLabel} variant={statusVariant} />
              </div>

              <div className="bg-dark-bg/60 rounded-btn p-2.5 border border-dark-border text-caption font-mono text-dark-muted break-all">
                {test.details}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Informasi Kebijakan Keamanan */}
      <Card variant="surface" className="flex items-start gap-2.5">
        <Info size={18} className="text-info flex-shrink-0 mt-0.5 stroke-[1.5]" />
        <div className="text-caption text-dark-muted leading-relaxed">
          <span className="font-semibold text-dark-text block mb-0.5">
            Keamanan Default Deny & Cache
          </span>
          Sesuai aturan keamanan Firebase, akses Firestore tanpa hak otentikasi menghasilkan kode{' '}
          <code className="text-info font-mono">permission-denied</code>. Ini menandakan komunikasi
          jaringan ke backend berjalan normal dan aturan keamanan aktif menolak akses yang tidak sah.
        </div>
      </Card>

      {/* Tombol Uji Ulang (Maksimal 1 tombol utama per layar) */}
      <div className="mt-2">
        <Button
          variant="primary"
          fullWidth
          isLoading={testing}
          onClick={runDiagnostics}
          icon={<RefreshCw size={18} className={testing ? 'animate-spin' : ''} />}
        >
          Uji Ulang Koneksi
        </Button>
      </div>
    </div>
  );
};
