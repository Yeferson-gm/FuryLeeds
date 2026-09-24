'use client';

import { ArrowLeft, Loader2, Save, Send, Users } from 'lucide-react';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';
import { confirmAction } from '@/lib/action-alerts';
import type { MessageTemplate } from '@/types';

interface AudienceConfig {
  type: string;
  tagIds?: string[];
  customField?: {
    fieldId: string;
    operator: 'is' | 'is_not' | 'contains';
    value: string;
  };
  csvContacts?: { phone: string; name?: string }[];
  excludeTagIds?: string[];
}

interface Step4Props {
  name: string;
  onNameChange: (name: string) => void;
  template: MessageTemplate;
  audience: AudienceConfig;
  onSend: () => void;
  onSaveDraft?: () => void;
  onBack: () => void;
  isProcessing: boolean;
  progress: number;
}

export function Step4ScheduleSend({
  name,
  onNameChange,
  template,
  audience,
  onSend,
  onSaveDraft,
  onBack,
  isProcessing,
  progress,
}: Step4Props) {
  const [estimatedReach, setEstimatedReach] = useState<number>(0);
  const [loadingReach, setLoadingReach] = useState(true);

  useEffect(() => {
    async function calculateReach() {
      setLoadingReach(true);
      try {
        const response = await fetch('/api/whatsapp/broadcast/resources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audience }),
        });
        if (!response.ok) {
          setEstimatedReach(0);
          return;
        }
        const result = await response.json().catch(() => ({}));
        setEstimatedReach(result.count ?? 0);
      } finally {
        setLoadingReach(false);
      }
    }

    calculateReach();
  }, [audience]);

  async function confirmSend() {
    const confirmed = await confirmAction({
      title: 'Confirmar difusión',
      text: `Se enviará la plantilla "${template.name}" a ${estimatedReach.toLocaleString()} ${estimatedReach === 1 ? 'contacto' : 'contactos'}. Esta acción no se puede deshacer.`,
      confirmText: 'Enviar difusión',
      cancelText: 'Revisar de nuevo',
      icon: 'warning',
      destructive: true,
    });
    if (confirmed) onSend();
  }

  const audienceLabel =
    audience.type === 'all'
      ? 'Todos los contactos'
      : audience.type === 'tags'
        ? 'Filtrada por etiquetas'
        : audience.type === 'csv'
          ? 'Carga de CSV'
          : 'Filtrada por campo personalizado';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Revisar y enviar
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ponle un nombre a tu difusión y confirma el envío.
        </p>
      </div>

      {/* Broadcast Name */}
      <div>
        <label
          htmlFor="broadcast-name"
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          Nombre de la difusión
        </label>
        <Input
          id="broadcast-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="p. ej. Promo de verano"
          className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Summary Card */}
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Resumen</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Plantilla:</p>
            <p className="text-foreground">{template.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Audiencia:</p>
            <p className="text-foreground">{audienceLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Alcance estimado</p>
            <div className="flex items-center gap-1.5">
              {loadingReach ? (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              ) : (
                <>
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <p className="font-medium text-foreground">
                    {estimatedReach.toLocaleString()}
                  </p>
                </>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Idioma</p>
            <p className="text-foreground">{template.language ?? 'en_US'}</p>
          </div>
        </div>
      </div>

      {/* Processing overlay */}
      {isProcessing && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">Enviando...</p>
            </div>
            <span className="text-xs font-medium text-primary">
              {progress}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isProcessing}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Atrás
        </Button>

        <div className="flex items-center gap-2">
          {onSaveDraft && (
            <Button
              variant="outline"
              onClick={onSaveDraft}
              disabled={!name.trim() || isProcessing}
              className="border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Guardar como borrador
            </Button>
          )}

          <Button
            disabled={!name.trim() || isProcessing}
            onClick={confirmSend}
            className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Enviar difusión
          </Button>
        </div>
      </div>
    </div>
  );
}
