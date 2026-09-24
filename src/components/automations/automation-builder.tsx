'use client';

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Briefcase,
  ChevronDown,
  CircleSlash,
  FileText,
  GitBranch,
  GripVertical,
  Hourglass,
  List,
  Loader2,
  MessageSquare,
  MousePointerClick,
  PencilLine,
  Plus,
  Tag,
  TagIcon,
  Trash2,
  UserCheck,
  Webhook,
  Zap,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  blankButtonsPayload,
  blankListPayload,
  InteractiveBuilder,
} from '@/components/interactive/interactive-builder';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  childPath,
  insertAt,
  mapAtPath,
  moveAt,
  type ParentScope,
  removeAt,
  type StepPath,
} from '@/lib/automations/builder-tree';
import { toast } from '@/lib/notifications';

import { cn } from '@/lib/utils';
import { interactivePayloadPreviewText } from '@/lib/whatsapp/interactive';
import type {
  AccountMember,
  AutomationStepType,
  AutomationTriggerType,
  CustomField,
  InteractiveMessagePayload,
  KeywordMatchTriggerConfig,
  MessageTemplate,
  Tag as TagRecord,
} from '@/types';

// ------------------------------------------------------------
// Types (builder-local — mirror the flattened rows we POST)
// ------------------------------------------------------------

export interface BuilderStep {
  /** Client id; the API assigns real UUIDs server-side. */
  cid: string;
  step_type: AutomationStepType;
  step_config: Record<string, unknown>;
  branches?: { yes: BuilderStep[]; no: BuilderStep[] };
}

export interface BuilderInitial {
  id?: string;
  name: string;
  description: string;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  is_active: boolean;
  steps: BuilderStep[];
}

// ------------------------------------------------------------
// Step metadata — one source of truth for icon + label + border color
// ------------------------------------------------------------

interface StepMeta {
  label: string;
  icon: typeof Zap;
  /** Left-border accent color per spec. */
  border: string;
}

const STEP_META: Record<AutomationStepType, StepMeta> = {
  send_message: {
    label: 'Enviar mensaje',
    icon: MessageSquare,
    border: 'border-l-primary',
  },
  send_buttons: {
    label: 'Enviar botones',
    icon: MousePointerClick,
    border: 'border-l-primary',
  },
  send_list: {
    label: 'Enviar lista',
    icon: List,
    border: 'border-l-primary',
  },
  send_template: {
    label: 'Enviar plantilla',
    icon: FileText,
    border: 'border-l-primary',
  },
  add_tag: {
    label: 'Agregar etiqueta',
    icon: Tag,
    border: 'border-l-primary',
  },
  remove_tag: {
    label: 'Quitar etiqueta',
    icon: TagIcon,
    border: 'border-l-primary',
  },
  assign_conversation: {
    label: 'Asignar conversación',
    icon: UserCheck,
    border: 'border-l-primary',
  },
  update_contact_field: {
    label: 'Actualizar campo del contacto',
    icon: PencilLine,
    border: 'border-l-primary',
  },
  create_deal: {
    label: 'Crear negocio',
    icon: Briefcase,
    border: 'border-l-primary',
  },
  wait: { label: 'Esperar', icon: Hourglass, border: 'border-l-border' },
  condition: {
    label: 'Condición (Si/Si no)',
    icon: GitBranch,
    border: 'border-l-amber-500',
  },
  send_webhook: {
    label: 'Enviar webhook',
    icon: Webhook,
    border: 'border-l-primary',
  },
  close_conversation: {
    label: 'Cerrar conversación',
    icon: CircleSlash,
    border: 'border-l-primary',
  },
};

const ADDABLE_STEPS: AutomationStepType[] = [
  'send_message',
  'send_buttons',
  'send_list',
  'send_template',
  'add_tag',
  'remove_tag',
  'assign_conversation',
  'update_contact_field',
  'create_deal',
  'wait',
  'condition',
  'send_webhook',
  'close_conversation',
];

const TRIGGER_OPTIONS: {
  value: AutomationTriggerType;
  label: string;
  hint: string;
}[] = [
  {
    value: 'new_message_received',
    label: 'Nuevo mensaje recibido',
    hint: 'Cualquier mensaje entrante',
  },
  {
    value: 'first_inbound_message',
    label: 'Primer mensaje del contacto',
    hint: 'La primera vez que este contacto te escribe (también funciona con contactos agregados manualmente)',
  },
  {
    value: 'keyword_match',
    label: 'Palabra clave',
    hint: 'El mensaje contiene palabra(s) clave específica(s)',
  },
  {
    value: 'interactive_reply',
    label: 'Respuesta de botón / lista',
    hint: 'El cliente toca un botón o fila de lista cuyo id coincide; encadena menús entre automatizaciones',
  },
  {
    value: 'new_contact_created',
    label: 'Nuevo contacto creado',
    hint: 'Cuando un contacto se crea automáticamente a partir de un mensaje entrante',
  },
  {
    value: 'conversation_assigned',
    label: 'Conversación asignada',
    hint: 'Cuando se asigna a un agente',
  },
  {
    value: 'tag_added',
    label: 'Etiqueta agregada',
    hint: 'Cuando se agrega una etiqueta a un contacto',
  },
  {
    value: 'time_based',
    label: 'Por horario',
    hint: 'Según una programación recurrente',
  },
];

