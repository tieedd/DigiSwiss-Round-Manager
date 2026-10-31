import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { UserProfile, UserRole } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { StatusBadge } from '../../components/common/StatusBadge';
import { BottomSheet } from '../../components/common/BottomSheet';
import { AccessDeniedView } from '../../components/common/AccessDeniedView';
import { recordAuditLog, reauthenticateCurrentUser } from '../../services/authService';
import { canAccessAdminUsers, validateRoleChange, validateStatusToggle } from '../../utils/adminHelpers';
import {
  Users,
  Search,
  RefreshCw,
  UserCheck,
  UserX,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Eye,
  EyeOff,
  AlertCircle
} from 'lucide-react';

interface UserItem extends UserProfile {
  id: string;
}

const PAGE_SIZE = 20;

export const AdminUsersView: React.FC<{ onNavigateHome?: () => void }> = ({ onNavigateHome }) => {
  const { userProfile: currentAdminProfile, currentUser } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // State Konfirmasi Ubah Peran via Dropdown
  const [roleChangeModalOpen, setRoleChangeModalOpen] = useState(false);
  const [targetUser, setTargetUser] = useState<UserItem | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<'player' | 'organizer'>('player');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // State Konfirmasi Ubah Status Aktif/Nonaktif
  const [statusToggleModalOpen, setStatusToggleModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<boolean>(false);

  // Akses Gate: Hanya role 'admin' yang dapat mengakses
  if (!canAccessAdminUsers(currentAdminProfile?.role)) {
    return (
      <AccessDeniedView
        onReturn={onNavigateHome}
        message="Halaman Kelola Pengguna hanya dapat diakses oleh Admin Sistem."
      />
    );
  }

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Mengambil data pengguna nyata dari Firestore dengan batas hemat kuota
      const q = query(collection(db, 'users'), limit(100));
      const snap = await getDocs(q);
      const list: UserItem[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as UserProfile) });
      });
      setUsers(list);
    } catch (err) {
      console.error('Gagal mengambil daftar pengguna:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Filter pencarian berdasarkan username atau nama tampilan
  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return users;
    return users.filter((u) => {
      const uName = (u.username || '').toLowerCase();
      const dName = (u.displayName || '').toLowerCase();
      return uName.includes(q) || dName.includes(q);
    });
  }, [users, searchQuery]);

  // Paginasi 20 per halaman
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredUsers.slice(start, start + PAGE_SIZE);
  }, [filteredUsers, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Penanganan klik dropdown peran
  const handleDropdownRoleSelect = (user: UserItem, newRole: 'player' | 'organizer') => {
    if (user.username === 'admindss') {
      alert('Peran Admin Utama dilindungi dan tidak dapat diubah.');
      return;
    }
    if (user.role === newRole) return;

    setTargetUser(user);
    setSelectedNewRole(newRole);
    setAdminPassword('');
    setActionError('');
    setRoleChangeModalOpen(true);
  };

  // Konfirmasi & Eksekusi Perubahan Peran
  const handleConfirmRoleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUser || !currentUser) return;

    const validation = validateRoleChange({
      adminRole: currentAdminProfile?.role,
      targetUsername: targetUser.username,
      currentRole: targetUser.role,
      newRole: selectedNewRole,
      adminPassword,
    });

    if (!validation.allowed) {
      setActionError(validation.reason || 'Aksi tidak diizinkan.');
      return;
    }

    setActionLoading(true);
    setActionError('');
    try {
      // 1. Verifikasi password admin terlebih dahulu via reauthenticate
      await reauthenticateCurrentUser(adminPassword);

      // 2. Update dokumen users/{uid}
      const userRef = doc(db, 'users', targetUser.id);
      const oldRole = targetUser.role;
      await updateDoc(userRef, { role: selectedNewRole });

      // 3. Catat ke audit log
      await recordAuditLog(
        currentUser.uid,
        currentAdminProfile?.displayName || currentAdminProfile?.username || 'Admin',
        'USER_ROLE_CHANGED',
        `users/${targetUser.id}`,
        oldRole,
        selectedNewRole
      );

      // 4. Perbarui state lokal
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, role: selectedNewRole } : u))
      );

      setRoleChangeModalOpen(false);
      setTargetUser(null);
      setAdminPassword('');
    } catch (err: any) {
      setActionError(err?.message || 'Password admin tidak sesuai.');
    } finally {
      setActionLoading(false);
    }
  };

  // Penanganan klik tombol aktifkan / nonaktifkan akun
  const handleOpenStatusToggle = (user: UserItem, nextActive: boolean) => {
    if (user.username === 'admindss') {
      alert('Akun Admin Utama dilindungi dan tidak dapat dinonaktifkan.');
      return;
    }

    setTargetUser(user);
    setTargetStatus(nextActive);
    setAdminPassword('');
    setActionError('');
    setStatusToggleModalOpen(true);
  };

  // Konfirmasi & Eksekusi Perubahan Status Akun
  const handleConfirmStatusToggle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUser || !currentUser) return;

    const validation = validateStatusToggle({
      adminRole: currentAdminProfile?.role,
      targetUsername: targetUser.username,
      adminPassword,
    });

    if (!validation.allowed) {
      setActionError(validation.reason || 'Aksi tidak diizinkan.');
      return;
    }

    setActionLoading(true);
    setActionError('');
    try {
      // 1. Verifikasi password admin
      await reauthenticateCurrentUser(adminPassword);

      // 2. Update dokumen users/{uid}
      const userRef = doc(db, 'users', targetUser.id);
      const oldStatus = targetUser.active ? 'active' : 'inactive';
      const newStatus = targetStatus ? 'active' : 'inactive';
      await updateDoc(userRef, { active: targetStatus });

      // 3. Catat ke audit log
      await recordAuditLog(
        currentUser.uid,
        currentAdminProfile?.displayName || currentAdminProfile?.username || 'Admin',
        targetStatus ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        `users/${targetUser.id}`,
        oldStatus,
        newStatus
      );

      // 4. Perbarui state lokal (jika dinonaktifkan, sesi pengguna yang bersangkutan akan terputus otomatis)
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, active: targetStatus } : u))
      );

      setStatusToggleModalOpen(false);
      setTargetUser(null);
      setAdminPassword('');
    } catch (err: any) {
      setActionError(err?.message || 'Password admin tidak sesuai.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-section-title text-dark-text font-semibold">
            Kelola Pengguna
          </h2>
          <p className="text-caption text-dark-muted">
            Daftar akun riil pengguna sistem ({filteredUsers.length} total)
          </p>
        </div>
        <Button
          variant="secondary"
          className="!min-h-[38px] !px-3 !text-caption"
          onClick={fetchUsers}
          icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}
        >
          Muat Ulang
        </Button>
      </div>

      {/* Pencarian Akun */}
      <Input
        placeholder="Cari username atau nama tampilan..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        leftIcon={<Search size={18} />}
      />

      {/* Daftar Akun (Paginasi 20 per halaman) */}
      <div className="flex flex-col gap-2">
        {loading ? (
          <Card variant="surface" className="text-center py-8 text-caption text-dark-muted">
            Memuat daftar pengguna dari Firestore...
          </Card>
        ) : paginatedUsers.length === 0 ? (
          <Card variant="surface" className="text-center py-8 text-caption text-dark-muted">
            Tidak ada akun yang sesuai dengan kriteria pencarian.
          </Card>
        ) : (
          paginatedUsers.map((u) => {
            const isMainAdmin = u.username === 'admindss';
            return (
              <Card
                key={u.id}
                variant="surface"
                padding="sm"
                className="flex flex-col gap-2.5 border-dark-border"
              >
                {/* Baris Informasi Akun */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-dark-surface-high border border-dark-border flex items-center justify-center text-accent font-semibold text-body flex-shrink-0">
                      {u.displayName ? u.displayName.charAt(0).toUpperCase() : u.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-body font-medium text-dark-text truncate">
                          {u.displayName || u.username}
                        </span>
                        {isMainAdmin && (
                          <span className="text-[10px] bg-accent/15 text-accent border border-accent/30 px-1.5 py-0.2 rounded font-mono font-medium">
                            Admin Utama
                          </span>
                        )}
                      </div>
                      <span className="text-caption font-mono text-dark-muted truncate block">
                        @{u.username}
                      </span>
                    </div>
                  </div>

                  {/* Status Aktif */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge
                      label={u.active ? 'Aktif' : 'Nonaktif'}
                      variant={u.active ? 'green' : 'red'}
                    />
                  </div>
                </div>

                {/* Baris Kontrol: Dropdown Peran & Tombol Status */}
                <div className="pt-2 border-t border-dark-border/80 flex items-center justify-between gap-2 flex-wrap text-caption">
                  {/* Dropdown Ubah Peran (Hanya player dan organizer) */}
                  <div className="flex items-center gap-2">
                    <span className="text-dark-muted text-[11px]">Peran:</span>
                    {isMainAdmin ? (
                      <span className="font-mono text-[11px] font-semibold text-accent px-2 py-1 rounded bg-accent/10 border border-accent/30">
                        admin
                      </span>
                    ) : (
                      <select
                        aria-label={`Ubah peran untuk @${u.username}`}
                        value={u.role}
                        onChange={(e) =>
                          handleDropdownRoleSelect(u, e.target.value as 'player' | 'organizer')
                        }
                        className="bg-dark-surface-high text-dark-text border border-dark-border rounded-md px-2.5 py-1 text-caption font-medium focus:outline-none focus:border-accent cursor-pointer min-h-[34px]"
                      >
                        <option value="player">player</option>
                        <option value="organizer">organizer</option>
                      </select>
                    )}
                  </div>

                  {/* Tombol Toggle Aktif / Nonaktif */}
                  {!isMainAdmin && (
                    <div>
                      {u.active ? (
                        <button
                          type="button"
                          onClick={() => handleOpenStatusToggle(u, false)}
                          className="inline-flex items-center gap-1 text-[11px] text-status-red hover:underline px-2 py-1 min-h-[34px] rounded hover:bg-status-red/10 transition-colors"
                        >
                          <UserX size={14} />
                          <span>Nonaktifkan</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenStatusToggle(u, true)}
                          className="inline-flex items-center gap-1 text-[11px] text-status-green hover:underline px-2 py-1 min-h-[34px] rounded hover:bg-status-green/10 transition-colors"
                        >
                          <UserCheck size={14} />
                          <span>Aktifkan</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Kontrol Paginasi (20 Akun per Halaman) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 px-1 text-caption text-dark-muted">
          <span>
            Halaman <strong className="text-dark-text">{currentPage}</strong> dari{' '}
            <strong className="text-dark-text">{totalPages}</strong>
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="!min-h-[36px] !px-2.5 !text-caption"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              icon={<ChevronLeft size={16} />}
            >
              Sebelumnya
            </Button>
            <Button
              variant="secondary"
              className="!min-h-[36px] !px-2.5 !text-caption"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              <span className="flex items-center gap-1">
                <span>Berikutnya</span>
                <ChevronRight size={16} />
              </span>
            </Button>
          </div>
        </div>
      )}

      {/* Bottom Sheet Konfirmasi Ubah Peran + Password Admin */}
      <BottomSheet
        isOpen={roleChangeModalOpen}
        onClose={() => {
          setRoleChangeModalOpen(false);
          setTargetUser(null);
          setAdminPassword('');
        }}
        title="Konfirmasi Perubahan Peran"
      >
        {targetUser && (
          <form onSubmit={handleConfirmRoleChange} className="flex flex-col gap-3 py-1">
            <div className="p-3 bg-dark-surface-high rounded-btn border border-dark-border text-caption flex flex-col gap-1">
              <div>
                Akun:{' '}
                <strong className="text-dark-text">
                  {targetUser.displayName || targetUser.username} (@{targetUser.username})
                </strong>
              </div>
              <div>
                Perubahan Peran:{' '}
                <span className="font-mono text-dark-muted">{targetUser.role}</span> &rarr;{' '}
                <span className="font-mono text-accent font-semibold">{selectedNewRole}</span>
              </div>
            </div>

            <div className="flex items-start gap-2 p-2.5 rounded-btn bg-status-yellow/10 border border-status-yellow/30 text-caption text-status-yellow">
              <ShieldAlert size={16} className="flex-shrink-0 mt-0.5 stroke-[1.5]" />
              <span>
                Masukkan password admin Anda untuk mengonfirmasi perubahan peran pengguna ini.
              </span>
            </div>

            <Input
              label="Password Admin"
              type={showAdminPassword ? 'text' : 'password'}
              placeholder="Password"
              value={adminPassword}
              onChange={(e) => {
                setAdminPassword(e.target.value);
                if (actionError) setActionError('');
              }}
              error={actionError}
              disabled={actionLoading}
              autoComplete="current-password"
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                  className="p-1 text-dark-muted hover:text-dark-text focus:outline-none"
                  aria-label={showAdminPassword ? 'Sembunyikan' : 'Tampilkan'}
                >
                  {showAdminPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
            />

            <div className="flex flex-col gap-2 mt-2">
              <Button variant="primary" fullWidth type="submit" isLoading={actionLoading}>
                Konfirmasi Ubah Peran
              </Button>
              <Button
                variant="secondary"
                fullWidth
                type="button"
                disabled={actionLoading}
                onClick={() => {
                  setRoleChangeModalOpen(false);
                  setTargetUser(null);
                  setAdminPassword('');
                }}
              >
                Batal
              </Button>
            </div>
          </form>
        )}
      </BottomSheet>

      {/* Bottom Sheet Konfirmasi Status Aktif/Nonaktif + Password Admin */}
      <BottomSheet
        isOpen={statusToggleModalOpen}
        onClose={() => {
          setStatusToggleModalOpen(false);
          setTargetUser(null);
          setAdminPassword('');
        }}
        title={targetStatus ? 'Aktifkan Akun' : 'Nonaktifkan Akun'}
      >
        {targetUser && (
          <form onSubmit={handleConfirmStatusToggle} className="flex flex-col gap-3 py-1">
            <div className="p-3 bg-dark-surface-high rounded-btn border border-dark-border text-caption flex flex-col gap-1">
              <div>
                Target Akun:{' '}
                <strong className="text-dark-text">
                  {targetUser.displayName || targetUser.username} (@{targetUser.username})
                </strong>
              </div>
              <p className="text-dark-muted mt-1 leading-relaxed">
                {targetStatus
                  ? 'Akun ini akan diaktifkan kembali dan dapat masuk ke aplikasi DigiSwiss-Round.'
                  : 'Akun ini akan dinonaktifkan. Pengguna akan secara otomatis dikeluarkan dari aplikasi saat sesi diperiksa.'}
              </p>
            </div>

            <div className="flex items-start gap-2 p-2.5 rounded-btn bg-status-yellow/10 border border-status-yellow/30 text-caption text-status-yellow">
              <ShieldAlert size={16} className="flex-shrink-0 mt-0.5 stroke-[1.5]" />
              <span>
                Masukkan password admin Anda untuk mengonfirmasi perubahan status akun ini.
              </span>
            </div>

            <Input
              label="Password Admin"
              type={showAdminPassword ? 'text' : 'password'}
              placeholder="Password"
              value={adminPassword}
              onChange={(e) => {
                setAdminPassword(e.target.value);
                if (actionError) setActionError('');
              }}
              error={actionError}
              disabled={actionLoading}
              autoComplete="current-password"
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                  className="p-1 text-dark-muted hover:text-dark-text focus:outline-none"
                  aria-label={showAdminPassword ? 'Sembunyikan' : 'Tampilkan'}
                >
                  {showAdminPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
            />

            <div className="flex flex-col gap-2 mt-2">
              <Button
                variant={targetStatus ? 'primary' : 'danger'}
                fullWidth
                type="submit"
                isLoading={actionLoading}
              >
                {targetStatus ? 'Aktifkan Akun' : 'Nonaktifkan Akun'}
              </Button>
              <Button
                variant="secondary"
                fullWidth
                type="button"
                disabled={actionLoading}
                onClick={() => {
                  setStatusToggleModalOpen(false);
                  setTargetUser(null);
                  setAdminPassword('');
                }}
              >
                Batal
              </Button>
            </div>
          </form>
        )}
      </BottomSheet>
    </div>
  );
};
