import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import { decrypt } from '@/lib/whatsapp/encryption';
import { getSubscribedApps, verifyPhoneNumber } from '@/lib/whatsapp/meta-api';

export async function GET() {
  try {
    const { db, accountId } = await requireRole('viewer');
    const [config] = await db
      .select()
      .from(schema.whatsappConfig)
      .where(eq(schema.whatsappConfig.accountId, accountId))
      .limit(1);

    if (!config) {
      return NextResponse.json({
        live: false,
        checks: { config_exists: false },
        message: 'Aún no hay ninguna configuración de WhatsApp guardada.',
      });
    }

    let accessToken: string;
    try {
      accessToken = decrypt(config.accessToken);
    } catch {
      return NextResponse.json({
        live: false,
        checks: { config_exists: true, token_decryptable: false },
        message:
          'No se puede descifrar el token de acceso guardado; es probable que ENCRYPTION_KEY haya cambiado. Vuelve a introducir el token para solucionarlo.',
      });
    }

    const checks: {
      config_exists: boolean;
      token_decryptable: boolean;
      phone_metadata_ok: boolean;
      waba_subscribed_to_app: boolean | null;
      locally_marked_registered: boolean;
    } = {
      config_exists: true,
      token_decryptable: true,
      phone_metadata_ok: false,
      waba_subscribed_to_app: null,
      locally_marked_registered: config.registeredAt != null,
    };
    const errors: string[] = [];

    try {
      await verifyPhoneNumber({
        phoneNumberId: config.phoneNumberId,
        accessToken,
      });
      checks.phone_metadata_ok = true;
    } catch (error) {
      errors.push(
        `Falló la comprobación de los metadatos del teléfono: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (config.wabaId) {
      try {
        const subscriptions = await getSubscribedApps({
          wabaId: config.wabaId,
          accessToken,
        });
        checks.waba_subscribed_to_app = subscriptions.length > 0;
        if (!checks.waba_subscribed_to_app) {
          errors.push(
            'La WABA no tiene aplicaciones suscritas. Vuelve a guardar la configuración para suscribirla.'
          );
        }
      } catch (error) {
        errors.push(
          `Falló la comprobación de la suscripción de la WABA: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      errors.push(
        'No hay ningún ID de WABA guardado; los webhooks no pueden configurarse sin él. Añádelo en el formulario y vuelve a guardar.'
      );
    }

    const live =
      checks.phone_metadata_ok &&
      (checks.waba_subscribed_to_app ?? false) &&
      checks.locally_marked_registered;

    return NextResponse.json({
      live,
      checks,
      errors,
      last_registration_error: config.lastRegistrationError,
      registered_at: config.registeredAt,
      subscribed_apps_at: config.subscribedAppsAt,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
