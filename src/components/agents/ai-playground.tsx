import {
  ArrowRight,
  Bot,
  Loader2,
  RotateCcw,
  Send,
  UserCircle2,
} from 'lucide-react';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications';
import { cn } from '@/lib/utils';

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** assistant-only: the agent signalled a human handoff on this turn. */
  handoff?: boolean;
}

export function AiPlayground({ onGoToSetup }: { onGoToSetup?: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const next: Turn[] = [
      ...turns,
      { id: crypto.randomUUID(), role: 'user', content: text },
    ];
    setTurns(next);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/ai/playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send only role+content — the server ignores anything else.
        body: JSON.stringify({
          messages: next.map((t) => ({ role: t.role, content: t.content })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === 'ai_not_configured') {
          toast.error(
            'Aún no hay un agente configurado; completa primero la Configuración.'
          );
        } else {
          toast.error(data.error ?? 'No se pudo obtener una respuesta.');
        }
        // Roll the unsent user turn back so the transcript stays clean.
        setTurns(turns);
        setInput(text);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setTurns([
        ...next,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            typeof data.reply === 'string' && data.reply.trim()
              ? data.reply
              : '',
          handoff: Boolean(data.handoff),
        },
      ]);
    } catch {
      toast.error('No se pudo conectar con el agente.');
      setTurns(turns);
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="flex h-[60vh] min-h-105 flex-col rounded-xl border border-border bg-card">
      {/* Cabecera */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            Playground
          </span>
          <span className="text-xs text-muted-foreground">
            — prueba respuestas como si fueras un cliente
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTurns([])}
          disabled={turns.length === 0 || sending}
          className="text-muted-foreground"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reiniciar
        </Button>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {turns.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <Bot className="mb-2 h-8 w-8 text-muted-foreground/60" />
            <p>Envía un mensaje para ver cómo respondería tu agente.</p>
            <p className="mt-1 text-xs">
              Usa tu base de conocimiento y se comporta exactamente como el bot
              de respuesta automática, incluida la derivación.
            </p>
            {onGoToSetup && (
              <Button
                variant="link"
                size="sm"
                onClick={onGoToSetup}
                className="mt-1 h-auto p-0 text-xs"
              >
                ¿Aún no está configurado? Ve a Configuración{' '}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            )}
          </div>
        )}

        {turns.map((turn) => (
          <div
            key={turn.id}
            className={cn(
              'flex gap-2',
              turn.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            {turn.role === 'assistant' && (
              <Bot className="mt-1 h-5 w-5 shrink-0 text-primary" />
            )}
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm',
                turn.role === 'user'
                  ? 'rounded-br-sm bg-primary text-primary-foreground'
                  : 'rounded-bl-sm bg-muted text-foreground'
              )}
            >
              {turn.content && (
                <p className="whitespace-pre-wrap">{turn.content}</p>
              )}
              {turn.role === 'assistant' && turn.handoff && (
                <p
                  className={cn(
                    'flex items-center gap-1 text-xs text-amber-500',
                    turn.content && 'mt-1.5 border-t border-border/50 pt-1.5'
                  )}
                >
                  <UserCircle2 className="h-3.5 w-3.5" />
                  Aquí derivaría la conversación a una persona
                </p>
              )}
            </div>
            {turn.role === 'user' && (
              <UserCircle2 className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
            )}
          </div>
        ))}

        {sending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bot className="h-5 w-5 text-primary" />
            <Loader2 className="h-4 w-4 animate-spin" /> Pensando…
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un mensaje de cliente…"
          rows={1}
          className="flex-1 resize-none rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
          aria-label="Mensaje del cliente"
        />
        <Button
          size="sm"
          onClick={send}
          disabled={!input.trim() || sending}
          className="h-9 w-9 shrink-0 p-0"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
