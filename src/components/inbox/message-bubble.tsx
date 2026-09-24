'use client';

import {
  Check,
  CheckCheck,
  Clock,
  CornerDownLeft,
  LayoutTemplate,
  MapPin,
  Sparkles,
  XCircle,
} from 'lucide-react';

import { InteractivePreview } from '@/components/interactive/interactive-preview';
import { formatTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { Message, MessageReaction } from '@/types';
import {
  MediaAudioBubble,
  MediaDocumentBubble,
  MediaImageBubble,
  MediaUnavailable,
  MediaVideoBubble,
} from './message-media';
import { MessageReactions } from './message-reactions';
import { ReplyQuote } from './reply-quote';

interface MessageBubbleProps {
  message: Message;
  /** Pre-computed quote info for messages that reply to another. */
  reply?: { authorLabel: string; preview: string } | null;
  reactions?: MessageReaction[];
  currentUserId?: string;
  onToggleReaction?: (emoji: string) => void;
  /**
   * Opens the thread's media viewer on this message. Only images and videos
   * call it; omitted when the parent renders no viewer, in which case media
   * stays inline and non-clickable.
   */
  onOpenMedia?: (messageId: string) => void;
}

/**
 * "[title] — [details]" for a failed message, or null when the row
 * predates migration 042 / Meta sent no reason. Shared by the status
 * icon's tooltip and the line under the bubble.
 */
function failureReason(message: Message): string | null {
  if (message.status !== 'failed' || !message.error_title) return null;
  return message.error_details
    ? `${message.error_title} — ${message.error_details}`
    : message.error_title;
}

function StatusIcon({
  status,
  title,
}: {
  status: Message['status'];
  /** Tooltip for the failed state — Meta's reason, when we have one. */
  title?: string | null;
}) {
  switch (status) {
    case 'sending':
      return <Clock className="h-3 w-3 text-muted-foreground" />;
    case 'sent':
      return <Check className="h-3 w-3 text-muted-foreground" />;
    case 'delivered':
      return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case 'read':
      return <CheckCheck className="h-3 w-3 text-blue-400" />;
    case 'failed':
      return (
        <span className="inline-flex" title={title ?? undefined}>
          <XCircle className="h-3 w-3 text-red-400" />
        </span>
      );
    default:
      return null;
  }
}

function MessageContent({
  message,
  isAgent,
  onOpenMedia,
}: {
  message: Message;
  /** Outbound bubbles sit on the primary fill — badges must invert. */
  isAgent: boolean;
  onOpenMedia?: (messageId: string) => void;
}) {
  // Passed to the media bubbles as a no-arg callback; `undefined` when the
  // parent wired up no viewer, which is what makes them non-clickable.
  const openMedia = onOpenMedia ? () => onOpenMedia(message.id) : undefined;

  switch (message.content_type) {
    case 'text':
      return (
        <p className="whitespace-pre-wrap wrap-break-word text-sm">
          {message.content_text}
        </p>
      );

    case 'image':
      return (
        <div>
          {message.media_url ? (
            <MediaImageBubble message={message} onOpen={openMedia} />
          ) : (
            <MediaUnavailable label="Foto" />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap wrap-break-word text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case 'video':
      return (
        <div>
          {message.media_url ? (
            <MediaVideoBubble message={message} onOpen={openMedia} />
          ) : (
            <MediaUnavailable label="Video" />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap wrap-break-word text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case 'audio':
      return (
        <div>
          {message.media_url ? (
            <MediaAudioBubble message={message} />
          ) : (
            <MediaUnavailable label="Audio" />
          )}
        </div>
      );

    case 'document':
      if (!message.media_url) {
        return <MediaUnavailable label={message.content_text || 'Documento'} />;
      }
      return <MediaDocumentBubble message={message} />;

    case 'template':
      // Templates are almost always outbound, where the bubble fill IS
      // `primary` — so the old `bg-primary/20 text-primary` chip was
      // primary-on-primary and invisible. Paired with a null
      // content_text (issue #483) that rendered a bubble with nothing
      // in it at all. Invert on the primary fill, and fall back to the
      // template's name when the stored message has no rendered body.
      return (
        <div>
          <span
            className={cn(
              'mb-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
              isAgent
                ? 'bg-primary-foreground/20 text-primary-foreground'
                : 'bg-primary/20 text-primary'
            )}
          >
            <LayoutTemplate className="h-3 w-3" />
            Plantilla
          </span>
          {message.content_text ? (
            <p className="mt-1 whitespace-pre-wrap wrap-break-word text-sm">
              {message.content_text}
            </p>
          ) : (
            message.template_name && (
              <p className="mt-1 wrap-break-word text-sm italic opacity-80">
                {message.template_name}
              </p>
            )
          )}
        </div>
      );

    case 'location':
      return (
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{message.content_text || 'Ubicación compartida'}</span>
        </div>
      );

    case 'interactive': {
      // Three cases share content_type='interactive':
      //  - OUTBOUND with payload (composer / automation / Flow send after
      //    migration 035): render the buttons/list as they appear on the phone.
      //  - INBOUND tap (customer chose an option, sender_type='customer'):
      //    no payload; show the tapped option's title with a reply affordance
      //    so agents can tell it's a tap, not the customer typing.
      //  - OUTBOUND with NO payload: show the body text plainly; it is our
      //    own message, not a customer tap.
      if (message.interactive_payload) {
        return <InteractivePreview payload={message.interactive_payload} />;
      }
      if (message.sender_type === 'customer') {
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <CornerDownLeft className="h-3 w-3" />
              Respuesta de botón
            </span>
            <p className="whitespace-pre-wrap wrap-break-word text-sm">
              {message.content_text || '[Respuesta interactiva]'}
            </p>
          </div>
        );
      }
      return (
        <p className="whitespace-pre-wrap wrap-break-word text-sm">
          {message.content_text || '[Respuesta interactiva]'}
        </p>
      );
    }

    default:
      return (
        <p className="whitespace-pre-wrap wrap-break-word text-sm">
          {message.content_text || '[Tipo de mensaje no compatible]'}
        </p>
      );
  }
}

export function MessageBubble({
  message,
  reply,
  reactions,
  currentUserId,
  onToggleReaction,
  onOpenMedia,
}: MessageBubbleProps) {
  const isAgent =
    message.sender_type === 'agent' || message.sender_type === 'bot';
  const time = formatTime(new Date(message.created_at));
  const failure = isAgent ? failureReason(message) : null;

  // Row alignment + width cap are owned by <MessageActions> so its hover
  // group matches the bubble's content area, not the full row.
  return (
    <div className={cn('flex flex-col', isAgent ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'relative rounded-2xl px-3 py-2',
          isAgent
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : 'rounded-bl-md bg-muted text-foreground'
        )}
      >
        {reply && (
          <ReplyQuote
            authorLabel={reply.authorLabel}
            preview={reply.preview}
            onPrimary={isAgent}
          />
        )}
        <MessageContent
          message={message}
          isAgent={isAgent}
          onOpenMedia={onOpenMedia}
        />
        <div
          className={cn(
            'mt-1 flex items-center gap-1',
            isAgent ? 'justify-end' : 'justify-start'
          )}
        >
          {/* AI badge — only on replies the auto-reply bot generated
              (always outbound, so it sits on the primary fill). Lets
              agents tell an AI reply from their own / a Flow's at a
              glance. */}
          {message.ai_generated && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-primary-foreground/20 px-1.5 py-px text-[9px] font-semibold uppercase leading-none tracking-wide text-primary-foreground"
              title="Enviado automáticamente por el asistente de IA"
            >
              <Sparkles className="h-2.5 w-2.5" />
              IA
            </span>
          )}
          <span
            className={cn(
              'text-[10px]',
              // Outbound bubbles sit on the primary fill, so the
              // timestamp must read against that (not the neutral
              // foreground) — otherwise it goes low-contrast in light
              // mode. Inbound bubbles use the muted surface.
              isAgent ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )}
          >
            {time}
          </span>
          {isAgent && <StatusIcon status={message.status} title={failure} />}
        </div>
      </div>
      {failure && (
        <p
          className="mt-0.5 px-1 text-[10px] leading-tight text-muted-foreground"
          title={failure}
        >
          No entregado: {failure}
        </p>
      )}
      {reactions && reactions.length > 0 && onToggleReaction && (
        <MessageReactions
          reactions={reactions}
          currentUserId={currentUserId}
          onToggle={onToggleReaction}
        />
      )}
    </div>
  );
}
