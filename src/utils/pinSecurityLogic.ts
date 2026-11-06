import type { UserProfile } from '../types/index.ts';

export const PIN_PBKDF2_ITERATIONS = 150000;
export const MAX_PIN_FAILED_ATTEMPTS = 5;
export const PIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 menit

/**
 * Validasi apakah PIN terdiri dari tepat 6 digit numerik
 */
export function isPinFormatValid(pin: string): boolean {
  return typeof pin === 'string' && /^\d{6}$/.test(pin.trim());
}

/**
 * Memeriksa apakah PIN termasuk kombinasi lemah yang mudah ditebak
 */
export function isWeakPin(pin: string): { isWeak: boolean; reason?: string } {
  const cleanPin = pin.trim();
  if (!isPinFormatValid(cleanPin)) {
    return { isWeak: true, reason: 'PIN harus terdiri dari 6 digit angka.' };
  }

  // 1. 6 digit sama persis (misal: 111111, 000000)
  if (/^(\d)\1{5}$/.test(cleanPin)) {
    return {
      isWeak: true,
      reason: 'PIN tidak boleh berupa 6 angka yang sama (contoh: 111111).'
    };
  }

  // 2. Berurutan naik (misal: 123456, 234567, 012345)
  if ('0123456789'.includes(cleanPin)) {
    return {
      isWeak: true,
      reason: 'PIN tidak boleh berupa angka berurutan naik (contoh: 123456).'
    };
  }

  // 3. Berurutan turun (misal: 654321, 987654, 543210)
  if ('9876543210'.includes(cleanPin)) {
    return {
      isWeak: true,
      reason: 'PIN tidak boleh berupa angka berurutan turun (contoh: 654321).'
    };
  }

  // 4. Pola 2 digit berulang (misal: 121212, 595959)
  if (/^(\d{2})\1{2}$/.test(cleanPin)) {
    return {
      isWeak: true,
      reason: 'PIN tidak boleh berupa pola 2 angka berulang (contoh: 121212).'
    };
  }

  // 5. Pola 3 digit berulang (misal: 123123, 456456)
  if (/^(\d{3})\1$/.test(cleanPin)) {
    return {
      isWeak: true,
      reason: 'PIN tidak boleh berupa pola 3 angka berulang (contoh: 123123).'
    };
  }

  return { isWeak: false };
}

/**
 * Konversi Uint8Array ke Base64 string
 */
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Konversi Base64 string ke Uint8Array
 */
export function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Hashing PIN menggunakan Web Crypto API PBKDF2-SHA256 (>= 150000 iterasi)
 */
export async function hashPin(
  pin: string,
  customSaltBytes?: Uint8Array,
  iterations = PIN_PBKDF2_ITERATIONS
): Promise<{
  algo: 'pbkdf2-sha256';
  iterations: number;
  salt: string;
  hash: string;
}> {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error(
      'Web Crypto API (crypto.subtle) tidak didukung pada browser/perangkat ini. Demi keamanan akun, pemrosesan PIN tidak dapat dilanjutkan.'
    );
  }

  const saltBytes = customSaltBytes || cryptoObj.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin.trim());

  const keyMaterial = await cryptoObj.subtle.importKey(
    'raw',
    pinData,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await cryptoObj.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    256 // 256 bits = 32 bytes
  );

  return {
    algo: 'pbkdf2-sha256',
    iterations,
    salt: bytesToBase64(saltBytes),
    hash: bytesToBase64(new Uint8Array(derivedBits))
  };
}

/**
 * Memverifikasi kecocokan PIN dengan salt dan hash yang tersimpan
 */
export async function verifyPinHash(
  pin: string,
  saltBase64: string,
  expectedHashBase64: string,
  iterations = PIN_PBKDF2_ITERATIONS
): Promise<boolean> {
  try {
    const saltBytes = base64ToBytes(saltBase64);
    const result = await hashPin(pin, saltBytes, iterations);
    return result.hash === expectedHashBase64;
  } catch (err) {
    console.error('Verifikasi hash PIN gagal:', err);
    return false;
  }
}

/**
 * Memeriksa status penguncian PIN berdasarkan lockedUntil
 */
export function isPinLocked(
  lockedUntil: number | null | undefined,
  now = Date.now()
): { locked: boolean; remainingSeconds: number } {
  if (lockedUntil && lockedUntil > now) {
    return {
      locked: true,
      remainingSeconds: Math.ceil((lockedUntil - now) / 1000)
    };
  }
  return { locked: false, remainingSeconds: 0 };
}

/**
 * Menentukan rute gerbang aplikasi sesuai urutan keamanan:
 * 1. Loading
 * 2. Login
 * 3. Ganti Password Wajib (mustChangePassword)
 * 4. Pembuatan PIN Wajib (create_pin)
 * 5. Aplikasi Utama (app)
 */
export function getGateRoute(
  userProfile: UserProfile | null,
  hasPin: boolean | null
): 'loading' | 'login' | 'must_change_password' | 'create_pin' | 'app' {
  if (!userProfile) {
    return 'login';
  }
  if (userProfile.mustChangePassword) {
    return 'must_change_password';
  }
  if (hasPin === null) {
    return 'loading';
  }
  if (!hasPin) {
    return 'create_pin';
  }
  return 'app';
}
