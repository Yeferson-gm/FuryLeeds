'use client';

import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { fetchAccountMembers, memberLabel } from '@/lib/account/members';
import { confirmDestructiveAction } from '@/lib/action-alerts';
import { AI_PROVIDER_DEFAULT_MODEL } from '@/lib/ai/defaults';
import type { AiProvider } from '@/lib/ai/types';
import { canEditSettings } from '@/lib/auth/roles';
import { toast } from '@/lib/notifications';
import type { AccountMember } from '@/types';
import { AiKnowledgeCard } from './ai-knowledge';
import { SettingsPanelHead } from './settings-panel-head';

const COPY = {
  adminOnlyConfig:
    'Solo los administradores y propietarios pueden cambiar la configuración de IA.',
  apiKey: 'Clave de API',
  autoReply: 'Responder automáticamente a mensajes entrantes',
  autoReplyDesc:
    'El bot responde automáticamente a los nuevos mensajes entrantes (solo cuando ningún flujo los atiende y no hay agente asignado). Deriva a una persona cuando no puede ayudar.',
  behaviour: 'Comportamiento',
  behaviourDesc:
    'Cuéntale al asistente sobre tu negocio: productos, tono, qué puede y qué no puede prometer. Este contexto alimenta tanto los borradores como las respuestas automáticas.',
  businessContext: 'Contexto del negocio e instrucciones',
  description:
    'Usa tu propia clave de OpenAI o Anthropic. FuryLeeds llama al proveedor directamente con tu clave: sin cargos de IA por usuario, y tus datos siguen siendo tuyos. Esto impulsa las respuestas redactadas con IA en la bandeja de entrada, el bot de respuesta automática y el Playground.',
  embeddingsHint:
    'Una clave de OpenAI que se usa solo para generar embeddings de tu base de conocimiento (text-embedding-3-small){sameKeyText}. Déjala en blanco para usar búsqueda por palabras clave. Bórrala para desactivar la búsqueda semántica.',
  embeddingsKey: 'Clave de embeddings',
  enableAssistant: 'Activar asistente de IA',
  enableAssistantDesc:
    'Interruptor general. Activa el botón “Redactar con IA” en la bandeja de entrada.',
  encryptionNotice:
    'Tu clave se cifra en reposo (AES-256-GCM) y no se vuelve a mostrar después de guardarla.',
  handoffQueue: 'Cola sin asignar (cualquier agente puede tomarlo)',
  handoffTo: 'Derivar a',
  handoffToDesc:
    'Cuando el bot no puede ayudar, o alcanza el límite de respuestas, se pausa y dirige el chat aquí, con una breve nota de lo que pasó.',
  loadFailed: 'Error al cargar la configuración de IA',
  maxAutoReplies: 'Máximo de respuestas automáticas por conversación',
  maxAutoRepliesDesc:
    'Después de esta cantidad de respuestas del bot en un mismo hilo, el bot guarda silencio.',
  missingApiKey: 'Ingresa tu clave de API.',
  missingModel: 'Ingresa el nombre de un modelo.',
  model: 'Modelo',
  optionalSemanticSearch:
    '(opcional: habilita la búsqueda semántica en la base de conocimiento)',
  promptPlaceholder:
    'p. ej. Somos Acme, una tienda de equipos para café. Sé cálido y conciso. Nunca des precios ni fechas de entrega; deriva a una persona para eso.',
  provider: 'Proveedor',
  providerAndKey: 'Proveedor y clave',
  remove: 'Quitar',
  removeFailed: 'Error al eliminar.',
  removeSuccess: 'Configuración de IA eliminada.',
  sameKeyText: ': puede ser la misma clave de arriba',
  save: 'Guardar',
  saveFailed: 'Error al guardar.',
  saveSuccess: 'Asistente de IA guardado.',
  testKey: 'Probar clave',
  testNetworkError: 'No se pudo conectar con el proveedor.',
  testRejected: 'El proveedor rechazó la solicitud.',
  testSuccess: 'La clave funciona: el proveedor respondió.',
  title: 'Configuración del agente',
} as const;

const MASKED_KEY = '••••••••••••••••';

// Radix Select can't use an empty-string item value, so the "leave
// unassigned" choice gets a sentinel that maps to null in the payload.
const HANDOFF_QUEUE = '__queue__';

const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
};

const KEY_PLACEHOLDER: Record<AiProvider, string> = {
  openai: 'sk-...',
  anthropic: 'sk-ant-...',
};

