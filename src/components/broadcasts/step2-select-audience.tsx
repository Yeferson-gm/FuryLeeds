'use client';

import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Filter,
  Loader2,
  Tags,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { parseBroadcastCsv } from '@/lib/broadcast-csv';
import { toast } from '@/lib/notifications';
import type { CustomField, Tag } from '@/types';

type AudienceType = 'all' | 'tags' | 'custom_field' | 'csv';
type CustomFieldOperator = 'is' | 'is_not' | 'contains';

interface CustomFieldFilter {
  fieldId: string;
  operator: CustomFieldOperator;
  value: string;
}

interface AudienceConfig {
  type: AudienceType;
  tagIds?: string[];
  customField?: CustomFieldFilter;
  csvContacts?: { phone: string; name?: string }[];
  excludeTagIds?: string[];
}

const OPERATOR_OPTIONS: { value: CustomFieldOperator; label: string }[] = [
  { value: 'is', label: 'Es' },
  { value: 'is_not', label: 'No es' },
  { value: 'contains', label: 'Contiene' },
];

const AUDIENCE_OPTIONS: {
  type: AudienceType;
  label: string;
  description: string;
  icon: typeof Users;
}[] = [
  {
    type: 'all',
    label: 'Todos los contactos',
    description: 'Enviar a todos los contactos de tu base de datos.',
    icon: Users,
  },
  {
    type: 'tags',
    label: 'Filtrar por etiquetas',
    description: 'Enviar a contactos con etiquetas específicas.',
    icon: Tags,
  },
  {
    type: 'custom_field',
    label: 'Campo personalizado',
    description:
      'Enviar a contactos que cumplan una regla de campo personalizado.',
    icon: Filter,
  },
  {
    type: 'csv',
    label: 'Subir CSV',
    description: 'Sube un CSV con números de teléfono (y nombres opcionales).',
    icon: Upload,
  },
];

interface Step2Props {
  audience: AudienceConfig;
  onUpdate: (audience: AudienceConfig) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step2SelectAudience({
  audience,
  onUpdate,
  onNext,
  onBack,
}: Step2Props) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const selectedTagIdSet = new Set(audience.tagIds ?? []);
  const excludedTagIdSet = new Set(audience.excludeTagIds ?? []);
  const [loadingFields, setLoadingFields] = useState(false);
  const [estimatedCount, setEstimatedCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  // The picked file's name, shown back to the user. The parsed rows
  // themselves live on `audience.csvContacts` (owned by the wizard) so
  // they survive stepping forward and back.
  const [pickedCsvName, setPickedCsvName] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const csvCount = audience.csvContacts?.length ?? 0;
  // Only meaningful while the rows it produced are still in play —
  // picking another audience type wipes `csvContacts`.
  const csvFileName = csvCount > 0 ? pickedCsvName : null;

  // Tags and custom fields share one account-scoped resource endpoint.
  useEffect(() => {
    async function fetchResources() {
      setLoadingTags(true);
      setLoadingFields(true);
      try {
        const response = await fetch('/api/whatsapp/broadcast/resources', {
          cache: 'no-store',
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || 'No se pudieron cargar los filtros');
        }
        const result = await response.json().catch(() => ({}));
        setTags(result.tags ?? []);
        setCustomFields(result.customFields ?? []);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'No se pudieron cargar los filtros'
        );
      } finally {
        setLoadingTags(false);
        setLoadingFields(false);
      }
    }
    fetchResources();
  }, []);

  const fetchEstimatedCount = useCallback(async () => {
    const isIncomplete =
      (audience.type === 'tags' && !audience.tagIds?.length) ||
      (audience.type === 'custom_field' &&
        (!audience.customField?.fieldId || !audience.customField.value)) ||
      (audience.type === 'csv' && !audience.csvContacts?.length);
    if (isIncomplete) {
      setEstimatedCount(null);
      return;
    }

    setLoadingCount(true);
    try {
      const response = await fetch('/api/whatsapp/broadcast/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audience }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'No se pudo estimar la audiencia');
      }
      const result = await response.json().catch(() => ({}));
      setEstimatedCount(result.count ?? 0);
    } catch {
      setEstimatedCount(null);
    } finally {
      setLoadingCount(false);
    }
  }, [audience]);

  useEffect(() => {
    fetchEstimatedCount();
  }, [fetchEstimatedCount]);

  async function handleCsvChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const result = parseBroadcastCsv(await selected.text());

    if (!result.ok) {
      toast.error(
        result.error === 'missing_phone_column'
          ? "El CSV debe tener una columna 'phone'."
          : 'No se pudo leer el archivo CSV.'
      );
      // Clear the input so re-picking the same corrected file still
      // fires `change` (the browser suppresses it for an identical value).
      e.target.value = '';
      setPickedCsvName(null);
      onUpdate({ ...audience, csvContacts: undefined });
      return;
    }

    // Rows without a leading `+` and country code were refused (issue
    // #586). Say so, or a spreadsheet export that stripped the `+` looks
    // like a mysteriously smaller audience.
    if (result.invalid > 0) {
      toast.warning(
        `${result.invalid} fila(s) omitida(s): los números de teléfono deben empezar con + y el código de país (p. ej. +5215512345678).`
      );
    }

