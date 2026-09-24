'use client';

import type { ReactNode } from 'react';
import { sileo } from 'sileo';

type NotificationOptions = {
  description?: ReactNode | string;
  duration?: number | null;
};

type NotificationMethod = (
  title: string,
  options?: NotificationOptions
) => string;

function show(
  state: 'success' | 'error' | 'warning' | 'info',
  title: string,
  options?: NotificationOptions
): string {
  return sileo[state]({
    title,
    description: options?.description,
    duration: options?.duration,
    position: 'top-center',
  });
}

/**
 * Ephemeral application feedback backed by Sileo.
 *
 * The string-first API intentionally matches the calls previously made through
 * Sonner so feature components remain focused on their domain behavior.
 * Confirmations and one-time secrets belong in `action-alerts.ts` instead.
 */
export const toast: Record<
  'success' | 'error' | 'warning' | 'info',
  NotificationMethod
> = {
  success: (title, options) => show('success', title, options),
  error: (title, options) => show('error', title, options),
  warning: (title, options) => show('warning', title, options),
  info: (title, options) => show('info', title, options),
};
