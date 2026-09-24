/**
 * Browser-facing Imgora file API.
 *
 * Components use these helpers instead of contacting Imgora, so its token
 * remains server-side. The server resolves the account, validates the upload,
 * and returns Imgora's `secure_url` plus an opaque deletion reference.
 */

export {
  AVATAR_MAX_BYTES,
  buildMediaPath,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_BYTES_BY_KIND,
} from './policy';

import type { StorageCollection } from './policy';

export interface UploadAccountMediaResult {
  /** Imgora `secure_url`, safe to persist and send to external consumers. */
  publicUrl: string;
  /** Opaque, signed, account-scoped reference used for later deletion. */
  path: string;
}

function assertCollection(bucket: string): asserts bucket is StorageCollection {
  if (
    bucket !== 'avatars' &&
    bucket !== 'chat-media' &&
    bucket !== 'flow-media'
  ) {
    throw new Error('Unsupported storage collection.');
  }
}

async function responseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === 'string'
    ? body.error
    : `File request failed (HTTP ${response.status}).`;
}

export async function uploadAccountMedia(
  bucket: string,
  file: File
): Promise<UploadAccountMediaResult> {
  assertCollection(bucket);
  const form = new FormData();
  form.set('collection', bucket);
  form.set('file', file);

  const response = await fetch('/api/files', { method: 'POST', body: form });
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json()) as UploadAccountMediaResult;
}

/** Profile-form integration point; server-enforced limit is 2 MB, images only. */
export function uploadProfileAvatar(
  file: File
): Promise<UploadAccountMediaResult> {
  return uploadAccountMedia('avatars', file);
}

export async function deleteAccountMedia(
  bucket: string,
  path: string
): Promise<void> {
  assertCollection(bucket);
  const encodedPath = path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const response = await fetch(`/api/files/${bucket}/${encodedPath}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(await responseError(response));
  }
}
