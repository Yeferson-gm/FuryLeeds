import { extensionForMime } from '@/lib/media/filename';
import {
  buildMediaPath,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_BYTES_BY_KIND,
  normalizeStorageMime,
  uploadAccountFile,
} from '@/lib/storage/imgora';
import { downloadMedia } from './meta-api';

/** Imgora collection shared by inbound and outbound chat attachments. */
export const MIRROR_BUCKET = 'chat-media' as const;
export const MIRROR_FOLDER = 'inbound';

export interface MirrorInboundMediaArgs {
  accountId: string;
  mediaId: string;
  downloadUrl: string;
  accessToken: string;
  mimeType?: string | null;
  fileSize?: number | null;
  fileName?: string | null;
  messageTimestamp?: string | number | null;
  download?: typeof downloadMedia;
}

export function normalizeMimeType(value?: string | null): string | null {
  return normalizeStorageMime(value);
}

function kindForMime(mimeType: string | null): string {
  if (!mimeType) return 'file';
  const [top] = mimeType.split('/');
  if (top === 'image' || top === 'video' || top === 'audio') return top;
  if (top === 'text' || top === 'application') return 'document';
  return 'file';
}

function maxBytesForMime(mimeType: string | null): number {
  return mimeType?.startsWith('image/')
    ? MEDIA_MAX_BYTES_BY_KIND.image
    : MEDIA_MAX_BYTES;
}

/** Deterministic and traversal-safe name for a mirrored Meta attachment. */
export function mirrorFileName(args: {
  mediaId: string;
  mimeType: string | null;
  fileName?: string | null;
  messageTimestamp?: string | number | null;
}): string {
  const { mediaId, mimeType, fileName, messageTimestamp } = args;
  const safeMediaId = mediaId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
  const ext = extensionForMime(mimeType);
  const stem = ((fileName ?? '').split(/[\\/]/).pop() ?? '')
    .replace(/\.[^.]+$/, '')
    .trim();
  if (stem) return `${safeMediaId || 'media'}-${stem}.${ext}`;

  const kind = kindForMime(mimeType);
  const stamp = String(messageTimestamp ?? '').replace(/\D/g, '');
  return `${safeMediaId || 'media'}-${stamp ? `${kind}-${stamp}` : kind}.${ext}`;
}

/**
 * Best-effort copy of inbound WhatsApp bytes to account-isolated Imgora storage.
 * Returns Imgora's secure CDN URL, or `null` so the webhook can retain its
 * short-lived Meta proxy fallback without failing the whole delivery.
 */
export async function mirrorInboundMedia(
  args: MirrorInboundMediaArgs
): Promise<string | null> {
  const {
    accountId,
    mediaId,
    downloadUrl,
    accessToken,
    mimeType,
    fileSize,
    fileName,
    messageTimestamp,
    download = downloadMedia,
  } = args;
  const normalizedMime = normalizeMimeType(mimeType);
  const maxBytes = maxBytesForMime(normalizedMime);

  if (typeof fileSize === 'number' && fileSize > maxBytes) {
    console.warn(
      `[mirror-media] skipping ${mediaId}: ${fileSize} bytes exceeds the ${maxBytes}-byte limit`
    );
    return null;
  }

  try {
    const { buffer, contentType } = await download({
      downloadUrl,
      accessToken,
    });
    const uploadType =
      normalizedMime ??
      normalizeMimeType(contentType) ??
      'application/octet-stream';
    const downloadedMaxBytes = maxBytesForMime(uploadType);
    if (buffer.byteLength > downloadedMaxBytes) {
      console.warn(
        `[mirror-media] skipping ${mediaId}: downloaded ${buffer.byteLength} bytes, over the ${downloadedMaxBytes}-byte limit`
      );
      return null;
    }

    const objectName = mirrorFileName({
      mediaId,
      mimeType: uploadType,
      fileName,
      messageTimestamp,
    });
    const { publicUrl } = await uploadAccountFile({
      collection: MIRROR_BUCKET,
      accountId,
      fileName: objectName,
      bytes: buffer,
      mimeType: uploadType,
      now: null,
      subfolder: MIRROR_FOLDER,
    });

    return publicUrl;
  } catch (error) {
    console.warn(
      `[mirror-media] could not mirror ${mediaId}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/** Pure path preview retained for callers/tests that need deterministic keys. */
export function mirrorPath(args: {
  accountId: string;
  mediaId: string;
  mimeType: string | null;
  fileName?: string | null;
  messageTimestamp?: string | number | null;
}): string {
  return buildMediaPath(
    args.accountId,
    mirrorFileName(args),
    null,
    MIRROR_FOLDER,
    args.mimeType ?? undefined
  );
}
