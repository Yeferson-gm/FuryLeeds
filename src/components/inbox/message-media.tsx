import {
  Download,
  FileText,
  ImageOff,
  Loader2,
  type LucideIcon,
  Maximize2,
} from 'lucide-react';

import { useCallback, useState } from 'react';
import { useMediaBlobUrl } from '@/hooks/use-media-blob-url';
import { downloadMediaMessage } from '@/lib/media/download';
import { toast } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';

/**
 * The media renderers behind `<MessageBubble>`'s image / video / audio /
 * document cases. Split out of message-bubble.tsx so that file stays a
 * thin content switch — everything here is about the two affordances
 * issue #373 asked for: open it full-size, and save it.
 *
 * Both are less trivial than they look, because the two flavours of
 * `media_url` behave differently in the browser. See
 * `@/lib/media/blob-cache` for the proxy-vs-bucket split and
 * `@/lib/media/download` for why `<a download>` alone isn't enough.
 */

/** Inline media size cap, shared so the four bubbles can't drift apart. */
const MEDIA_BOX = 'max-h-64 max-w-60';

export function MediaUnavailable({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <ImageOff className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span>{label} no disponible</span>
    </div>
  );
}

/**
 * Kicks off a download and reports failure as a toast. Kept as a hook so
 * each bubble owns its own in-flight state — a slow 16 MB video shouldn't
 * put a spinner on every other attachment in the thread.
 */
function useMediaDownload(message: Message) {
  const [downloading, setDownloading] = useState(false);

  const download = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadMediaMessage(message);
    } catch {
      toast.error('No se pudo descargar el adjunto');
    } finally {
      setDownloading(false);
    }
  }, [downloading, message]);

  return { downloading, download };
}

function MediaActionButton({
  icon: Icon,
  label,
  onClick,
  busy = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      // Own surface rather than inheriting the bubble's, so the same button
      // reads on the muted inbound fill, the primary outbound fill, and on
      // top of an arbitrary photo.
      className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background/85 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Icon className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function MediaPlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-40 w-60 items-center justify-center rounded-lg bg-muted">
      {children}
    </div>
  );
}

export function MediaImageBubble({
  message,
  onOpen,
}: {
  message: Message;
  /** Opens the thread's lightbox on this message. Omitted ⇒ not clickable. */
  onOpen?: () => void;
}) {
  const { src, status } = useMediaBlobUrl(message.media_url);
  // The fetch can succeed and the bytes still not be a decodable image.
  const [broken, setBroken] = useState(false);
  const { downloading, download } = useMediaDownload(message);

  if (status === 'error' || broken) {
    return (
      <MediaPlaceholder>
        <ImageOff className="h-8 w-8 text-muted-foreground" />
      </MediaPlaceholder>
    );
  }

  if (status !== 'ready' || !src) {
    return (
      <MediaPlaceholder>
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </MediaPlaceholder>
    );
  }

  const image = (
    // biome-ignore lint/performance/noImgElement: authenticated WhatsApp media is exposed as a blob URL, which next/image cannot optimize.
    <img
      src={src}
      alt="Imagen adjunta"
      className={cn(MEDIA_BOX, 'rounded-lg object-contain')}
      onError={() => setBroken(true)}
    />
  );

  return (
    <div className="group/media relative w-fit">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label="Ver imagen"
          className="block cursor-zoom-in rounded-lg outline-none ring-offset-2 ring-offset-transparent focus-visible:ring-2 focus-visible:ring-ring"
        >
          {image}
        </button>
      ) : (
        image
      )}
      {/* Hover-only: on touch there is no hover, but tapping the image opens
          the viewer, which carries a full-size Download button. */}
      <div className="absolute bottom-2 right-2 opacity-0 transition-opacity group-hover/media:opacity-100 group-focus-within/media:opacity-100">
        <MediaActionButton
          icon={Download}
          label="Descargar"
          onClick={download}
          busy={downloading}
        />
      </div>
    </div>
  );
}

export function MediaVideoBubble({
  message,
  onOpen,
}: {
  message: Message;
  onOpen?: () => void;
}) {
  const { downloading, download } = useMediaDownload(message);

  return (
    <div className="relative w-fit">
      {/* Plain URL, not a blob: the element should stream rather than wait
          for up to 16 MB to land. */}
      {/* biome-ignore lint/a11y/useMediaCaption: WhatsApp does not provide a WebVTT caption track for received videos. */}
      <video
        src={message.media_url}
        controls
        preload="metadata"
        className={cn(MEDIA_BOX, 'rounded-lg')}
      />
      {/* Top-right, clear of the native controls — and always visible, since
          expanding is the only way to watch a clip capped at 15rem wide and
          a touch device gets no hover. */}
      <div className="absolute right-2 top-2 flex gap-1">
        {onOpen && (
          <MediaActionButton
            icon={Maximize2}
            label="Ampliar video"
            onClick={onOpen}
          />
        )}
        <MediaActionButton
          icon={Download}
          label="Descargar"
          onClick={download}
          busy={downloading}
        />
      </div>
    </div>
  );
}

export function MediaAudioBubble({ message }: { message: Message }) {
  const { downloading, download } = useMediaDownload(message);

  return (
    <div className="flex items-center gap-2">
      {/* biome-ignore lint/a11y/useMediaCaption: WhatsApp does not provide a transcript or WebVTT track for received audio. */}
      <audio src={message.media_url} controls className="max-w-60" />
      <MediaActionButton
        icon={Download}
        label="Descargar"
        onClick={download}
        busy={downloading}
      />
    </div>
  );
}

export function MediaDocumentBubble({ message }: { message: Message }) {
  const { downloading, download } = useMediaDownload(message);

  return (
    <div className="flex items-center gap-2">
      <a
        href={message.media_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm hover:bg-muted"
      >
        <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="truncate">{message.content_text || 'Documento'}</span>
      </a>
      <MediaActionButton
        icon={Download}
        label="Descargar"
        onClick={download}
        busy={downloading}
      />
    </div>
  );
}
