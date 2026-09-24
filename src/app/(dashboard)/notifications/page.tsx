'use client';

import { Bell, CheckCheck, Loader2, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { formatRelativeTime } from '@/lib/dates';
import { toast } from '@/lib/notifications';
import { getRealtimeSocket } from '@/lib/realtime/client';
import { cn } from '@/lib/utils';
import type { Notification } from '@/types';

// Icon per notification type. Only one type exists today
// (conversation_assigned) but this keeps future types a one-line add.
const TYPE_ICON: Record<Notification['type'], typeof Bell> = {
  conversation_assigned: UserPlus,
};

export default function NotificationsPage() {
  const router = useRouter();
  const { accountId } = useAuth();
  const [notifications, setNotifications] = useState<Notification[] | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const loadedRef = useRef(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!accountId) return;
      const response = await fetch('/api/notifications', {
        cache: 'no-store',
        signal,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          body?.error || 'No se pudieron cargar las notificaciones'
        );
      }
      const body = (await response.json()) as { notifications: Notification[] };
      setNotifications(body.notifications);
      loadedRef.current = true;
      setError(null);
    },
    [accountId]
  );

  useEffect(
    function subscribeToNotifications() {
      if (!accountId) return;
      loadedRef.current = false;
      const controller = new AbortController();
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
          await load(controller.signal);
        } catch (loadError) {
          if (!controller.signal.aborted && !loadedRef.current) {
            setError(
              loadError instanceof Error
                ? loadError.message
                : 'No se pudieron cargar las notificaciones'
            );
          }
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
      socket.on('notification:changed', refresh);
      return function unsubscribeFromNotifications() {
        stopped = true;
        controller.abort();
        socket.off('connect', refresh);
        socket.off('notification:changed', refresh);
      };
    },
    [accountId, load]
  );

  const markRead = useCallback(
    async (id: string) => {
      // Optimistic — the row is already visually "read" by the time the
      // request lands, so the UI doesn't wait on the round-trip.
      setNotifications(
        (prev) =>
          prev?.map((n) =>
            n.id === id && !n.read_at
              ? { ...n, read_at: new Date().toISOString() }
              : n
          ) ?? prev
      );
      try {
        const response = await fetch(
          `/api/notifications/${encodeURIComponent(id)}`,
          { method: 'PATCH' }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch {
        toast.error('Error al marcar la notificación como leída');
        void load().catch(() => {});
      }
    },
    [load]
  );

  const handleClick = useCallback(
    (n: Notification) => {
      if (!n.read_at) markRead(n.id);
      if (n.conversation_id) {
        router.push(`/inbox?c=${n.conversation_id}`);
      }
    },
    [markRead, router]
  );

  const unreadIds =
    notifications?.filter((n) => !n.read_at).map((n) => n.id) ?? [];

  const markAllRead = useCallback(async () => {
    if (unreadIds.length === 0) return;
    setMarkingAll(true);
    const now = new Date().toISOString();
    setNotifications(
      (prev) =>
        prev?.map((n) => (n.read_at ? n : { ...n, read_at: now })) ?? prev
    );
    try {
      const response = await fetch('/api/notifications/read-all', {
        method: 'PATCH',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch {
      toast.error('Error al marcar todas como leídas');
      void load().catch(() => {});
    } finally {
      setMarkingAll(false);
    }
  }, [unreadIds.length, load]);

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {'Reintentar'}
        </Button>
      </div>
    );
  }

  if (notifications === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {'Notificaciones'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {
              'Las conversaciones que otros compañeros te asignan aparecen aquí.'
            }
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={unreadIds.length === 0 || markingAll}
          onClick={markAllRead}
        >
          {markingAll ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCheck className="h-4 w-4" />
          )}
          {'Marcar todas como leídas'}
        </Button>
      </div>

      {notifications.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Bell className="h-6 w-6 text-primary" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">
            {'Aún no hay notificaciones'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {'Verás una alerta aquí cuando alguien te asigne una conversación.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const Icon = TYPE_ICON[n.type] ?? Bell;
            const isUnread = !n.read_at;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleClick(n)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors',
                    isUnread
                      ? 'border-primary/30 bg-primary/5 hover:border-primary/50'
                      : 'border-border bg-card hover:border-border/70'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                      isUnread ? 'bg-primary/15' : 'bg-muted'
                    )}
                    aria-hidden
                  >
                    <Icon
                      className={cn(
                        'h-5 w-5',
                        isUnread ? 'text-primary' : 'text-muted-foreground'
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'truncate text-sm font-semibold',
                          isUnread ? 'text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        {n.title}
                      </span>
                      {isUnread && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary">
                          <span className="sr-only">{'Sin leer'}</span>
                        </span>
                      )}
                    </div>
                    {n.body && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      {formatRelativeTime(new Date(n.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