function cid(): string {
  return (
    'c_' +
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36))
  );
}

// The send_buttons / send_list step_config IS an InteractiveMessagePayload,
// but step_config is typed generically as Record<string, unknown>. These two
// helpers hold the single unavoidable structural cast in one place so a
// payload-shape change has one seam to update instead of four scattered
// `as unknown as` sites.
function toStepConfig(p: InteractiveMessagePayload): Record<string, unknown> {
  return p as unknown as Record<string, unknown>;
}
function asInteractive(
  cfg: Record<string, unknown>
): InteractiveMessagePayload {
  return cfg as unknown as InteractiveMessagePayload;
}

function blankConfig(type: AutomationStepType): Record<string, unknown> {
  switch (type) {
    case 'send_message':
      return { text: '' };
    case 'send_buttons':
      return toStepConfig(blankButtonsPayload());
    case 'send_list':
      return toStepConfig(blankListPayload());
    case 'send_template':
      return { template_name: '', language: 'en_US' };
    case 'add_tag':
    case 'remove_tag':
      return { tag_id: '' };
    case 'assign_conversation':
      return { mode: 'round_robin' };
    case 'update_contact_field':
      return { field: 'name', value: '' };
    case 'create_deal':
      return { pipeline_id: '', stage_id: '', title: '', value: 0 };
    case 'wait':
      return { amount: 1, unit: 'hours' };
    case 'condition':
      return { subject: 'tag_presence', operand: '', value: '' };
    case 'send_webhook':
      return { url: '', headers: {}, body_template: '' };
    case 'close_conversation':
      return {};
    default:
      return {};
  }
}

// ------------------------------------------------------------
// Account resources (tags, members, approved templates, pipelines)
//
// Loaded once at the builder root and shared via context so the
// tag / agent / template pickers below can offer existing resources
// by name instead of asking the user to paste raw UUIDs. Every picker
// falls back to a raw input when its list is empty (fresh account or
// an older deployment), so an automation is always authorable.
// ------------------------------------------------------------

interface AutomationResources {
  tags: TagRecord[];
  members: AccountMember[];
  templates: MessageTemplate[];
  customFields: CustomField[];
  pipelines: PipelineOption[];
  stages: PipelineStageOption[];
}

interface PipelineOption {
  id: string;
  name: string;
}

interface PipelineStageOption {
  id: string;
  name: string;
  pipeline_id: string;
  position: number;
}

const ResourcesContext = createContext<AutomationResources>({
  tags: [],
  members: [],
  templates: [],
  customFields: [],
  pipelines: [],
  stages: [],
});

function useResources(): AutomationResources {
  return useContext(ResourcesContext);
}

function ResourcesProvider({ children }: { children: ReactNode }) {
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [stages, setStages] = useState<PipelineStageOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    // All database access stays server-side. The endpoint applies account
    // scoping and only returns templates that Meta has approved.
    void (async () => {
      try {
        const response = await fetch('/api/automations/resources', {
          cache: 'no-store',
        });
        if (!response.ok) return;
        const resources =
          (await response.json()) as Partial<AutomationResources>;
        if (cancelled) return;
        setTags(resources.tags ?? []);
        setTemplates(resources.templates ?? []);
        setCustomFields(resources.customFields ?? []);
        setPipelines(resources.pipelines ?? []);
        setStages(resources.stages ?? []);
      } catch {
        // Pickers retain their raw-id fallback when resources cannot load.
      }
    })();

    // Members go through the API so we inherit its email-visibility
    // rules (agents/viewers don't see emails). Unreachable on older
    // deployments → pickers fall back to a raw agent-id input.
    void (async () => {
      try {
        const res = await fetch('/api/account/members', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as { members?: AccountMember[] };
        if (!cancelled) setMembers(json.members ?? []);
      } catch {
        // Members endpoint absent — caller falls back to raw input.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const resources = useMemo(
    () => ({ tags, members, templates, customFields, pipelines, stages }),
    [tags, members, templates, customFields, pipelines, stages]
  );

  return (
    <ResourcesContext.Provider value={resources}>
      {children}
    </ResourcesContext.Provider>
  );
}

const SELECT_CLASS =
  'w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none';

/** Tag dropdown by name + color, storing the tag's id. Falls back to a
 *  raw id input when no tags exist yet. */
function TagSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { tags } = useResources();
  if (tags.length === 0) {
    return (
      <Input
        placeholder="ID de etiqueta"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-muted text-foreground"
      />
    );
  }
  const selected = tags.find((t) => t.id === value);
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-3 w-3 shrink-0 rounded-full border border-border"
        style={{ backgroundColor: selected?.color ?? 'transparent' }}
        aria-hidden
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT_CLASS}
        aria-label="Etiqueta"
      >
        <option value="">Selecciona una etiqueta…</option>
        {tags.map((tg) => (
          <option key={tg.id} value={tg.id}>
            {tg.name}
          </option>
        ))}
        {/* Preserve a saved tag that's since been deleted so editing an
            existing automation doesn't silently drop it. */}
        {value && !selected && (
          <option value={value}>{value} (etiqueta desconocida)</option>
        )}
      </select>
    </div>
  );
}

