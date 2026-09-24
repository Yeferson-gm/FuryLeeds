import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import {
  deleteAccountFile,
  getAccountFile,
  isStorageCollection,
  StorageError,
} from '@/lib/storage/imgora';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ collection: string; path: string[] }>;
}

function storageError(error: StorageError): NextResponse {
  return NextResponse.json({ error: error.message }, { status: error.status });
}

async function routeTarget(context: RouteContext) {
  const { collection, path: segments } = await context.params;
  if (!isStorageCollection(collection) || segments.length !== 1) {
    throw new StorageError('File not found.', 404);
  }
  return { collection, reference: segments[0] };
}

/** Resolve an authenticated opaque reference and redirect to Imgora's CDN URL. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const target = await routeTarget(context);
    const { accountId } = await getCurrentAccount();
    const asset = await getAccountFile(
      target.collection,
      accountId,
      target.reference
    );
    return NextResponse.redirect(asset.secureUrl);
  } catch (error) {
    if (error instanceof StorageError) return storageError(error);
    return toErrorResponse(error);
  }
}

/** Delete requires a session matching the account signed into the reference. */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const target = await routeTarget(context);
    const { accountId } = await getCurrentAccount();
    await deleteAccountFile(target.collection, accountId, target.reference);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof StorageError) return storageError(error);
    return toErrorResponse(error);
  }
}
