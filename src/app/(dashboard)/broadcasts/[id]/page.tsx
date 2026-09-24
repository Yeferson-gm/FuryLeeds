'use client';

import {
  AlertCircle,
  ArrowLeft,
  CheckCheck,
  ChevronDown,
  Download,
  Eye,
  Filter,
  Loader2,
  MessageCircle,
  PlayCircle,
  RotateCcw,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { confirmAction, confirmDestructiveAction } from '@/lib/action-alerts';
import { getBroadcastStatus, getRecipientStatus } from '@/lib/broadcast-status';
import { toast } from '@/lib/notifications';
import { getRealtimeSocket } from '@/lib/realtime/client';
import type { BroadcastChangedEvent } from '@/lib/realtime/events';
import type { Broadcast, BroadcastRecipient, RecipientStatus } from '@/types';

interface StatCardProps {
  label: string;
  value: number;
  total: number;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ label, value, total, icon, color }: StatCardProps) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}
        >
          {icon}
        </div>
        <span className="text-xs text-muted-foreground">{pct}%</span>
      </div>
      <p className="mt-3 text-2xl font-bold text-foreground">
        {value.toLocaleString()}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

interface FunnelStep {
  label: string;
  value: number;
  color: string;
}

/**
 * Pure-CSS funnel chart: decreasing-width rounded bars.
 * Width is relative to the largest step (typically Sent) so we
 * always render a full bar at the top and proportional tails.
 */
