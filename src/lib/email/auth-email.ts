import { createHash } from 'node:crypto';
import { sendEmail } from './chatsend';

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character] ?? character;
  });
}

function emailDocument(input: {
  preheader: string;
  title: string;
  message: string;
  footer: string;
  code?: string;
  action?: {
    label: string;
    url: string;
  };
}): string {
  const actionUrl = input.action ? escapeHtml(input.action.url) : null;
  const code = input.code ? escapeHtml(input.code) : null;

  return `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
  <body style="margin:0;background:#0b0c10;color:#f5f5f6;font-family:Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0c10;padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#15171c;border:1px solid #292c34;border-radius:16px;overflow:hidden">
          <tr><td style="padding:28px 32px 16px">
            <div style="display:inline-block;background:#7c3aed;border-radius:10px;padding:9px 12px;font-weight:700">FuryLeeds</div>
          </td></tr>
          <tr><td style="padding:8px 32px 32px">
            <h1 style="margin:0 0 14px;font-size:25px;line-height:1.25">${escapeHtml(input.title)}</h1>
            <p style="margin:0 0 24px;color:#b4b8c2;font-size:16px;line-height:1.6">${escapeHtml(input.message)}</p>
            ${code ? `<div style="margin:0 0 24px;border:1px solid #393d48;border-radius:12px;background:#0f1116;padding:18px;text-align:center;font-size:30px;font-weight:700;letter-spacing:8px">${code}</div>` : ''}
            ${
              input.action && actionUrl
                ? `<a href="${actionUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">${escapeHtml(input.action.label)}</a>
            <p style="margin:24px 0 8px;color:#858a96;font-size:13px;line-height:1.5">Si el botón no funciona, abre este enlace:</p>
            <p style="margin:0;word-break:break-all"><a href="${actionUrl}" style="color:#a78bfa;font-size:13px">${actionUrl}</a></p>`
                : ''
            }
          </td></tr>
          <tr><td style="border-top:1px solid #292c34;padding:18px 32px;color:#858a96;font-size:12px;line-height:1.5">${escapeHtml(input.footer)}</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function otpIdempotencyKey(email: string, otp: string): string {
  const digest = createHash('sha256')
    .update(`${email.toLowerCase()}\0${otp}`)
    .digest('hex');
  return `reset-otp-${digest}`;
}

export async function sendVerificationEmail(input: {
  email: string;
  name: string;
  url: string;
  token: string;
}): Promise<void> {
  await sendEmail({
    recipient: input.email,
    subject: 'Confirma tu correo electrónico',
    text: `Hola ${input.name}. Confirma tu correo abriendo este enlace: ${input.url}`,
    html: emailDocument({
      preheader: 'Confirma tu cuenta de FuryLeeds',
      title: 'Confirma tu correo',
      message: `Hola ${input.name}. Verifica tu dirección para activar tu cuenta y comenzar a usar FuryLeeds.`,
      action: {
        label: 'Confirmar correo',
        url: input.url,
      },
      footer:
        'Este enlace caduca en una hora. Si no creaste esta cuenta, ignora este correo.',
    }),
    idempotencyKey: `verify-${input.token}`,
  });
}

export async function sendPasswordResetCode(input: {
  email: string;
  otp: string;
}): Promise<void> {
  await sendEmail({
    recipient: input.email,
    subject: 'Tu código para restablecer la contraseña',
    text: `Tu código de FuryLeeds para restablecer la contraseña es ${input.otp}. Caduca en 10 minutos.`,
    html: emailDocument({
      preheader: 'Código para restablecer tu contraseña',
      title: 'Restablece tu contraseña',
      message:
        'Ingresa este código en FuryLeeds para crear una contraseña nueva. No lo compartas con nadie.',
      code: input.otp,
      footer:
        'Este código caduca en 10 minutos. Si no solicitaste el cambio, ignora este correo.',
    }),
    idempotencyKey: otpIdempotencyKey(input.email, input.otp),
  });
}

export async function sendWelcomeEmail(input: {
  email: string;
  name: string;
  userId: string;
}): Promise<void> {
  await sendEmail({
    recipient: input.email,
    subject: 'Te damos la bienvenida a FuryLeeds',
    text: `Hola ${input.name}. Bienvenido a FuryLeeds. Organiza tus conversaciones, atiende mejor a tus clientes y haz crecer tu negocio desde un solo lugar.`,
    html: emailDocument({
      preheader: 'Tu espacio de trabajo en FuryLeeds está listo',
      title: `¡Bienvenido a FuryLeeds, ${input.name}!`,
      message:
        'Tu cuenta está lista. Organiza tus conversaciones, atiende mejor a tus clientes y haz crecer tu negocio desde un solo lugar.',
      footer:
        'Gracias por confiar en FuryLeeds para acompañar el crecimiento de tu negocio.',
    }),
    idempotencyKey: `welcome-${input.userId}`,
  });
}

export async function sendPasswordChangedEmail(input: {
  email: string;
  name: string;
}): Promise<void> {
  await sendEmail({
    recipient: input.email,
    subject: 'Tu contraseña se actualizó correctamente',
    text: `Hola ${input.name}. Tu contraseña de FuryLeeds se restableció correctamente. Ya puedes iniciar sesión con tu nueva contraseña.`,
    html: emailDocument({
      preheader: 'Tu contraseña de FuryLeeds fue actualizada',
      title: 'Contraseña recuperada correctamente',
      message: `Hola ${input.name}. Tu contraseña se restableció correctamente. Ya puedes entrar a FuryLeeds con tu nueva contraseña.`,
      footer:
        'Si no realizaste este cambio, contacta de inmediato al administrador de tu cuenta.',
    }),
  });
}
