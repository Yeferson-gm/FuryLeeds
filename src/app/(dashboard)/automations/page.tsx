'use client';

import {
  Clock,
  Copy,
  FileText,
  Loader2,
  MessageCircle,
  MoreVertical,
  Pencil,
  PhoneCall,
  Plus,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GatedButton } from '@/components/ui/gated-button';
import { Switch } from '@/components/ui/switch';
import { useCan } from '@/hooks/use-can';
import { confirmDestructiveAction } from '@/lib/action-alerts';
import {
  AUTOMATION_TEMPLATES,
  type TemplateSlug,
} from '@/lib/automations/templates';
import {
  formatRelative,
  isKnownTrigger,
  triggerMeta,
} from '@/lib/automations/trigger-meta';
import { toast } from '@/lib/notifications';

import { cn } from '@/lib/utils';
import type { Automation, AutomationTriggerType } from '@/types';

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  new_message_received: 'Nuevo mensaje recibido',
  first_inbound_message: 'Primer mensaje del contacto',
  keyword_match: 'Palabra clave',
  interactive_reply: 'Respuesta de botón / lista',
  new_contact_created: 'Nuevo contacto creado',
  conversation_assigned: 'Conversación asignada',
  tag_added: 'Etiqueta agregada',
  time_based: 'Por horario',
};

const TEMPLATE_ORDER: TemplateSlug[] = [
  'welcome_message',
  'out_of_office',
  'lead_qualifier',
  'follow_up_reminder',
];

const TEMPLATE_ICON: Record<TemplateSlug, typeof Zap> = {
  welcome_message: MessageCircle,
  out_of_office: Clock,
  lead_qualifier: Users,
  follow_up_reminder: PhoneCall,
};

export default function AutomationsPage() {
  const router = useRouter();
  const canCreate = useCan('send-messages');
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/automations', { cache: 'no-store' });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errorBody.error ?? 'Failed to load automations');
      }
      const body = (await response.json().catch(() => ({}))) as {
        automations?: Automation[];
      };
      setAutomations(body.automations ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load automations'
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(a: Automation, next: boolean) {
    // Optimistic flip so the switch feels instant.
    setAutomations(
      (prev) =>
        prev?.map((x) => (x.id === a.id ? { ...x, is_active: next } : x)) ??
        prev
    );
    const res = await fetch(`/api/automations/${a.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ is_active: next }),
    });
    if (!res.ok) {
      // Roll back on error.
      setAutomations(
        (prev) =>
          prev?.map((x) => (x.id === a.id ? { ...x, is_active: !next } : x)) ??
          prev
      );
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error ?? 'Error al actualizar');
      return;
    }
    toast.success(next ? 'Automatización activada' : 'Automatización pausada');
  }

  async function duplicate(a: Automation) {
    const res = await fetch(`/api/automations/${a.id}/duplicate`, {
      method: 'POST',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error ?? 'Error al duplicar');
      return;
    }
    toast.success('Automatización duplicada');
    load();
  }

  async function deleteAutomation(automation: Automation) {
    const confirmed = await confirmDestructiveAction({
      title: `¿Eliminar "${automation.name}"?`,
      text: 'También se eliminará su historial de ejecuciones. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar automatización',
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/automations/${automation.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error ?? 'Error al eliminar');
        return;
      }
      toast.success('Automatización eliminada');
      load();
    } catch {
      toast.error('Error al eliminar');
    }
  }

  async function startFromTemplate(slug: TemplateSlug) {
    router.push(`/automations/new?template=${slug}`);
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {'Reintentar'}
        </Button>
      </div>
    );
  }

  if (automations === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const showTemplates = automations.length < 3;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {'Automatizaciones'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {
              'Crea flujos de trabajo que reaccionan automáticamente a eventos de WhatsApp®.'
            }
          </p>
        </div>
        <GatedButton
          canAct={canCreate}
          gateReason="create automations"
          onClick={() => router.push('/automations/new')}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {'Crear automatización'}
        </GatedButton>
      </div>

      {showTemplates && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            {'Plantillas de inicio rápido'}
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {TEMPLATE_ORDER.map((slug) => {
              const t = AUTOMATION_TEMPLATES[slug];
              const Icon = TEMPLATE_ICON[slug];
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => startFromTemplate(slug)}
                  className="group flex flex-col items-start rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-card/80"
                >
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/15">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    {t.name}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {automations.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">
            {'Aún no hay automatizaciones'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {'Elige una plantilla de arriba o crea una desde cero.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {automations.map((a) => (
            <AutomationCard
              key={a.id}
              automation={a}
              onToggle={(next) => toggleActive(a, next)}
              onEdit={() => router.push(`/automations/${a.id}/edit`)}
              onDuplicate={() => duplicate(a)}
              onLogs={() => router.push(`/automations/${a.id}/logs`)}
              onDelete={() => deleteAutomation(a)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AutomationCard({
  automation,
  onToggle,
  onEdit,
  onDuplicate,
  onLogs,
  onDelete,
}: {
  automation: Automation;
  onToggle: (next: boolean) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onLogs: () => void;
  onDelete: () => void;
}) {
  const meta = triggerMeta(automation.trigger_type);
  const triggerLabel = isKnownTrigger(automation.trigger_type)
    ? TRIGGER_LABELS[automation.trigger_type]
    : automation.trigger_type;
  return (
    <li className="rounded-xl border border-border bg-card transition-colors hover:border-border">
      <div className="flex items-center gap-4 p-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10"
          aria-hidden
        >
          <Zap className="h-5 w-5 text-primary" />
        </div>

        <button
          type="button"
          onClick={onEdit}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {automation.name}
            </span>
            {automation.is_active && (
              <span className="relative flex h-2 w-2">
                <span className="sr-only">{'Activa'}</span>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
            )}
          </div>
          {automation.description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {automation.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                meta.pillClass
              )}
            >
              {triggerLabel}
            </span>
            <span className="tabular-nums">
              {automation.execution_count}{' '}
              {automation.execution_count === 1 ? 'ejecución' : 'ejecuciones'}
            </span>
            <span aria-hidden>·</span>
            <span>última {formatRelative(automation.last_executed_at)}</span>
          </div>
        </button>

        <div className="flex items-center gap-3">
          <Switch
            checked={automation.is_active}
            onCheckedChange={(v) => onToggle(!!v)}
            aria-label={automation.is_active ? 'Desactivar' : 'Activar'}
          />

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Abrir menú"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted"
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4" />
                {'Editar'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-4 w-4" />
                {'Duplicar'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onLogs}>
                <FileText className="h-4 w-4" />
                {'Ver registros'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
                {'Eliminar'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}
