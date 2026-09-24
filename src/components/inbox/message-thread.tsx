'use client';

import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  UserPlus,
} from 'lucide-react';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PresenceDot } from '@/components/presence/presence-dot';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import { usePresence } from '@/hooks/use-presence';
import {
  differenceInWholeHours,
  formatLocalDateKey,
  formatLongSpanishDate,
  isToday,
  isYesterday,
} from '@/lib/dates';
import { collectMediaGallery } from '@/lib/media/gallery';
import { toast } from '@/lib/notifications';
import { presenceLabel } from '@/lib/presence';
import { getRealtimeSocket } from '@/lib/realtime/client';
import type { ThreadChangedEvent } from '@/lib/realtime/events';
import { deleteAccountMedia } from '@/lib/storage/upload-media';
import { cn } from '@/lib/utils';
import { renderTemplateBody } from '@/lib/whatsapp/template-render';
import { contactHandle } from '@/lib/whatsapp/wa-identity';
import type {
  Contact,
  Conversation,
  ConversationStatus,
  InteractiveMessagePayload,
  Message,
  MessageReaction,
  MessageTemplate,
  Profile,
} from '@/types';
import { AiThreadBanner } from './ai-thread-banner';
import { MediaLightbox } from './media-lightbox';
import { MessageActions } from './message-actions';
import { MessageBubble } from './message-bubble';
import {
  CHAT_MEDIA_BUCKET,
  MessageComposer,
  type SendMediaPayload,
} from './message-composer';
import { buildReplyPreview } from './reply-quote';
import { TemplatePicker } from './template-picker';

interface ReplyDraft {
  id: string;
  authorLabel: string;
  preview: string;
}

interface MessageThreadProps {
  conversation: Conversation | null;
  contact: Contact | null;
  messages: Message[];
  onMessagesLoaded: (messages: Message[]) => void;
  onNewMessage: (message: Message) => void;
  onUpdateMessage: (id: string, updates: Partial<Message>) => void;
  onStatusChange: (conversationId: string, status: ConversationStatus) => void;
  onAssignChange: (
    conversationId: string,
    assignedAgentId: string | null
  ) => void;
  /**
   * On mobile, the thread is shown full-screen with the conversation list
   * hidden. This callback lets the page deselect the active conversation
   * and reveal the list again. Rendered as a back-arrow in the header on
   * mobile only.
   */
  onBack?: () => void;
  /**
   * Increment to force the messages + reactions fetch effects to refire.
   * Parent bumps this on realtime reconnect / tab visibility → visible
   * so the open thread catches up on any events sent while the WS was
   * disconnected or the tab was throttled. Optional so existing callers
   * keep working.
   */
  resyncToken?: number;
  /**
   * Fired by the manual-refresh button in the thread header. The parent
   * typically bumps the same `resyncToken` it controls — this gives the
   * user a way to force a refetch when they suspect realtime missed an
   * event (or they're impatient). Optional so existing callers keep
   * working; the button is only rendered when this is provided.
   */
  onRefresh?: () => void;
  /**
   * Desktop-only contact-panel toggle. The page owns the open/closed
   * state (it's the one that renders the sidebar), so the thread just
   * reflects it and asks the page to flip it. Both optional so existing
   * callers keep working; the toggle button only renders when
   * `onToggleContactPanel` is wired up.
   */
  contactPanelOpen?: boolean;
  onToggleContactPanel?: () => void;
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return 'Hoy';
  if (isYesterday(date)) return 'Ayer';
  return formatLongSpanishDate(date);
}

