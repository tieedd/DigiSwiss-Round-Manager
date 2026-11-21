import React, { useEffect, useState } from 'react';
import { TournamentAnnouncement } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { ConfirmSheet } from '../common/ConfirmSheet';
import {
  ANNOUNCEMENT_MAX_LENGTH,
  formatRelativeIndonesianTime,
  validateAnnouncementMessage,
} from '../../utils/announcementLogic';
import {
  createTournamentAnnouncement,
  deleteTournamentAnnouncement,
  subscribeTournamentAnnouncements,
  updateTournamentAnnouncement,
} from '../../services/announcementService';
import { useToast } from '../../context/ToastContext';
import { Megaphone, Plus, Pencil, Trash2, Check, X, AlertCircle } from 'lucide-react';

interface TournamentAnnouncementsSectionProps {
  tournamentId: string;
  canManage: boolean;
  actor: {
    uid: string;
    name: string;
  } | null;
}

export const TournamentAnnouncementsSection: React.FC<
  TournamentAnnouncementsSectionProps
> = ({ tournamentId, canManage, actor }) => {
  const { success: showToastSuccess, error: showToastError } = useToast();

  const [announcements, setAnnouncements] = useState<TournamentAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // State form buat baru
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMessage, setComposeMessage] = useState('');
  const [composeError, setComposeError] = useState('');
  const [composeLoading, setComposeLoading] = useState(false);

  // State edit inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // State hapus dengan ConfirmSheet
  const [deleteTarget, setDeleteTarget] = useState<TournamentAnnouncement | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeTournamentAnnouncements(
      tournamentId,
      (items) => {
        setAnnouncements(items);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [tournamentId]);

  // Perbarui waktu relatif setiap 30 detik agar label "Baru saja" / "X menit lalu" tetap segar
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actor || composeLoading) return;

    const validation = validateAnnouncementMessage(composeMessage);
    if (!validation.valid) {
      setComposeError(validation.error || 'Isi pengumuman tidak valid.');
      return;
    }

    setComposeLoading(true);
    setComposeError('');
    try {
      await createTournamentAnnouncement(tournamentId, validation.trimmed, actor);
      setComposeMessage('');
      setComposeOpen(false);
      showToastSuccess('Pengumuman Dipublikasikan', 'Pengumuman organizer berhasil ditambahkan.');
    } catch (err: any) {
      setComposeError(err?.message || 'Gagal menyimpan pengumuman.');
    } finally {
      setComposeLoading(false);
    }
  };

  const handleStartEdit = (item: TournamentAnnouncement) => {
    setEditingId(item.id);
    setEditMessage(item.message);
    setEditError('');
  };

  const handleSaveEdit = async (e: React.FormEvent, itemId: string) => {
    e.preventDefault();
    if (editLoading) return;

    const validation = validateAnnouncementMessage(editMessage);
    if (!validation.valid) {
      setEditError(validation.error || 'Isi pengumuman tidak valid.');
      return;
    }

    setEditLoading(true);
    setEditError('');
    try {
      await updateTournamentAnnouncement(tournamentId, itemId, validation.trimmed);
      setEditingId(null);
      setEditMessage('');
      showToastSuccess('Pengumuman Diperbarui', 'Perubahan pengumuman berhasil disimpan.');
    } catch (err: any) {
      setEditError(err?.message || 'Gagal memperbarui pengumuman.');
    } finally {
      setEditLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!actor || !deleteTarget || deleteLoading) return;
    setDeleteLoading(true);
    try {
      await deleteTournamentAnnouncement(tournamentId, deleteTarget, actor);
      setDeleteTarget(null);
      showToastSuccess('Pengumuman Dihapus', 'Pengumuman telah dihapus.');
    } catch (err: any) {
      showToastError('Gagal Menghapus', err?.message || 'Tidak dapat menghapus pengumuman.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Untuk pemain biasa, jika tidak ada pengumuman sama sekali dan masih loading kosong, tetap tampil kartu ringkas
  return (
    <Card
      variant="surface"
      className="flex flex-col gap-2.5 border-amber-400/25 bg-amber-500/5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Megaphone size={16} className="text-accent flex-shrink-0" />
          <h4 className="text-body font-semibold text-dark-text truncate">
            Pengumuman Organizer
          </h4>
          {announcements.length > 0 && (
            <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-accent/15 text-accent border border-accent/25">
              {announcements.length}
            </span>
          )}
        </div>

        {canManage && !composeOpen && (
          <Button
            variant="secondary"
            className="!min-h-[32px] !px-2.5 !text-[11px]"
            onClick={() => {
              setComposeMessage('');
              setComposeError('');
              setComposeOpen(true);
            }}
            icon={<Plus size={13} />}
          >
            Buat Pengumuman
          </Button>
        )}
      </div>

      {/* Form Tambah Pengumuman */}
      {canManage && composeOpen && (
        <form
          onSubmit={handleCreateSubmit}
          className="p-2.5 rounded-btn bg-dark-surface-high border border-dark-border flex flex-col gap-2"
        >
          <textarea
            value={composeMessage}
            onChange={(e) => {
              setComposeMessage(e.target.value);
              if (composeError) setComposeError('');
            }}
            maxLength={ANNOUNCEMENT_MAX_LENGTH}
            rows={3}
            disabled={composeLoading}
            placeholder="Tulis pengumuman untuk peserta liga (jadwal, aturan, istirahat, dll)..."
            className="w-full rounded-btn bg-dark-surface border border-dark-border px-3 py-2 text-caption text-dark-text placeholder:text-dark-muted focus:outline-none focus:border-accent resize-y"
          />

          <div className="flex items-center justify-between text-[11px] text-dark-muted">
            <span>Maksimal {ANNOUNCEMENT_MAX_LENGTH} karakter</span>
            <span className="font-mono tabular-nums">
              {composeMessage.trim().length}/{ANNOUNCEMENT_MAX_LENGTH}
            </span>
          </div>

          {composeError && (
            <div className="p-2 rounded bg-status-red/10 border border-status-red/30 text-[11px] text-status-red flex items-start gap-1.5">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>{composeError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              disabled={composeLoading}
              onClick={() => {
                setComposeOpen(false);
                setComposeError('');
              }}
              className="!min-h-[32px] !px-3 !text-[11px]"
            >
              Batal
            </Button>
            <Button
              variant="primary"
              type="submit"
              isLoading={composeLoading}
              disabled={composeLoading}
              className="!min-h-[32px] !px-3 !text-[11px]"
            >
              Publikasikan
            </Button>
          </div>
        </form>
      )}

      {/* Daftar Pengumuman */}
      {loading ? (
        <p className="text-caption text-dark-muted py-1">Memuat pengumuman...</p>
      ) : announcements.length === 0 ? (
        <p className="text-caption text-dark-muted italic py-0.5">
          Belum ada pengumuman dari organizer.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {announcements.map((item) => {
            const isEditing = editingId === item.id;
            const isEdited =
              typeof item.updatedAt === 'number' &&
              typeof item.createdAt === 'number' &&
              item.updatedAt > item.createdAt + 1000;

            return (
              <div
                key={item.id}
                className="p-2.5 rounded-btn bg-dark-surface border border-dark-border flex flex-col gap-1.5"
              >
                {isEditing ? (
                  <form
                    onSubmit={(e) => handleSaveEdit(e, item.id)}
                    className="flex flex-col gap-2"
                  >
                    <textarea
                      value={editMessage}
                      onChange={(e) => {
                        setEditMessage(e.target.value);
                        if (editError) setEditError('');
                      }}
                      maxLength={ANNOUNCEMENT_MAX_LENGTH}
                      rows={3}
                      disabled={editLoading}
                      className="w-full rounded-btn bg-dark-surface-high border border-dark-border px-2.5 py-1.5 text-caption text-dark-text focus:outline-none focus:border-accent resize-y"
                    />
                    <div className="flex items-center justify-between text-[11px] text-dark-muted">
                      <span>Edit pengumuman</span>
                      <span className="font-mono tabular-nums">
                        {editMessage.trim().length}/{ANNOUNCEMENT_MAX_LENGTH}
                      </span>
                    </div>
                    {editError && (
                      <span className="text-[11px] text-status-red">{editError}</span>
                    )}
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="secondary"
                        type="button"
                        disabled={editLoading}
                        onClick={() => {
                          setEditingId(null);
                          setEditError('');
                        }}
                        className="!min-h-[30px] !px-2.5 !text-[11px]"
                        icon={<X size={12} />}
                      >
                        Batal
                      </Button>
                      <Button
                        variant="primary"
                        type="submit"
                        isLoading={editLoading}
                        disabled={editLoading}
                        className="!min-h-[30px] !px-2.5 !text-[11px]"
                        icon={<Check size={12} />}
                      >
                        Simpan
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-dark-muted min-w-0">
                        <strong className="text-accent font-semibold truncate">
                          {item.authorName}
                        </strong>
                        <span>&bull;</span>
                        <span className="tabular-nums">
                          {formatRelativeIndonesianTime(item.createdAt, nowMs)}
                        </span>
                        {isEdited && (
                          <span className="text-[10px] italic text-dark-muted/80">
                            (diedit)
                          </span>
                        )}
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(item)}
                            className="p-1.5 rounded-btn text-dark-muted hover:text-accent hover:bg-dark-surface-high transition-colors"
                            aria-label="Edit pengumuman"
                            title="Edit pengumuman"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            className="p-1.5 rounded-btn text-dark-muted hover:text-status-red hover:bg-status-red/10 transition-colors"
                            aria-label="Hapus pengumuman"
                            title="Hapus pengumuman"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    <p className="text-caption text-dark-text whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
                      {item.message}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ConfirmSheet Hapus Pengumuman */}
      <ConfirmSheet
        isOpen={Boolean(deleteTarget)}
        title="Hapus Pengumuman?"
        message="Pengumuman yang dihapus tidak dapat dikembalikan."
        confirmLabel="Ya, Hapus"
        cancelLabel="Batal"
        variant="danger"
        isLoading={deleteLoading}
        zIndexClass="z-[70]"
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!deleteLoading) setDeleteTarget(null);
        }}
      />
    </Card>
  );
};
