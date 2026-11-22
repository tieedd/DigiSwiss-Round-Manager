export interface ErrorInfoLike {
  name?: string;
  message?: string;
  stack?: string;
}

const MAX_MESSAGE_LEN = 300;
const MAX_STACK_LINES = 8;
const MAX_COMPONENT_STACK_LINES = 6;

function truncateLines(raw: string | undefined, maxLines: number): string[] {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, maxLines);
}

/**
 * Susun ringkasan galat aman untuk disalin pengguna.
 * Hanya berisi nama, pesan galat, dan potongan pendek stack trace tanpa data pengguna.
 */
export function formatSafeErrorDetails(
  error: ErrorInfoLike | null | undefined,
  componentStack?: string
): string {
  const name = (error?.name || 'Error').trim() || 'Error';
  const rawMessage = (error?.message || 'Terjadi kesalahan tidak dikenal').trim();
  const message =
    rawMessage.length > MAX_MESSAGE_LEN
      ? `${rawMessage.slice(0, MAX_MESSAGE_LEN)}...`
      : rawMessage;

  const lines: string[] = [`${name}: ${message}`];

  const stackLines = truncateLines(error?.stack, MAX_STACK_LINES);
  if (stackLines.length > 0) {
    lines.push('', 'Stack:', ...stackLines);
  }

  const compLines = truncateLines(componentStack, MAX_COMPONENT_STACK_LINES);
  if (compLines.length > 0) {
    lines.push('', 'Component:', ...compLines);
  }

  return lines.join('\n');
}