function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-4 text-sm font-medium text-foreground">Embudo</h3>
      <div className="space-y-2">
        {steps.map((step) => {
          const pctOfMax = Math.max(5, Math.round((step.value / max) * 100));
          const pctOfSent =
            steps[0].value > 0
              ? Math.round((step.value / steps[0].value) * 100)
              : 0;
          return (
            <div key={step.label} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">
                {step.label}
              </span>
              <div className="relative h-7 flex-1 rounded-full bg-muted">
                <div
                  className={`h-7 rounded-full ${step.color} transition-[width] duration-500`}
                  style={{ width: `${pctOfMax}%` }}
                />
                <span className="absolute inset-0 flex items-center px-3 text-xs font-medium text-foreground">
                  {step.value.toLocaleString()}
                  <span className="ml-2 text-muted-foreground/80">
                    ({pctOfSent}%)
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RECIPIENT_STATUSES: readonly RecipientStatus[] = [
  'pending',
  'sent',
  'delivered',
  'read',
  'replied',
  'failed',
];

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  scheduled: 'Programada',
  sending: 'Enviando',
  sent: 'Enviada',
  failed: 'Fallida',
  pending: 'Pendiente',
  delivered: 'Entregado',
  read: 'Leído',
  replied: 'Respondido',
  unknown: 'Desconocido',
};

/**
 * CSV export helper — RFC 4180 quoting. Quote every field so
 * commas/newlines/quotes round-trip cleanly.
 */
function toCsv(rows: string[][]): string {
  const escapeCsvField = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return rows.map((row) => row.map(escapeCsvField).join(',')).join('\n');
}

function downloadBlob(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function BroadcastDetailPage() {
  const params = useParams();
  const router = useRouter();
  const broadcastId = params.id as string;

  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RecipientStatus | 'all'>(
    'all'
  );
  const [deleting, setDeleting] = useState(false);
  const [resumingScope, setResumingScope] = useState<
    'pending' | 'failed' | null
  >(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(`/api/whatsapp/broadcast/${broadcastId}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        const errorResult = await response.json().catch(() => ({}));
        throw new Error(errorResult.error || 'Difusión no encontrada');
      }
      const result = await response.json().catch(() => ({}));
      setBroadcast(result.broadcast);
      setRecipients(result.recipients ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Difusión no encontrada');
    } finally {
      setLoading(false);
    }
  }, [broadcastId]);

  useEffect(
    function subscribeToBroadcastChanges() {
      const socket = getRealtimeSocket();
      let stopped = false;
      let requestRunning = false;
      let refreshPending = false;

      async function refresh() {
        if (stopped) return;
        if (requestRunning) {
          refreshPending = true;
          return;
        }
        requestRunning = true;
        try {
          await fetchData();
        } finally {
          requestRunning = false;
          if (refreshPending && !stopped) {
            refreshPending = false;
            void refresh();
          }
        }
      }

      function handleBroadcastChange(event: BroadcastChangedEvent) {
        if (event.broadcastId === broadcastId) void refresh();
      }

      void refresh();
      socket.on('connect', refresh);
      socket.on('broadcast:changed', handleBroadcastChange);
      return function unsubscribeFromBroadcastChanges() {
        stopped = true;
        socket.off('connect', refresh);
        socket.off('broadcast:changed', handleBroadcastChange);
      };
    },
    [broadcastId, fetchData]
  );

  const filteredRecipients = useMemo(
    () =>
      statusFilter === 'all'
        ? recipients
        : recipients.filter((r) => r.status === statusFilter),
    [recipients, statusFilter]
  );

  function handleExport() {
    if (!broadcast) return;
    const header = [
      'Contacto',
      'Teléfono',
      'Estado',
      'Enviado',
      'Entregado',
      'Leído',
      'Error',
    ];
    const rows = recipients.map((r) => [
      r.contact?.name ?? '',
      r.contact?.phone ?? '',
      r.status,
      r.sent_at ?? '',
      r.delivered_at ?? '',
      r.read_at ?? '',
      r.error_message ?? '',
    ]);
    const csv = toCsv([header, ...rows]);
    const safeName = broadcast.name
      .replace(/[^a-z0-9-_]+/gi, '-')
      .toLowerCase();
    downloadBlob(`difusion-${safeName}-${broadcastId.slice(0, 8)}.csv`, csv);
  }

  /**
   * Hand the leftovers to the server (issue #472).
   *
   * The wizard's send loop lives in the tab that started the campaign,
   * so navigating away strands the rest as 'pending' with the broadcast
   * stuck 'sending'. This is the recovery, and the same call retries
   * failed recipients.
   */
  async function handleResume(scope: 'pending' | 'failed') {
    const count = scope === 'pending' ? pendingCount : retryableCount;
    const confirmed = await confirmAction({
      title:
        scope === 'pending'
          ? '¿Reanudar la difusión?'
          : '¿Reintentar los envíos fallidos?',
      text: `FuryLeeds volverá a enviar desde el servidor a ${count} ${count === 1 ? 'destinatario' : 'destinatarios'}. Esto puede generar nuevos mensajes en WhatsApp.`,
      confirmText: scope === 'pending' ? 'Reanudar envío' : 'Reintentar envíos',
      cancelText: 'Cancelar',
      icon: 'warning',
      destructive: true,
    });
    if (!confirmed) return;

    setResumingScope(scope);
    try {
      const res = await fetch(`/api/whatsapp/broadcast/${broadcastId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });
      if (!res.ok) {
        const errorPayload = await res.json().catch(() => ({}));
        toast.error(
          `No se pudo reanudar: ${errorPayload?.error || `HTTP ${res.status}`}`
        );
        return;
      }

      const payload = await res.json().catch(() => ({}));
      toast.success(
        payload.remaining > 0
          ? `Enviando a ${payload.resuming} destinatarios en segundo plano. Otros ${payload.remaining} necesitarán otra ejecución.`
          : `Enviando a ${payload.resuming} destinatarios en segundo plano.`
      );
      // Delivery runs server-side after the 202, so the counts here are
      // a snapshot — reload to pick up the first of it.
      await fetchData();
    } catch (err) {
      toast.error(
        `No se pudo reanudar: ${
          err instanceof Error ? err.message : 'Error desconocido'
        }`
      );
    } finally {
      setResumingScope(null);
    }
  }

  async function handleDelete() {
    const confirmed = await confirmDestructiveAction({
      title: '¿Eliminar esta difusión?',
      text: 'Se eliminarán la difusión y sus resultados locales. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar difusión',
    });
    if (!confirmed) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/whatsapp/broadcast/${broadcastId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorResult = await response.json().catch(() => ({}));
        throw new Error(errorResult.error || 'No se pudo eliminar la difusión');
      }
      toast.success('Difusión eliminada');
      router.push('/broadcasts');
    } catch (error) {
      toast.error(
        `Error al eliminar: ${
          error instanceof Error ? error.message : 'Error desconocido'
        }`
      );
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !broadcast) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">
          {error ?? 'Difusión no encontrada'}
        </p>
        <Button variant="outline" onClick={() => router.push('/broadcasts')}>
          {'Volver a difusiones'}
        </Button>
      </div>
    );
  }

  const status = getBroadcastStatus(broadcast.status);

  const pendingCount = recipients.filter((r) => r.status === 'pending').length;
  const retryableCount = recipients.filter((r) => r.status === 'failed').length;
  // A campaign whose tab went away sits in 'sending' with recipients
  // still pending and nothing left to move them. Name that state rather
  // than leaving a permanently pulsing "sending" badge.
  const isStalled = broadcast.status === 'sending' && pendingCount > 0;

  const funnelSteps: FunnelStep[] = [
    {
      label: 'Enviados',
      value: broadcast.sent_count,
      color: 'bg-primary',
    },
    {
      label: 'Entregados',
      value: broadcast.delivered_count,
      color: 'bg-teal-500',
    },
    {
      label: 'Leídos',
      value: broadcast.read_count,
      color: 'bg-blue-500',
    },
    {
      label: 'Respondidos',
      value: broadcast.replied_count,
      color: 'bg-indigo-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/broadcasts')}
            className="border-border"
            aria-label="Volver a difusiones"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">
                {broadcast.name}
              </h1>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${status.classes}`}
              >
                {STATUS_LABELS[status.label] ?? 'Desconocido'}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
              <span>Plantilla: {broadcast.template_name}</span>
              <span>-</span>
              <span>
                Creada el {new Date(broadcast.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {/* Mid-send broadcasts cannot be deleted because orphaning in-flight
            Meta messages would leave the local funnel inconsistent. */}
        <Button
          variant="outline"
          size="sm"
          disabled={broadcast.status === 'sending' || deleting}
          onClick={handleDelete}
          title={
            broadcast.status === 'sending'
              ? 'No se puede eliminar mientras una difusión se está enviando'
              : 'Eliminar esta difusión'
          }
          className="border-red-500/30 bg-transparent text-red-400 hover:bg-red-500/10 disabled:opacity-40"
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          {deleting ? 'Eliminando…' : 'Eliminar'}
        </Button>
      </div>

      {/* Resume / retry (issue #472). Only rendered when there is
          actually something outstanding. */}
      {(pendingCount > 0 || retryableCount > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="text-sm">
            <p className="font-medium text-foreground">
              {isStalled
                ? 'Esta campaña se detuvo a medio camino'
                : 'Algunos destinatarios necesitan otro intento'}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {isStalled
                ? `${pendingCount} destinatarios nunca recibieron el envío: la pestaña del navegador que ejecutaba esta campaña se cerró antes de terminar. Reanudar la completa desde el servidor.`
                : `${retryableCount} destinatarios fallaron. Reintentar les vuelve a enviar desde el servidor.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pendingCount > 0 && (
              <Button
                size="sm"
                onClick={() => handleResume('pending')}
                disabled={resumingScope !== null}
              >
                {resumingScope === 'pending' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PlayCircle className="h-3.5 w-3.5" />
                )}
                Reanudar envío ({pendingCount})
              </Button>
            )}
            {retryableCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleResume('failed')}
                disabled={resumingScope !== null}
                className="border-border text-muted-foreground hover:bg-muted"
              >
                {resumingScope === 'failed' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                Reintentar fallidos ({retryableCount})
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Stats — 6 cards: Total / Sent / Delivered / Read / Replied / Failed */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label={'Total de destinatarios'}
          value={broadcast.total_recipients}
          total={broadcast.total_recipients}
          icon={<Users className="h-4 w-4" />}
          color="bg-muted text-muted-foreground"
        />
        <StatCard
          label={'Enviados'}
          value={broadcast.sent_count}
          total={broadcast.total_recipients}
          icon={<Send className="h-4 w-4" />}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          label={'Entregados'}
          value={broadcast.delivered_count}
          total={broadcast.total_recipients}
          icon={<CheckCheck className="h-4 w-4" />}
          color="bg-teal-500/10 text-teal-400"
        />
        <StatCard
          label={'Leídos'}
          value={broadcast.read_count}
          total={broadcast.total_recipients}
          icon={<Eye className="h-4 w-4" />}
          color="bg-blue-500/10 text-blue-400"
        />
        <StatCard
          label={'Respondidos'}
          value={broadcast.replied_count}
          total={broadcast.total_recipients}
          icon={<MessageCircle className="h-4 w-4" />}
          color="bg-indigo-500/10 text-indigo-400"
        />
        <StatCard
          label={'Fallidos'}
          value={broadcast.failed_count}
          total={broadcast.total_recipients}
          icon={<AlertCircle className="h-4 w-4" />}
          color="bg-red-500/10 text-red-400"
        />
      </div>

      <FunnelChart steps={funnelSteps} />

      {/* Recipients Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">
            {statusFilter !== 'all'
              ? `Destinatarios (${filteredRecipients.length} de ${recipients.length})`
              : `Destinatarios (${recipients.length})`}
          </h2>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border text-muted-foreground hover:bg-muted"
                  />
                }
              >
                <Filter className="h-3.5 w-3.5" />
                {statusFilter === 'all'
                  ? 'Todos los estados'
                  : (STATUS_LABELS[getRecipientStatus(statusFilter).label] ??
                    'Desconocido')}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="border-border bg-popover">
                <DropdownMenuItem
                  onClick={() => setStatusFilter('all')}
                  className={
                    statusFilter === 'all'
                      ? 'text-primary'
                      : 'text-popover-foreground'
                  }
                >
                  {'Todos los estados'}
                </DropdownMenuItem>
                {RECIPIENT_STATUSES.map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={
                      statusFilter === s
                        ? 'text-primary'
                        : 'text-popover-foreground'
                    }
                  >
                    {STATUS_LABELS[getRecipientStatus(s).label] ??
                      'Desconocido'}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={recipients.length === 0}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" />
              {'Exportar CSV'}
            </Button>
          </div>
        </div>

        {filteredRecipients.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {recipients.length === 0
                ? 'No se encontraron destinatarios.'
                : 'Ningún destinatario coincide con este filtro.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">
                    {'Contacto'}
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    {'Teléfono'}
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    {'Estado'}
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    {'Enviado'}
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    {'Entregado'}
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    {'Leído'}
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    {'Error'}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecipients.map((recipient) => {
                  const rStatus = getRecipientStatus(recipient.status);
                  return (
                    <TableRow key={recipient.id} className="border-border">
                      <TableCell className="font-medium text-foreground">
                        {recipient.contact?.name ?? 'Desconocido'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.contact?.phone ?? '-'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${rStatus.classes}`}
                        >
                          {STATUS_LABELS[rStatus.label] ?? 'Desconocido'}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.sent_at
                          ? new Date(recipient.sent_at).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.delivered_at
                          ? new Date(recipient.delivered_at).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.read_at
                          ? new Date(recipient.read_at).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-red-400">
                        {recipient.error_message ?? '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
