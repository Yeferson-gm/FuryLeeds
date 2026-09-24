'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  buildNotificationContent,
  conversationHref,
  getNotificationPermission,
  pickContactDisplayName,
  readBrowserNotifyPref,
  shouldNotifyForMessage,
  subscribeBrowserNotifyPref,
  viewedConversationFromLocation,
} from '@/lib/notifications/browser-notify';
import { getRealtimeSocket } from '@/lib/realtime/client';
import type { BrowserMessageEvent } from '@/lib/realtime/events';

const serverSnapshot = () => false;

/** Device-scoped browser-notification preference. */
export function useBrowserNotifyPref(): boolean {
  return useSyncExternalStore(
    subscribeBrowserNotifyPref,
    readBrowserNotifyPref,
    serverSnapshot
  );
}

/** Shows browser notifications for inbound Socket.IO message events. */
export function useBrowserNotifications(): void {
  const enabled = useBrowserNotifyPref();
  const router = useRouter();
  const seenRef = useRef<Map<string, number>>(new Map());

  useEffect(
    function subscribeToBrowserMessages() {
      if (!enabled || getNotificationPermission() === 'unsupported') return;
      const socket = getRealtimeSocket();

      function showNotification(message: BrowserMessageEvent) {
        if (getNotificationPermission() !== 'granted') return;
        const shouldNotify = shouldNotifyForMessage(message, {
          documentVisible: document.visibilityState === 'visible',
          viewingConversationId: viewedConversationFromLocation(
            window.location.pathname,
            window.location.search
          ),
          seen: seenRef.current,
        });
        if (!shouldNotify) return;

        const { title, body } = buildNotificationContent(
          message,
          pickContactDisplayName({
            name: message.contact_name,
            wa_username: message.contact_wa_username,
            phone: message.contact_phone,
          })
        );
        try {
          const notification = new Notification(title, {
            body,
            tag: message.conversation_id,
            icon: '/icon',
          });
          notification.onclick = () => {
            window.focus();
            router.push(conversationHref(message.conversation_id));
            notification.close();
          };
        } catch (error) {
          console.error('[useBrowserNotifications] failed to show:', error);
        }
      }

      socket.on('browser-message:created', showNotification);
      return function unsubscribeFromBrowserMessages() {
        socket.off('browser-message:created', showNotification);
      };
    },
    [enabled, router]
  );
}
