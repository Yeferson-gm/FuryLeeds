'use client';

import {
  AlertCircle,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { confirmDestructiveAction } from '@/lib/action-alerts';
import { toast } from '@/lib/notifications';
import {
  MEDIA_MAX_BYTES_BY_KIND,
  uploadAccountMedia,
} from '@/lib/storage/upload-media';

import { templateStatusConfig } from '@/lib/template-status';
import {
  isMediaHeaderKind,
  MEDIA_HEADER_SPECS,
  type MediaHeaderKind,
} from '@/lib/whatsapp/media-header-types';
import {
  extractVariableIndices,
  TEMPLATE_LIMITS,
} from '@/lib/whatsapp/template-validators';
import type {
  MessageTemplate,
  TemplateButton,
  TemplateSampleValues,
} from '@/types';
import { SettingsPanelHead } from './settings-panel-head';

const COPY = {
  addButton: 'Agregar botón',
  authWarning:
    'Las plantillas de AUTENTICACIÓN tienen un formato fijo de cuerpo + botón OTP que necesita otro constructor. Por ahora, créalas en el Administrador de WhatsApp de Meta y usa <bold>Sincronizar desde Meta</bold> para traerlas.',
  bodyHint:
    'Usa {{1}}, {{2}} para las variables (deben ser contiguas empezando en {{1}}).',
  bodyPlaceholder: 'Hola {{1}}, tu pedido {{2}} está confirmado.',
  bodyText: 'Texto del cuerpo',
  btnCopyCode: 'Copiar código',
  btnLabelPlaceholder: 'Texto del botón',
  btnPhone: 'Teléfono',
  btnQuickReply: 'Respuesta rápida',
  btnUrl: 'URL',
  buttons: 'Botones (opcional)',
  buttonsLimit:
    'Hasta {max} botones. Los botones QUICK_REPLY deben ir antes de los botones de URL / teléfono / copiar código.',
  cancel: 'Cancelar',
  category: 'Categoría',
  codePlaceholder: 'Código de ejemplo (p. ej. VERANO20)',
  createFirst: 'Crea tu primera plantilla de mensaje para empezar.',
  delete: 'Eliminar',
  deleteDialogTitle: '¿Eliminar plantilla?',
  deleteLocalDesc:
    '"{name}" se eliminará de FuryLeeds. Nunca se envió a Meta, así que no hace falta limpieza remota.',
  deleteLocallyAria: 'Eliminar plantilla localmente',
  deleteLocallyTitle: 'Eliminar localmente',
  deleteMetaDesc:
    '"{name}" se eliminará de Meta y de FuryLeeds. Las difusiones activas que usen esta plantilla empezarán a fallar en su próximo envío. No se puede deshacer.',
  deleteMetaLocallyAria: 'Eliminar plantilla de Meta y localmente',
  deleteMetaLocallyTitle: 'Eliminar de Meta y localmente',
  deleting: 'Eliminando…',
  description:
    'Crea plantillas y envíalas a Meta para su aprobación. Usa "Sincronizar desde Meta" para traer plantillas aprobadas en otro lugar.',
  dialogEditDesc:
    'Guarda tus cambios para reenviarla a Meta. El estado volverá a PENDIENTE durante la revisión.',
  dialogEditTitle: 'Editar plantilla de mensaje',
  dialogNewDesc:
    'Crea una plantilla y envíala a Meta para su aprobación. Una vez aprobada, podrás usarla en difusiones y en la bandeja de entrada.',
  dialogNewTitle: 'Nueva plantilla de mensaje',
  documentHint:
    ' PDF, Word, PowerPoint, Excel o texto, ≤100 MB por enlace (≤16 MB si se sube aquí).',
  edit: 'Editar',
  editLabel: 'Editar plantilla',
  editTitle:
    'Editar provoca una nueva revisión de Meta: el estado vuelve a PENDIENTE.',
  footer: 'Pie (opcional)',
  footerPlaceholder: 'Texto de pie opcional (máx. 60 caracteres)',
  header: 'Encabezado',
  headerDocument: 'Documento',
  headerImage: 'Imagen',
  headerNone: 'Ninguno',
  headerSampleAria: 'Valor de ejemplo para la variable del encabezado',
  headerSamplePlaceholder:
    'Valor de ejemplo para {{1}} (obligatorio para la revisión de Meta)',
  headerText: 'Texto',
  headerTextLabel: 'Texto del encabezado',
  headerTextPlaceholder:
    'Texto del encabezado (máx. 60 caracteres, {{1}} opcional)',
  headerVideo: 'Video',
  uploadDocument: 'Subir documento',
  uploadHint: 'JPEG o PNG, ≤5 MB',
  uploadHintDocument: 'PDF, Word, PowerPoint, Excel o texto, ≤16 MB',
  uploadHintVideo: 'MP4 o 3GPP, ≤16 MB',
  uploadImage: 'Subir imagen',
  uploadVideo: 'Subir video',
  imageHint:
    'Sube un JPEG/PNG (≤5 MB, ≥800×418 px recomendado) o pega un enlace HTTPS público; lo subimos a Meta para su revisión automáticamente.',
  langFixed: 'El idioma es fijo una vez que la plantilla existe en Meta.',
  langHint:
    'Debe coincidir exactamente con el código en Meta: <code>en_US</code> y <code>en</code> son distintos.',
  language: 'Idioma',
  mediaHint:
    'Sube un archivo o pega un enlace HTTPS público; lo subimos a Meta para su revisión automáticamente.',
  mediaUrlPlaceholder: 'https://… (o pega un enlace público de {format})',
  nameFixed:
    'El nombre es fijo una vez que la plantilla existe en Meta; crea una plantilla nueva para cambiarlo.',
  nameHint: 'Solo letras minúsculas, dígitos y guiones bajos.',
  namePlaceholder: 'p. ej. order_confirmation',
  newTemplate: 'Nueva plantilla',
  noTemplates: 'Aún no hay plantillas.',
  phonePlaceholder: '+15551234567',
  qualityScoreTitle: 'Puntuación de calidad de Meta',
  resubmit: 'Reenviar',
  resubmitLabel: 'Editar y reenviar plantilla',
  resubmitTitle: 'Edita la plantilla y reenvíala a Meta para su revisión.',
  sampleAria: 'Valor de ejemplo para la variable del cuerpo {var}',
  samplePlaceholder: 'Ejemplo para {var}',
  sampleValues: 'Valores de ejemplo (Meta los usa para revisar tu plantilla)',
  saveResubmit: 'Guardar y reenviar',
  saving: 'Guardando…',
  submitApproval: 'Enviar para aprobación',
  submitting: 'Enviando…',
  syncFromMeta: 'Sincronizar desde Meta',
  syncTitle:
    'Traer las plantillas aprobadas de tu cuenta de WhatsApp Business en Meta',
  syncing: 'Sincronizando…',
  templateName: 'Nombre de la plantilla',
  title: 'Plantillas de mensaje',
  toastDeleteError: 'Error al eliminar la plantilla',
  toastDeleteSuccess: 'Plantilla eliminada',
  toastInvalidDocument:
    'El documento del encabezado debe ser un archivo PDF, Word, PowerPoint, Excel o de texto.',
  toastInvalidImage: 'La imagen del encabezado debe ser JPEG o PNG.',
  toastInvalidVideo: 'El video del encabezado debe ser un archivo MP4 o 3GPP.',
  toastLoadFailed: 'Error al cargar las plantillas',
  toastMediaTooLarge:
    'El archivo pesa {size} MB; el límite de carga es {max} MB.',
  toastSaveEditDry: 'Plantilla actualizada (simulación, sin llamada a Meta)',
  toastSaveNewDry: 'Plantilla guardada (simulación, sin llamada a Meta)',
  toastSubmitEditSuccess:
    'Edición enviada; Meta suele revisar en menos de 24 horas.',
  toastSubmitFailed: 'Error al enviar',
  toastSubmitNewSuccess:
    'Enviada a Meta; el tiempo de revisión habitual es de 24 horas. El estado se actualiza automáticamente.',
  toastSyncCount:
    '{total} {total, plural, =1 {plantilla sincronizada} other {plantillas sincronizadas}} desde Meta',
  toastSyncDetails: ' ({inserted} nuevas, {updated} actualizadas)',
  toastSyncError: 'Error al sincronizar las plantillas',
  toastSyncFailed: 'Error al sincronizar: {preview}',
  toastSyncTruncated:
    'Solo se sincronizaron las primeras 2000 plantillas; tu cuenta tiene más. Sincroniza de nuevo para continuar o contacta a soporte si esto persiste.',
  toastUploadFailed: 'Error al subir.',
  toastUploadSuccess: 'Archivo subido.',
  urlPlaceholder: 'https://example.com/path o con sufijo {{1}}',
  urlSamplePlaceholder:
    'Valor de ejemplo para {{1}} (obligatorio cuando la URL tiene una variable)',
  videoHint: ' MP4 o 3GPP, ≤16 MB, ≤60 segundos recomendado.',
} as const;

const CATEGORIES = ['Marketing', 'Utility', 'Authentication'] as const;
const CATEGORY_LABELS = {
  Marketing: 'Marketing',
  Utility: 'Utilidad',
  Authentication: 'Autenticación',
} as const;

type HeaderFormat = 'none' | 'text' | 'image' | 'video' | 'document';

const HEADER_FORMAT_LABELS: Record<HeaderFormat, string> = {
  none: 'Ninguno',
  text: 'Texto',
  image: 'Imagen',
  video: 'Video',
  document: 'Documento',
};
const HEADER_FORMATS: HeaderFormat[] = [
  'none',
  'text',
  'image',
  'video',
  'document',
];

const categoryColors: Record<string, string> = {
  Marketing: 'bg-purple-600/20 text-purple-400 border-purple-600/30',
  Utility: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  Authentication: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
};

interface TemplateFormData {
  name: string;
  category: MessageTemplate['category'];
  language: string;
  header_format: HeaderFormat;
  header_content: string;
  header_media_url: string;
  header_sample: string;
  body_text: string;
  body_samples: string[];
  footer_text: string;
  buttons: TemplateButton[];
}

const emptyForm: TemplateFormData = {
  name: '',
  category: 'Marketing',
  language: 'en_US',
  header_format: 'none',
  header_content: '',
  header_media_url: '',
  header_sample: '',
  body_text: '',
  body_samples: [],
  footer_text: '',
  buttons: [],
};

const COMMON_LANGUAGE_CODES = [
  'en_US',
  'en_GB',
  'en',
  'es',
  'es_ES',
  'es_MX',
  'fr',
  'fr_FR',
  'de',
  'it',
  'pt_BR',
  'pt_PT',
  'nl',
  'pl',
  'ru',
  'tr',
  'lt',
];

function emptyButton(type: TemplateButton['type']): TemplateButton {
  switch (type) {
    case 'QUICK_REPLY':
      return { type: 'QUICK_REPLY', text: '' };
    case 'URL':
      return { type: 'URL', text: '', url: '' };
    case 'PHONE_NUMBER':
      return { type: 'PHONE_NUMBER', text: '', phone_number: '' };
    case 'COPY_CODE':
      return { type: 'COPY_CODE', text: '', example: '' };
  }
}

export function TemplateManager() {
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState<TemplateFormData>(emptyForm);
  // Non-null when the dialog is editing an existing row — switches the
  // submit handler from POST /submit to PATCH /[id] and changes the
  // dialog title + CTA. Set to the template id to pre-fill from a row.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Template selected for the confirm-delete dialog. The destructive

  // Header-media upload (image #230; video/document #562). Uploads to the
  // account-scoped chat-media bucket and stores the public URL in
  // header_media_url; the submit route turns that into a Meta
  // Resumable-Upload handle.
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const headerFileRef = useRef<HTMLInputElement>(null);

  // Body variable indices — `[1, 2, 3]` for "{{1}} {{2}} {{3}}". We
  // re-run the extractor on every render to keep the sample-value rows
  // in sync with what the user typed.
  const bodyVarCount = useMemo(
    () => extractVariableIndices(form.body_text).length,
    [form.body_text]
  );
  const headerVarCount = useMemo(
    () =>
      form.header_format === 'text'
        ? extractVariableIndices(form.header_content).length
        : 0,
    [form.header_format, form.header_content]
  );

  // Resize body_samples so it always has exactly bodyVarCount entries.
  // (We mutate via setForm in an effect so React owns the state.)
  useEffect(() => {
    setForm((prev) => {
      if (prev.body_samples.length === bodyVarCount) return prev;
      const next = prev.body_samples.slice(0, bodyVarCount);
      while (next.length < bodyVarCount) next.push('');
      return { ...prev, body_samples: next };
    });
  }, [bodyVarCount]);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/templates', { cache: 'no-store' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || COPY.toastLoadFailed);
      }
      const data = await response.json();
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
      toast.error(COPY.toastLoadFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    fetchTemplates();
  }, [authLoading, user?.id, user, fetchTemplates]);

  function buildSubmitPayload() {
    const sample_values: TemplateSampleValues = {};
    if (form.body_samples.some((v) => v.trim())) {
      sample_values.body = form.body_samples.map((v) => v.trim());
    }
    if (form.header_format === 'text' && form.header_sample.trim()) {
      sample_values.header = [form.header_sample.trim()];
    }

    return {
      name: form.name.trim(),
      category: form.category,
      language: form.language.trim() || 'en_US',
      header_type:
        form.header_format === 'none' ? undefined : form.header_format,
      header_content:
        form.header_format === 'text' ? form.header_content.trim() : undefined,
      header_media_url:
        form.header_format !== 'none' && form.header_format !== 'text'
          ? form.header_media_url.trim() || undefined
          : undefined,
      body_text: form.body_text.trim(),
      footer_text: form.footer_text.trim() || undefined,
      buttons: form.buttons.length > 0 ? form.buttons : undefined,
      sample_values:
        Object.keys(sample_values).length > 0 ? sample_values : undefined,
    };
  }

  function openEdit(template: MessageTemplate) {
    setEditingId(template.id);
    setForm({
      name: template.name,
      category: template.category,
      language: template.language || 'en_US',
      header_format: (template.header_type ?? 'none') as HeaderFormat,
      header_content: template.header_content ?? '',
      header_media_url: template.header_media_url ?? '',
      header_sample: template.sample_values?.header?.[0] ?? '',
      body_text: template.body_text,
      body_samples: template.sample_values?.body ?? [],
      footer_text: template.footer_text ?? '',
      buttons: template.buttons ?? [],
    });
    setDialogOpen(true);
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  async function readJsonResponse(
    response: Response
  ): Promise<Record<string, unknown>> {
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) return {};
    return (await response.json().catch(() => ({}))) as Record<string, unknown>;
  }

  async function handleSubmit() {
    // AUTHENTICATION is blocked by the persistent banner + disabled
    // submit button; this is a defensive second line of defense.
    if (form.category === 'Authentication') return;
    try {
      setSubmitting(true);
      const isEdit = editingId !== null;
      const url = isEdit
        ? `/api/whatsapp/templates/${editingId}`
        : '/api/whatsapp/templates/submit';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSubmitPayload()),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) {
        throw new Error(
          (typeof data.error === 'string' && data.error) ||
            `${isEdit ? 'Error al editar' : 'Error al enviar'} (HTTP ${res.status})`
        );
      }
      // Refresh first, then close — re-opening the dialog
      // immediately should not show a stale list.
      if (user) await fetchTemplates();
      toast.success(
        data.dry_run
          ? isEdit
            ? COPY.toastSaveEditDry
            : COPY.toastSaveNewDry
          : isEdit
            ? COPY.toastSubmitEditSuccess
            : COPY.toastSubmitNewSuccess
      );
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      console.error('Submit error:', err);
      toast.error(err instanceof Error ? err.message : COPY.toastSubmitFailed);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSyncFromMeta() {
    if (!user) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/whatsapp/templates/sync', {
        method: 'POST',
      });
      const data = await readJsonResponse(res);
      if (!res.ok) {
        throw new Error(
          (typeof data.error === 'string' && data.error) ||
            `Error al sincronizar (HTTP ${res.status})`
        );
      }
      toast.success(
        `${data.total} ${data.total === 1 ? 'plantilla sincronizada' : 'plantillas sincronizadas'} desde Meta` +
          (data.inserted || data.updated
            ? ` (${data.inserted} nuevas, ${data.updated} actualizadas)`
            : '')
      );
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        const preview = data.errors
          .slice(0, 3)
          .map(
            (e: { name: string; language: string; message: string }) =>
              `${e.name} (${e.language})`
          );
        const suffix =
          data.errors.length > 3 ? `, +${data.errors.length - 3} más` : '';
        toast.error(`Error al sincronizar: ${preview.join(', ')}${suffix}`);
      }
      if (data.truncated) {
        // Keep this long-lived because the truncated sync result requires
        // an operator follow-up before the local template list is complete.
        toast.error(COPY.toastSyncTruncated, { duration: 10000 });
      }
      await fetchTemplates();
    } catch (err) {
      console.error('Template sync error:', err);
      toast.error(err instanceof Error ? err.message : COPY.toastSyncError);
    } finally {
      setSyncing(false);
    }
  }

  async function deleteTemplate(target: MessageTemplate) {
    if (deletingId) return;
    const confirmed = await confirmDestructiveAction({
      title: COPY.deleteDialogTitle,
      text: target.meta_template_id
        ? `"${target.name}" se eliminará de Meta y de FuryLeeds. Las difusiones activas que la usen empezarán a fallar. Esta acción no se puede deshacer.`
        : `"${target.name}" se eliminará de FuryLeeds. Nunca se envió a Meta.`,
      confirmText: COPY.delete,
    });
    if (!confirmed) return;

    setDeletingId(target.id);
    try {
      // Route handler scopes the Meta delete via hsm_id (so sibling
      // language variants survive) and falls through to remove the
      // local row. Local-only rows skip the Meta call.
      const res = await fetch(`/api/whatsapp/templates/${target.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data?.error || `Error al eliminar (HTTP ${res.status})`
        );
      }
      toast.success(COPY.toastDeleteSuccess);
      setTemplates((prev) => prev.filter((t) => t.id !== target.id));
    } catch (err) {
      console.error('Delete error:', err);
      toast.error(err instanceof Error ? err.message : COPY.toastDeleteError);
    } finally {
      setDeletingId(null);
    }
  }

  // The patch type unions every field across button variants. The
  // conditional rendering below ensures only fields valid for the
  // current button's `type` reach this function, so the runtime
  // assertion + per-type spread preserves discriminated-union
  // invariants without forcing every call site to thread the type
  // through generics (which TS can't infer from a partial literal).
  type ButtonPatch = {
    text?: string;
    url?: string;
    phone_number?: string;
    example?: string;
  };
  function updateButton(index: number, patch: ButtonPatch) {
    setForm((prev) => {
      const current = prev.buttons[index];
      if (!current) return prev;
      const next = [...prev.buttons];
      // Per-variant spread keeps the discriminant pinned. Switch
      // exhaustiveness is enforced by TypeScript.
      switch (current.type) {
        case 'QUICK_REPLY':
          next[index] = {
            ...current,
            ...(patch.text !== undefined && { text: patch.text }),
          };
          break;
        case 'URL':
          next[index] = {
            ...current,
            ...(patch.text !== undefined && { text: patch.text }),
            ...(patch.url !== undefined && { url: patch.url }),
            ...(patch.example !== undefined && { example: patch.example }),
          };
          break;
        case 'PHONE_NUMBER':
          next[index] = {
            ...current,
            ...(patch.text !== undefined && { text: patch.text }),
            ...(patch.phone_number !== undefined && {
              phone_number: patch.phone_number,
            }),
          };
          break;
        case 'COPY_CODE':
          next[index] = {
            ...current,
            ...(patch.text !== undefined && { text: patch.text }),
            ...(patch.example !== undefined && { example: patch.example }),
          };
          break;
      }
      return { ...prev, buttons: next };
    });
  }

  function changeButtonType(index: number, type: TemplateButton['type']) {
    setForm((prev) => {
      const next = [...prev.buttons];
      next[index] = emptyButton(type);
      return { ...prev, buttons: next };
    });
  }

  function removeButton(index: number) {
    setForm((prev) => ({
      ...prev,
      buttons: prev.buttons.filter((_, i) => i !== index),
    }));
  }

  function addButton() {
    if (form.buttons.length >= TEMPLATE_LIMITS.maxButtonsTotal) return;
    setForm((prev) => ({
      ...prev,
      buttons: [...prev.buttons, emptyButton('QUICK_REPLY')],
    }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const headerNeedsMedia =
    form.header_format !== 'none' && form.header_format !== 'text';
  const headerMediaKind: MediaHeaderKind | null = isMediaHeaderKind(
    form.header_format
  )
    ? form.header_format
    : null;

  // Per-kind copy for the file picker. Kept as explicit key maps (not
  // `t(\`upload${kind}\`)`) so the catalogue scanner can see every key.
  const uploadLabels = {
    image: COPY.uploadImage,
    video: COPY.uploadVideo,
    document: COPY.uploadDocument,
  } as const;
  const uploadHints = {
    image: COPY.uploadHint,
    video: COPY.uploadHintVideo,
    document: COPY.uploadHintDocument,
  } as const;
  const invalidTypeMessages = {
    image: COPY.toastInvalidImage,
    video: COPY.toastInvalidVideo,
    document: COPY.toastInvalidDocument,
  } as const;

  async function handleHeaderMediaFile(file: File, kind: MediaHeaderKind) {
    if (!MEDIA_HEADER_SPECS[kind].mimeTypes.includes(file.type)) {
      toast.error(invalidTypeMessages[kind]);
      return;
    }
    // The upload lands in the chat-media bucket, whose 16 MB ceiling is
    // below Meta's 100 MB document cap — so this is the bucket-side
    // limit, not Meta's. A larger document can still be pasted as a link.
    const maxBytes = MEDIA_MAX_BYTES_BY_KIND[kind];
    if (file.size > maxBytes) {
      toast.error(
        `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB; el límite de carga es ${Math.round(maxBytes / 1024 / 1024)} MB.`
      );
      return;
    }
    setUploadingHeader(true);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      setForm((f) => ({ ...f, header_media_url: publicUrl }));
      toast.success(COPY.toastUploadSuccess);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : COPY.toastUploadFailed);
    } finally {
      setUploadingHeader(false);
    }
  }

  return (
    <section className="animate-in fade-in-50 space-y-4 duration-200">
      <SettingsPanelHead
        title={COPY.title}
        description={COPY.description}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleSyncFromMeta}
              disabled={syncing}
              title={COPY.syncTitle}
            >
              <RefreshCw
                className={`size-4 ${syncing ? 'animate-spin' : ''}`}
              />
              {syncing ? COPY.syncing : COPY.syncFromMeta}
            </Button>
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              {COPY.newTemplate}
            </Button>
          </div>
        }
      />

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground text-sm">{COPY.noTemplates}</p>
            <p className="text-muted-foreground text-xs mt-1">
              {COPY.createFirst}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {templates.map((template) => {
            const statusKey = template.status || 'DRAFT';
            const status = templateStatusConfig[statusKey];
            return (
              <Card key={template.id}>
                <CardContent className="flex items-start justify-between pt-4">
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-foreground">
                        {template.name}
                      </h3>
                      <Badge
                        className={`text-xs border ${categoryColors[template.category] || ''}`}
                      >
                        {CATEGORY_LABELS[template.category]}
                      </Badge>
                      <Badge className={`text-xs border ${status.classes}`}>
                        {status.label}
                      </Badge>
                      {template.language && (
                        <span className="text-xs text-muted-foreground uppercase">
                          {template.language}
                        </span>
                      )}
                      {template.quality_score && (
                        <span
                          className={`text-[10px] uppercase font-medium ${
                            template.quality_score === 'GREEN'
                              ? 'text-emerald-400'
                              : template.quality_score === 'YELLOW'
                                ? 'text-yellow-400'
                                : 'text-red-400'
                          }`}
                          title={COPY.qualityScoreTitle}
                        >
                          {template.quality_score}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {template.body_text}
                    </p>
                    {template.footer_text && (
                      <p className="text-xs text-muted-foreground italic">
                        {template.footer_text}
                      </p>
                    )}
                    {(template.rejection_reason ||
                      template.submission_error) && (
                      <div className="flex items-start gap-1.5 text-xs text-red-400 bg-red-950/20 border border-red-900/40 rounded px-2 py-1.5">
                        <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                        <span>
                          {template.rejection_reason ||
                            template.submission_error}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {statusKey === 'APPROVED' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(template)}
                        title={COPY.editTitle}
                        aria-label={COPY.editLabel}
                        className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-8 px-2"
                      >
                        <Pencil className="size-3.5" />
                        {COPY.edit}
                      </Button>
                    )}
                    {(statusKey === 'REJECTED' || statusKey === 'PAUSED') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(template)}
                        title={COPY.resubmitTitle}
                        aria-label={COPY.resubmitLabel}
                        className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-8 px-2"
                      >
                        <RotateCcw className="size-3.5" />
                        {COPY.resubmit}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteTemplate(template)}
                      disabled={deletingId === template.id}
                      aria-label={
                        template.meta_template_id
                          ? COPY.deleteMetaLocallyAria
                          : COPY.deleteLocallyAria
                      }
                      title={
                        template.meta_template_id
                          ? COPY.deleteMetaLocallyTitle
                          : COPY.deleteLocallyTitle
                      }
                      className="text-muted-foreground hover:text-red-400 hover:bg-red-950/30 h-8 w-8"
                    >
                      {deletingId === template.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingId(null);
            setForm(emptyForm);
          }
        }}
      >
        <DialogContent className="bg-popover border-border sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {editingId ? COPY.dialogEditTitle : COPY.dialogNewTitle}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {editingId ? COPY.dialogEditDesc : COPY.dialogNewDesc}
            </DialogDescription>
          </DialogHeader>

          {form.category === 'Authentication' && (
            <div className="flex items-start gap-2 rounded border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <p>
                Las plantillas de AUTENTICACIÓN tienen un formato fijo de cuerpo
                + botón OTP que necesita otro constructor. Por ahora, créalas en
                el Administrador de WhatsApp de Meta y usa{' '}
                <strong>Sincronizar desde Meta</strong> para traerlas.
              </p>
            </div>
          )}

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-muted-foreground">
                {COPY.templateName}
              </Label>
              <Input
                placeholder={COPY.namePlaceholder}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={editingId !== null}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <p className="text-[11px] text-muted-foreground">
                {editingId ? COPY.nameFixed : COPY.nameHint}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">{COPY.category}</Label>
                <Select
                  value={form.category}
                  onValueChange={(val) =>
                    setForm({
                      ...form,
                      category: val as MessageTemplate['category'],
                    })
                  }
                >
                  <SelectTrigger className="w-full bg-muted border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {CATEGORIES.map((cat) => (
                      <SelectItem
                        key={cat}
                        value={cat}
                        className="text-popover-foreground focus:bg-muted focus:text-popover-foreground"
                      >
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">{COPY.language}</Label>
                <Input
                  list="template-language-codes"
                  placeholder="en_US"
                  value={form.language}
                  onChange={(e) =>
                    setForm({ ...form, language: e.target.value })
                  }
                  disabled={editingId !== null}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <datalist id="template-language-codes">
                  {COMMON_LANGUAGE_CODES.map((code) => (
                    <option key={code} value={code} />
                  ))}
                </datalist>
                <p className="text-[11px] text-muted-foreground">
                  {editingId ? (
                    COPY.langFixed
                  ) : (
                    <span>
                      Debe coincidir exactamente con el código en Meta:{' '}
                      <code>en_US</code> y <code>en</code> son distintos.
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">{COPY.header}</Label>
              <Select
                value={form.header_format}
                onValueChange={(val) =>
                  // Preserve header_content, header_media_url, and
                  // header_sample across format switches. The submit
                  // payload builder only reads the field that matches
                  // the active format, so an orphan value on a hidden
                  // field is harmless — and keeping it lets the user
                  // switch formats to compare without losing typing.
                  setForm({
                    ...form,
                    header_format: (val || 'none') as HeaderFormat,
                  })
                }
              >
                <SelectTrigger className="w-full bg-muted border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {HEADER_FORMATS.map((type) => (
                    <SelectItem
                      key={type}
                      value={type}
                      className="text-popover-foreground focus:bg-muted focus:text-popover-foreground"
                    >
                      {type === 'none'
                        ? COPY.headerNone
                        : type === 'text'
                          ? COPY.headerText
                          : type === 'image'
                            ? COPY.headerImage
                            : type === 'video'
                              ? COPY.headerVideo
                              : COPY.headerDocument}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {form.header_format === 'text' && (
                <div className="space-y-2 mt-2">
                  <Input
                    id="template-header-text"
                    aria-label={COPY.headerTextLabel}
                    placeholder={COPY.headerTextPlaceholder}
                    value={form.header_content}
                    onChange={(e) =>
                      setForm({ ...form, header_content: e.target.value })
                    }
                    maxLength={TEMPLATE_LIMITS.headerTextMaxLength}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                  {headerVarCount > 0 && (
                    <Input
                      id="template-header-sample"
                      aria-label={COPY.headerSampleAria}
                      placeholder={COPY.headerSamplePlaceholder}
                      value={form.header_sample}
                      onChange={(e) =>
                        setForm({ ...form, header_sample: e.target.value })
                      }
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                    />
                  )}
                </div>
              )}

              {headerNeedsMedia && (
                <div className="space-y-2 mt-2">
                  {headerMediaKind && (
                    <div className="flex items-center gap-2">
                      <input
                        ref={headerFileRef}
                        type="file"
                        accept={MEDIA_HEADER_SPECS[
                          headerMediaKind
                        ].mimeTypes.join(',')}
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleHeaderMediaFile(f, headerMediaKind);
                          e.target.value = '';
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploadingHeader}
                        onClick={() => headerFileRef.current?.click()}
                      >
                        {uploadingHeader ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                        {uploadLabels[headerMediaKind]}
                      </Button>
                      <span className="text-[11px] text-muted-foreground">
                        {uploadHints[headerMediaKind]}
                      </span>
                    </div>
                  )}
                  <Input
                    placeholder={`https://… (o pega un enlace público de ${HEADER_FORMAT_LABELS[form.header_format].toLowerCase()})`}
                    value={form.header_media_url}
                    onChange={(e) =>
                      setForm({ ...form, header_media_url: e.target.value })
                    }
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                  {form.header_format === 'image' && form.header_media_url && (
                    <Image
                      src={form.header_media_url}
                      alt="Muestra del encabezado"
                      width={224}
                      height={112}
                      unoptimized
                      className="max-h-28 w-auto rounded-md border border-border object-contain"
                    />
                  )}
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {form.header_format === 'image'
                      ? COPY.imageHint
                      : COPY.mediaHint}
                    {form.header_format === 'video' && COPY.videoHint}
                    {form.header_format === 'document' && COPY.documentHint}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">{COPY.bodyText}</Label>
              <Textarea
                placeholder={COPY.bodyPlaceholder}
                value={form.body_text}
                onChange={(e) =>
                  setForm({ ...form, body_text: e.target.value })
                }
                rows={4}
                maxLength={TEMPLATE_LIMITS.bodyMaxLength}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none"
              />
              <p className="text-[11px] text-muted-foreground">
                {COPY.bodyHint}
              </p>

              {bodyVarCount > 0 && (
                <div className="space-y-1.5 pt-1">
                  <Label className="text-[11px] text-muted-foreground">
                    {COPY.sampleValues}
                  </Label>
                  {extractVariableIndices(form.body_text).map(
                    (variableIndex, i) => {
                      const val = form.body_samples[i] ?? '';
                      const inputId = `template-body-sample-${variableIndex}`;
                      return (
                        <Input
                          key={variableIndex}
                          id={inputId}
                          aria-label={`Valor de ejemplo para la variable del cuerpo {{${i + 1}}}`}
                          placeholder={`Ejemplo para {{${i + 1}}}`}
                          value={val}
                          onChange={(e) => {
                            const next = [...form.body_samples];
                            next[i] = e.target.value;
                            setForm({ ...form, body_samples: next });
                          }}
                          className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                        />
                      );
                    }
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">{COPY.footer}</Label>
              <Input
                placeholder={COPY.footerPlaceholder}
                value={form.footer_text}
                onChange={(e) =>
                  setForm({ ...form, footer_text: e.target.value })
                }
                maxLength={TEMPLATE_LIMITS.footerMaxLength}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-muted-foreground">{COPY.buttons}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addButton}
                  disabled={
                    form.buttons.length >= TEMPLATE_LIMITS.maxButtonsTotal
                  }
                  className="border-border bg-transparent text-muted-foreground hover:bg-muted h-7 text-xs"
                >
                  <Plus className="size-3" />
                  {COPY.addButton}
                </Button>
              </div>
              {form.buttons.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {`Hasta ${TEMPLATE_LIMITS.maxButtonsTotal} botones. Los botones QUICK_REPLY deben ir antes de los botones de URL / teléfono / copiar código.`}
                </p>
              ) : (
                <div className="space-y-2">
                  {form.buttons.map((btn, i) => (
                    <div
                      key={JSON.stringify(btn)}
                      className="space-y-2 rounded border border-border bg-muted/50 p-2"
                    >
                      <div className="flex items-center gap-2">
                        <Select
                          value={btn.type}
                          onValueChange={(val) => {
                            // Same null guard as the Header Select
                            // (per PR 148): @base-ui Select fires
                            // onValueChange(null) on deselect.
                            if (!val) return;
                            changeButtonType(i, val as TemplateButton['type']);
                          }}
                        >
                          <SelectTrigger className="w-40 bg-muted border-border text-foreground h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-popover border-border">
                            <SelectItem
                              value="QUICK_REPLY"
                              className="text-popover-foreground focus:bg-muted focus:text-popover-foreground"
                            >
                              {COPY.btnQuickReply}
                            </SelectItem>
                            <SelectItem
                              value="URL"
                              className="text-popover-foreground focus:bg-muted focus:text-popover-foreground"
                            >
                              {COPY.btnUrl}
                            </SelectItem>
                            <SelectItem
                              value="PHONE_NUMBER"
                              className="text-popover-foreground focus:bg-muted focus:text-popover-foreground"
                            >
                              {COPY.btnPhone}
                            </SelectItem>
                            <SelectItem
                              value="COPY_CODE"
                              className="text-popover-foreground focus:bg-muted focus:text-popover-foreground"
                            >
                              {COPY.btnCopyCode}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder={COPY.btnLabelPlaceholder}
                          value={btn.text}
                          maxLength={TEMPLATE_LIMITS.buttonTextMaxLength}
                          onChange={(e) =>
                            updateButton(i, { text: e.target.value })
                          }
                          className="flex-1 bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-xs"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeButton(i)}
                          className="text-muted-foreground hover:text-red-400 hover:bg-red-950/30 size-7"
                          aria-label={`Eliminar botón ${i + 1}`}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                      {btn.type === 'URL' && (
                        <div className="space-y-1 pl-1">
                          <Input
                            placeholder={COPY.urlPlaceholder}
                            value={btn.url}
                            onChange={(e) =>
                              updateButton(i, { url: e.target.value })
                            }
                            className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-xs"
                          />
                          {extractVariableIndices(btn.url).length > 0 && (
                            <Input
                              placeholder={COPY.urlSamplePlaceholder}
                              value={btn.example ?? ''}
                              onChange={(e) =>
                                updateButton(i, { example: e.target.value })
                              }
                              className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-xs"
                            />
                          )}
                        </div>
                      )}
                      {btn.type === 'PHONE_NUMBER' && (
                        <Input
                          placeholder={COPY.phonePlaceholder}
                          value={btn.phone_number}
                          onChange={(e) =>
                            updateButton(i, { phone_number: e.target.value })
                          }
                          className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-xs"
                        />
                      )}
                      {btn.type === 'COPY_CODE' && (
                        <Input
                          placeholder={COPY.codePlaceholder}
                          value={btn.example}
                          onChange={(e) =>
                            updateButton(i, { example: e.target.value })
                          }
                          className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-xs"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {COPY.cancel}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || form.category === 'Authentication'}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {editingId ? COPY.saving : COPY.submitting}
                </>
              ) : editingId ? (
                COPY.saveResubmit
              ) : (
                COPY.submitApproval
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
