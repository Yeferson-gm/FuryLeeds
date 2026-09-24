import type { ContentType, SenderType } from '@/types';

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface EntityChangedEvent {
  id: string;
  eventType: RealtimeEventType;
}

export interface ConversationChangedEvent extends EntityChangedEvent {
  conversationId: string;
}

export interface ThreadChangedEvent {
  conversationId: string;
}

export interface NotificationChangedEvent extends EntityChangedEvent {
  notificationId: string;
}

export interface BroadcastChangedEvent extends EntityChangedEvent {
  broadcastId: string;
}

export interface PresenceChangedEvent {
  eventType: 'UPSERT' | 'DELETE';
  userId: string;
  status?: 'online' | 'away';
  lastSeenAt?: string;
}

export interface BrowserMessageEvent {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  content_type: ContentType;
  content_text: string | null;
  created_at: string;
  contact_name: string | null;
  contact_wa_username: string | null;
  contact_phone: string | null;
}

export interface ServerToClientEvents {
  'conversation:changed': (event: ConversationChangedEvent) => void;
  'thread:changed': (event: ThreadChangedEvent) => void;
  'summary:changed': () => void;
  'notification:changed': (event: NotificationChangedEvent) => void;
  'presence:changed': (event: PresenceChangedEvent) => void;
  'broadcast:changed': (event: BroadcastChangedEvent) => void;
  'browser-message:created': (event: BrowserMessageEvent) => void;
}

export interface ClientToServerEvents {
  'presence:set': (payload: { status: 'online' | 'away' }) => void;
  'thread:join': (
    payload: { conversationId: string },
    acknowledge?: (accepted: boolean) => void
  ) => void;
  'thread:leave': (payload: { conversationId: string }) => void;
}

export interface SocketData {
  userId: string;
  accountId: string;
}

export type DatabaseRealtimeEvent =
  | {
      v: 1;
      kind: 'conversation';
      eventType: RealtimeEventType;
      accountId: string;
      entityId: string;
      conversationId: string;
    }
  | {
      v: 1;
      kind: 'thread';
      eventType: RealtimeEventType;
      accountId: string;
      entityId: string;
      conversationId: string;
      browserMessage?: BrowserMessageEvent;
    }
  | {
      v: 1;
      kind: 'notification';
      eventType: RealtimeEventType;
      accountId: string;
      entityId: string;
      targetUserId: string;
    }
  | {
      v: 1;
      kind: 'presence';
      eventType: RealtimeEventType;
      accountId: string;
      entityId: string;
      targetUserId: string;
      status?: 'online' | 'away';
      lastSeenAt?: string;
    }
  | {
      v: 1;
      kind: 'broadcast';
      eventType: RealtimeEventType;
      accountId: string;
      entityId: string;
      broadcastId: string;
    };

export const REALTIME_CHANNEL = 'furyleeds_realtime_v1';

export function accountRoom(accountId: string): string {
  return `account:${accountId}`;
}

export function userRoom(accountId: string, userId: string): string {
  return `account:${accountId}:user:${userId}`;
}

export function conversationRoom(
  accountId: string,
  conversationId: string
): string {
  return `account:${accountId}:conversation:${conversationId}`;
}
