import { RESET_API_TIMEOUT_MS, RESET_API_URL } from '../config/resetApi.ts';

export type ResetApiErrorCode =
  | 'bad_request'
  | 'weak_password'
  | 'mismatch'
  | 'locked'
  | 'busy'
  | 'unauthorized'
  | 'not_found'
  | 'rate_limited'
  | 'server_error'
  | 'network_error'
  | 'timeout'
  | 'invalid_response';

export interface ResetWithPinResponse {
  ok: true;
  mode: 'pin';
  needsNewPin: false;
}

export interface ResetWithCodeResponse {
  ok: true;
  mode: 'code';
  needsNewPin: true;
}

export interface CreateResetCodeResponse {
  ok: true;
  code: string;
  expiresAt: number;
  minutes: number;
}

export interface ResetApiErrorResponse {
  ok: false;
  code?: ResetApiErrorCode | string;
  message?: string;
  remainingAttempts?: number;
  lockedUntil?: number;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CreateResetCodeDeps {
  reauthenticate: (password: string) => Promise<boolean>;
  getIdToken: () => Promise<string>;
  fetchImpl?: FetchLike;
}

export class PasswordResetError extends Error {
  code: ResetApiErrorCode | string;
  remainingAttempts?: number;
  lockedUntil?: number;

  constructor(
    message: string,
    code: ResetApiErrorCode | string = 'server_error',
    options?: { remainingAttempts?: number; lockedUntil?: number }
  ) {
    super(message);
    this.name = 'PasswordResetError';
    this.code = code;
    this.remainingAttempts = options?.remainingAttempts;
    this.lockedUntil = options?.lockedUntil;
  }
}

/**
 * Normalisasi username sebelum dikirim: hapus spasi tepi dan ubah ke huruf kecil.
 */
export function normalizeResetUsername(raw: string): string {
  if (!raw) return '';
  return raw.trim().toLowerCase();
}

/**
 * Normalisasi kode reset darurat: hapus seluruh spasi dan ubah ke huruf besar.
 */
export function normalizeResetCode(raw: string): string {
  if (!raw) return '';
  return raw.replace(/\s+/g, '').toUpperCase();
}

/**
 * Normalisasi PIN: sisakan angka 0-9 saja, maksimal 6 digit.
 */
export function normalizeResetPin(raw: string): string {
  if (!raw) return '';
  return raw.replace(/\D/g, '').slice(0, 6);
}

function getFallbackErrorMessage(code?: string): string {
  switch (code) {
    case 'bad_request':
      return 'Data yang dikirim tidak lengkap atau tidak valid.';
    case 'weak_password':
      return 'Password baru belum memenuhi syarat keamanan.';
    case 'mismatch':
      return 'Username, PIN, atau kode reset tidak sesuai.';
    case 'locked':
      return 'Percobaan reset dikunci sementara karena terlalu banyak kegagalan.';
    case 'busy':
      return 'Server sedang sibuk memproses permintaan. Silakan coba sesaat lagi.';
    case 'unauthorized':
      return 'Sesi admin tidak valid atau Anda tidak memiliki izin untuk aksi ini.';
    case 'not_found':
      return 'Akun pengguna tidak ditemukan atau tidak aktif.';
    case 'rate_limited':
      return 'Terlalu banyak permintaan reset. Silakan tunggu beberapa saat.';
    default:
      return 'Terjadi kesalahan pada server reset. Silakan coba lagi.';
  }
}

async function postResetApi<T extends { ok: true }>(
  payload: Record<string, unknown>,
  fetchImpl: FetchLike = fetch,
  timeoutMs: number = RESET_API_TIMEOUT_MS
): Promise<T> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  if (controller) {
    timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
  }

  let response: Response;
  try {
    response = await fetchImpl(RESET_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      redirect: 'follow',
      body: JSON.stringify(payload),
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new PasswordResetError(
        'Permintaan ke server reset melebihi batas waktu (40 detik). Silakan coba lagi.',
        'timeout'
      );
    }
    throw new PasswordResetError(
      'Tidak dapat menghubungi server reset. Periksa koneksi internet.',
      'network_error'
    );
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }

  let rawText = '';
  try {
    rawText = await response.text();
  } catch {
    throw new PasswordResetError(
      'Gagal membaca respons dari server reset. Silakan coba lagi.',
      'invalid_response'
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new PasswordResetError(
      'Respons server reset tidak valid. Silakan coba lagi.',
      'invalid_response'
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new PasswordResetError(
      'Format respons server reset tidak dikenali.',
      'invalid_response'
    );
  }

  if (parsed.ok !== true) {
    const errPayload = parsed as ResetApiErrorResponse;
    const errCode = typeof errPayload.code === 'string' && errPayload.code ? errPayload.code : 'server_error';
    const message =
      typeof errPayload.message === 'string' && errPayload.message.trim()
        ? errPayload.message
        : getFallbackErrorMessage(errCode);

    throw new PasswordResetError(message, errCode, {
      remainingAttempts:
        typeof errPayload.remainingAttempts === 'number' ? errPayload.remainingAttempts : undefined,
      lockedUntil:
        typeof errPayload.lockedUntil === 'number' ? errPayload.lockedUntil : undefined,
    });
  }

  return parsed as T;
}

/**
 * Reset password pengguna menggunakan PIN keamanan 6 digit.
 */
export async function resetPasswordWithPin(
  username: string,
  pin: string,
  newPassword: string,
  fetchImpl?: FetchLike
): Promise<ResetWithPinResponse> {
  return postResetApi<ResetWithPinResponse>(
    {
      action: 'resetWithPin',
      username: normalizeResetUsername(username),
      pin: normalizeResetPin(pin),
      newPassword,
    },
    fetchImpl
  );
}

/**
 * Reset password pengguna menggunakan kode reset darurat dari Admin.
 */
export async function resetPasswordWithCode(
  username: string,
  code: string,
  newPassword: string,
  fetchImpl?: FetchLike
): Promise<ResetWithCodeResponse> {
  return postResetApi<ResetWithCodeResponse>(
    {
      action: 'resetWithCode',
      username: normalizeResetUsername(username),
      code: normalizeResetCode(code),
      newPassword,
    },
    fetchImpl
  );
}

/**
 * Membuat kode reset darurat oleh Admin setelah re-otentikasi password admin.
 * Dipisahkan dengan injeksi dependensi agar mudah diuji tanpa SDK Firebase langsung.
 */
export async function createResetCodeWithAuth(
  username: string,
  minutes: number,
  adminPassword: string,
  deps: CreateResetCodeDeps
): Promise<CreateResetCodeResponse> {
  await deps.reauthenticate(adminPassword);
  const idToken = await deps.getIdToken();

  return postResetApi<CreateResetCodeResponse>(
    {
      action: 'createResetCode',
      idToken,
      username: normalizeResetUsername(username),
      minutes,
    },
    deps.fetchImpl
  );
}
