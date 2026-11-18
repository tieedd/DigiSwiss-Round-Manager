export type WaitingStatusConfirmAction = 'accept' | 'reject' | 'acceptAll';

export interface WaitingStatusPlayerLike {
  id: string;
  name?: string;
  status: string;
}

export interface WaitingStatusConfirmRequest {
  action: WaitingStatusConfirmAction;
  playerId?: string;
  playerName?: string;
  waitingCount?: number;
}

export interface WaitingStatusConfirmContent {
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  confirmVariant: 'primary' | 'danger';
}

/**
 * Memeriksa apakah objek pemain masih berstatus 'waiting'.
 */
export function isPlayerWaiting(
  player: Pick<WaitingStatusPlayerLike, 'status'> | null | undefined
): boolean {
  return Boolean(player && player.status === 'waiting');
}

/**
 * Memeriksa apakah pemain dengan ID tertentu masih ada di daftar dan berstatus 'waiting'.
 */
export function isPlayerStillWaitingInList(
  players: ReadonlyArray<Pick<WaitingStatusPlayerLike, 'id' | 'status'>>,
  playerId: string | null | undefined
): boolean {
  if (!playerId) return false;
  const target = players.find((p) => p.id === playerId);
  return isPlayerWaiting(target);
}

/**
 * Menyaring hanya pemain yang masih berstatus 'waiting'.
 */
export function filterWaitingPlayers<T extends Pick<WaitingStatusPlayerLike, 'status'>>(
  players: ReadonlyArray<T>
): T[] {
  return players.filter((p) => isPlayerWaiting(p));
}

/**
 * Menyusun judul, pesan isi, serta label & varian tombol dialog konfirmasi Waiting List.
 */
export function buildWaitingStatusConfirmContent(
  request: WaitingStatusConfirmRequest
): WaitingStatusConfirmContent {
  const safeName = (request.playerName || '').trim() || 'Pemain';
  const rawCount = Number.isFinite(request.waitingCount) ? Number(request.waitingCount) : 0;
  const safeCount = Math.max(0, Math.floor(rawCount));

  switch (request.action) {
    case 'accept':
      return {
        title: 'Terima Peserta?',
        message: `Terima ${safeName} sebagai peserta resmi?`,
        cancelLabel: 'Batal',
        confirmLabel: 'Ya, Terima',
        confirmVariant: 'primary',
      };
    case 'reject':
      return {
        title: 'Tolak Peserta?',
        message: `Tolak ${safeName}? Pemain ini tidak akan ikut turnamen.`,
        cancelLabel: 'Batal',
        confirmLabel: 'Ya, Tolak',
        confirmVariant: 'danger',
      };
    case 'acceptAll':
      return {
        title: 'Terima Semua?',
        message:
          safeCount === 1
            ? 'Terima 1 pemain di Waiting List?'
            : `Terima ${safeCount} pemain di Waiting List?`,
        cancelLabel: 'Batal',
        confirmLabel: 'Ya, Terima Semua',
        confirmVariant: 'primary',
      };
  }
}

/**
 * Pesan toast sukses setelah pembaruan status Waiting List selesai.
 */
export function getWaitingStatusSuccessToast(
  action: WaitingStatusConfirmAction,
  options: { playerName?: string; count?: number } = {}
): string {
  const safeName = (options.playerName || '').trim() || 'Pemain';
  const rawCount = Number.isFinite(options.count) ? Number(options.count) : 0;
  const safeCount = Math.max(0, Math.floor(rawCount));

  switch (action) {
    case 'accept':
      return `${safeName} diterima`;
    case 'reject':
      return `${safeName} ditolak`;
    case 'acceptAll':
      return safeCount === 1
        ? '1 pemain di Waiting List diterima'
        : `${safeCount} pemain di Waiting List diterima`;
  }
}

/**
 * Pesan singkat jika pemain ternyata sudah tidak berstatus 'waiting' saat konfirmasi ditekan.
 */
export function getAlreadyProcessedMessage(
  action: WaitingStatusConfirmAction,
  playerName?: string
): string {
  const safeName = (playerName || '').trim() || 'Pemain';
  if (action === 'acceptAll') {
    return 'Semua pemain di Waiting List sudah diproses sebelumnya.';
  }
  return `${safeName} sudah tidak berstatus Waiting List.`;
}