/** Contact-field dropdown for "Update Contact Field": built-in columns plus
 *  any account custom fields (stored as `custom:<id>`). A saved custom field
 *  that's since been deleted is preserved as a labelled option so editing an
 *  existing automation doesn't silently drop it. */
function ContactFieldSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { customFields } = useResources();
  const customValue = value.startsWith('custom:') ? value : '';
  const knownCustom =
    customValue && customFields.some((f) => `custom:${f.id}` === customValue);
  return (
    <select
      value={value || 'name'}
      onChange={(e) => onChange(e.target.value)}
      className={SELECT_CLASS}
      aria-label="Campo del contacto"
    >
      <option value="name">Nombre</option>
      <option value="email">Correo</option>
      <option value="company">Empresa</option>
      {customFields.length > 0 && (
        <optgroup label="Campos personalizados">
          {customFields.map((f) => (
            <option key={f.id} value={`custom:${f.id}`}>
              {f.field_name}
            </option>
          ))}
        </optgroup>
      )}
      {customValue && !knownCustom && (
        <option value={customValue}>{customValue} (campo desconocido)</option>
      )}
    </select>
  );
}

/** Agent dropdown by name, storing the member's user_id. Falls back to
 *  a raw id input when the member list is unavailable. */
function AgentSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { members } = useResources();
  if (members.length === 0) {
    return (
      <Input
        placeholder="ID de agente"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-muted text-foreground"
      />
    );
  }
  const selected = members.find((m) => m.user_id === value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={SELECT_CLASS}
      aria-label="Agente"
    >
      <option value="">Selecciona un agente…</option>
      {members.map((m) => (
        <option key={m.user_id} value={m.user_id}>
          {m.full_name || m.email || m.user_id}
        </option>
      ))}
      {value && !selected && (
        <option value={value}>{value} (agente desconocido)</option>
      )}
    </select>
  );
}

/** Pipeline + stage picker for Create Deal. The automation stores ids because
 *  the engine writes directly to deals, but authors should choose by name. */
