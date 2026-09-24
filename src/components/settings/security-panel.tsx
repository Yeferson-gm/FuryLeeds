'use client';

import { PasswordForm } from './password-form';
import { SessionsCard } from './sessions-card';
import { SettingsPanelHead } from './settings-panel-head';

const COPY = {
  description:
    'Cambia tu contraseña y cierra sesión en tus dispositivos. Esto mantiene tu cuenta segura.',
  title: 'Acceso y seguridad',
} as const;

/**
 * "Login & security" section — groups the former Profile-tab password
 * and active-sessions cards into their own dedicated home.
 */
export function SecurityPanel() {
  return (
    <section className="max-w-2xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={COPY.title} description={COPY.description} />
      <div className="space-y-4">
        <PasswordForm />
        <SessionsCard />
      </div>
    </section>
  );
}