export function AiConfig() {
  const { accountId, accountRole, profileLoading } = useAuth();
  const canEdit = accountRole ? canEditSettings(accountRole) : false;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [configured, setConfigured] = useState(false);
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [model, setModel] = useState(AI_PROVIDER_DEFAULT_MODEL.openai);
  const [apiKey, setApiKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [embeddingsKey, setEmbeddingsKey] = useState('');
  const [embeddingsKeyEdited, setEmbeddingsKeyEdited] = useState(false);
  const [hasStoredEmbeddingsKey, setHasStoredEmbeddingsKey] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [maxPerConversation, setMaxPerConversation] = useState(3);
  // Empty string = leave unassigned (shared queue).
  const [handoffAgentId, setHandoffAgentId] = useState('');
  const [members, setMembers] = useState<AccountMember[]>([]);

  // Guard keyed on the account (not a bare boolean) so an in-place
  // account switch — ownership transfer, multi-account membership —
  // refetches instead of showing the previous account's config. Mirrors
  // the loadedAccountIdRef pattern in whatsapp-config.tsx.
  const loadedAccountIdRef = useRef<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/config');
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? COPY.loadFailed);
        return;
      }
      if (data.configured) {
        setConfigured(true);
        setProvider(data.provider);
        setModel(data.model);
        setSystemPrompt(data.system_prompt ?? '');
        setIsActive(data.is_active);
        setAutoReplyEnabled(data.auto_reply_enabled);
        setMaxPerConversation(data.auto_reply_max_per_conversation ?? 3);
        setHandoffAgentId(data.handoff_agent_id ?? '');
        setHasStoredKey(Boolean(data.has_key));
        setApiKey(data.has_key ? MASKED_KEY : '');
        setKeyEdited(false);
        setHasStoredEmbeddingsKey(Boolean(data.has_embeddings_key));
        setEmbeddingsKey(data.has_embeddings_key ? MASKED_KEY : '');
        setEmbeddingsKeyEdited(false);
      }
    } catch {
      toast.error(COPY.loadFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!accountId || loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    void fetchConfig();
    // Members populate the handoff-target picker. Best-effort — on an
    // older deployment without the endpoint the picker just shows the
    // queue option.
    void fetchAccountMembers().then(setMembers);
  }, [accountId, fetchConfig]);

  // Swap the model default when the provider changes, unless the user
  // typed a custom model.
  const handleProviderChange = (next: AiProvider) => {
    setProvider(next);
    const isDefaultModel =
      model === AI_PROVIDER_DEFAULT_MODEL.openai ||
      model === AI_PROVIDER_DEFAULT_MODEL.anthropic ||
      model.trim() === '';
    if (isDefaultModel) setModel(AI_PROVIDER_DEFAULT_MODEL[next]);
  };

  const keyPayload = () => (keyEdited ? apiKey.trim() : undefined);

  // undefined = leave unchanged; '' typed = null (clear); text = set.
  const embeddingsKeyPayload = () =>
    embeddingsKeyEdited ? embeddingsKey.trim() || null : undefined;

  const buildBody = () => ({
    provider,
    model: model.trim(),
    api_key: keyPayload(),
    embeddings_api_key: embeddingsKeyPayload(),
    system_prompt: systemPrompt.trim() || null,
    is_active: isActive,
    auto_reply_enabled: autoReplyEnabled,
    auto_reply_max_per_conversation: maxPerConversation,
    handoff_agent_id: handoffAgentId || null,
  });

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model: model.trim(),
          api_key: keyPayload(),
        }),
      });
      const data = await res.json();
      if (res.ok) toast.success(COPY.testSuccess);
      else toast.error(data.error ?? COPY.testRejected);
    } catch {
      toast.error(COPY.testNetworkError);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!model.trim()) {
      toast.error(COPY.missingModel);
      return;
    }
    if (!configured && !keyEdited) {
      toast.error(COPY.missingApiKey);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(COPY.saveSuccess);
        await fetchConfig();
      } else {
        toast.error(data.error ?? COPY.saveFailed);
      }
    } catch {
      toast.error(COPY.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    const confirmed = await confirmDestructiveAction({
      title: '¿Quitar la configuración de IA?',
      text: 'Se eliminarán las claves cifradas y se desactivarán los borradores y respuestas automáticas.',
      confirmText: 'Quitar configuración',
    });
    if (!confirmed) return;

    setRemoving(true);
    try {
      const res = await fetch('/api/ai/config', { method: 'DELETE' });
      if (res.ok) {
        toast.success(COPY.removeSuccess);
        setConfigured(false);
        setHasStoredKey(false);
        setApiKey('');
        setKeyEdited(false);
        setIsActive(false);
        setAutoReplyEnabled(false);
        setSystemPrompt('');
        setHandoffAgentId('');
      } else {
        const data = await res.json();
        toast.error(data.error ?? COPY.removeFailed);
      }
    } catch {
      toast.error(COPY.removeFailed);
    } finally {
      setRemoving(false);
    }
  };

  if (loading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
      </div>
    );
  }

  const disabled = !canEdit || saving;

  return (
    <div>
      <SettingsPanelHead title={COPY.title} description={COPY.description} />

      {!canEdit && (
        <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {COPY.adminOnlyConfig}
        </p>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />{' '}
              {COPY.providerAndKey}
            </CardTitle>
            <CardDescription>{COPY.encryptionNotice}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{COPY.provider}</Label>
                <Select
                  value={provider}
                  onValueChange={(v) => handleProviderChange(v as AiProvider)}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">
                      {PROVIDER_LABEL.openai}
                    </SelectItem>
                    <SelectItem value="anthropic">
                      {PROVIDER_LABEL.anthropic}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-model">{COPY.model}</Label>
                <Input
                  id="ai-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={AI_PROVIDER_DEFAULT_MODEL[provider]}
                  disabled={disabled}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-key">{COPY.apiKey}</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="ai-key"
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setKeyEdited(true);
                    }}
                    onFocus={() => {
                      if (!keyEdited && hasStoredKey) {
                        setApiKey('');
                        setKeyEdited(true);
                      }
                    }}
                    placeholder={KEY_PLACEHOLDER[provider]}
                    disabled={disabled}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={
                      showKey ? 'Ocultar clave de API' : 'Mostrar clave de API'
                    }
                  >
                    {showKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <Button
                  variant="outline"
                  onClick={handleTest}
                  disabled={disabled || testing}
                >
                  {testing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  {COPY.testKey}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-embeddings-key">
                {COPY.embeddingsKey}{' '}
                <span className="font-normal text-muted-foreground">
                  {COPY.optionalSemanticSearch}
                </span>
              </Label>
              <Input
                id="ai-embeddings-key"
                type="password"
                value={embeddingsKey}
                onChange={(e) => {
                  setEmbeddingsKey(e.target.value);
                  setEmbeddingsKeyEdited(true);
                }}
                onFocus={() => {
                  if (!embeddingsKeyEdited && hasStoredEmbeddingsKey) {
                    setEmbeddingsKey('');
                    setEmbeddingsKeyEdited(true);
                  }
                }}
                placeholder="sk-... (OpenAI)"
                disabled={disabled}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                {`Una clave de OpenAI que se usa solo para generar embeddings de tu base de conocimiento (text-embedding-3-small)${provider === 'openai' ? COPY.sameKeyText : ''}. Déjala en blanco para usar búsqueda por palabras clave. Bórrala para desactivar la búsqueda semántica.`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{COPY.behaviour}</CardTitle>
            <CardDescription>{COPY.behaviourDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ai-prompt">{COPY.businessContext}</Label>
              <Textarea
                id="ai-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder={COPY.promptPlaceholder}
                rows={5}
                disabled={disabled}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {COPY.enableAssistant}
                </p>
                <p className="text-xs text-muted-foreground">
                  {COPY.enableAssistantDesc}
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={disabled}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {COPY.autoReply}
                </p>
                <p className="text-xs text-muted-foreground">
                  {COPY.autoReplyDesc}
                </p>
              </div>
              <Switch
                checked={autoReplyEnabled}
                onCheckedChange={setAutoReplyEnabled}
                disabled={disabled || !isActive}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="ai-max">{COPY.maxAutoReplies}</Label>
                <p className="text-xs text-muted-foreground">
                  {COPY.maxAutoRepliesDesc}
                </p>
              </div>
              <Input
                id="ai-max"
                type="number"
                min={1}
                max={20}
                value={maxPerConversation}
                onChange={(e) =>
                  setMaxPerConversation(
                    Math.min(20, Math.max(1, Number(e.target.value) || 1))
                  )
                }
                disabled={disabled || !autoReplyEnabled}
                className="w-20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-handoff">{COPY.handoffTo}</Label>
              <p className="text-xs text-muted-foreground">
                {COPY.handoffToDesc}
              </p>
              <Select
                value={handoffAgentId || HANDOFF_QUEUE}
                onValueChange={(v) =>
                  setHandoffAgentId(!v || v === HANDOFF_QUEUE ? '' : v)
                }
                disabled={disabled || !autoReplyEnabled}
              >
                <SelectTrigger id="ai-handoff">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={HANDOFF_QUEUE}>
                    {COPY.handoffQueue}
                  </SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {memberLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <AiKnowledgeCard
          accountId={accountId}
          canEdit={canEdit}
          hasEmbeddingsKey={
            embeddingsKeyEdited
              ? embeddingsKey.trim().length > 0
              : hasStoredEmbeddingsKey
          }
        />

        <div className="flex items-center justify-between">
          {configured ? (
            <Button
              variant="ghost"
              onClick={handleRemove}
              disabled={!canEdit || removing}
              className="text-destructive hover:text-destructive"
            >
              {removing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {COPY.remove}
            </Button>
          ) : (
            <span />
          )}

          <Button onClick={handleSave} disabled={disabled}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {COPY.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
