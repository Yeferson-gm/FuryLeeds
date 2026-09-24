export const MEDIA_MAX_BYTES = 16 * 1024 * 1024;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const MEDIA_MAX_BYTES_BY_KIND = {
  image: 5 * 1024 * 1024,
  video: MEDIA_MAX_BYTES,
  audio: MEDIA_MAX_BYTES,
  document: MEDIA_MAX_BYTES,
} as const;

export const MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'video/quicktime': 'mov',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'text/plain': 'txt',
} as const;

export type AllowedMimeType = keyof typeof MIME_EXTENSIONS;
export type StorageCollection = 'avatars' | 'chat-media' | 'flow-media';

const COLLECTIONS = new Set<StorageCollection>([
  'avatars',
  'chat-media',
  'flow-media',
]);
const AVATAR_MIME_TYPES = new Set<AllowedMimeType>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const MEDIA_MIME_TYPES = new Set<AllowedMimeType>(
  Object.keys(MIME_EXTENSIONS) as AllowedMimeType[]
);
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export class StorageError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 413 | 500 | 502 = 400
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export function isStorageCollection(value: string): value is StorageCollection {
  return COLLECTIONS.has(value as StorageCollection);
}

export function normalizeStorageMime(value?: string | null): string | null {
  if (!value) return null;
  const mime = value.split(';')[0].trim().toLowerCase();
  return mime.includes('/') ? mime : null;
}

export function assertAllowedUpload(
  collection: StorageCollection,
  mimeType: string,
  size: number
): asserts mimeType is AllowedMimeType {
  const normalized = normalizeStorageMime(mimeType);
  const allowed =
    collection === 'avatars' ? AVATAR_MIME_TYPES : MEDIA_MIME_TYPES;
  if (!normalized || !allowed.has(normalized as AllowedMimeType)) {
    throw new StorageError('Unsupported file type.');
  }

  const maxBytes =
    collection === 'avatars'
      ? AVATAR_MAX_BYTES
      : normalized.startsWith('image/')
        ? MEDIA_MAX_BYTES_BY_KIND.image
        : MEDIA_MAX_BYTES;
  if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) {
    throw new StorageError(`File exceeds the ${maxBytes}-byte limit.`, 413);
  }
}

function assertSafeSegment(value: string, label: string): void {
  if (!SAFE_SEGMENT.test(value) || value === '.' || value === '..') {
    throw new StorageError(`Invalid ${label}.`);
  }
}

export function buildMediaPath(
  accountId: string,
  fileName: string,
  now: number | null = Date.now(),
  subfolder?: string,
  mimeType?: string
): string {
  assertSafeSegment(accountId, 'account id');
  if (subfolder) assertSafeSegment(subfolder, 'subfolder');

  const normalizedMime = normalizeStorageMime(mimeType);
  const canonicalExtension = normalizedMime
    ? MIME_EXTENSIONS[normalizedMime as AllowedMimeType]
    : undefined;
  const inputName = (fileName.split(/[\\/]/).pop() ?? '').trim();
  const hasExtension = /\.[A-Za-z0-9]{1,10}$/.test(inputName);
  const extension =
    canonicalExtension ??
    (hasExtension
      ? (inputName.split('.').pop()?.toLowerCase() ?? 'bin')
      : 'bin');
  const safeBase =
    inputName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 40) || 'file';
  const accountFolder = `account-${accountId}`;
  const directory = subfolder ? `${accountFolder}/${subfolder}` : accountFolder;
  const stamp = now === null ? '' : `${now}-`;
  return `${directory}/${stamp}${safeBase}.${extension}`;
}

export function isSafeAccountId(value: string): boolean {
  return SAFE_SEGMENT.test(value);
}
