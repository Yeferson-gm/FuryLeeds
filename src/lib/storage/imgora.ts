import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  assertAllowedUpload,
  buildMediaPath,
  isSafeAccountId,
  type StorageCollection,
  StorageError,
} from './policy';

export {
  buildMediaPath,
  isStorageCollection,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_BYTES_BY_KIND,
  normalizeStorageMime,
  StorageError,
} from './policy';

const REFERENCE_VERSION = 1;
const IMGORA_TIMEOUT_MS = 120_000;

export type ImgoraResourceType = 'image' | 'video' | 'audio' | 'file';

interface ImgoraConfig {
  apiUrl: string;
  apiKey: string;
  origin: string;
  baseFolder: string;
}

interface AssetReference {
  v: typeof REFERENCE_VERSION;
  accountId: string;
  collection: StorageCollection;
  publicId: string;
  type: ImgoraResourceType;
}

export interface ImgoraAsset {
  publicId: string;
  secureUrl: string;
  type: ImgoraResourceType;
}

export interface UploadAccountFileArgs {
  collection: StorageCollection;
  accountId: string;
  fileName: string;
  bytes: Blob | Uint8Array | ArrayBuffer;
  mimeType: string;
  now?: number | null;
  subfolder?: string;
}

export interface UploadAccountFileResult {
  /** Opaque, signed reference accepted by the authenticated file API. */
  path: string;
  /** Imgora CDN URL. It contains no Imgora API credential. */
  publicUrl: string;
}

function requiredConfig(name: keyof NodeJS.ProcessEnv): string {
  const value = process.env[name]?.trim();
  if (!value) throw new StorageError(`${name} is not configured.`, 500);
  return value;
}

function configuredUrl(name: 'IMGORA_API_URL' | 'IMGORA_ORIGIN'): URL {
  let url: URL;
  try {
    url = new URL(requiredConfig(name));
  } catch {
    throw new StorageError(`${name} is invalid.`, 500);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new StorageError(`${name} must use HTTP or HTTPS.`, 500);
  }
  return url;
}

function imgoraConfig(): ImgoraConfig {
  const baseFolder = requiredConfig('IMGORA_BASE_FOLDER').replace(
    /^\/+|\/+$/g,
    ''
  );
  if (
    !baseFolder ||
    baseFolder.split('/').some((segment) => !isSafeAccountId(segment))
  ) {
    throw new StorageError('IMGORA_BASE_FOLDER is invalid.', 500);
  }
  const apiUrl = configuredUrl('IMGORA_API_URL');
  const origin = configuredUrl('IMGORA_ORIGIN');
  return {
    apiUrl: apiUrl.toString().replace(/\/+$/, ''),
    apiKey: requiredConfig('IMGORA_API_KEY'),
    origin: origin.origin,
    baseFolder,
  };
}

function signingKey(): string {
  const key = process.env.ENCRYPTION_KEY ?? process.env.BETTER_AUTH_SECRET;
  if (!key) {
    throw new StorageError(
      'ENCRYPTION_KEY or BETTER_AUTH_SECRET is required to sign file references.',
      500
    );
  }
  return key;
}

function signReferencePayload(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

export function createAssetReference(asset: {
  accountId: string;
  collection: StorageCollection;
  publicId: string;
  type: ImgoraResourceType;
}): string {
  if (
    !isSafeAccountId(asset.accountId) ||
    !asset.publicId ||
    asset.publicId.length > 2_048
  ) {
    throw new StorageError('Invalid Imgora asset reference.');
  }
  const payload = Buffer.from(
    JSON.stringify({ v: REFERENCE_VERSION, ...asset } satisfies AssetReference)
  ).toString('base64url');
  return `${payload}.${signReferencePayload(payload)}`;
}

function invalidReference(): never {
  throw new StorageError('File not found.', 404);
}

export function readAssetReference(
  reference: string,
  expected: { collection: StorageCollection; accountId: string }
): AssetReference {
  const [payload, signature, extra] = reference.split('.');
  if (!payload || !signature || extra) return invalidReference();

  const actual = Buffer.from(signature);
  const signed = Buffer.from(signReferencePayload(payload));
  if (actual.length !== signed.length || !timingSafeEqual(actual, signed)) {
    return invalidReference();
  }

  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return invalidReference();
  }
  if (!value || typeof value !== 'object') return invalidReference();

  const candidate = value as Partial<AssetReference>;
  if (
    candidate.v !== REFERENCE_VERSION ||
    candidate.accountId !== expected.accountId ||
    candidate.collection !== expected.collection ||
    !isSafeAccountId(candidate.accountId) ||
    typeof candidate.publicId !== 'string' ||
    !candidate.publicId ||
    candidate.publicId.length > 2_048 ||
    !isImgoraResourceType(candidate.type)
  ) {
    return invalidReference();
  }
  return candidate as AssetReference;
}

function isImgoraResourceType(value: unknown): value is ImgoraResourceType {
  return (
    value === 'image' ||
    value === 'video' ||
    value === 'audio' ||
    value === 'file'
  );
}

