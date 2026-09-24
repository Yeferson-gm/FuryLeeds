'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  derivePresence,
  type PresenceRow,
  type PresenceStatus,
  type StoredPresence,
} from '@/lib/presence';
import { getRealtimeSocket } from '@/lib/realtime/client';
import type { PresenceChangedEvent } from '@/lib/realtime/events';

type PresenceMap = Map<string, PresenceRow>;

interface PresenceApiRow {
  user_id: string;
  status: StoredPresence;
  last_seen_at: string;
}

interface UsePresenceResult {
  getPresence: (userId: string) => PresenceStatus;
  getRow: (userId: string) => PresenceRow | undefined;
  now: number;
}

/** Tracks account presence through Socket.IO and derives offline state locally. */
export function usePresence(enabled = true): UsePresenceResult {
  const { accountId } = useAuth();
  const [rows, setRows] = useState<PresenceMap>(() => new Map());
  const [now, setNow] = useState(() => Date.now());
  const active = enabled && !!accountId;

  useEffect(
    function subscribeToPresence() {
      if (!active) return;

      const controller = new AbortController();
      const socket = getRealtimeSocket();

      async function loadSnapshot() {
        try {
          const response = await fetch('/api/presence', {
            cache: 'no-store',
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const body = (await response.json()) as {
            presence: PresenceApiRow[];
          };
          const next = new Map<string, PresenceRow>();
          for (const row of body.presence) {
            next.set(row.user_id, {
              status: row.status,
              last_seen_at: row.last_seen_at,
            });
          }
          setRows(next);
          setNow(Date.now());
        } catch (error) {
          if (!controller.signal.aborted) {
            console.error('[usePresence] snapshot failed:', error);
          }
        }
      }

      function handlePresence(event: PresenceChangedEvent) {
        setRows((current) => {
          const next = new Map(current);
          if (
            event.eventType === 'DELETE' ||
            !event.status ||
            !event.lastSeenAt
          ) {
            next.delete(event.userId);
          } else {
            next.set(event.userId, {
              status: event.status,
              last_seen_at: event.lastSeenAt,
            });
          }
          return next;
        });
        setNow(Date.now());
      }

      void loadSnapshot();
      socket.on('connect', loadSnapshot);
      socket.on('presence:changed', handlePresence);

      return function unsubscribeFromPresence() {
        controller.abort();
        socket.off('connect', loadSnapshot);
        socket.off('presence:changed', handlePresence);
      };
    },
    [active]
  );

  const getRow = useCallback(
    (userId: string): PresenceRow | undefined => rows.get(userId),
    [rows]
  );

  const getPresence = useCallback(
    (userId: string): PresenceStatus => {
      const row = rows.get(userId);
      return derivePresence(row?.status, row?.last_seen_at, now);
    },
    [rows, now]
  );

  return { getPresence, getRow, now };
}
