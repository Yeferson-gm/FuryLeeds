'use client';

import { Loader2, MessageSquare, Zap } from 'lucide-react';

import { useEffect, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { interactivePayloadPreviewText } from '@/lib/whatsapp/interactive';
import type { QuickReply } from '@/types';

interface QuickReplyPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (qr: QuickReply) => void;
}

/**
 * Lists the account's saved quick replies for insertion into the
 * composer. Text snippets fill the textarea; interactive snippets open
 * the builder pre-filled (handled by the caller's `onPick`).
 */
export function QuickReplyPicker({
  open,
  onOpenChange,
  onPick,
}: QuickReplyPickerProps) {
  const [items, setItems] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch('/api/quick-replies', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setItems((data.quick_replies as QuickReply[]) ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Respuestas rápidas</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aún no hay respuestas rápidas. Agrega algunas en Configuración →
              Respuestas rápidas.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((qr) => (
                <li key={qr.id}>
                  <button
                    type="button"
                    onClick={() => onPick(qr)}
                    className="flex w-full items-start gap-2 rounded-md border border-border bg-muted/40 p-2.5 text-left hover:border-primary/50 hover:bg-muted"
                  >
                    {qr.kind === 'interactive' ? (
                      <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {qr.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {qr.kind === 'interactive' && qr.interactive_payload
                          ? interactivePayloadPreviewText(
                              qr.interactive_payload
                            )
                          : qr.content_text}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
