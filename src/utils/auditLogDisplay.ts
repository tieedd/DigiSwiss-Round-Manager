export interface AuditLogKeyValueLine {
  key: string;
  value: string;
}

export interface FormattedAuditLogValue {
  kind: 'empty' | 'json' | 'text';
  lines: AuditLogKeyValueLine[];
  text: string;
}

export interface FormatAuditLogOptions {
  maxTextLength?: number;
  maxEntries?: number;
  maxDepth?: number;
}

const DEFAULT_MAX_TEXT_LENGTH = 2000;
const DEFAULT_MAX_ENTRIES = 60;
const DEFAULT_MAX_DEPTH = 4;

function truncateWithEllipsis(input: string, maxLength: number): string {
  if (maxLength <= 0 || input.length <= maxLength) return input;
  if (maxLength <= 3) return input.slice(0, maxLength);
  return `${input.slice(0, maxLength - 3)}...`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatScalarOrArray(value: unknown, maxTextLength: number): string {
  if (value === null) return 'null';
  if (value === undefined) return '-';
  if (typeof value === 'string') {
    return truncateWithEllipsis(value, maxTextLength);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    try {
      const items = value.map((item) => {
        if (typeof item === 'string') return item;
        if (item === null) return 'null';
        if (typeof item === 'number' || typeof item === 'boolean') return String(item);
        return JSON.stringify(item);
      });
      return truncateWithEllipsis(`[${items.join(', ')}]`, maxTextLength);
    } catch {
      return '[...]';
    }
  }
  try {
    return truncateWithEllipsis(JSON.stringify(value), maxTextLength);
  } catch {
    return String(value);
  }
}

function flattenObjectEntries(
  obj: Record<string, unknown>,
  prefix: string,
  depth: number,
  maxDepth: number,
  maxTextLength: number,
  maxEntries: number,
  out: AuditLogKeyValueLine[]
): boolean {
  const keys = Object.keys(obj);
  for (const key of keys) {
    if (out.length >= maxEntries) {
      return true;
    }
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];

    if (isPlainObject(val)) {
      const childKeys = Object.keys(val);
      if (childKeys.length === 0) {
        out.push({ key: fullKey, value: '{}' });
      } else if (depth >= maxDepth) {
        out.push({ key: fullKey, value: formatScalarOrArray(val, maxTextLength) });
      } else {
        const childTruncated = flattenObjectEntries(
          val,
          fullKey,
          depth + 1,
          maxDepth,
          maxTextLength,
          maxEntries,
          out
        );
        if (childTruncated) {
          return true;
        }
      }
    } else {
      out.push({
        key: fullKey,
        value: formatScalarOrArray(val, maxTextLength),
      });
    }
  }
  return false;
}

/**
 * Memformat nilai log audit (oldValue / newValue) secara aman:
 * - Kosong / null / undefined -> kind: 'empty', text: '-'
 * - JSON objek valid -> kind: 'json' dengan daftar baris { key, value } ("kunci: nilai")
 * - JSON rusak / string biasa / tipe lain -> kind: 'text' dengan pembatasan panjang aman
 */
export function formatAuditLogValue(
  rawValue: string | null | undefined,
  options: FormatAuditLogOptions = {}
): FormattedAuditLogValue {
  const maxTextLength = options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;

  if (rawValue === null || rawValue === undefined) {
    return { kind: 'empty', lines: [], text: '-' };
  }

  const trimmed = String(rawValue).trim();
  if (trimmed.length === 0) {
    return { kind: 'empty', lines: [], text: '-' };
  }

  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isPlainObject(parsed)) {
        const topKeys = Object.keys(parsed);
        if (topKeys.length === 0) {
          return { kind: 'text', lines: [], text: '{}' };
        }

        const lines: AuditLogKeyValueLine[] = [];
        const wasTruncated = flattenObjectEntries(
          parsed,
          '',
          0,
          maxDepth,
          maxTextLength,
          maxEntries,
          lines
        );

        if (wasTruncated) {
          lines.push({
            key: '...',
            value: `dibatasi ${maxEntries} entri`,
          });
        }

        const text = lines.map((l) => `${l.key}: ${l.value}`).join('\n');
        return {
          kind: 'json',
          lines,
          text,
        };
      }
    } catch {
      // JSON rusak/tidak lengkap -> fallback ke teks biasa
    }
  }

  return {
    kind: 'text',
    lines: [],
    text: truncateWithEllipsis(trimmed, maxTextLength),
  };
}