function DealPipelineFields({
  pipelineId,
  stageId,
  onChange,
}: {
  pipelineId: string;
  stageId: string;
  onChange: (patch: { pipeline_id: string; stage_id: string }) => void;
}) {
  const { pipelines, stages } = useResources();

  if (pipelines.length === 0) {
    return (
      <>
        <FieldBlock label="ID del pipeline">
          <Input
            value={pipelineId}
            onChange={(e) =>
              onChange({ pipeline_id: e.target.value, stage_id: stageId })
            }
            className="bg-muted text-foreground"
          />
        </FieldBlock>
        <FieldBlock label="ID de la etapa">
          <Input
            value={stageId}
            onChange={(e) =>
              onChange({ pipeline_id: pipelineId, stage_id: e.target.value })
            }
            className="bg-muted text-foreground"
          />
        </FieldBlock>
      </>
    );
  }

  const selectedPipeline = pipelines.find((p) => p.id === pipelineId);
  const stageOptions = stages.filter((s) => s.pipeline_id === pipelineId);
  const selectedStage = stageOptions.find((s) => s.id === stageId);

  return (
    <>
      <FieldBlock label="Pipeline">
        <select
          value={pipelineId}
          onChange={(e) => {
            const nextPipelineId = e.target.value;
            const firstStage = stages.find(
              (s) => s.pipeline_id === nextPipelineId
            );
            onChange({
              pipeline_id: nextPipelineId,
              stage_id: firstStage?.id ?? '',
            });
          }}
          className={SELECT_CLASS}
        >
          <option value="">Selecciona un pipeline…</option>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          {pipelineId && !selectedPipeline && (
            <option value={pipelineId}>
              {pipelineId} (pipeline desconocido)
            </option>
          )}
        </select>
      </FieldBlock>
      <FieldBlock label="Etapa">
        <select
          value={stageId}
          onChange={(e) =>
            onChange({ pipeline_id: pipelineId, stage_id: e.target.value })
          }
          className={SELECT_CLASS}
          disabled={!pipelineId || stageOptions.length === 0}
        >
          <option value="">
            {pipelineId
              ? 'Selecciona una etapa…'
              : 'Primero selecciona un pipeline…'}
          </option>
          {stageOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {stageId && pipelineId && !selectedStage && (
            <option value={stageId}>{stageId} (etapa desconocida)</option>
          )}
        </select>
      </FieldBlock>
    </>
  );
}

/** Template dropdown showing approved templates by name + language,
 *  storing both template_name and language. Falls back to manual name +
 *  language inputs when no approved templates are synced yet. */
function SendTemplateFields({
  templateName,
  language,
  onChange,
}: {
  templateName: string;
  language: string;
  onChange: (patch: { template_name: string; language: string }) => void;
}) {
  const { templates } = useResources();

  if (templates.length === 0) {
    return (
      <>
        <FieldBlock label="Nombre de la plantilla">
          <Input
            value={templateName}
            onChange={(e) =>
              onChange({ template_name: e.target.value, language })
            }
            className="bg-muted text-foreground"
          />
        </FieldBlock>
        <FieldBlock label="Idioma">
          <Input
            value={language}
            onChange={(e) =>
              onChange({
                template_name: templateName,
                language: e.target.value,
              })
            }
            className="bg-muted text-foreground"
          />
        </FieldBlock>
      </>
    );
  }

  // Encode name + language in the option value so two templates that
  // share a name across languages stay distinct.
  const toValue = (name: string, lang: string) => `${name}::${lang}`;
  const current = templateName ? toValue(templateName, language) : '';
  const hasMatch = templates.some(
    (t) => toValue(t.name, t.language ?? 'en_US') === current
  );

  return (
    <FieldBlock label="Plantilla">
      <select
        value={current}
        onChange={(e) => {
          const [name, lang] = e.target.value.split('::');
          onChange({ template_name: name ?? '', language: lang ?? '' });
        }}
        className={SELECT_CLASS}
      >
        <option value="">Selecciona una plantilla…</option>
        {templates.map((tmpl) => {
          const lang = tmpl.language ?? 'en_US';
          return (
            <option key={tmpl.id} value={toValue(tmpl.name, lang)}>
              {tmpl.name} ({lang})
            </option>
          );
        })}
        {current && !hasMatch && (
          <option value={current}>
            {`${templateName} (${language || 'desconocido'}): no está en la lista de aprobadas`}
          </option>
        )}
      </select>
    </FieldBlock>
  );
}

// ------------------------------------------------------------
// Main builder component
// ------------------------------------------------------------

export function AutomationBuilder({ initial }: { initial: BuilderInitial }) {
  const router = useRouter();
  const isEditing = !!initial.id;
  const [state, setState] = useState<BuilderInitial>(initial);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function patchTop<K extends keyof BuilderInitial>(
    key: K,
    value: BuilderInitial[K]
  ) {
    setState((s) => ({ ...s, [key]: value }));
  }

  // --- Step tree mutations (immutable) ---

  function updateStep(
    path: StepPath,
    updater: (s: BuilderStep) => BuilderStep
  ) {
    setState((s) => ({ ...s, steps: mapAtPath(s.steps, path, updater) }));
  }

  function addStepAt(
    parent: ParentScope,
    index: number,
    type: AutomationStepType
  ) {
    const node: BuilderStep = {
      cid: cid(),
      step_type: type,
      step_config: blankConfig(type),
      branches: type === 'condition' ? { yes: [], no: [] } : undefined,
    };
    setState((s) => ({ ...s, steps: insertAt(s.steps, parent, index, node) }));
    setExpandedId(node.cid);
  }

  function deleteStepAt(path: StepPath) {
    setState((s) => ({ ...s, steps: removeAt(s.steps, path) }));
  }

  function moveStepAt(path: StepPath, direction: -1 | 1) {
    setState((s) => ({ ...s, steps: moveAt(s.steps, path, direction) }));
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        name: state.name || 'Automatización sin título',
        description: state.description || null,
        trigger_type: state.trigger_type,
        trigger_config: state.trigger_config,
        is_active: state.is_active,
        steps: toApiSteps(state.steps),
      };

      const res = isEditing
        ? await fetch(`/api/automations/${initial.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/automations`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // If the server blocked activation with validation issues,
        // surface the first concrete problem so the user can fix it
        // without opening DevTools for the full array.
        const firstIssue: { path?: string; message?: string } | undefined =
          body?.issues?.[0];
        if (firstIssue?.message) {
          toast.error(firstIssue.message, {
            description: firstIssue.path ? `at ${firstIssue.path}` : undefined,
          });
        } else {
          toast.error(body?.error ?? 'Error al guardar');
        }
        return;
      }
      toast.success(
        isEditing ? 'Automatización guardada' : 'Automatización creada'
      );
      if (!isEditing && body?.automation?.id) {
        router.replace(`/automations/${body.automation.id}/edit`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* Top bar. At sub-sm widths the "Active" label is hidden and the
          switch moves to the right of the save button, so the name input
          gets maximum width. */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card/80 px-3 py-3 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={() => router.push('/automations')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Volver a automatizaciones"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <input
          value={state.name}
          onChange={(e) => patchTop('name', e.target.value)}
          placeholder="Automatización sin título"
          className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:bg-muted focus:outline-none sm:text-base"
          aria-label="Nombre de la automatización"
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Activa</span>
          <Switch
            checked={state.is_active}
            onCheckedChange={(v) => patchTop('is_active', !!v)}
            aria-label="Activa"
          />
        </div>
        <Button
          onClick={save}
          disabled={saving}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isEditing ? 'Guardar' : 'Guardar borrador'}
        </Button>
      </header>

      {/* Canvas */}
      <div className="relative flex-1 overflow-y-auto">
        <div className="absolute inset-0 bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] bg-size-[20px_20px] pointer-events-none" />
        <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-0 px-4 py-10">
          <ResourcesProvider>
            <TriggerCard
              type={state.trigger_type}
              config={state.trigger_config}
              onTypeChange={(tVal) => patchTop('trigger_type', tVal)}
              onConfigChange={(c) => patchTop('trigger_config', c)}
            />
            <StepList
              steps={state.steps}
              basePath={[]}
              scope={{ kind: 'root' }}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              updateStep={updateStep}
              addStepAt={addStepAt}
              deleteStepAt={deleteStepAt}
              moveStepAt={moveStepAt}
            />
          </ResourcesProvider>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Trigger card
// ------------------------------------------------------------

function TriggerCard({
  type,
  config,
  onTypeChange,
  onConfigChange,
}: {
  type: AutomationTriggerType;
  config: Record<string, unknown>;
  onTypeChange: (type: AutomationTriggerType) => void;
  onConfigChange: (config: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerOption = TRIGGER_OPTIONS.find((option) => option.value === type);
  return (
    // Card width: full on mobile, fixed 320px on sm+. The canvas wrapper
    // (max-w-2xl + px-4) keeps this tidy on tablet/desktop.
    <div className="z-10 w-full max-w-[320px] sm:w-80">
      <div className="rounded-lg border border-border border-l-4 border-l-blue-500 bg-card shadow-lg">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500/10 text-blue-400">
            <Zap className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wide text-blue-300">
              Disparador
            </div>
            <div className="truncate text-sm font-medium text-foreground">
              {triggerOption?.label ?? type}
            </div>
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>
        {open && (
          <div className="space-y-3 border-t border-border px-4 py-3">
            <div>
              <label
                htmlFor="automation-trigger-type"
                className="mb-1 block text-xs font-medium text-muted-foreground"
              >
                Tipo de disparador
              </label>
              <select
                id="automation-trigger-type"
                value={type}
                onChange={(e) =>
                  onTypeChange(e.target.value as AutomationTriggerType)
                }
                className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {TRIGGER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {triggerOption?.hint}
              </p>
            </div>
            {type === 'keyword_match' && (
              <KeywordMatchConfig
                config={config as unknown as KeywordMatchTriggerConfig}
                onChange={onConfigChange}
              />
            )}
            {type === 'interactive_reply' && (
              <InteractiveReplyConfig
                config={config}
                onChange={onConfigChange}
              />
            )}
            {type === 'tag_added' && (
              <div>
                <p className="mb-1 block text-xs font-medium text-muted-foreground">
                  Tag
                </p>
                <TagSelect
                  value={(config.tag_id as string) ?? ''}
                  onChange={(v) => onConfigChange({ ...config, tag_id: v })}
                />
              </div>
            )}
            {type === 'time_based' && (
              <div>
                <label
                  htmlFor="automation-schedule"
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                  Programación
                </label>
                <Input
                  id="automation-schedule"
                  placeholder="Expresión cron o HH:mm"
                  value={(config.schedule as string) ?? ''}
                  onChange={(e) =>
                    onConfigChange({ ...config, schedule: e.target.value })
                  }
                  className="bg-muted text-foreground"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Expresión cron (p. ej. 0 9 * * 1-5)
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function KeywordMatchConfig({
  config,
  onChange,
}: {
  config: KeywordMatchTriggerConfig;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const keywords = config?.keywords ?? [];
  // Keep a local draft string so the comma and trailing space aren't
  // stripped on every keystroke (which made multi-word, comma-separated
  // entry like "SEO, search engine optimization" impossible to type).
  // We only parse into the keywords array on blur, then re-display the
  // cleaned, rejoined form. Seeded once on mount; this component remounts
  // when the trigger type changes, so the seed stays in sync.
  const [draft, setDraft] = useState(() => keywords.join(', '));

  // Persist the default the <select> displays. The dropdown falls back to
  // "contains" for display, but leaving it untouched would otherwise omit
  // match_type from the saved config — and activation validation then
  // rejected it (trigger.match_type). Seed once on mount; the component
  // remounts when the trigger type changes, matching the keywords draft.
  useEffect(() => {
    if (config?.match_type == null) {
      onChange({ ...config, match_type: 'contains' });
    }
  }, [onChange, config?.match_type, config]);

  function commit() {
    const parsed = draft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setDraft(parsed.join(', '));
    onChange({ ...config, keywords: parsed });
  }

  return (
    <div className="space-y-2">
      <div>
        <label
          htmlFor="automation-keywords"
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Palabras clave
        </label>
        <Input
          id="automation-keywords"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="Lista separada por comas (p. ej. hola, ayuda, comprar)"
          className="bg-muted text-foreground"
        />
      </div>
      <div>
        <label
          htmlFor="automation-match-type"
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Tipo de coincidencia
        </label>
        <select
          id="automation-match-type"
          value={config?.match_type ?? 'contains'}
          onChange={(e) =>
            onChange({
              ...config,
              match_type: e.target.value as 'exact' | 'contains' | 'word',
            })
          }
          className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:outline-none"
        >
          <option value="contains">Contiene</option>
          <option value="word">Palabra completa</option>
          <option value="exact">Exacta</option>
        </select>
        {/* Only worth explaining for `word` — "contains" and "exact" read
            for themselves, and this is the one that changes which messages
            fire an automation in a way that isn't obvious. */}
        {config?.match_type === 'word' && (
          <p className="mt-1 text-xs text-muted-foreground">
            Coincide con la palabra clave solo como palabra independiente, así
            "k" ya no se activa con "thanks". Ideal para palabras clave cortas
            en idiomas con espacios; usa Contiene para idiomas que se escriben
            sin espacios.
          </p>
        )}
      </div>
    </div>
  );
}

function InteractiveReplyConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const ids = (config?.reply_ids as string[] | undefined) ?? [];
  // Same local-draft-then-commit pattern as KeywordMatchConfig so
  // commas + spaces survive keystrokes.
  const [draft, setDraft] = useState(() => ids.join(', '));

  function commit() {
    const parsed = draft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setDraft(parsed.join(', '));
    onChange({ ...config, reply_ids: parsed });
  }

  return (
    <div>
      <label
        htmlFor="automation-reply-ids"
        className="mb-1 block text-xs font-medium text-muted-foreground"
      >
        IDs de respuesta
      </label>
      <Input
        id="automation-reply-ids"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        placeholder="si, no, mas_info"
        className="bg-muted font-mono text-foreground"
      />
      <p className="mt-1 text-[11px] text-muted-foreground">
        IDs de botón/fila de lista separados por comas, coincidencia exacta. Usa
        los mismos ids que definiste en un paso Enviar botones / Enviar lista.
      </p>
    </div>
  );
}

// ------------------------------------------------------------
// Step list + card + connectors
// ------------------------------------------------------------

interface StepListProps {
  steps: BuilderStep[];
  /**
   * Path of the step that owns this list — `[]` for the root canvas,
   * the condition's own path for a branch column. Combined with
   * `scope` by `childPath` to address each child.
   */
  basePath: StepPath;
  /** Which bucket this list reads and writes. */
  scope: ParentScope;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  updateStep: (
    path: StepPath,
    updater: (s: BuilderStep) => BuilderStep
  ) => void;
  addStepAt: (
    parent: ParentScope,
    index: number,
    type: AutomationStepType
  ) => void;
  deleteStepAt: (path: StepPath) => void;
  moveStepAt: (path: StepPath, direction: -1 | 1) => void;
}

function StepList(props: StepListProps) {
  const { steps, basePath, scope, ...rest } = props;

  return (
    <div className="flex w-full flex-col items-center">
      <AddButton onPick={(t) => props.addStepAt(scope, 0, t)} />
      {steps.map((step, idx) => (
        <StepRenderer
          key={step.cid}
          step={step}
          index={idx}
          total={steps.length}
          basePath={basePath}
          scope={scope}
          {...rest}
        />
      ))}
    </div>
  );
}

function StepRenderer({
  step,
  index,
  total,
  scope,
  basePath,
  ...props
}: {
  step: BuilderStep;
  index: number;
  total: number;
  scope: ParentScope;
  basePath: StepPath;
} & Omit<StepListProps, 'steps' | 'basePath' | 'scope'>) {
  const path = childPath(basePath, scope, index);
  const meta = STEP_META[step.step_type];
  const Icon = meta.icon;
  const expanded = props.expandedId === step.cid;
  const isCondition = step.step_type === 'condition';
  const nested = basePath.length > 0;
  // Card widths on mobile fill the full canvas column (max-w-2xl px-4
  // still keeps them reasonable). On sm+ fixed widths come back so the
  // flow visual stays recognisable — but only at the top level: a
  // branch column is a fraction of its condition's width, so a 320px
  // card inside one overflowed its own column and dragged the editor's
  // controls out of reach (issue #474). Nested cards fill the column
  // they were given instead.
  //
  // A condition is wider than a plain step because it has to hold two
  // branch columns side by side; 600px (the canvas is max-w-2xl, i.e.
  // 640px of content) leaves each branch ~294px — near enough to the
  // 320px a step gets at the top level for the same editors to fit.
  const width = nested
    ? 'w-full'
    : isCondition
      ? 'w-full max-w-[600px] sm:w-[600px]'
      : 'w-full max-w-[320px] sm:w-80';

  return (
    <>
      <div className={cn('z-10 flex min-w-0 flex-col', width)}>
        <div
          className={cn(
            'rounded-lg border border-border border-l-4 bg-card shadow-lg',
            meta.border
          )}
        >
          <button
            type="button"
            onClick={() => props.setExpandedId(expanded ? null : step.cid)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <GripVertical
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {isCondition
                  ? 'Condición'
                  : step.step_type === 'wait'
                    ? 'Espera'
                    : 'Acción'}
              </div>
              <div className="truncate text-sm font-medium text-foreground">
                {meta.label}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {previewFor(step)}
              </div>
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform',
                expanded && 'rotate-180'
              )}
            />
          </button>
          {expanded && (
            <div className="border-t border-border px-4 py-3">
              <StepEditor
                step={step}
                onChange={(next) => props.updateStep(path, () => next)}
              />
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === 0}
                    aria-label="Subir"
                    onClick={() => props.moveStepAt(path, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === total - 1}
                    aria-label="Bajar"
                    onClick={() => props.moveStepAt(path, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => props.deleteStepAt(path)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </Button>
              </div>
            </div>
          )}
        </div>

        {isCondition && (
          <ConditionBranches step={step} path={path} {...props} />
        )}
      </div>

      {/* A condition branches into Yes/No (rendered above by
          ConditionBranches), so it has no linear "continue" path — adding
          the trailing connector here would produce a spurious third output. */}
      {!isCondition && (
        <AddButton onPick={(t) => props.addStepAt(scope, index + 1, t)} />
      )}
    </>
  );
}

function ConditionBranches({
  step,
  path,
  ...props
}: {
  step: BuilderStep;
  /** The condition's OWN path. Children hang off it, one marker each. */
  path: StepPath;
} & Omit<StepListProps, 'steps' | 'basePath' | 'scope'>) {
  const yes = step.branches?.yes ?? [];
  const no = step.branches?.no ?? [];
  return (
    // Stack Yes/No vertically until THIS CARD is wide enough for two
    // columns. A viewport breakpoint can't tell: a condition nested in
    // a branch is a fraction of the screen, and `sm:grid-cols-2` split
    // it anyway, leaving two columns too narrow to render a step in.
    <div className="@container mt-3 w-full">
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
        <BranchColumn label="Sí" color="text-primary">
          <StepList
            {...props}
            steps={yes}
            basePath={path}
            scope={{ kind: 'branch', parentCid: step.cid, branch: 'yes' }}
          />
        </BranchColumn>
        <BranchColumn label="No" color="text-rose-400">
          <StepList
            {...props}
            steps={no}
            basePath={path}
            scope={{ kind: 'branch', parentCid: step.cid, branch: 'no' }}
          />
        </BranchColumn>
      </div>
    </div>
  );
}

function BranchColumn({
  label,
  color,
  children,
}: {
  label: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <div className={cn('mb-2 text-[11px] font-semibold uppercase', color)}>
        {label}
      </div>
      {children}
    </div>
  );
}

function AddButton({ onPick }: { onPick: (type: AutomationStepType) => void }) {
  return (
    <div className="relative flex flex-col items-center">
      <div className="h-4 w-0.5 bg-border" aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-border bg-background text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary data-popup-open:border-primary data-popup-open:bg-primary/20 data-popup-open:text-primary"
          aria-label="Agregar paso"
        >
          <Plus className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-80 min-w-56 overflow-y-auto border-border bg-popover"
        >
          {ADDABLE_STEPS.map((tp) => {
            const Icon = STEP_META[tp].icon;
            return (
              <DropdownMenuItem key={tp} onClick={() => onPick(tp)}>
                <Icon className="h-4 w-4" />
                {STEP_META[tp].label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="h-4 w-0.5 bg-border" aria-hidden />
    </div>
  );
}

// ------------------------------------------------------------
// Per-step config editor
// ------------------------------------------------------------

function StepEditor({
  step,
  onChange,
}: {
  step: BuilderStep;
  onChange: (s: BuilderStep) => void;
}) {
  const cfg = step.step_config;
  const set = (patch: Record<string, unknown>) =>
    onChange({ ...step, step_config: { ...cfg, ...patch } });

  switch (step.step_type) {
    case 'send_message':
      return (
        <FieldBlock label="Texto del mensaje">
          <Textarea
            value={(cfg.text as string) ?? ''}
            onChange={(e) => set({ text: e.target.value })}
            placeholder="¡Hola! Gracias por escribirnos…"
            className="min-h-24 bg-muted text-foreground"
          />
        </FieldBlock>
      );
    case 'send_buttons':
    case 'send_list':
      // The whole step_config IS the interactive payload; the shared
      // builder edits it in place (and enforces Meta's limits + preview).
      return (
        <InteractiveBuilder
          value={asInteractive(cfg)}
          onChange={(payload) =>
            onChange({ ...step, step_config: toStepConfig(payload) })
          }
        />
      );
    case 'send_template':
      return (
        <SendTemplateFields
          templateName={(cfg.template_name as string) ?? ''}
          language={(cfg.language as string) ?? ''}
          onChange={(patch) => set(patch)}
        />
      );
    case 'add_tag':
    case 'remove_tag':
      return (
        <FieldBlock label="Etiqueta">
          <TagSelect
            value={(cfg.tag_id as string) ?? ''}
            onChange={(v) => set({ tag_id: v })}
          />
        </FieldBlock>
      );
    case 'assign_conversation':
      return (
        <>
          <FieldBlock label="Modo">
            <select
              value={(cfg.mode as string) ?? 'round_robin'}
              onChange={(e) => set({ mode: e.target.value })}
              className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground"
            >
              <option value="round_robin">Rotativo</option>
              <option value="specific">Agente específico</option>
            </select>
          </FieldBlock>
          {cfg.mode === 'specific' && (
            <FieldBlock label="Agente">
              <AgentSelect
                value={(cfg.agent_id as string) ?? ''}
                onChange={(v) => set({ agent_id: v })}
              />
            </FieldBlock>
          )}
        </>
      );
    case 'update_contact_field':
      return (
        <>
          <FieldBlock label="Campo">
            <ContactFieldSelect
              value={(cfg.field as string) ?? 'name'}
              onChange={(v) => set({ field: v })}
            />
          </FieldBlock>
          <FieldBlock label="Valor">
            <Input
              value={(cfg.value as string) ?? ''}
              onChange={(e) => set({ value: e.target.value })}
              placeholder="Texto o {{ vars.x }} / {{ message.text }}"
              className="bg-muted text-foreground"
            />
          </FieldBlock>
        </>
      );
    case 'create_deal':
      return (
        <>
          <DealPipelineFields
            pipelineId={(cfg.pipeline_id as string) ?? ''}
            stageId={(cfg.stage_id as string) ?? ''}
            onChange={(patch) => set(patch)}
          />
          <FieldBlock label="Título">
            <Input
              value={(cfg.title as string) ?? ''}
              onChange={(e) => set({ title: e.target.value })}
              className="bg-muted text-foreground"
            />
          </FieldBlock>
          <FieldBlock label="Valor">
            <Input
              type="number"
              value={(cfg.value as number) ?? 0}
              onChange={(e) => set({ value: Number(e.target.value) })}
              className="bg-muted text-foreground"
            />
          </FieldBlock>
        </>
      );
    case 'wait':
      return (
        <div className="grid grid-cols-2 gap-2">
          <FieldBlock label="Cantidad">
            <Input
              type="number"
              min={1}
              value={(cfg.amount as number) ?? 1}
              onChange={(e) =>
                set({ amount: Math.max(1, Number(e.target.value)) })
              }
              className="bg-muted text-foreground"
            />
          </FieldBlock>
          <FieldBlock label="Unidad">
            <select
              value={(cfg.unit as string) ?? 'hours'}
              onChange={(e) => set({ unit: e.target.value })}
              className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground"
            >
              <option value="minutes">Minutos</option>
              <option value="hours">Horas</option>
              <option value="days">Días</option>
            </select>
          </FieldBlock>
        </div>
      );
    case 'condition':
      return (
        <>
          <FieldBlock label="Sujeto">
            <select
              value={(cfg.subject as string) ?? 'tag_presence'}
              onChange={(e) => set({ subject: e.target.value })}
              className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground"
            >
              <option value="tag_presence">Presencia de etiqueta</option>
              <option value="contact_field">Campo del contacto</option>
              <option value="message_content">Contenido del mensaje</option>
              <option value="time_of_day">Hora del día</option>
            </select>
          </FieldBlock>
          <FieldBlock label="Operando">
            <Input
              placeholder={
                cfg.subject === 'time_of_day'
                  ? 'HH:mm-HH:mm'
                  : cfg.subject === 'contact_field'
                    ? 'name / email / company'
                    : cfg.subject === 'tag_presence'
                      ? 'id de etiqueta'
                      : ''
              }
              value={(cfg.operand as string) ?? ''}
              onChange={(e) => set({ operand: e.target.value })}
              className="bg-muted text-foreground"
            />
          </FieldBlock>
          {(cfg.subject === 'contact_field' ||
            cfg.subject === 'message_content') && (
            <FieldBlock label="Valor">
              <Input
                value={(cfg.value as string) ?? ''}
                onChange={(e) => set({ value: e.target.value })}
                className="bg-muted text-foreground"
              />
            </FieldBlock>
          )}
        </>
      );
    case 'send_webhook':
      return (
        <>
          <FieldBlock label="URL">
            <Input
              value={(cfg.url as string) ?? ''}
              onChange={(e) => set({ url: e.target.value })}
              className="bg-muted text-foreground"
            />
          </FieldBlock>
          <FieldBlock label="Plantilla del cuerpo">
            <Textarea
              value={(cfg.body_template as string) ?? ''}
              onChange={(e) => set({ body_template: e.target.value })}
              className="min-h-20 bg-muted font-mono text-xs text-foreground"
            />
          </FieldBlock>
        </>
      );
    case 'close_conversation':
      return (
        <p className="text-xs text-muted-foreground">
          Cambia el estado de la conversación a "cerrada". No requiere
          configuración.
        </p>
      );
    default:
      return null;
  }
}

function FieldBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="mb-2 last:mb-0">
      <legend className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </legend>
      {children}
    </fieldset>
  );
}

function previewFor(step: BuilderStep): string {
  switch (step.step_type) {
    case 'send_message':
      return (step.step_config.text as string) || 'no text yet';
    case 'send_buttons':
    case 'send_list':
      return (
        interactivePayloadPreviewText(asInteractive(step.step_config)) ||
        'no body yet'
      );
    case 'send_template':
      return (step.step_config.template_name as string) || 'pick a template';
    case 'wait':
      return `${step.step_config.amount ?? '?'} ${step.step_config.unit ?? ''}`;
    case 'condition':
      return `when ${step.step_config.subject ?? '?'}`;
    case 'send_webhook':
      return (step.step_config.url as string) || 'no url';
    default:
      return '';
  }
}

// ------------------------------------------------------------
// Serialize builder tree → API payload (flattened shape)
// ------------------------------------------------------------

interface ApiStep {
  step_type: string;
  step_config: Record<string, unknown>;
  branches?: { yes?: ApiStep[]; no?: ApiStep[] };
}

export function toApiSteps(steps: BuilderStep[]): ApiStep[] {
  return steps.map((s) => ({
    step_type: s.step_type,
    step_config: s.step_config,
    branches: s.branches
      ? { yes: toApiSteps(s.branches.yes), no: toApiSteps(s.branches.no) }
      : undefined,
  }));
}

/**
 * Convert server-returned step tree (from loadStepsTree) into the
 * builder-local shape with client ids.
 */
export interface ServerStepNode {
  id: string;
  step_type: string;
  step_config: Record<string, unknown>;
  branches: { yes: ServerStepNode[]; no: ServerStepNode[] };
}

export function fromServerSteps(nodes: ServerStepNode[]): BuilderStep[] {
  return nodes.map((n) => ({
    cid: cid(),
    step_type: n.step_type as AutomationStepType,
    step_config: n.step_config ?? {},
    branches:
      n.step_type === 'condition'
        ? {
            yes: fromServerSteps(n.branches?.yes ?? []),
            no: fromServerSteps(n.branches?.no ?? []),
          }
        : undefined,
  }));
}
