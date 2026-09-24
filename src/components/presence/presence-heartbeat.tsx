'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { IDLE_AFTER_MS, type StoredPresence } from '@/lib/presence';
import { getRealtimeSocket } from '@/lib/realtime/client';

/** Reports real presence transitions through the authenticated Socket.IO link. */
export function PresenceHeartbeat() {
  const { accountId } = useAuth();
  const lastActivityRef = useRef(0);

  useEffect(
    function reportPresenceTransitions() {
      if (!accountId) return;

      const socket = getRealtimeSocket();
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let lastStatus: StoredPresence | null = null;
      lastActivityRef.current = Date.now();

      function emitStatus(status: StoredPresence) {
        if (lastStatus === status) return;
        lastStatus = status;
        socket.emit('presence:set', { status });
      }

      function checkIdle() {
        const remaining =
          IDLE_AFTER_MS - (Date.now() - lastActivityRef.current);
        if (remaining > 0 && !document.hidden) {
          idleTimer = setTimeout(checkIdle, remaining);
          return;
        }
        emitStatus('away');
        idleTimer = null;
      }

      function ensureIdleCheck() {
        if (idleTimer || document.hidden) return;
        idleTimer = setTimeout(checkIdle, IDLE_AFTER_MS);
      }

      function markActive() {
        lastActivityRef.current = Date.now();
        if (!document.hidden) emitStatus('online');
        ensureIdleCheck();
      }

      function handleVisibilityChange() {
        if (document.hidden) {
          emitStatus('away');
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = null;
          return;
        }
        markActive();
      }

      function handleConnect() {
        lastStatus = null;
        emitStatus(document.hidden ? 'away' : 'online');
        ensureIdleCheck();
      }

      const activityEvents: (keyof DocumentEventMap)[] = [
        'mousemove',
        'keydown',
        'pointerdown',
        'scroll',
      ];
      for (const eventName of activityEvents) {
        document.addEventListener(eventName, markActive, { passive: true });
      }
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', markActive);
      socket.on('connect', handleConnect);

      handleConnect();
      return function stopPresenceReporting() {
        if (idleTimer) clearTimeout(idleTimer);
        for (const eventName of activityEvents) {
          document.removeEventListener(eventName, markActive);
        }
        document.removeEventListener(
          'visibilitychange',
          handleVisibilityChange
        );
        window.removeEventListener('focus', markActive);
        socket.off('connect', handleConnect);
      };
    },
    [accountId]
  );

  return null;
}