function groupMessagesByDate(messages: Message[]) {
  const groups: { date: string; messages: Message[] }[] = [];
  let currentDate = '';

  for (const msg of messages) {
    const day = formatLocalDateKey(new Date(msg.created_at));
    if (day !== currentDate) {
      currentDate = day;
      groups.push({ date: msg.created_at, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }

  return groups;
}

const STATUS_OPTIONS: {
  label: string;
  value: ConversationStatus;
  color: string;
}[] = [
  { label: 'Abierta', value: 'open', color: 'text-primary' },
  { label: 'Pendiente', value: 'pending', color: 'text-amber-400' },
  { label: 'Cerrada', value: 'closed', color: 'text-muted-foreground' },
];

/**
 * WhatsApp-style doodle background applied to the chat area (both the
 * active thread and the empty state). The SVG tile lives at
 * `/public/inbox-doodle.svg`; the slate-950 colour sits underneath so
 * the doodles read as a subtle pattern rather than a stark grid.
 *
 * Defined once at module scope so the two render paths can't drift —
 * if we ever switch the asset, both spots update together.
 */
const DOODLE_BG_CLASSES =
  "bg-background bg-[url('/inbox-doodle.svg')] bg-repeat";

export function MessageThread({
  conversation,
  contact,
  messages,
  onMessagesLoaded,
  onNewMessage,
  onUpdateMessage,
  onStatusChange,
  onAssignChange,
  onBack,
  resyncToken = 0,
  onRefresh,
  contactPanelOpen,
  onToggleContactPanel,
}: MessageThreadProps) {
  const { user } = useAuth();
  const { getPresence, getRow, now } = usePresence();
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  // Purely visual spin state for the manual-refresh button. The actual
  // refetch is fire-and-forget through `onRefresh` (which bumps the
  // parent's resyncToken); the 700ms spin is just feedback so the click
  // doesn't feel like a no-op. Cleared via the timer ref on unmount.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);
  const handleRefreshClick = useCallback(() => {
    if (isRefreshing || !onRefresh) return;
    setIsRefreshing(true);
    onRefresh();
    refreshTimerRef.current = setTimeout(() => {
      setIsRefreshing(false);
      refreshTimerRef.current = null;
    }, 700);
  }, [isRefreshing, onRefresh]);
  const [replyTo, setReplyTo] = useState<ReplyDraft | null>(null);
  // Which attachment the media viewer is showing. Lives here rather than in
  // the bubble so the viewer can page through every image/video in the
  // thread (issue #373). Paired with the conversation it belongs to and read
  // back through that check below, so switching threads closes the viewer
  // without an effect racing the messages refetch.
  const [openMedia, setOpenMedia] = useState<{
    conversationId: string;
    messageId: string;
  } | null>(null);

  // Load account members for assignment. Authorization and account scoping
  // live in the API rather than in the browser.
  useEffect(function loadProfiles() {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/inbox/resources', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as { profiles?: Profile[] };
        setProfiles(payload.profiles ?? []);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Failed to fetch profiles:', error);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  // 24-hour session timer
  const sessionInfo = useMemo(() => {
    if (!messages.length) return { expired: false, remaining: '' };

    // Find last customer message
    const lastCustomerMsg = [...messages]
      .reverse()
      .find((m) => m.sender_type === 'customer');

    if (!lastCustomerMsg)
      return { expired: true, remaining: 'Sin mensajes del cliente' };

    const hoursSince = differenceInWholeHours(
      new Date(),
      new Date(lastCustomerMsg.created_at)
    );
    const expired = hoursSince >= 24;

    if (expired) {
      return { expired: true, remaining: 'Expirada' };
    }

    const hoursLeft = 24 - hoursSince;
    const remaining =
      hoursLeft >= 1
        ? `${Math.floor(hoursLeft)}h restantes`
        : `${Math.floor(hoursLeft * 60)}min restantes`;

    return { expired, remaining };
  }, [messages]);

  // Store the latest callback in a ref so parent renders do not restart the
  // Socket.IO subscription and create duplicate requests.
  // The ref is written inside an effect so the mutation doesn't happen
  // during render (React 19 refs rule); consumers only read `.current`
  // inside the async fetch completion, which runs after the render.
  const onMessagesLoadedRef = useRef(onMessagesLoaded);
  useEffect(() => {
    onMessagesLoadedRef.current = onMessagesLoaded;
  });

  const conversationId = conversation?.id;
  const hasUnread = (conversation?.unread_count ?? 0) > 0;

  const mediaMessageId =
    openMedia && openMedia.conversationId === conversationId
      ? openMedia.messageId
      : null;
  const handleMediaChange = useCallback(
    (messageId: string | null) => {
      setOpenMedia(
        messageId && conversationId ? { conversationId, messageId } : null
      );
    },
    [conversationId]
  );

  // Load a complete snapshot on mount/reconnect and whenever PostgreSQL emits
  // a change for the active thread. Bursts are coalesced to one trailing fetch.
  useEffect(
    function subscribeToThread() {
      void resyncToken;
      if (!conversationId) return;

      const controller = new AbortController();
      const socket = getRealtimeSocket();
      let stopped = false;
      let requestRunning = false;
      let refreshPending = false;
      setLoading(true);

      const loadSnapshot = async () => {
        if (stopped) return;
        if (requestRunning) {
          refreshPending = true;
          return;
        }
        requestRunning = true;
        try {
          const response = await fetch(
            `/api/inbox/conversations/${encodeURIComponent(conversationId)}`,
            { cache: 'no-store', signal: controller.signal }
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = (await response.json()) as {
            messages?: Message[];
            reactions?: MessageReaction[];
          };
          if (stopped) return;
          onMessagesLoadedRef.current(payload.messages ?? []);
          setReactions(payload.reactions ?? []);
        } catch (error) {
          if (!controller.signal.aborted) {
            console.error('Failed to fetch thread snapshot:', error);
          }
        } finally {
          if (!controller.signal.aborted && !stopped) setLoading(false);
          requestRunning = false;
          if (refreshPending && !stopped) {
            refreshPending = false;
            void loadSnapshot();
          }
        }
      };

      const joinThread = () => {
        socket.emit('thread:join', { conversationId }, (accepted) => {
          if (!accepted) console.error('Realtime thread subscription rejected');
        });
      };
      const handleThreadChange = (event: ThreadChangedEvent) => {
        if (event.conversationId === conversationId) void loadSnapshot();
      };
      const handleConnect = () => {
        joinThread();
        void loadSnapshot();
      };

      joinThread();
      void loadSnapshot();
      socket.on('connect', handleConnect);
      socket.on('thread:changed', handleThreadChange);

      return function unsubscribeFromThread() {
        stopped = true;
        controller.abort();
        socket.emit('thread:leave', { conversationId });
        socket.off('connect', handleConnect);
        socket.off('thread:changed', handleThreadChange);
      };
    },
    [conversationId, resyncToken]
  );

  // Clear any in-progress reply draft when the active conversation changes —
  // a quote pulled from conversation A shouldn't bleed into conversation B.
  useEffect(() => {
    setReplyTo(null);
  }, []);

  // Reset unread_count whenever an unread snapshot surfaces on the active
  // conversation, including new messages received while it is open.
  //
  // Guarding on hasUnread prevents the eq-update loop: once unread_count
  // is 0 the condition is false, so no further UPDATE is issued.
  useEffect(() => {
    if (!conversationId || !hasUnread) return;
    void fetch(
      `/api/inbox/conversations/${encodeURIComponent(conversationId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unread_count: 0 }),
      }
    ).then((response) => {
      if (!response.ok) {
        console.error('Failed to reset unread_count:', response.status);
      }
    });
  }, [conversationId, hasUnread]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const handleSend = useCallback(
    async (text: string, replyToId?: string) => {
      if (!conversation) return;

      const tempId = `temp-${Date.now()}`;

      // Optimistic update — shows the message immediately with "sending" status
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: 'agent',
        content_type: 'text',
        content_text: text,
        status: 'sending',
        created_at: new Date().toISOString(),
        reply_to_message_id: replyToId,
      };
      onNewMessage(optimisticMsg);
      setReplyTo(null);

      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: 'text',
            content_text: text,
            reply_to_message_id: replyToId,
          }),
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          const reason = payload?.error || `HTTP ${res.status}`;
          console.error('Failed to send message:', reason);
          toast.error(`Error al enviar: ${reason}`);
          // Mark the optimistic bubble as failed so the user sees what happened
          onUpdateMessage(tempId, { status: 'failed' });
          return;
        }

        // The next realtime snapshot replaces the optimistic bubble with the
        // persisted row. Mark it sent immediately so the UI remains responsive.
        onUpdateMessage(tempId, { status: 'sent' });
      } catch (err) {
        console.error('Failed to send message:', err);
        const reason = err instanceof Error ? err.message : 'error de red';
        toast.error(`Error al enviar: ${reason}`);
        onUpdateMessage(tempId, { status: 'failed' });
      }
    },
    [conversation, onNewMessage, onUpdateMessage]
  );

  const handleSendMedia = useCallback(
    async (payload: SendMediaPayload) => {
      if (!conversation) return;

      // Documents show their filename in our own bubble (and to the
      // recipient as the Meta caption when no caption was typed); other
      // kinds use the caption as-is. Audio carries no caption.
      const contentText =
        payload.kind === 'document'
          ? payload.caption || payload.filename || 'Documento'
          : payload.caption;

      const tempId = `temp-${Date.now()}`;
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: 'agent',
        content_type: payload.kind,
        content_text: contentText,
        media_url: payload.mediaUrl,
        status: 'sending',
        created_at: new Date().toISOString(),
        reply_to_message_id: payload.replyToId,
      };
      onNewMessage(optimisticMsg);
      setReplyTo(null);

      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: payload.kind,
            media_url: payload.mediaUrl,
            content_text: contentText,
            filename: payload.filename,
            reply_to_message_id: payload.replyToId,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const reason = data?.error || `HTTP ${res.status}`;
          console.error('Failed to send media:', reason);
          toast.error(`Error al enviar: ${reason}`);
          onUpdateMessage(tempId, { status: 'failed' });
          // The upload never reached the recipient — GC the orphaned
          // object rather than leaving it in the public bucket forever.
          void deleteAccountMedia(CHAT_MEDIA_BUCKET, payload.path).catch(
            () => {}
          );
          return;
        }

        onUpdateMessage(tempId, { status: 'sent' });
      } catch (err) {
        console.error('Failed to send media:', err);
        const reason = err instanceof Error ? err.message : 'error de red';
        toast.error(`Error al enviar: ${reason}`);
        onUpdateMessage(tempId, { status: 'failed' });
        void deleteAccountMedia(CHAT_MEDIA_BUCKET, payload.path).catch(
          () => {}
        );
      }
    },
    [conversation, onNewMessage, onUpdateMessage]
  );

  const handleSendInteractive = useCallback(
    async (payload: InteractiveMessagePayload, replyToId?: string) => {
      if (!conversation) return;

      const tempId = `temp-${Date.now()}`;
      // Optimistic bubble — renders the buttons/list immediately via the
      // interactive_payload, same as the persisted row will.
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: 'agent',
        content_type: 'interactive',
        content_text: payload.body,
        interactive_payload: payload,
        status: 'sending',
        created_at: new Date().toISOString(),
        reply_to_message_id: replyToId,
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: 'interactive',
            interactive_payload: payload,
            reply_to_message_id: replyToId,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const reason = data?.error || `HTTP ${res.status}`;
          console.error('Failed to send interactive message:', reason);
          toast.error(`Error al enviar: ${reason}`);
          onUpdateMessage(tempId, { status: 'failed' });
          return;
        }

        onUpdateMessage(tempId, { status: 'sent' });
      } catch (err) {
        console.error('Failed to send interactive message:', err);
        const reason = err instanceof Error ? err.message : 'error de red';
        toast.error(`Error al enviar: ${reason}`);
        onUpdateMessage(tempId, { status: 'failed' });
      }
    },
    [conversation, onNewMessage, onUpdateMessage]
  );

  const handleStatusChange = useCallback(
    async (status: ConversationStatus) => {
      if (!conversation) return;

      const response = await fetch(
        `/api/inbox/conversations/${encodeURIComponent(conversation.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        }
      );
      if (!response.ok) {
        toast.error('Error al actualizar el estado');
        return;
      }
      onStatusChange(conversation.id, status);
    },
    [conversation, onStatusChange]
  );

  const handleOpenTemplates = useCallback(() => {
    setTemplateModalOpen(true);
  }, []);

  const handleSendTemplate = useCallback(
    async (
      template: MessageTemplate,
      values: {
        body: string[];
        headerText?: string;
        buttonParams?: Record<number, string>;
      }
    ) => {
      if (!conversation) return;

      const renderedBody = renderTemplateBody(template.body_text, values.body);
      const tempId = `temp-${Date.now()}`;

      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: 'agent',
        content_type: 'template',
        content_text: renderedBody,
        template_name: template.name,
        status: 'sending',
        created_at: new Date().toISOString(),
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: 'template',
            template_name: template.name,
            template_language: template.language,
            // Structured params drive the new send-builder path
            // (header media + URL button substitution). Body values
            // are mirrored under both shapes so the route can fall
            // back if the template row isn't found locally.
            template_message_params: {
              body: values.body,
              headerText: values.headerText,
              buttonParams: values.buttonParams,
            },
            template_params: values.body,
            content_text: renderedBody,
          }),
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          const reason = payload?.error || `HTTP ${res.status}`;
          console.error('Failed to send template:', reason);
          toast.error(`Error al enviar la plantilla: ${reason}`);
          onUpdateMessage(tempId, { status: 'failed' });
          return;
        }

        onUpdateMessage(tempId, { status: 'sent' });
      } catch (err) {
        console.error('Failed to send template:', err);
        const reason = err instanceof Error ? err.message : 'error de red';
        toast.error(`Error al enviar la plantilla: ${reason}`);
        onUpdateMessage(tempId, { status: 'failed' });
      }
    },
    [conversation, onNewMessage, onUpdateMessage]
  );

  // Build a quick id → Message map so reply quotes can be rendered without
  // an extra fetch — the thread already holds the full conversation.
  const messagesById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  // Images + videos in the thread, in order — the set the media viewer
  // pages through with ← / →.
  const mediaGallery = useMemo(() => collectMediaGallery(messages), [messages]);

  // Bucket reactions by their target message_id for O(1) per-bubble lookup.
  const reactionsByMessageId = useMemo(() => {
    const map = new Map<string, MessageReaction[]>();
    for (const r of reactions) {
      const bucket = map.get(r.message_id);
      if (bucket) bucket.push(r);
      else map.set(r.message_id, [r]);
    }
    return map;
  }, [reactions]);

  const contactDisplayName =
    contact?.name || (contact ? contactHandle(contact) : '') || 'Cliente';

  // Author label for a quoted message: "Tú" when we sent the parent,
  // contact name when the customer sent it.
  const authorLabelFor = useCallback(
    (m: Message): string => {
      const isAgentMsg = m.sender_type === 'agent' || m.sender_type === 'bot';
      return isAgentMsg ? 'Tú' : contactDisplayName;
    },
    [contactDisplayName]
  );

  const handleStartReply = useCallback(
    (msg: Message) => {
      setReplyTo({
        id: msg.id,
        authorLabel: authorLabelFor(msg),
        preview: buildReplyPreview(msg),
      });
    },
    [authorLabelFor]
  );

  // Single reaction-set primitive. emoji === "" removes; otherwise adds/swaps.
  // Capture the current list so a failed optimistic request can restore it.
  const postReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user?.id || !conversation) {
        console.warn('[reactions] missing user or conversation');
        return;
      }
      if (messageId.startsWith('temp-')) {
        toast.error('Espera a que el mensaje termine de enviarse');
        return;
      }

      const convId = conversation.id;
      const userId = user.id;
      const snapshot = reactions;
      const optimisticId = `temp-${Date.now()}`;
      const createdAt = new Date().toISOString();

      setReactions((prev) => {
        const own = prev.find(
          (r) =>
            r.message_id === messageId &&
            r.actor_type === 'agent' &&
            r.actor_id === userId
        );
        if (emoji === '') return own ? prev.filter((r) => r !== own) : prev;
        if (own) return prev.map((r) => (r === own ? { ...own, emoji } : r));
        return [
          ...prev,
          {
            id: optimisticId,
            message_id: messageId,
            conversation_id: convId,
            actor_type: 'agent',
            actor_id: userId,
            emoji,
            created_at: createdAt,
          },
        ];
      });

      try {
        const res = await fetch('/api/whatsapp/react', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_id: messageId, emoji }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'error de red';
        toast.error(`Error en la reacción: ${reason}`);
        setReactions(snapshot);
      }
    },
    [conversation, reactions, user?.id]
  );

  const handleAssignChange = useCallback(
    async (agentId: string | null) => {
      if (!conversation) return;

      const response = await fetch(
        `/api/inbox/conversations/${encodeURIComponent(conversation.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigned_agent_id: agentId }),
        }
      );
      if (!response.ok) {
        console.error('Failed to update assignment:', response.status);
        toast.error('Error al actualizar la asignación');
        return;
      }
      onAssignChange(conversation.id, agentId);
    },
    [conversation, onAssignChange]
  );

  // Empty state — same WhatsApp-style doodle background as the active
  // thread below, so swapping between empty/selected doesn't change the
  // pattern under the user's eye.
  if (!conversation || !contact) {
    return (
      <div
        className={cn(
          'flex flex-1 flex-col items-center justify-center',
          DOODLE_BG_CLASSES
        )}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <MessageSquare className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-sm font-medium text-muted-foreground">
          Selecciona una conversación
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Elige una conversación a la izquierda para empezar a chatear
        </p>
      </div>
    );
  }

  const displayName = contact.name || contactHandle(contact);
  const messageGroups = groupMessagesByDate(messages);
  const currentStatus = STATUS_OPTIONS.find(
    (s) => s.value === conversation.status
  );
  const assignedAgentId = conversation.assigned_agent_id ?? null;
  const currentAssignee = profiles.find((p) => p.user_id === assignedAgentId);
  const assignLabel = assignedAgentId
    ? (currentAssignee?.full_name ?? 'Asignada')
    : 'Asignar';

  return (
    // `min-w-0` is load-bearing: the page already puts min-w-0 on the
    // thread's flex *wrapper* (issue #165), but this root keeps the
    // default `min-width: auto`, so a single wide message (long unbroken
    // URL/word) expands the whole thread past its flex share and the chat
    // paints on top of the contact sidebar at lg+ — outgoing bubbles get
    // clipped and the hover toolbar overlaps the Tags panel. Letting the
    // root shrink lets the bubbles' wrap-break-word / max-w caps apply.
    // Issue #257.
    <div className={cn('flex min-w-0 flex-1 flex-col', DOODLE_BG_CLASSES)}>
      {/* Header — solid card surface sits on top of the doodle so the
          name/avatar/dropdowns stay legible. */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* Back-to-list button — mobile only. Hidden on lg+ where the
              conversation list is always visible next to the thread. */}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Volver a las conversaciones"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {contactHandle(contact)}
            </p>
          </div>
          {/* Session timer badge — hidden on the narrowest phones so
              the name + back arrow keep their room. */}
          <Badge
            variant="outline"
            className={cn(
              'ml-1 hidden gap-1 border-border text-[10px] sm:inline-flex sm:ml-2',
              sessionInfo.expired ? 'text-red-400' : 'text-primary'
            )}
          >
            <Clock className="h-3 w-3" />
            {sessionInfo.remaining}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Contact-panel toggle — desktop only. The contact sidebar
              eats a chunk of horizontal width that crowds the thread on
              smaller laptops; this lets agents reclaim it when they just
              want to read and reply. Hidden on mobile, where the sidebar
              never renders as a permanent panel anyway. Issue #258. */}
          {onToggleContactPanel && (
            <button
              type="button"
              onClick={onToggleContactPanel}
              aria-label={
                contactPanelOpen
                  ? 'Ocultar panel del contacto'
                  : 'Mostrar panel del contacto'
              }
              title={contactPanelOpen ? 'Ocultar contacto' : 'Mostrar contacto'}
              aria-pressed={contactPanelOpen}
              className={cn(
                'hidden h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground lg:inline-flex',
                contactPanelOpen ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              {contactPanelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </button>
          )}

          {/* Manual refresh — forces a refetch of the messages + the
              conversation list (the parent bumps its resyncToken). Useful
              when realtime missed an event or the agent just wants to be
              sure nothing's stale. Only rendered when the parent wires
              up `onRefresh`. */}
          {onRefresh && (
            <button
              type="button"
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              aria-label="Actualizar conversación"
              title="Actualizar"
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60'
              )}
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')}
              />
            </button>
          )}

          {/* Status dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'inline-flex items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted',
                currentStatus?.color ?? 'text-muted-foreground'
              )}
            >
              {currentStatus?.label ?? 'Estado'}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-border bg-popover"
            >
              {STATUS_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={cn('text-sm', opt.color)}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Assign dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'inline-flex items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted',
                assignedAgentId ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <UserPlus className="h-3 w-3" />
              <span className="hidden sm:inline">{assignLabel}</span>
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-border bg-popover"
            >
              {profiles.length === 0 ? (
                <DropdownMenuItem
                  disabled
                  className="text-sm text-muted-foreground"
                >
                  No hay compañeros disponibles
                </DropdownMenuItem>
              ) : (
                profiles.map((p) => {
                  const isSelected = p.user_id === assignedAgentId;
                  const presence = getPresence(p.user_id);
                  return (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => handleAssignChange(p.user_id)}
                      className={cn(
                        'text-sm',
                        isSelected ? 'text-primary' : 'text-popover-foreground'
                      )}
                    >
                      <PresenceDot
                        status={presence}
                        label={presenceLabel(
                          presence,
                          getRow(p.user_id)?.last_seen_at ?? null,
                          now
                        )}
                        className="mr-2"
                      />
                      <span className="flex-1">
                        {p.full_name}
                        {p.user_id === user?.id ? ' (yo)' : ''}
                      </span>
                      {isSelected && <Check className="ml-2 h-3 w-3" />}
                    </DropdownMenuItem>
                  );
                })
              )}
              {assignedAgentId && (
                <>
                  <DropdownMenuSeparator className="bg-border" />
                  <DropdownMenuItem
                    onClick={() => handleAssignChange(null)}
                    className="text-sm text-muted-foreground"
                  >
                    Quitar asignación
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Aún no hay mensajes</p>
            <p className="text-xs text-muted-foreground">
              Envía una plantilla para iniciar la conversación
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messageGroups.map((group) => (
              <div key={group.date}>
                {/* Date separator */}
                <div className="mb-4 flex items-center justify-center">
                  <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-medium text-muted-foreground">
                    {formatDateSeparator(group.date)}
                  </span>
                </div>
                {/* Messages */}
                <div className="space-y-2">
                  {group.messages.map((msg) => {
                    const parent = msg.reply_to_message_id
                      ? messagesById.get(msg.reply_to_message_id)
                      : null;
                    const reply = parent
                      ? {
                          authorLabel:
                            parent.sender_type === 'agent' ||
                            parent.sender_type === 'bot'
                              ? ' (yo)'
                              : contact?.name ||
                                contact?.phone ||
                                'Desconocido',
                          preview: buildReplyPreview(parent),
                        }
                      : null;
                    const msgReactions = reactionsByMessageId.get(msg.id);
                    // Toggle is computed at the call site — `msgReactions`
                    // and `user?.id` are already in scope, no extra hook.
                    const handlePillToggle = (emoji: string) => {
                      const own = msgReactions?.find(
                        (r) =>
                          r.actor_type === 'agent' && r.actor_id === user?.id
                      );
                      const next = own?.emoji === emoji ? '' : emoji;
                      void postReaction(msg.id, next);
                    };
                    return (
                      <MessageActions
                        key={msg.id}
                        message={msg}
                        onReply={() => handleStartReply(msg)}
                        onReact={(emoji) => {
                          if (emoji) void postReaction(msg.id, emoji);
                        }}
                      >
                        <MessageBubble
                          message={msg}
                          reply={reply}
                          reactions={msgReactions}
                          currentUserId={user?.id}
                          onToggleReaction={handlePillToggle}
                          onOpenMedia={handleMediaChange}
                        />
                      </MessageActions>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI auto-reply banner — take over an active bot, or resume it
          after a handoff. Renders nothing unless the account has
          auto-reply configured. */}
      <AiThreadBanner
        conversationId={conversation.id}
        disabled={conversation.ai_autoreply_disabled ?? false}
        handoffSummary={conversation.ai_handoff_summary}
        assignedAgentId={assignedAgentId}
        currentUserId={user?.id}
        onChange={(patch) => {
          if ('assigned_agent_id' in patch) {
            onAssignChange(conversation.id, patch.assigned_agent_id ?? null);
          }
        }}
      />

      {/* Composer */}
      <MessageComposer
        conversationId={conversation.id}
        sessionExpired={sessionInfo.expired}
        onSend={handleSend}
        onSendMedia={handleSendMedia}
        onSendInteractive={handleSendInteractive}
        onOpenTemplates={handleOpenTemplates}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
      />

      <TemplatePicker
        open={templateModalOpen}
        onOpenChange={setTemplateModalOpen}
        onSelect={handleSendTemplate}
      />

      {/* Full-size viewer for the thread's images/videos. Renders nothing
          until a bubble opens it. */}
      <MediaLightbox
        items={mediaGallery}
        activeId={mediaMessageId}
        onActiveIdChange={handleMediaChange}
        contactLabel={contactDisplayName}
      />
    </div>
  );
}
