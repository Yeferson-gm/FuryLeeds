import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import { decrypt } from '@/lib/whatsapp/encryption';
import { downloadMedia, getMediaUrl } from '@/lib/whatsapp/meta-api';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params;
    if (!mediaId) {
      return NextResponse.json(
        { error: 'Media ID is required' },
        { status: 400 }
      );
    }

    const { db, accountId } = await getCurrentAccount();
    const [config] = await db
      .select({ accessToken: schema.whatsappConfig.accessToken })
      .from(schema.whatsappConfig)
      .where(eq(schema.whatsappConfig.accountId, accountId))
      .limit(1);
    if (!config) {
      return NextResponse.json(
        { error: 'WhatsApp not configured' },
        { status: 400 }
      );
    }

    const accessToken = decrypt(config.accessToken);
    const mediaInfo = await getMediaUrl({ mediaId, accessToken });
    const { buffer, contentType } = await downloadMedia({
      downloadUrl: mediaInfo.url,
      accessToken,
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          contentType || mediaInfo.mimeType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Error in WhatsApp media GET:', error);
    return toErrorResponse(error);
  }
}
