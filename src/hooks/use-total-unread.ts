'use client';

import { useSyncExternalStore } from 'react';
import {
  getNotificationSummaryServerSnapshot,
  getNotificationSummarySnapshot,
  subscribeNotificationSummary,
} from '@/lib/realtime/summary-store';

/** Count of conversations with unread inbound messages in the current account. */
export function useTotalUnread(): number {
  return useSyncExternalStore(
    subscribeNotificationSummary,
    getNotificationSummarySnapshot,
    getNotificationSummaryServerSnapshot
  ).total_unread;
}
