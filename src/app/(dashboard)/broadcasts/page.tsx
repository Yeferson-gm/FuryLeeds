'use client';

import { Loader2, Plus, Radio } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { GatedButton } from '@/components/ui/gated-button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCan } from '@/hooks/use-can';
import { getBroadcastStatus } from '@/lib/broadcast-status';
import { getRealtimeSocket } from '@/lib/realtime/client';
import type { Broadcast } from '@/types';

const BROADCAST_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  scheduled: 'Programada',
  sending: 'Enviando',
  sent: 'Enviada',
  failed: 'Fallida',
} as const;

function percent(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function RateCell({
  value,
  total,
  color,
}: {
  value: number;
  total: number;
  /** Tailwind bg class for the fill, e.g. "bg-primary" */
  color: string;
}) {
  const pct = percent(value, total);
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
        {pct}%
      </span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BroadcastsPage() {
  const router = useRouter();
  const canCreate = useCan('send-messages');
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBroadcasts = useCallback(async () => {
    try {
      const response = await fetch('/api/whatsapp/broadcast', {
        cache: 'no-store',
      });
      if (!response.ok) {
        const errorResult = await response.json().catch(() => ({}));
        throw new Error(errorResult.error || 'Error al cargar las difusiones');
      }
      const result = await response.json().catch(() => ({}));
      setBroadcasts(result.broadcasts ?? []);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al cargar las difusiones'
      );
    } finally {
      setLoading(false);
    }
  }, []);

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
          await fetchBroadcasts();
        } finally {
          requestRunning = false;
          if (refreshPending && !stopped) {
            refreshPending = false;
            void refresh();
          }
        }
      }

      void refresh();
      socket.on('connect', refresh);
      socket.on('broadcast:changed', refresh);
      return function unsubscribeFromBroadcastChanges() {
        stopped = true;
        socket.off('connect', refresh);
        socket.off('broadcast:changed', refresh);
      };
    },
    [fetchBroadcasts]
  );

  const anySending = useMemo(
    () => broadcasts.some((b) => b.status === 'sending'),
    [broadcasts]
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
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

  return (
    <div className="space-y-6">
      {/* Top indeterminate progress bar: only visible while a broadcast
          is mid-send. Pure CSS animation so no extra deps. */}
      {anySending && (
        <div
          role="progressbar"
          aria-label={'Difusión en curso'}
          className="broadcast-indeterminate fixed inset-x-0 top-0 z-40 h-0.5 overflow-hidden bg-muted"
        >
          <div className="broadcast-indeterminate-bar h-0.5 bg-primary" />
          <style jsx>{`
            .broadcast-indeterminate-bar {
              width: 33%;
              transform: translateX(-100%);
              animation: broadcast-slide 1.6s cubic-bezier(0.4, 0, 0.2, 1)
                infinite;
            }
            @keyframes broadcast-slide {
              0% {
                transform: translateX(-100%);
              }
              100% {
                transform: translateX(400%);
              }
            }
          `}</style>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{'Difusiones'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {
              'Envía mensajes masivos a tus contactos usando plantillas aprobadas.'
            }
          </p>
        </div>
        <GatedButton
          canAct={canCreate}
          gateReason="create broadcasts"
          onClick={() => router.push('/broadcasts/new')}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {'Nueva difusión'}
        </GatedButton>
      </div>

      {broadcasts.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-border bg-card">
          <Radio className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            {'Aún no hay difusiones'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {
              'Crea tu primera difusión para llegar a tus contactos a gran escala.'
            }
          </p>
          <GatedButton
            canAct={canCreate}
            gateReason="create broadcasts"
            onClick={() => router.push('/broadcasts/new')}
            className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {'Nueva difusión'}
          </GatedButton>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">
                  {'Nombre'}
                </TableHead>
                <TableHead className="hidden text-muted-foreground md:table-cell">
                  {'Plantilla'}
                </TableHead>
                <TableHead className="hidden text-right text-muted-foreground sm:table-cell">
                  {'Destinatarios'}
                </TableHead>
                <TableHead className="hidden text-muted-foreground lg:table-cell">
                  {'Entrega'}
                </TableHead>
                <TableHead className="hidden text-muted-foreground lg:table-cell">
                  {'Leídos'}
                </TableHead>
                <TableHead className="text-muted-foreground">
                  {'Estado'}
                </TableHead>
                <TableHead className="hidden text-muted-foreground sm:table-cell">
                  {'Fecha'}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broadcasts.map((broadcast) => {
                const status = getBroadcastStatus(broadcast.status);
                return (
                  <TableRow
                    key={broadcast.id}
                    className="cursor-pointer border-border hover:bg-muted/50"
                    onClick={() => router.push(`/broadcasts/${broadcast.id}`)}
                  >
                    <TableCell className="font-medium text-foreground">
                      {broadcast.name}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {broadcast.template_name}
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
                      {broadcast.total_recipients}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <RateCell
                        value={broadcast.delivered_count}
                        total={broadcast.total_recipients}
                        color="bg-primary"
                      />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <RateCell
                        value={broadcast.read_count}
                        total={broadcast.total_recipients}
                        color="bg-blue-500"
                      />
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${status.classes}`}
                      >
                        {status.pulse && (
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-yellow-400" />
                          </span>
                        )}
                        {BROADCAST_STATUS_LABELS[status.label]}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {new Date(broadcast.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
