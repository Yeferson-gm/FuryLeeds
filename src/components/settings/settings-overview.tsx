import { ChevronRight, Loader2 } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { CURRENCIES } from '@/lib/currency';

import { THEMES } from '@/lib/themes';
import { cn } from '@/lib/utils';
import { ROLE_META } from './role-meta';
import { SettingsChip, StatusDot } from './settings-chip';
import { SECTION_META, type SettingsSection } from './settings-sections';

const COPY = {
  appearance: 'modo {mode} · acento {theme}',
  connected: 'Conectado',
  fieldsCount:
    '{count} {count, plural, =1 {campo personalizado} other {campos personalizados}}',
  loading: 'Cargando…',
  manageTemplates: 'Administrar plantillas de mensaje',
  membersCount: '{count} {count, plural, =1 {miembro} other {miembros}}',
  needsReconnecting: 'Necesita reconectarse',
  notSetup: 'Aún sin configurar',
  pendingInvites:
    '{count} {count, plural, =1 {invitación pendiente} other {invitaciones pendientes}}',
  pendingReview: '{count} en revisión',
  tagsAndFields: 'Etiquetas y campos personalizados',
  tagsCount: '{count} {count, plural, =1 {etiqueta} other {etiquetas}}',
  templatesCount: '{count} {count, plural, =1 {plantilla} other {plantillas}}',
  viewTeamMembers: 'Ver miembros del equipo',
  yourAccount: 'Tu cuenta',
} as const;

const ROLE_LABELS = {
  owner: 'Propietario',
  admin: 'Administrador',
  agent: 'Agente',
  viewer: 'Observador',
} as const;

const SECTION_LABELS: Record<SettingsSection, string> = {
  overview: 'Resumen',
  profile: 'Tu perfil',
  security: 'Acceso y seguridad',
  appearance: 'Apariencia',
  whatsapp: 'WhatsApp',
  templates: 'Plantillas',
  'quick-replies': 'Respuestas rápidas',
  fields: 'Campos y etiquetas',
  deals: 'Negocios y moneda',
  members: 'Miembros del equipo',
  api: 'Claves de API',
};

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

interface OverviewCounts {
  members: number | null;
  pendingInvites: number | null;
  templates: number | null;
  templatesPending: number | null;
  tags: number | null;
  customFields: number | null;
}

interface WhatsAppStatus {
  configured: boolean;
  connected: boolean;
}

