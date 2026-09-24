import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import {
  isStorageCollection,
  StorageError,
  uploadAccountFile,
} from '@/lib/storage/imgora';

export const runtime = 'nodejs';

function storageError(error: StorageError): NextResponse {
  return NextResponse.json({ error: error.message }, { status: error.status });
}

/**
 * Authenticated multipart upload API used by all browser components.
 * Imgora credentials remain server-side; fields are `collection` and `file`.
 */
export async function POST(request: Request) {
  try {
    const { accountId } = await getCurrentAccount();
    const form = await request.formData();
    const collection = form.get('collection');
    const file = form.get('file');

    if (typeof collection !== 'string' || !isStorageCollection(collection)) {
      return NextResponse.json(
        { error: 'Unsupported storage collection.' },
        { status: 400 }
      );
    }
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'A file is required.' },
        { status: 400 }
      );
    }

    const result = await uploadAccountFile({
      collection,
      accountId,
      fileName: file.name,
      bytes: file,
      mimeType: file.type,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof StorageError) return storageError(error);
    return toErrorResponse(error);
  }
}
