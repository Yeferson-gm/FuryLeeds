'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getRealtimeSocket } from '@/lib/realtime/client';
import type { ConversationChangedEvent } from '@/lib/realtime/events';
import type { Conversation } from '@/types';

interface RealtimeRowEvent<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: Partial<T>;
}

interface UseRealtimeOptions {
  onConversationEvent?: (event: RealtimeRowEvent<Conversation>) => void;
  enabled?: boolean;
}

interface InboxPayload {
  conversations?: Conversation[];
}

/** Subscribes to account-scoped conversation events over Socket.IO. */
export function useRealtime({
  onConversationEvent,
  enabled = true,
}: UseRealtimeOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const callbackRef = useRef(onConversationEvent);
  const subscribedRef = useRef(enabled);

  useEffect(function keepCallbackCurrent() {
    callbackRef.current = onConversationEvent;
  });

  useEffect(
    function subscribeToConversationEvents() {
      subscribedRef.current = enabled;
      if (!enabled) {
        setIsConnected(false);
        return;
      }

      const socket = getRealtimeSocket();
      const loading = new Set<string>();
      const pending = new Map<string, ConversationChangedEvent>();

      const emitHydrated = async (event: ConversationChangedEvent) => {
        if (!subscribedRef.current) return;
        if (event.eventType === 'DELETE') {
          callbackRef.current?.({
            eventType: 'DELETE',
            new: { id: event.conversationId } as Conversation,
            old: { id: event.conversationId },
          });
          return;
        }
        if (loading.has(event.conversationId)) {
          pending.set(event.conversationId, event);
          return;
        }

        loading.add(event.conversationId);
        try {
          const response = await fetch(
            `/api/inbox?conversation_id=${encodeURIComponent(event.conversationId)}`,
            { cache: 'no-store' }
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = (await response.json()) as InboxPayload;
          const conversation = payload.conversations?.[0];
          if (conversation && subscribedRef.current) {
            callbackRef.current?.({
              eventType: event.eventType,
              new: conversation,
              old: {},
            });
          }
        } catch (error) {
          console.error('[realtime] conversation hydration failed:', error);
        } finally {
          loading.delete(event.conversationId);
          const next = pending.get(event.conversationId);
          if (next) {
            pending.delete(event.conversationId);
            void emitHydrated(next);
          }
        }
      };

      const handleConnect = () => setIsConnected(true);
      const handleDisconnect = () => setIsConnected(false);
      const handleConversation = (event: ConversationChangedEvent) => {
        void emitHydrated(event);
      };

      setIsConnected(socket.connected);
      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);
      socket.on('conversation:changed', handleConversation);

      return function unsubscribeConversationEvents() {
        subscribedRef.current = false;
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        socket.off('conversation:changed', handleConversation);
        loading.clear();
        pending.clear();
      };
    },
    [enabled]
  );

  const unsubscribe = useCallback(() => {
    subscribedRef.current = false;
    setIsConnected(false);
  }, []);

  return { isConnected, unsubscribe };
}