export function resourceTypeForMime(mimeType: string): ImgoraResourceType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

function endpointForType(type: ImgoraResourceType): string {
  return `/${type}/pro/upload`;
}

function imgoraHeaders(config: ImgoraConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    'X-Imgora-Origin': config.origin,
  };
}

async function providerFetch(
  input: string | URL,
  init: RequestInit = {}
): Promise<Response> {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(IMGORA_TIMEOUT_MS),
    });
  } catch (error) {
    throw new StorageError(
      error instanceof DOMException && error.name === 'TimeoutError'
        ? 'Imgora request timed out.'
        : 'Imgora is unavailable.',
      502
    );
  }
}

async function providerJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new StorageError('Imgora returned an invalid response.', 502);
  }
}

async function providerError(response: Response): Promise<StorageError> {
  const status =
    response.status === 400 ||
    response.status === 404 ||
    response.status === 409 ||
    response.status === 413
      ? response.status
      : 502;
  return new StorageError(
    `Imgora request failed (HTTP ${response.status}).`,
    status
  );
}

function parseAssetResponse(
  value: unknown,
  type: ImgoraResourceType
): ImgoraAsset {
  if (!value || typeof value !== 'object') {
    throw new StorageError('Imgora returned an invalid response.', 502);
  }
  const data = (value as { data?: unknown }).data;
  if (!data || typeof data !== 'object') {
    throw new StorageError('Imgora returned an invalid response.', 502);
  }
  const publicId = (data as { public_id?: unknown }).public_id;
  const secureUrl = (data as { secure_url?: unknown }).secure_url;
  if (
    typeof publicId !== 'string' ||
    !publicId ||
    publicId.length > 2_048 ||
    typeof secureUrl !== 'string'
  ) {
    throw new StorageError('Imgora returned an invalid response.', 502);
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(secureUrl);
  } catch {
    throw new StorageError('Imgora returned an invalid response.', 502);
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new StorageError('Imgora returned an invalid response.', 502);
  }
  return { publicId, secureUrl: parsedUrl.toString(), type };
}

async function asUploadBlob(
  bytes: Blob | Uint8Array | ArrayBuffer,
  mimeType: string
): Promise<Blob> {
  if (bytes instanceof Blob) {
    return new Blob([await bytes.arrayBuffer()], { type: mimeType });
  }
  if (bytes instanceof Uint8Array) {
    return new Blob([new Uint8Array(bytes).buffer], { type: mimeType });
  }
  return new Blob([bytes], { type: mimeType });
}

export async function uploadAccountFile(
  args: UploadAccountFileArgs
): Promise<UploadAccountFileResult> {
  const size =
    args.bytes instanceof Blob ? args.bytes.size : args.bytes.byteLength;
  const mimeType = args.mimeType.split(';')[0].trim().toLowerCase();
  assertAllowedUpload(args.collection, mimeType, size);

  const objectPath = buildMediaPath(
    args.accountId,
    args.fileName,
    args.now,
    args.subfolder,
    mimeType
  );
  const segments = objectPath.split('/');
  const filename = segments.pop();
  if (!filename) throw new StorageError('Invalid file name.');

  const type = resourceTypeForMime(mimeType);
  const config = imgoraConfig();
  const form = new FormData();
  form.set('file', await asUploadBlob(args.bytes, mimeType), filename);
  form.set(
    'folder',
    [config.baseFolder, args.collection, ...segments].join('/')
  );
  form.set('filename', filename);

  const response = await providerFetch(
    `${config.apiUrl}${endpointForType(type)}`,
    {
      method: 'POST',
      headers: imgoraHeaders(config),
      body: form,
    }
  );
  if (!response.ok) throw await providerError(response);

  const asset = parseAssetResponse(await providerJson(response), type);
  return {
    publicUrl: asset.secureUrl,
    path: createAssetReference({
      accountId: args.accountId,
      collection: args.collection,
      publicId: asset.publicId,
      type,
    }),
  };
}

export async function getAccountFile(
  collection: StorageCollection,
  accountId: string,
  reference: string
): Promise<ImgoraAsset> {
  const target = readAssetReference(reference, { collection, accountId });
  const config = imgoraConfig();
  const url = new URL(
    `${config.apiUrl}/resources/${encodeURIComponent(target.publicId)}`
  );
  url.searchParams.set('type', target.type);
  const response = await providerFetch(url, {
    headers: imgoraHeaders(config),
  });
  if (!response.ok) throw await providerError(response);
  return parseAssetResponse(await providerJson(response), target.type);
}

export async function deleteAccountFile(
  collection: StorageCollection,
  accountId: string,
  reference: string
): Promise<void> {
  const target = readAssetReference(reference, { collection, accountId });
  const config = imgoraConfig();
  const response = await providerFetch(
    `${config.apiUrl}/assets/${encodeURIComponent(target.publicId)}`,
    { method: 'DELETE', headers: imgoraHeaders(config) }
  );
  if (!response.ok) throw await providerError(response);
}
