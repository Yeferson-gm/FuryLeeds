'use client';

import { useSyncExternalStore } from 'react';
import {
  getNotificationSummaryServerSnapshot,
  getNotificationSummarySnapshot,
  subscribeNotificationSummary,
} from '@/lib/realtime/summary-store';

/** Count of unread notifications addressed to the signed-in user. */
export function useUnreadNotifications(): number {
  return useSyncExternalStore(
    subscribeNotificationSummary,
    getNotificationSummarySnapshot,
    getNotificationSummaryServerSnapshot
  ).unread_notifications;
}
