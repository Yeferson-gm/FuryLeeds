import { MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type AuthSection = 'login' | 'signup';

interface AuthPageShellProps {
  children: ReactNode;
  activeSection?: AuthSection;
  loginHref?: string;
  signupHref?: string;
}

const AUTH_NAV_ITEMS: ReadonlyArray<{
  id: AuthSection;
  hrefKey: 'loginHref' | 'signupHref';
  label: string;
}> = [
  { id: 'login', hrefKey: 'loginHref', label: 'Iniciar sesión' },
  { id: 'signup', hrefKey: 'signupHref', label: 'Crear cuenta' },
];

export function AuthPageShell({
  children,
  activeSection,
  loginHref = '/login',
  signupHref = '/signup',
}: AuthPageShellProps) {
  const hrefs = { loginHref, signupHref };

  return (
    <main className="auth-stage relative min-h-svh overflow-hidden bg-background px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="auth-grid absolute inset-0 opacity-55" />
        <div className="absolute -top-64 left-1/2 size-136 -translate-x-1/2 rounded-full bg-primary/6 blur-3xl" />
        <div className="absolute -right-48 -bottom-64 size-120 rounded-full bg-foreground/3 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100svh-5rem)] w-full max-w-md flex-col justify-center">
        <Link
          href="/"
          className="mx-auto mb-5 flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground"
          aria-label="FuryLeeds — ir al inicio"
        >
          <span className="flex size-8 items-center justify-center rounded-lg border border-border bg-card shadow-sm">
            <MessageSquareText className="size-4 text-foreground" />
          </span>
          <span>FuryLeeds</span>
        </Link>

        <section
          className="overflow-hidden rounded-xl border border-border bg-card/95 shadow-2xl shadow-black/35 backdrop-blur-xl"
          aria-label="Acceso a FuryLeeds"
        >
          {activeSection ? (
            <nav
              className="grid grid-cols-2 border-b border-border bg-background/45"
              aria-label="Opciones de acceso"
            >
              {AUTH_NAV_ITEMS.map((item) => {
                const active = item.id === activeSection;
                return (
                  <Link
                    key={item.id}
                    href={hrefs[item.hrefKey]}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative px-4 py-3 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                      active
                        ? 'bg-card text-foreground'
                        : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
                    )}
                  >
                    {item.label}
                    {active ? (
                      <span className="absolute inset-x-5 bottom-0 h-px bg-foreground" />
                    ) : null}
                  </Link>
                );
              })}
            </nav>
          ) : null}

          {children}
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
          Acceso protegido para equipos que gestionan conversaciones de
          WhatsApp.
        </p>
        <nav
          className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2"
          aria-label="Información legal"
        >
          <Link
            href="/privacy"
            className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Privacidad
          </Link>
          <Link
            href="/terms"
            className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Condiciones
          </Link>
          <Link
            href="/data-deletion"
            className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Eliminar datos
          </Link>
        </nav>
      </div>
    </main>
  );
}
