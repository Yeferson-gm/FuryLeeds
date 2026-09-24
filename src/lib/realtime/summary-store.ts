'use client';

import { getRealtimeSocket } from '@/lib/realtime/client';

export interface NotificationSummary {
  total_unread: number;
  unread_notifications: number;
}

const EMPTY_SUMMARY: NotificationSummary = {
  total_unread: 0,
  unread_notifications: 0,
};

let summary = EMPTY_SUMMARY;
let initialized = false;
let request: Promise<void> | null = null;
let refreshPending = false;
let socketBound = false;
const listeners = new Set<() => void>();

function publish(next: NotificationSummary) {
  if (
    next.total_unread === summary.total_unread &&
    next.unread_notifications === summary.unread_notifications
  ) {
    return;
  }
  summary = next;
  for (const listener of listeners) listener();
}

async function loadSummary(): Promise<void> {
  if (request) {
    refreshPending = true;
    return request;
  }
  request = (async () => {
    try {
      const response = await fetch('/api/notifications/summary', {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next = (await response.json()) as NotificationSummary;
      initialized = true;
      publish(next);
    } catch (error) {
      console.error('[realtime-summary] refresh failed:', error);
    } finally {
      request = null;
      if (refreshPending) {
        refreshPending = false;
        void loadSummary();
      }
    }
  })();
  return request;
}

function bindSocket() {
  if (socketBound) return;
  socketBound = true;
  const socket = getRealtimeSocket();
  socket.on('summary:changed', loadSummary);
  socket.on('connect', loadSummary);
}

export function subscribeNotificationSummary(listener: () => void): () => void {
  listeners.add(listener);
  bindSocket();
  if (!initialized) void loadSummary();
  return () => listeners.delete(listener);
}

export function getNotificationSummarySnapshot(): NotificationSummary {
  return summary;
}

export function getNotificationSummaryServerSnapshot(): NotificationSummary {
  return EMPTY_SUMMARY;
}
