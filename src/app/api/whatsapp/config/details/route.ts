import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';

const safeConfigColumns = {
  id: schema.whatsappConfig.id,
  user_id: schema.whatsappConfig.userId,
  phone_number_id: schema.whatsappConfig.phoneNumberId,
  waba_id: schema.whatsappConfig.wabaId,
  status: schema.whatsappConfig.status,
  connected_at: schema.whatsappConfig.connectedAt,
  registered_at: schema.whatsappConfig.registeredAt,
  subscribed_apps_at: schema.whatsappConfig.subscribedAppsAt,
  last_registration_error: schema.whatsappConfig.lastRegistrationError,
  mirror_inbound_media: schema.whatsappConfig.mirrorInboundMedia,
};

export async function GET() {
  try {
    const ctx = await requireRole('viewer');
    const [config] = await ctx.db
      .select(safeConfigColumns)
      .from(schema.whatsappConfig)
      .where(eq(schema.whatsappConfig.accountId, ctx.accountId))
      .limit(1);

    return NextResponse.json({ config: config ?? null });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as {
      mirror_inbound_media?: unknown;
    } | null;

    if (typeof body?.mirror_inbound_media !== 'boolean') {
      return NextResponse.json(
        { error: 'mirror_inbound_media debe ser booleano.' },
        { status: 400 }
      );
    }

    const [config] = await ctx.db
      .update(schema.whatsappConfig)
      .set({
        mirrorInboundMedia: body.mirror_inbound_media,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.whatsappConfig.accountId, ctx.accountId))
      .returning(safeConfigColumns);

    if (!config) {
      return NextResponse.json(
        { error: 'Configuración de WhatsApp no encontrada.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ config });
  } catch (error) {
    return toErrorResponse(error);
  }
}