export function SettingsOverview({
  onSelect,
}: {
  onSelect: (section: SettingsSection) => void;
}) {
  const { user, profile, accountId, accountRole, defaultCurrency } = useAuth();
  const { mode, theme } = useTheme();

  const [counts, setCounts] = useState<OverviewCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  // WhatsApp status is tracked separately: its health check decrypts the
  // token and pings Meta, which is far slower than the cheap count
  // queries. Gating it independently keeps a slow/flaky Meta round-trip
  // from blanking the rest of the landing.
  const [whatsapp, setWhatsapp] = useState<WhatsAppStatus | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState(true);

  useEffect(() => {
    if (!user || !accountId) return;
    let cancelled = false;

    async function loadOverview() {
      setCountsLoading(true);
      setWhatsappLoading(true);
      try {
        const response = await fetch('/api/settings/overview', {
          cache: 'no-store',
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Overview request failed');
        }
        const data = await response.json();
        if (cancelled) return;
        setCounts(data.counts);
        setWhatsapp((current) => ({
          configured: Boolean(data.whatsappConfigured),
          connected: current?.connected ?? false,
        }));
      } catch (error) {
        console.error('Failed to load settings overview:', error);
        if (!cancelled) {
          setCounts(null);
          setWhatsapp((current) => ({
            configured: current?.configured ?? false,
            connected: current?.connected ?? false,
          }));
        }
      } finally {
        setCountsLoading((current) => (cancelled ? current : false));
      }
    }

    async function loadWhatsAppHealth() {
      setWhatsappLoading(true);
      try {
        const response = await fetch('/api/whatsapp/config', {
          cache: 'no-store',
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Health request failed');
        }
        const data = await response.json();
        if (!cancelled) {
          setWhatsapp((current) => ({
            configured: current?.configured ?? data.reason !== 'no_config',
            connected: Boolean(data.connected),
          }));
        }
      } catch (error) {
        console.error('Failed to load WhatsApp health:', error);
      } finally {
        setWhatsappLoading((current) => (cancelled ? current : false));
      }
    }

    loadOverview();
    loadWhatsAppHealth();

    return () => {
      cancelled = true;
    };
  }, [user?.id, accountId, user]);

  const displayName = profile?.full_name || profile?.email || COPY.yourAccount;
  const initial = (profile?.full_name || profile?.email || 'U')
    .charAt(0)
    .toUpperCase();
  const roleMeta = accountRole ? ROLE_META[accountRole] : null;
  const RoleIcon = roleMeta?.icon;

  const currencyLabel =
    CURRENCIES.find((c) => c.code === defaultCurrency)?.label ??
    defaultCurrency;
  const themeName = THEMES.find((t) => t.id === theme)?.name ?? theme;
  const modeLabel = mode === 'dark' ? 'Oscuro' : 'Claro';

  // Per-tile loading + subtitle. `null` counts render as a graceful
  // fallback so a single failed query never blanks a tile.
  const tiles: {
    section: SettingsSection;
    loading: boolean;
    subtitle: ReactNode;
  }[] = [
    {
      section: 'whatsapp',
      loading: whatsappLoading,
      subtitle: !whatsapp?.configured ? (
        COPY.notSetup
      ) : whatsapp.connected ? (
        <>
          <StatusDot tone="ok" /> {COPY.connected}
        </>
      ) : (
        <>
          <StatusDot tone="muted" /> {COPY.needsReconnecting}
        </>
      ),
    },
    {
      section: 'members',
      loading: countsLoading,
      subtitle:
        counts?.members == null
          ? COPY.viewTeamMembers
          : `${countLabel(counts.members, 'miembro', 'miembros')}${
              counts.pendingInvites
                ? ` · ${countLabel(
                    counts.pendingInvites,
                    'invitación pendiente',
                    'invitaciones pendientes'
                  )}`
                : ''
            }`,
    },
    {
      section: 'templates',
      loading: countsLoading,
      subtitle:
        counts?.templates == null
          ? COPY.manageTemplates
          : `${countLabel(counts.templates, 'plantilla', 'plantillas')}${
              counts.templatesPending
                ? ` · ${counts.templatesPending} en revisión`
                : ''
            }`,
    },
    {
      section: 'deals',
      loading: false,
      subtitle: `${defaultCurrency} — ${currencyLabel}`,
    },
    {
      section: 'fields',
      loading: countsLoading,
      subtitle:
        counts?.tags == null && counts?.customFields == null
          ? COPY.tagsAndFields
          : `${countLabel(counts?.tags ?? 0, 'etiqueta', 'etiquetas')} · ${countLabel(
              counts?.customFields ?? 0,
              'campo personalizado',
              'campos personalizados'
            )}`,
    },
    {
      section: 'appearance',
      loading: false,
      subtitle: `modo ${modeLabel} · acento ${themeName}`,
    },
  ];

  return (
    <section className="animate-in fade-in-50 duration-200">
      {/* Identity */}
      <Card className="flex-row items-center gap-4 px-5 py-5">
        <Avatar size="lg" className="size-14">
          {profile?.avatar_url ? (
            <AvatarImage src={profile.avatar_url} alt={displayName} />
          ) : null}
          <AvatarFallback className="bg-primary/10 text-xl text-primary">
            {initial}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-foreground">
            {displayName}
          </div>
          {profile?.email ? (
            <div className="truncate text-sm text-muted-foreground">
              {profile.email}
            </div>
          ) : null}
        </div>
        {roleMeta && RoleIcon ? (
          <SettingsChip variant={roleMeta.variant}>
            <RoleIcon />
            {accountRole ? ROLE_LABELS[accountRole] : ''}
          </SettingsChip>
        ) : null}
      </Card>

      {/* Status tiles */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map(({ section, loading, subtitle }) => {
          const meta = SECTION_META[section];
          const Icon = meta.icon;
          return (
            <button
              key={section}
              type="button"
              onClick={() => onSelect(section)}
              className={cn(
                'group flex items-start gap-3.5 rounded-xl border border-border bg-card p-4 text-left transition-colors',
                'hover:border-primary-soft-2 hover:bg-card-2'
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">
                  {SECTION_LABELS[section]}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {loading ? (
                    <>
                      <Loader2 className="size-3 animate-spin" /> {COPY.loading}
                    </>
                  ) : (
                    subtitle
                  )}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
