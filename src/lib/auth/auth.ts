import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { emailOTP } from 'better-auth/plugins';
import { applicationUrl } from '@/lib/app-url';
import { db, sqlClient } from '@/lib/db';
import { authSchema } from '@/lib/db/auth-schema';
import {
  sendPasswordChangedEmail,
  sendPasswordResetCode,
  sendVerificationEmail,
  sendWelcomeEmail,
} from '@/lib/email/auth-email';

function configuredSuperadmins(): Set<string> {
  return new Set(
    (process.env.SUPERADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const siteUrl = applicationUrl();

async function sendLifecycleEmail(
  event: 'welcome' | 'password-reset-code' | 'password-changed',
  send: () => Promise<void>
): Promise<void> {
  try {
    await send();
  } catch {
    // The account/password mutation already succeeded. Report the provider
    // failure without logging the recipient, body, URL, code, or credentials.
    console.error(`[auth-email] ChatSend failed to deliver ${event} email`);
  }
}

export const auth = betterAuth({
  appName: 'FuryLeeds',
  baseURL: siteUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: authSchema,
    transaction: true,
  }),
  trustedOrigins: [siteUrl],
  advanced: {
    database: {
      generateId: 'uuid',
    },
    backgroundTasks: {
      handler: (promise) => {
        void promise.catch(() => {
          console.error('[auth] Better Auth background task failed');
        });
      },
    },
  },
  user: {
    additionalFields: {
      systemRole: {
        type: 'string',
        defaultValue: 'user',
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    autoSignIn: false,
    onPasswordReset: async ({ user }) => {
      await sendLifecycleEmail('password-changed', () =>
        sendPasswordChangedEmail({
          email: user.email,
          name: user.name,
        })
      );
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 3600,
    sendVerificationEmail: async ({ user, url, token }) => {
      await sendVerificationEmail({
        email: user.email,
        name: user.name,
        url,
        token,
      });
    },
    afterEmailVerification: async (user) => {
      await sendLifecycleEmail('welcome', () =>
        sendWelcomeEmail({
          email: user.email,
          name: user.name,
          userId: user.id,
        })
      );
    },
  },
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {},
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: {
            ...user,
            systemRole: configuredSuperadmins().has(user.email.toLowerCase())
              ? 'superadmin'
              : 'user',
          },
        }),
        after: async (user) => {
          await sqlClient.begin(async (transaction) => {
            const existing = await transaction`
              SELECT 1 FROM profiles WHERE user_id = ${user.id} LIMIT 1
            `;
            if (existing.length > 0) return;

            const accounts = await transaction`
              INSERT INTO accounts (name, owner_user_id)
              VALUES (${`Cuenta de ${user.name}`}, ${user.id})
              RETURNING id
            `;
            const accountId = accounts[0]?.id;
            if (typeof accountId !== 'string') {
              throw new Error('No se pudo crear la cuenta inicial');
            }

            await transaction`
              INSERT INTO profiles
                (user_id, full_name, email, avatar_url, account_id, account_role)
              VALUES
                (${user.id}, ${user.name}, ${user.email}, ${user.image}, ${accountId}, 'owner')
            `;
          });

          if (user.emailVerified) {
            await sendLifecycleEmail('welcome', () =>
              sendWelcomeEmail({
                email: user.email,
                name: user.name,
                userId: user.id,
              })
            );
          }
        },
      },
      update: {
        after: async (user) => {
          await sqlClient`
            UPDATE profiles
            SET full_name = ${user.name},
                email = ${user.email},
                avatar_url = ${user.image},
                updated_at = NOW()
            WHERE user_id = ${user.id}
          `;
        },
      },
    },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      storeOTP: 'hashed',
      disableSignUp: true,
      rateLimit: {
        window: 60,
        max: 3,
      },
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== 'forget-password') {
          throw new Error('Este flujo OTP no está habilitado');
        }
        await sendLifecycleEmail('password-reset-code', () =>
          sendPasswordResetCode({ email, otp })
        );
      },
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