    setPickedCsvName(selected.name);
    onUpdate({ ...audience, csvContacts: result.contacts });
  }

  function toggleTag(tagId: string) {
    const current = audience.tagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, tagIds: updated });
  }

  function toggleExcludeTag(tagId: string) {
    const current = audience.excludeTagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, excludeTagIds: updated });
  }

  function updateCustomField(patch: Partial<CustomFieldFilter>) {
    const prev = audience.customField ?? {
      fieldId: '',
      operator: 'is' as CustomFieldOperator,
      value: '',
    };
    onUpdate({ ...audience, customField: { ...prev, ...patch } });
  }

  const isValid =
    audience.type === 'all' ||
    (audience.type === 'tags' &&
      audience.tagIds &&
      audience.tagIds.length > 0) ||
    (audience.type === 'custom_field' &&
      !!audience.customField?.fieldId &&
      audience.customField.value.length > 0) ||
    (audience.type === 'csv' &&
      audience.csvContacts &&
      audience.csvContacts.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Seleccionar audiencia
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Elige quién recibirá esta difusión.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {AUDIENCE_OPTIONS.map(
          (option: {
            type: AudienceType;
            label: string;
            description: string;
            icon: typeof Users;
          }) => {
            const isSelected = audience.type === option.type;
            const Icon = option.icon;
            return (
              <button
                key={option.type}
                type="button"
                onClick={() =>
                  onUpdate({
                    ...audience,
                    type: option.type,
                    // Wipe shape fields from other types to avoid stale
                    // config leaking across selections.
                    tagIds:
                      option.type === 'tags' ? audience.tagIds : undefined,
                    customField:
                      option.type === 'custom_field'
                        ? audience.customField
                        : undefined,
                    csvContacts:
                      option.type === 'csv' ? audience.csvContacts : undefined,
                  })
                }
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border bg-card/50 hover:border-border'
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    isSelected
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {option.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {option.description}
                  </p>
                </div>
              </button>
            );
          }
        )}
      </div>

      {audience.type === 'tags' && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <p className="mb-3 text-sm font-medium text-foreground">
            Seleccionar etiquetas
          </p>
          {loadingTags ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : tags.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No se encontraron etiquetas.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isSelected = selectedTagIdSet.has(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      isSelected
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-muted text-muted-foreground hover:border-border'
                    }`}
                  >
                    <span
                      className="mr-1.5 h-2 w-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {audience.type === 'custom_field' && (
        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <p className="text-sm font-medium text-foreground">
            Campo personalizado
          </p>
          {loadingFields ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : customFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Error al cargar los campos personalizados
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)]">
              <select
                value={audience.customField?.fieldId ?? ''}
                onChange={(e) => updateCustomField({ fieldId: e.target.value })}
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                aria-label="Campo personalizado"
              >
                <option value="">Selecciona un campo...</option>
                {customFields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.field_name}
                  </option>
                ))}
              </select>
              <select
                value={audience.customField?.operator ?? 'is'}
                onChange={(e) =>
                  updateCustomField({
                    operator: e.target.value as CustomFieldOperator,
                  })
                }
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                aria-label="Operador de comparación"
              >
                {OPERATOR_OPTIONS.map(
                  (op: { value: CustomFieldOperator; label: string }) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  )
                )}
              </select>
              <input
                type="text"
                value={audience.customField?.value ?? ''}
                onChange={(e) => updateCustomField({ value: e.target.value })}
                placeholder="Valor a comparar"
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                aria-label="Valor a comparar"
              />
            </div>
          )}
        </div>
      )}

      {audience.type === 'csv' && (
        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">
              Subir archivo CSV
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Debe contener una columna 'phone' (formato E.164). La columna
              'name' es opcional.
            </p>
          </div>

          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            className="group flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-muted/70"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-foreground">
              {csvFileName ? (
                <FileText className="h-5 w-5" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
            </div>
            <p className="text-sm text-foreground">
              {csvFileName ?? 'Subir archivo CSV'}
            </p>
            {csvCount > 0 && (
              <p className="text-xs text-primary">
                {`${csvCount} contacto(s) válido(s) encontrado(s) en el CSV.`}
              </p>
            )}
          </button>

          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleCsvChange}
            className="hidden"
          />
        </div>
      )}

      {/* Exclude list — applies regardless of audience type */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <X className="h-4 w-4 text-red-400" />
          <p className="text-sm font-medium text-foreground">
            Excluir etiquetas (opcional)
          </p>
        </div>
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No se encontraron etiquetas.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const isExcluded = excludedTagIdSet.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleExcludeTag(tag.id)}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    isExcluded
                      ? 'border-red-500/30 bg-red-500/10 text-red-300'
                      : 'border-border bg-muted text-muted-foreground hover:border-border'
                  }`}
                >
                  <span
                    className="mr-1.5 h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Audience Summary */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <p className="mb-2 text-sm font-medium text-foreground">
          Resumen de la audiencia
        </p>
        {loadingCount ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Calculando…</span>
          </div>
        ) : estimatedCount !== null ? (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-sm text-foreground">
              {estimatedCount.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">
              destinatarios estimados
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Selecciona un tipo de audiencia para ver la estimación.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Atrás
        </Button>
        <Button
          onClick={onNext}
          disabled={!isValid}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Siguiente
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
