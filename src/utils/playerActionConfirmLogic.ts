export type PlayerActionConfirmType = 'drop' | 'deleteManual' | 'deleteParticipant';

export interface PlayerActionConfirmRequest {
  action: PlayerActionConfirmType;
  playerId: string;
  playerName?: string;
}

export interface PlayerActionConfirmContent {
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  variant: 'primary' | 'danger';
}

function normalizePlayerName(playerName?: string): string {
  return (playerName || '').trim() || 'Pemain';
}

/**
 * Menyusun judul, pesan isi, label tombol, dan varian dialog konfirmasi aksi peserta.
 */
export function buildPlayerActionConfirmContent(
  request: PlayerActionConfirmRequest
): PlayerActionConfirmContent {
  const safeName = normalizePlayerName(request.playerName);

  switch (request.action) {
    case 'drop':
      return {
        title: 'Drop Peserta?',
        message: `Tandai ${safeName} sebagai dropped? Pemain tidak akan dipasangkan lagi di ronde berikutnya, poin dari ronde sebelumnya tetap tercatat di klasemen, dan jumlah ronde turnamen tidak berubah.`,
        cancelLabel: 'Batal',
        confirmLabel: 'Ya, Drop',
        variant: 'danger',
      };
    case 'deleteManual':
      return {
        title: 'Hapus Peserta?',
        message: `Hapus peserta manual ${safeName} dari turnamen ini?`,
        cancelLabel: 'Batal',
        confirmLabel: 'Ya, Hapus',
        variant: 'danger',
      };
    case 'deleteParticipant':
      return {
        title: 'Hapus Peserta?',
        message: `Hapus peserta ${safeName} dari turnamen ini? Data deck peserta di turnamen ini juga akan dihapus.`,
        cancelLabel: 'Batal',
        confirmLabel: 'Ya, Hapus',
        variant: 'danger',
      };
  }
}

/**
 * Pesan toast sukses setelah aksi peserta selesai dijalankan.
 */
export function getPlayerActionSuccessToast(
  action: PlayerActionConfirmType,
  playerName?: string
): string {
  const safeName = normalizePlayerName(playerName);

  switch (action) {
    case 'drop':
      return `${safeName} ditandai dropped`;
    case 'deleteManual':
      return `Peserta manual ${safeName} dihapus`;
    case 'deleteParticipant':
      return `Peserta ${safeName} dihapus dari turnamen`;
  }
}
