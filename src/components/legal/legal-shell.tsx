import { ArrowLeft, MessageSquareText, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

const LEGAL_LINKS = [
  { href: '/privacy', label: 'Privacidad' },
  { href: '/terms', label: 'Condiciones' },
  { href: '/data-deletion', label: 'Eliminación de datos' },
] as const;

interface LegalShellProps {
  children: ReactNode;
  eyebrow: string;
  summary: string;
  title: string;
}

export function LegalShell({
  children,
  eyebrow,
  summary,
  title,
}: LegalShellProps) {
  return (
    <main className="relative min-h-svh overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="auth-grid absolute inset-0 opacity-35" />
        <div className="absolute -top-64 left-1/2 size-136 -translate-x-1/2 rounded-full bg-primary/7 blur-3xl" />
      </div>

      <header className="relative border-b border-border/80 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-4 sm:px-8">
          <Link
            href="/login"
            className="flex items-center gap-2.5 text-sm font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="FuryLeeds — volver al acceso"
          >
            <span className="flex size-8 items-center justify-center rounded-lg border border-border bg-card shadow-sm">
              <MessageSquareText className="size-4" aria-hidden="true" />
            </span>
            FuryLeeds
          </Link>

          <nav
            className="hidden items-center gap-1 rounded-lg border border-border bg-card/70 p-1 sm:flex"
            aria-label="Documentos legales"
          >
            {LEGAL_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:py-20">
        <article className="min-w-0">
          <div className="mb-12 max-w-3xl border-l-2 border-primary pl-5 sm:pl-7">
            <p className="mb-4 font-mono text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              {eyebrow}
            </p>
            <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
              {title}
            </h1>
            <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
              {summary}
            </p>
            <p className="mt-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Vigente desde el 27 de septiembre de 2026
            </p>
          </div>

          <div className="legal-content max-w-3xl space-y-10">{children}</div>
        </article>

        <aside
          className="lg:sticky lg:top-8 lg:self-start"
          aria-label="Información legal"
        >
          <div className="rounded-xl border border-border bg-card/85 p-5 shadow-xl shadow-black/10 backdrop-blur">
            <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
            <h2 className="mt-4 text-sm font-semibold">
              Responsable del servicio
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              CEDURS TECHNOLOGY GROUP S.A.C., titular y operador de FuryLeeds.
            </p>
            <div className="mt-5 border-t border-border pt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Canal de contacto
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Utiliza el canal corporativo oficialmente designado en tu
                contrato o solicita asistencia al propietario o administrador de
                tu espacio de trabajo.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <footer className="relative border-t border-border bg-card/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 sm:px-8 md:flex-row md:items-center md:justify-between">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Volver a FuryLeeds
          </Link>
          <nav
            className="flex flex-wrap gap-x-5 gap-y-2"
            aria-label="Enlaces legales del pie"
          >
            {LEGAL_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </main>
  );
}
