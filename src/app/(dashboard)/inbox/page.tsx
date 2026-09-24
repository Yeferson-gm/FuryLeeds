'use client';

import { WifiOff } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ContactSidebar } from '@/components/inbox/contact-sidebar';
import { ConversationList } from '@/components/inbox/conversation-list';
import { MessageThread } from '@/components/inbox/message-thread';
import { useRealtime } from '@/hooks/use-realtime';

import { cn } from '@/lib/utils';
import type {
  Contact,
  Conversation,
  ConversationStatus,
  Message,
} from '@/types';

// Remembers the agent's show/hide choice for the desktop contact panel
// across reloads and sessions (device-scoped, like the theme prefs).
const CONTACT_PANEL_STORAGE_KEY = 'furyleeds:inbox:contact-panel-open';

// `useSearchParams` (the `?c=<id>` deep link below) requires a Suspense
// boundary or the production build bails to CSR and errors out. Thin
// wrapper supplies it; the inner component holds all the inbox state.
export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxPageInner />
    </Suspense>
  );
}

function InboxPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /**
   * `?c=<id>` deep-link support. Used when landing here from the
   * dashboard's recent-conversations list so the right thread opens
   * automatically instead of showing the empty center panel.
   */
  const deepLinkConvId = searchParams.get('c');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<Conversation | null>(null);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [whatsappConnected, setWhatsappConnected] = useState<boolean | null>(
    null
  );
  /**
   * Bumped whenever we want children (ConversationList, MessageThread)
   * to refetch from the DB — used as a safety net against missed
   * realtime events. Bumped on WS reconnect and on tab visibility →
   * visible. The initial mount fetches don't depend on this; they fire
   * once on conversationId-change as usual.
   */
  const [resyncToken, setResyncToken] = useState(0);

  /**
   * Whether the desktop contact sidebar (tags / deals / notes) is shown.
   * Defaults to `true` (the historical behaviour) and is restored from
   * localStorage after mount. We deliberately do NOT read localStorage in
   * the initializer: the server renders with `true`, so reading a stored
   * `false` synchronously would produce a hydration mismatch. The effect
   * below reconciles to the stored value right after mount instead.
   */
  const [contactPanelOpen, setContactPanelOpen] = useState(true);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONTACT_PANEL_STORAGE_KEY);
      if (stored !== null) setContactPanelOpen(stored === 'true');
    } catch {
      // localStorage can throw in private-browsing / sandboxed contexts.
    }
  }, []);

  const handleToggleContactPanel = useCallback(() => {
    const next = !contactPanelOpen;
    setContactPanelOpen(next);
    try {
      localStorage.setItem(CONTACT_PANEL_STORAGE_KEY, String(next));
    } catch {
      // Persistence is best-effort; ignore storage failures.
    }
  }, [contactPanelOpen]);

  // Fire the deep-link auto-select exactly once per URL — subsequent
  // list refreshes (realtime, manual refetch) must not snap the user
  // back to the deep-linked conversation if they've already clicked
  // elsewhere.
  const autoSelectedForDeepLinkRef = useRef<string | null>(null);

  // Tracks conversations whose hydrate fetch is currently in flight. The
  // conv-INSERT and the first-message-INSERT events both call into
  // hydrateConversation; the dedupe here keeps it at one refetch per
  // new conversation even when both events arrive within milliseconds.
  const hydratingConvIdsRef = useRef<Set<string>>(new Set());

  /**
   * Synchronous mirror of the conversation ids currently in `conversations`
   * state. Event handlers need to know "do we already have this conv?"
   * without waiting for a setState updater to run — updaters fire during
   * reconciliation, *after* the synchronous handler code returns, so a
   * `let foundInList = false; setState(p => { foundInList = ...; return ... })`
   * flag reads as `false` in the same tick (this exact bug shipped in #105
   * and caused #106: every incoming message and every status flip fired a
   * redundant DB hydrate, swamping the client and delaying refreshes).
   * The ref is kept in sync via the effect below.
   */
  const knownConvIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const next = new Set<string>();
    for (const c of conversations) next.add(c.id);
    knownConvIdsRef.current = next;
  }, [conversations]);

  // Pull one account-scoped conversation snapshot with its contact and tags.
  // This self-heals out-of-order local state after a Socket.IO reconnect.
  const hydrateConversation = useCallback(async (convId: string) => {
    if (hydratingConvIdsRef.current.has(convId)) return;
    hydratingConvIdsRef.current.add(convId);
    try {
      const response = await fetch(
        `/api/inbox?conversation_id=${encodeURIComponent(convId)}`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        console.error('Failed to hydrate conversation:', response.status);
        return;
      }
      const payload = (await response.json()) as {
        conversations?: Conversation[];
      };
      const fetched = payload.conversations?.[0];
      if (!fetched) return;
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === fetched.id);
        if (existing) {
          // Already in state — keep fields that a newer event may have patched
          // while this request was in flight. Only backfill the contact join.
          return prev.map((c) =>
            c.id === fetched.id
              ? { ...c, contact: c.contact ?? fetched.contact }
              : c
          );
        }
        return [fetched, ...prev];
      });
    } finally {
      hydratingConvIdsRef.current.delete(convId);
    }
  }, []);

  // Check the account-owned WhatsApp connection status on mount.
  useEffect(function loadConnectionStatus() {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/inbox', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as {
          whatsapp_connected?: boolean;
        };
        setWhatsappConnected(payload.whatsapp_connected === true);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Failed to load WhatsApp connection status:', error);
          setWhatsappConnected(false);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  // Reconcile account-scoped conversation events from Socket.IO.
  const handleConversationEvent = useCallback(
    (event: {
      eventType: string;
      new: Conversation;
      old: Partial<Conversation>;
    }) => {
      const conv = event.new;

      if (event.eventType === 'DELETE') {
        setConversations((prev) => prev.filter((item) => item.id !== conv.id));
        if (activeConversation?.id === conv.id) {
          setActiveConversation(null);
          setActiveContact(null);
          setMessages([]);
          router.replace('/inbox', { scroll: false });
        }
        return;
      }

      if (event.eventType === 'INSERT') {
        // Prepend immediately for snappy UX. Realtime snapshots include
        // the contact join; skip if we already have the row.
        // already have the row — that shouldn't happen normally, but
        // out-of-order delivery would have us prepending a duplicate.
        if (!knownConvIdsRef.current.has(conv.id)) {
          setConversations((prev) => {
            if (prev.some((c) => c.id === conv.id)) return prev;
            return [conv, ...prev];
          });
          hydrateConversation(conv.id);
        }
      }

      if (event.eventType === 'UPDATE') {
        if (knownConvIdsRef.current.has(conv.id)) {
          // If this UPDATE is for the conv the user is currently viewing,
          // suppress the incoming unread_count — the user is reading it
          // RIGHT NOW, so any positive value would just flicker the badge
          // back on for the ~100ms it takes for the reset effect's server
          // UPDATE to round-trip. Non-active convs take the value as-is.
          const isActive = activeConversation?.id === conv.id;
          setConversations((prev) =>
            prev
              .map((c) =>
                c.id === conv.id
                  ? {
                      ...c,
                      ...conv,
                      unread_count: isActive ? 0 : conv.unread_count,
                    }
                  : c
              )
              .sort(
                (a, b) =>
                  new Date(b.last_message_at ?? b.created_at).getTime() -
                  new Date(a.last_message_at ?? a.created_at).getTime()
              )
          );
        } else {
          // UPDATE arrived before the INSERT (or after a missed INSERT)
          // — fetch the row so it surfaces with its contact joined. The
          // patch contained in `conv` will already be reflected in what
          // the hydrate fetch returns.
          hydrateConversation(conv.id);
        }

        // Update active conversation if it changed
        if (activeConversation && conv.id === activeConversation.id) {
          setActiveConversation((prev) => (prev ? { ...prev, ...conv } : prev));
        }
      }
    },
    [activeConversation, hydrateConversation, router]
  );

  // Subscribe to account-scoped conversation events. MessageThread joins a
  // dedicated room so messages and reactions update without periodic requests.
  const { isConnected } = useRealtime({
    onConversationEvent: handleConversationEvent,
    enabled: true,
  });

  /**
   * Bump `resyncToken` whenever the realtime channel transitions from
   * disconnected → connected *after* the initial connect. The initial
   * connect is covered by the children's on-mount fetches; only later
   * reconnects need a manual refetch to fill the gap.
   *
   * Tracked via a `was-connected` ref rather than a count so that React
   * strict-mode's dev-only effect double-fire doesn't read as a
   * reconnect.
   */
  const wasConnectedRef = useRef(false);
  const initialConnectDoneRef = useRef(false);
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current) {
      // false → true transition
      if (initialConnectDoneRef.current) {
        setResyncToken((n) => n + 1);
      } else {
        initialConnectDoneRef.current = true;
      }
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected]);

  /**
   * Refetch when the tab regains focus. Background tabs may have their
   * WS throttled by the browser even without a full disconnect, so a
   * visibilitychange → visible is a reliable signal that we may have
   * missed events. Cheap to fire; the children dedupe on their own.
   */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        setResyncToken((n) => n + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  /**
   * Manual refresh trigger for the thread-header refresh button.
   * Bumps the same resyncToken the reconnect / visibility paths use,
   * so it goes through the existing dedupe & refetch plumbing — no
   * separate code path to keep in sync.
   */
  const handleManualRefresh = useCallback(() => {
    setResyncToken((n) => n + 1);
  }, []);

  const handleConversationsLoaded = useCallback(
    (loaded: Conversation[]) => {
      setConversations(loaded);
      // Resolve a pending deep-link here rather than in an effect — this
      // is an event handler, so the setState calls below are allowed by
      // react-hooks/set-state-in-effect. Runs once per ?c=<id> URL value
      // via the ref, so realtime refreshes of the list can't snap the
      // user back to the deep-linked thread after they've navigated.
      if (
        deepLinkConvId &&
        autoSelectedForDeepLinkRef.current !== deepLinkConvId &&
        loaded.length > 0
      ) {
        autoSelectedForDeepLinkRef.current = deepLinkConvId;
        // If the deep-linked conversation is already the active one
        // (e.g. because the user clicked it in the list and we
        // router.replace()'d the URL, which made the ConversationList
        // refetch and land us back here), do NOT re-apply it. Doing so
        // would setMessages([]) on a thread whose messages have
        // already been loaded by MessageThread — and because
        // conversationId didn't change, MessageThread wouldn't
        // refetch. The thread would read "No messages yet" until a
        // full page reload rehydrated state from scratch.
        if (activeConversation?.id === deepLinkConvId) return;
        const match = loaded.find((c) => c.id === deepLinkConvId);
        if (match) {
          setActiveConversation(match);
          setActiveContact(match.contact ?? null);
          setMessages([]);
          // Mirror the optimistic unread reset that handleSelectConversation
          // does — the user just deep-linked into this conv, treat that the
          // same as a click. Leaves activeConversation.unread_count alone so
          // the MessageThread reset effect still fires the server UPDATE.
          if (match.unread_count > 0) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === match.id ? { ...c, unread_count: 0 } : c
              )
            );
          }
        }
      }
    },
    [deepLinkConvId, activeConversation?.id]
  );

  const handleSelectConversation = useCallback(
    (conv: Conversation) => {
      // Re-clicking the already-active conversation would clear the
      // messages array, but the fetch effect in MessageThread only re-runs
      // when conversationId changes — so messages would stay empty until
      // the user navigated away and back. Bail out early instead.
      if (activeConversation?.id === conv.id) return;
      setActiveConversation(conv);
      setActiveContact(conv.contact ?? null);
      setMessages([]);
      // Optimistically clear the unread badge for this conv. The
      // server-side reset is fired by the unread-reset effect inside
      // MessageThread (which reads activeConversation.unread_count, not
      // the list copy — so we deliberately leave that intact below to
      // keep the effect firing), and the realtime UPDATE that comes
      // back will sync to 0 again as a no-op. Zeroing the list copy
      // here means the user sees the badge disappear the instant they
      // click instead of waiting for the round-trip — and it persists
      // even if the realtime UPDATE is dropped.
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conv.id && c.unread_count > 0 ? { ...c, unread_count: 0 } : c
        )
      );
      // Record the selection on the deep-link ref BEFORE we change the
      // URL. The router.replace below flips `deepLinkConvId`, which can
      // in turn cause ConversationList to refetch and eventually call
      // handleConversationsLoaded again. Without this line, the ref
      // still points at the previous value, the auto-select block
      // sees `ref !== deepLinkConvId`, fires a second time, and
      // clobbers the messages MessageThread just fetched.
      autoSelectedForDeepLinkRef.current = conv.id;
      // Reflect the selection in the URL so a refresh lands the user
      // back in the same thread, and so copy-paste links work. Use
      // replace() to avoid polluting browser history with every click.
      router.replace(`/inbox?c=${conv.id}`, { scroll: false });
    },
    [activeConversation?.id, router]
  );

  // Mobile "back" — deselect the conversation so the list pane comes
  // back. Also clears the ?c= param so a refresh lands on the list
  // instead of re-opening the thread the user just backed out of.
  const handleCloseConversation = useCallback(() => {
    setActiveConversation(null);
    setActiveContact(null);
    setMessages([]);
    // Clearing the ref lets the deep-link auto-selector fire again if
    // the user later visits /inbox?c=<same-id> — desirable UX.
    autoSelectedForDeepLinkRef.current = null;
    router.replace('/inbox', { scroll: false });
  }, [router]);

  const handleMessagesLoaded = useCallback((loaded: Message[]) => {
    setMessages((previous) => {
      const optimistic = previous.filter((message) =>
        message.id.startsWith('temp-')
      );
      if (optimistic.length === 0) return loaded;

      // Keep sends that are still in flight, but remove each optimistic row as
      // soon as its persisted counterpart appears in a realtime snapshot.
      const unmatchedServer = loaded.slice();
      const pending = optimistic.filter((temp) => {
        const matchIndex = unmatchedServer.findIndex(
          (message) =>
            message.sender_type === temp.sender_type &&
            message.content_type === temp.content_type &&
            message.content_text === temp.content_text &&
            message.media_url === temp.media_url &&
            message.template_name === temp.template_name &&
            Math.abs(
              new Date(message.created_at).getTime() -
                new Date(temp.created_at).getTime()
            ) < 120_000
        );
        if (matchIndex < 0) return true;
        unmatchedServer.splice(matchIndex, 1);
        return false;
      });

      return [...loaded, ...pending].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  }, []);

  const handleNewMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const handleUpdateMessage = useCallback(
    (id: string, updates: Partial<Message>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
      );
    },
    []
  );

  const handleStatusChange = useCallback(
    (conversationId: string, status: ConversationStatus) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, status } : c))
      );
      if (activeConversation?.id === conversationId) {
        setActiveConversation((prev) => (prev ? { ...prev, status } : prev));
      }
    },
    [activeConversation]
  );

  const handleAssignChange = useCallback(
    (conversationId: string, assignedAgentId: string | null) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, assigned_agent_id: assignedAgentId ?? undefined }
            : c
        )
      );
      if (activeConversation?.id === conversationId) {
        setActiveConversation((prev) =>
          prev
            ? { ...prev, assigned_agent_id: assignedAgentId ?? undefined }
            : prev
        );
      }
    },
    [activeConversation]
  );

  // On mobile (<lg) we show a SINGLE pane — either the list or the
  // thread — rather than cramming both side-by-side. Selecting a
  // conversation slides the thread in; the thread's back button pops
  // it back to the list. On lg+ both panes render side-by-side as
  // before, unchanged.
  const hasActiveConv = !!activeConversation;

  return (
    <div className="-m-4 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden sm:-m-6">
      {/* WhatsApp connection banner — in the flex column, not absolute,
          so it pushes the panels down instead of overlapping them. */}
      {whatsappConnected === false && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2">
          <WifiOff className="h-4 w-4 text-amber-400" />
          <p className="text-xs text-amber-400">
            {
              'WhatsApp® no está conectado. Ve a Configuración para conectar tu cuenta.'
            }
          </p>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Conversation list.
            Hidden on mobile when a conversation is selected so the
            thread can occupy the full width. Always visible on lg+. */}
        <div
          className={cn(
            'flex h-full flex-1 lg:flex-none',
            hasActiveConv ? 'hidden lg:flex' : 'flex'
          )}
        >
          <ConversationList
            activeConversationId={activeConversation?.id ?? null}
            onSelect={handleSelectConversation}
            conversations={conversations}
            onConversationsLoaded={handleConversationsLoaded}
            resyncToken={resyncToken}
          />
        </div>

        {/* Center panel: Message thread.
            Hidden on mobile when no conversation is selected so the
            list can occupy the full width. Always visible on lg+
            (shows its own empty-state if no thread is picked yet).

            `min-w-0` is load-bearing: without it, a single wide piece
            of content inside the thread (long quote preview, very
            long URL in a message body) forces the flex child past
            its share and pushes the contact-sidebar panel off-screen
            on the right. Issue #165. */}
        <div
          className={cn(
            'flex h-full min-w-0 flex-1 lg:flex',
            hasActiveConv ? 'flex' : 'hidden lg:flex'
          )}
        >
          <MessageThread
            conversation={activeConversation}
            contact={activeContact}
            messages={messages}
            onMessagesLoaded={handleMessagesLoaded}
            onNewMessage={handleNewMessage}
            onUpdateMessage={handleUpdateMessage}
            onStatusChange={handleStatusChange}
            onAssignChange={handleAssignChange}
            onBack={handleCloseConversation}
            resyncToken={resyncToken}
            onRefresh={handleManualRefresh}
            contactPanelOpen={contactPanelOpen}
            onToggleContactPanel={handleToggleContactPanel}
          />
        </div>

        {/* Right panel: Contact sidebar — desktop only, and only when the
            agent hasn't collapsed it via the thread-header toggle (#258).
            On mobile it's always hidden (the `lg:block` below), so the
            toggle — which is itself desktop-only — never affects it. */}
        {contactPanelOpen && (
          <div className="hidden lg:block">
            <ContactSidebar contact={activeContact} />
          </div>
        )}
      </div>
    </div>
  );
}
