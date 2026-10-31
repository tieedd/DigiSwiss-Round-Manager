/**
 * Memformat timestamp ke representasi tanggal dan waktu dalam Bahasa Indonesia.
 * Contoh: "29 Okt 2026, 23:26 WIB"
 */
export function formatIndonesianDateTime(timestamp: number | null | undefined): string {
  if (!timestamp) return 'Belum pernah login';

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '-';

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
  ];

  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day} ${month} ${year}, ${hours}:${minutes} WIB`;
}

/**
 * Memformat timestamp ke representasi waktu singkat: "HH:mm:ss"
 */
export function formatIndonesianTime(timestamp: number | null | undefined): string {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '-';

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}
