'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  XCircle,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/use-auth';
import { confirmDestructiveAction } from '@/lib/action-alerts';
import { toast } from '@/lib/notifications';
import { SettingsPanelHead } from './settings-panel-head';

const COPY = {
  accessToken: 'Token de acceso permanente',
  accessTokenPlaceholder: 'Ingresa tu token de acceso',
  accessTokenRequired:
    'El token de acceso es obligatorio para la configuración inicial',
  apiConnectionFailed: 'Error de conexión con la API',
  apiConnectionOk: 'Conexión con la API exitosa',
  apiCredentialsDesc:
    'Ingresa tus credenciales de la API de WhatsApp Business de Meta.',
  apiCredentialsTitle: 'Credenciales de la API',
  connectedDesc:
    'Tu token de acceso se autentica con Meta. Revisa el estado de registro abajo para saber si los webhooks están realmente conectados.',
  connectedGeneric:
    'WhatsApp conectado. Los eventos empezarán a llegar en menos de un minuto.',
  connectedTo: 'Conectado a {name}',
  connectionTestFailed:
    'La prueba de conexión falló. Revisa la red e inténtalo de nuevo.',
  credentialsValid: 'Credenciales válidas',
  description:
    'Conecta tu API de WhatsApp Business de Meta. Credenciales, webhook y pasos de configuración, todo está aquí.',
  diagnosticLastRun: 'Diagnóstico — última ejecución: ',
  fullyWired:
    'El número está completamente conectado: Meta está entregando eventos.',
  lastAttemptFailed: 'El último intento falló con: ',
  lastSaveFailed: 'El último guardado falló',
  live: 'activo',
  liveWithName: 'Activo: {name} ya puede recibir eventos.',
  loadFailed: 'Error al cargar la configuración de WhatsApp',
  mediaDesc:
    'Meta elimina los archivos recibidos unos 30 días después de su llegada. Los adjuntos pueden copiarse a tu propio almacenamiento para que sigan visibles.',
  mediaTitle: 'Almacenamiento de adjuntos',
  metaDocs: 'Documentación de la API de WhatsApp de Meta',
  metaErrorCode: 'Código de error de Meta',
  metaErrorDetailsHint: 'Cita estos detalles al contactar al soporte de Meta.',
  metaErrorMessage: 'Respuesta de Meta',
  metaErrorStep: 'Paso',
  metaErrorTrace: 'Trace ID',
  mirrorInbound: 'Conservar adjuntos entrantes',
  mirrorInboundDesc:
    'Guarda una copia de cada foto, video, nota de voz y documento que envían los clientes. Usa el almacenamiento de tu cuenta; los archivos de más de 16 MB se omiten.',
  mirrorInboundOffWarning:
    'Los nuevos adjuntos dejarán de copiarse y quedarán inaccesibles unos 30 días después de su llegada.',
  mirrorInboundSaveFailed:
    'No se pudo actualizar la configuración de adjuntos.',
  noRegistrationHint:
    'Este número se guardó antes de que existiera el seguimiento de registro, o el registro se omitió. Ingresa el PIN de dos pasos abajo y haz clic en Guardar configuración para suscribirlo.',
  notConnected: 'No conectado',
  notConnectedDesc:
    'Configura abajo tus credenciales de la API de Meta para conectar tu cuenta de WhatsApp Business.',
  notFullyRegistered:
    'El número no está completamente registrado. Revisa abajo qué paso falló.',
  notLive: 'inactivo',
  notRegistered: 'No registrado: Meta no entregará eventos',
  optional: '(opcional)',
  phoneNumberId: 'Phone Number ID',
  phoneNumberIdNotNumeric:
    'El Phone Number ID debe contener solo dígitos. Copia el id numérico desde Meta → WhatsApp → Configuración de la API, no el número de teléfono en sí.',
  phoneNumberIdPlaceholder: 'p. ej. 100234567890123',
  phoneNumberIdRequired: 'El Phone Number ID es obligatorio',
  pinHint:
    'Solo se necesita para recibir mensajes entrantes en un número de producción. Configúralo en Meta Business Manager → Cuentas de WhatsApp → Números de teléfono → Verificación en dos pasos y pégalo aquí para que FuryLeeds pueda suscribir el número; de lo contrario, Meta envía los eventos entrantes a la última app que reclamó el número (el síntoma que afecta a segundos números bajo una WABA compartida). Los números de prueba de Meta no tienen PIN y ya vienen registrados: déjalo en blanco para ellos. Dejarlo en blanco también mantiene intacto un registro existente.',
  pinPlaceholder: 'PIN de 6 dígitos del Administrador de WhatsApp de Meta',
  reenterAccessToken:
    'Vuelve a ingresar el token de acceso para guardar los cambios',
  registered: 'Registrado: Meta entregará los eventos a FuryLeeds',
  resetConfig: 'Restablecer configuración',
  resetConfirm:
    'Esto eliminará la configuración actual de WhatsApp para que puedas ingresarla de nuevo. ¿Continuar?',
  resetDone:
    'Configuración borrada. Ya puedes volver a ingresar tus credenciales.',
  resetFailed: 'Error al restablecer la configuración',
  resetting: 'Restableciendo...',
  retryHint:
    'Ingresa (o corrige) el PIN de dos pasos abajo y haz clic en Guardar configuración para reintentar.',
  saveConfig: 'Guardar configuración',
  saveFailed: 'Error al guardar la configuración',
  savedButRegistrationFailed:
    'Guardado, pero Meta no pudo registrar el número: {error}',
  savedRegistrationSkipped:
    'Credenciales guardadas y verificadas. El registro de entrada se omitió (sin PIN); revisa el estado de registro abajo.',
  saving: 'Guardando...',
  setupInstructions: 'Instrucciones de configuración',
  setupInstructionsDesc:
    'Sigue estos pasos para conectar tu API de WhatsApp Business.',
  step1: 'Crea una app en Meta',
  step1_1: 'Ve a developers.facebook.com',
  step1_2: 'Haz clic en "Mis apps" y luego en "Crear app"',
  step1_3: 'Selecciona "Empresa" como tipo de app',
  step1_4: 'Completa los datos de la app y créala',
  step2: 'Agrega el producto WhatsApp',
  step2_1: 'En el panel de tu app, haz clic en "Agregar producto"',
  step2_2: 'Busca "WhatsApp" y haz clic en "Configurar"',
  step2_3: 'Sigue el asistente de configuración para vincular tu empresa',
  step3: 'Obtén las credenciales de la API',
  step3_1: 'Ve a WhatsApp > Configuración de la API',
  step3_2: 'Copia tu <strong class="text-foreground">Phone Number ID</strong>',
  step3_3:
    'Copia tu <strong class="text-foreground">ID de la cuenta de WhatsApp Business</strong>',
  step3_4:
    'Genera un <strong class="text-foreground">Token de acceso permanente</strong> en Configuración del negocio > Usuarios del sistema',
  step4: 'Configura los webhooks',
  step4_1: 'Ve a WhatsApp > Configuración',
  step4_2: 'Haz clic en "Editar" en la sección Webhook',
  step4_3:
    'Pega la <strong class="text-foreground">URL de callback del webhook</strong> de arriba',
  step4_4:
    'Ingresa el mismo <strong class="text-foreground">Token de verificación</strong> que configuraste aquí',
  step4_5: 'Suscríbete al campo de webhook "messages"',
  subscribedSince:
    'Suscrito desde {date}. Haz clic en Verificar con Meta si los eventos dejan de llegar.',
  testConnection: 'Probar conexión con la API',
  testing: 'Probando...',
  title: 'Conexión con WhatsApp',
  tokenCorrupted: 'No se puede descifrar el token almacenado',
  tokenHidden:
    'El token está oculto por seguridad. Vuelve a ingresarlo para actualizar la configuración.',
  twoStepPin: 'PIN de verificación en dos pasos',
  unknownDate: 'desconocida',
  verifyEndpointUnreachable: 'No se pudo acceder al endpoint de verificación.',
  verifyWithMeta: 'Verificar con Meta',
  wabaId: 'ID de la cuenta de WhatsApp Business',
  wabaIdNotNumeric:
    'El ID de la cuenta de WhatsApp Business debe contener solo dígitos. Cópialo desde Meta → WhatsApp → Configuración de la API.',
  wabaIdPlaceholder: 'p. ej. 100234567890456',
  wabaNotSubscribed:
    'La cuenta de WhatsApp Business no está suscrita a esta app, así que Meta no entregará webhooks entrantes. Vuelve a ingresar el token de acceso y guarda de nuevo para suscribirla.',
  wabaSubscribed:
    'La cuenta de WhatsApp Business está suscrita a esta app: los webhooks entrantes pueden entregarse.',
  webhookCopied: 'URL del webhook copiada al portapapeles',
  webhookDesc:
    'Usa esta URL como callback del webhook en el panel de la app de Meta.',
  webhookTitle: 'Configuración del webhook',
  webhookUrl: 'URL de callback del webhook',
  webhookVerifyToken: 'Token de verificación del webhook',
  webhookVerifyTokenHint:
    'Una cadena personalizada que tú creas. Debe coincidir con el token que configuraste en los ajustes de webhook de Meta.',
  webhookVerifyTokenPlaceholder: 'Crea un token de verificación personalizado',
} as const;

const MASKED_TOKEN = '••••••••••••••••';

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';
type ResetReason = 'token_corrupted' | 'meta_api_error' | null;

// Meta ids are decimal digit strings — mirrors the server-side check in
// POST /api/whatsapp/config so the obvious paste mistakes get a named
// field before a round-trip.
const META_ID_RE = /^\d+$/;

// `meta` object the config route attaches to every failed Meta call
// (issue #505): what a user quotes to Meta support.
type MetaErrorMeta = {
  code: number | null;
  subcode: number | null;
  fbtrace_id: string | null;
  step: string;
  field?: string | null;
  message?: string | null;
};
type MetaFailure = { message: string; meta: MetaErrorMeta | null };
type WabaSubscription = {
  checked: boolean;
  subscribed: boolean | null;
  app_id_match: boolean | null;
  error?: string;
};

type SafeWhatsAppConfig = {
  id: string;
  user_id: string;
  phone_number_id: string;
  waba_id: string | null;
  status: 'connected' | 'disconnected';
  connected_at: string | null;
  registered_at: string | null;
  subscribed_apps_at: string | null;
  last_registration_error: string | null;
  mirror_inbound_media: boolean;
};

export function WhatsAppConfig() {
  const {
    user,
    accountId,
    loading: authLoading,
    profileLoading,
    canEditSettings,
  } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [config, setConfig] = useState<SafeWhatsAppConfig | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('unknown');
  const [resetReason, setResetReason] = useState<ResetReason>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  // Structured details of the last failed Meta call (health check or
  // save) — rendered as small muted text under the actionable message.
  const [statusMeta, setStatusMeta] = useState<MetaErrorMeta | null>(null);
  const [saveFailure, setSaveFailure] = useState<MetaFailure | null>(null);
  const [wabaSubscription, setWabaSubscription] =
    useState<WabaSubscription | null>(null);
  // Guards against re-hydrating the form when auth state refreshes for
  // reasons unrelated to switching accounts. Without this, that churn
  // overwrites form values the user has typed but not saved yet.
  const loadedAccountIdRef = useRef<string | null>(null);

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [pin, setPin] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);

  // Inbound-media mirror (issue #466). Unlike everything else on this
  // page it is NOT part of handleSave: that path insists on re-entering
  // the access token so it can re-verify with Meta, which is unnecessary
  // for flipping a boolean. The dedicated API limits this update to admins.
  const [mirrorMedia, setMirrorMedia] = useState(true);
  const [savingMirror, setSavingMirror] = useState(false);

  // True once /register has succeeded on Meta's side (timestamp set
  // in the row). When false, the saved config is metadata-only and
  // Meta will silently drop every inbound event — that's the
  // multi-number bug that prompted this work.
  const isRegistered = Boolean(config?.registered_at);
  const lastRegistrationError = config?.last_registration_error ?? null;

  const [verifyingRegistration, setVerifyingRegistration] = useState(false);
  type RegistrationProbe = {
    live: boolean;
    checks: Record<string, boolean | null>;
    errors?: string[];
    last_registration_error?: string | null;
    registered_at?: string | null;
    subscribed_apps_at?: string | null;
  };
  const [registrationProbe, setRegistrationProbe] =
    useState<RegistrationProbe | null>(null);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook`
      : '';

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const detailsResponse = await fetch('/api/whatsapp/config/details', {
        cache: 'no-store',
      });
      if (!detailsResponse.ok) {
        const details = await detailsResponse.json();
        throw new Error(details.error || COPY.loadFailed);
      }
      const details = await detailsResponse.json();
      const data = details.config as SafeWhatsAppConfig | null;

      if (data) {
        setConfig(data);
        setPhoneNumberId(data.phone_number_id || '');
        setWabaId(data.waba_id || '');
        setAccessToken(MASKED_TOKEN);
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);
        setMirrorMedia(data.mirror_inbound_media !== false);
      } else {
        setConfig(null);
        setPhoneNumberId('');
        setWabaId('');
        setAccessToken('');
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);
        setMirrorMedia(true);
      }
      setRegistrationProbe(null);

      if (data) {
        const healthResponse = await fetch('/api/whatsapp/config', {
          cache: 'no-store',
        });
        if (!healthResponse.ok) {
          const payload = await healthResponse.json();
          throw new Error(payload.error || COPY.apiConnectionFailed);
        }
        const payload = await healthResponse.json();

        if (payload.connected) {
          setConnectionStatus('connected');
          setResetReason(null);
          setStatusMessage('');
          setStatusMeta(null);
          setWabaSubscription(payload.waba_subscription ?? null);
        } else {
          setConnectionStatus('disconnected');
          setResetReason(
            payload.needs_reset
              ? 'token_corrupted'
              : payload.reason === 'meta_api_error'
                ? 'meta_api_error'
                : null
          );
          setStatusMessage(payload.message || '');
          setStatusMeta(payload.meta ?? null);
          setWabaSubscription(null);
        }
      } else {
        setConnectionStatus('disconnected');
        setResetReason(null);
        setStatusMessage('');
        setStatusMeta(null);
        setWabaSubscription(null);
      }
    } catch (err) {
      console.error('fetchConfig error:', err);
      setConnectionStatus('disconnected');
      toast.error(COPY.loadFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Need both the auth session (`!authLoading`) AND the profile
    // (`!profileLoading`, which carries `accountId`). Without the
    // second guard, the effect would fire with `accountId === null`
    // for the first render window and bail without ever retrying
    // once the profile arrives.
    if (authLoading || profileLoading) return;
    if (!user || !accountId) {
      loadedAccountIdRef.current = null;
      setLoading(false);
      return;
    }
    if (loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    fetchConfig();
  }, [authLoading, profileLoading, user?.id, accountId, fetchConfig, user]);

  async function handleToggleMirrorMedia(next: boolean) {
    if (!config || savingMirror) return;
    // Optimistic — the switch should feel instant; a failure rolls it
    // back rather than leaving the UI ahead of the row.
    const previous = mirrorMedia;
    setMirrorMedia(next);
    setSavingMirror(true);
    try {
      const response = await fetch('/api/whatsapp/config/details', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mirror_inbound_media: next }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || COPY.mirrorInboundSaveFailed);
      }
      const data = await response.json();
      setConfig(data.config);
    } catch (error) {
      console.error('Failed to update media retention setting:', error);
      setMirrorMedia(previous);
      toast.error(COPY.mirrorInboundSaveFailed);
    } finally {
      setSavingMirror(false);
    }
  }

  async function handleSave() {
    if (!phoneNumberId.trim()) {
      toast.error(COPY.phoneNumberIdRequired);
      return;
    }
    if (!META_ID_RE.test(phoneNumberId.trim())) {
      toast.error(COPY.phoneNumberIdNotNumeric);
      return;
    }
    if (wabaId.trim() && !META_ID_RE.test(wabaId.trim())) {
      toast.error(COPY.wabaIdNotNumeric);
      return;
    }
    if (!config && (!accessToken.trim() || !tokenEdited)) {
      toast.error(COPY.accessTokenRequired);
      return;
    }

    try {
      setSaving(true);

      // Always POST through the API — it verifies with Meta and encrypts
      // the access_token server-side with ENCRYPTION_KEY. Client-side
      // persistence would expose plaintext and break subsequent health checks.
      const payload: Record<string, unknown> = {
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim() || null,
        verify_token: verifyToken.trim() || null,
        // Optional — only sent when the user filled it in. The server
        // requires it on first save or when changing numbers; for a
        // simple token rotation, leaving it blank skips re-register.
        pin: pin.trim() || null,
      };

      if (tokenEdited && accessToken !== MASKED_TOKEN && accessToken.trim()) {
        payload.access_token = accessToken.trim();
      } else if (config) {
        // Existing config — reuse stored encrypted token by decrypting on the
        // server. But our POST handler requires an access_token to verify
        // with Meta. If the user didn't change the token, we need to signal
        // that. Simplest: require token re-entry if they're updating.
        toast.error(COPY.reenterAccessToken);
        return;
      }

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        // The route names the failing step and which field to check
        // (issue #505). Keep the details on screen — a toast is too
        // short-lived to copy a trace id out of.
        setSaveFailure({
          message: data.error || COPY.saveFailed,
          meta: data.meta ?? null,
        });
        toast.error(data.error || COPY.saveFailed, { duration: 10000 });
        return;
      }
      const data = await res.json();
      setSaveFailure(null);

      // The route now returns a structured outcome:
      //   * registered=true   → number is live, events will flow
      //   * registered=false  → credentials saved but /register
      //                         failed; UI shows the specific error
      //                         and a retry path. registration_error
      //                         is human-readable from Meta.
      if (data.registered === false && data.registration_error) {
        setSaveFailure({
          message: `Guardado, pero Meta no pudo registrar el número: ${data.registration_error}`,
          meta: data.meta ?? null,
        });
        toast.error(
          `Guardado, pero Meta no pudo registrar el número: ${data.registration_error}`,
          { duration: 12000 }
        );
      } else if (data.registration_skipped) {
        // Credentials saved + verified, but /register was skipped
        // because no PIN was supplied (e.g. a Meta test number).
        // Don't claim the number is "Live" — point at the
        // Registration status banner instead.
        toast.success(COPY.savedRegistrationSkipped, { duration: 10000 });
        setPin('');
      } else {
        toast.success(
          data.phone_info?.verified_name
            ? `Activo: ${data.phone_info.verified_name} ya puede recibir eventos.`
            : COPY.connectedGeneric
        );
        // Clear the PIN so subsequent saves don't accidentally
        // re-register (which would void the active subscription if
        // the PIN became stale).
        setPin('');
      }

      await fetchConfig();
    } catch (err) {
      console.error('Save error:', err);
      toast.error(COPY.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'GET' });
      if (!res.ok) {
        const payload = await res.json();
        setConnectionStatus('disconnected');
        setResetReason(
          payload.needs_reset
            ? 'token_corrupted'
            : payload.reason === 'meta_api_error'
              ? 'meta_api_error'
              : null
        );
        setStatusMessage(payload.message || '');
        setStatusMeta(payload.meta ?? null);
        setWabaSubscription(null);
        toast.error(payload.message || COPY.apiConnectionFailed, {
          duration: 10000,
        });
        return;
      }
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setResetReason(null);
        setStatusMessage('');
        setStatusMeta(null);
        setWabaSubscription(payload.waba_subscription ?? null);
        toast.success(
          payload.phone_info?.verified_name
            ? `Conectado a ${payload.phone_info.verified_name}`
            : COPY.apiConnectionOk
        );
      } else {
        setConnectionStatus('disconnected');
        setResetReason(
          payload.needs_reset
            ? 'token_corrupted'
            : payload.reason === 'meta_api_error'
              ? 'meta_api_error'
              : null
        );
        setStatusMessage(payload.message || '');
        setStatusMeta(payload.meta ?? null);
        setWabaSubscription(null);
        toast.error(payload.message || COPY.apiConnectionFailed, {
          duration: 10000,
        });
      }
    } catch (err) {
      console.error('Test connection error:', err);
      setConnectionStatus('disconnected');
      toast.error(COPY.connectionTestFailed);
    } finally {
      setTesting(false);
    }
  }

  async function handleVerifyRegistration() {
    setVerifyingRegistration(true);
    setRegistrationProbe(null);
    try {
      const res = await fetch('/api/whatsapp/config/verify-registration', {
        method: 'GET',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as RegistrationProbe;
      setRegistrationProbe(data);
      if (data.live) {
        toast.success(COPY.fullyWired);
      } else {
        toast.error(COPY.notFullyRegistered, { duration: 8000 });
      }
      await fetchConfig();
    } catch (err) {
      console.error('verify-registration failed:', err);
      toast.error(COPY.verifyEndpointUnreachable);
    } finally {
      setVerifyingRegistration(false);
    }
  }

  async function handleReset() {
    const confirmed = await confirmDestructiveAction({
      title: '¿Eliminar la configuración de WhatsApp?',
      text: COPY.resetConfirm,
      confirmText: 'Eliminar configuración',
    });
    if (!confirmed) return;

    try {
      setResetting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || COPY.resetFailed);
        return;
      }

      toast.success(COPY.resetDone);
      setConfig(null);
      setPhoneNumberId('');
      setWabaId('');
      setAccessToken('');
      setVerifyToken('');
      setTokenEdited(false);
      setConnectionStatus('disconnected');
      setResetReason(null);
      setStatusMessage('');
      setStatusMeta(null);
      setSaveFailure(null);
      setWabaSubscription(null);
    } catch (err) {
      console.error('Reset error:', err);
      toast.error(COPY.resetFailed);
    } finally {
      setResetting(false);
    }
  }

  function handleCopyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success(COPY.webhookCopied);
  }

  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead title={COPY.title} description={COPY.description} />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  const showResetBanner = resetReason === 'token_corrupted';

  // Step + code + trace id in small muted text, so a user can quote
  // them to Meta support (issue #505). The step names are wire values
  // from the route, shown verbatim.
  const renderMetaDetails = (meta: MetaErrorMeta) => (
    <div className="mt-2 space-y-0.5 text-[11px] leading-relaxed text-muted-foreground break-all">
      <p>
        {COPY.metaErrorStep}: <code>{meta.step}</code>
        {meta.code !== null && meta.code !== undefined && (
          <>
            {' · '}
            {COPY.metaErrorCode}:{' '}
            <code>
              {meta.code}
              {meta.subcode !== null && meta.subcode !== undefined
                ? `/${meta.subcode}`
                : ''}
            </code>
          </>
        )}
        {meta.fbtrace_id && (
          <>
            {' · '}
            {COPY.metaErrorTrace}: <code>{meta.fbtrace_id}</code>
          </>
        )}
      </p>
      {meta.message && (
        <p>
          {COPY.metaErrorMessage}: {meta.message}
        </p>
      )}
      <p>{COPY.metaErrorDetailsHint}</p>
    </div>
  );

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={COPY.title} description={COPY.description} />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Main config form */}
        <div className="space-y-6">
          {/* Corrupted-token reset banner */}
          {showResetBanner && (
            <Alert className="bg-amber-950/40 border-amber-600/40">
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-5 text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <AlertTitle className="text-amber-200 mb-1">
                    {COPY.tokenCorrupted}
                  </AlertTitle>
                  <AlertDescription className="text-amber-100/80 text-sm">
                    {statusMessage}
                  </AlertDescription>
                  <Button
                    onClick={handleReset}
                    disabled={resetting}
                    size="sm"
                    className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {resetting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {COPY.resetting}
                      </>
                    ) : (
                      <>
                        <RotateCcw className="size-4" />
                        {COPY.resetConfig}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Alert>
          )}

          {/* Last save failed — why, which field, and what to quote to Meta */}
          {saveFailure && (
            <Alert className="bg-red-950/30 border-red-700/50">
              <div className="flex items-start gap-3">
                <XCircle className="size-5 text-red-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <AlertTitle className="text-red-200 mb-1">
                    {COPY.lastSaveFailed}
                  </AlertTitle>
                  <AlertDescription className="text-red-100/80 text-sm">
                    {saveFailure.message}
                  </AlertDescription>
                  {saveFailure.meta && renderMetaDetails(saveFailure.meta)}
                </div>
              </div>
            </Alert>
          )}

          {/* Connection Status */}
          <Alert className="bg-card border-border">
            <div className="flex items-center gap-2">
              {connectionStatus === 'connected' ? (
                <CheckCircle2 className="size-4 text-primary" />
              ) : (
                <XCircle className="size-4 text-red-500" />
              )}
              <AlertTitle className="text-foreground mb-0">
                {connectionStatus === 'connected'
                  ? COPY.credentialsValid
                  : COPY.notConnected}
              </AlertTitle>
            </div>
            <AlertDescription className="text-muted-foreground">
              {connectionStatus === 'connected'
                ? COPY.connectedDesc
                : statusMessage || COPY.notConnectedDesc}
            </AlertDescription>
            {connectionStatus === 'connected' && wabaSubscription?.checked && (
              <p
                className={
                  'mt-1 text-xs ' +
                  (wabaSubscription.subscribed === false
                    ? 'text-amber-300'
                    : 'text-muted-foreground')
                }
              >
                {wabaSubscription.subscribed === false
                  ? COPY.wabaNotSubscribed
                  : wabaSubscription.subscribed === true
                    ? COPY.wabaSubscribed
                    : wabaSubscription.error}
              </p>
            )}
            {connectionStatus !== 'connected' &&
              statusMeta &&
              renderMetaDetails(statusMeta)}
          </Alert>

          {/* Registration Status — the "is it actually live?" check.
            Credentials being valid is necessary but not sufficient;
            without a successful /register call the number won't
            receive inbound events. Surface this dimension separately
            so users don't trust a misleading green banner. */}
          {config && (
            <Alert
              className={
                isRegistered
                  ? 'bg-emerald-950/30 border-emerald-700/50'
                  : 'bg-amber-950/30 border-amber-700/50'
              }
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  {isRegistered ? (
                    <CheckCircle2 className="size-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="size-4 text-amber-400" />
                  )}
                  <AlertTitle
                    className={
                      'mb-0 ' +
                      (isRegistered ? 'text-emerald-200' : 'text-amber-200')
                    }
                  >
                    {isRegistered ? COPY.registered : COPY.notRegistered}
                  </AlertTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleVerifyRegistration}
                  disabled={verifyingRegistration}
                  className="border-border bg-transparent text-foreground hover:bg-muted h-7"
                >
                  {verifyingRegistration ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Zap className="size-3.5" />
                  )}
                  {COPY.verifyWithMeta}
                </Button>
              </div>
              <AlertDescription className="text-muted-foreground mt-2 text-xs leading-relaxed">
                {isRegistered ? (
                  <span>
                    Suscrito desde{' '}
                    {config.registered_at
                      ? new Date(config.registered_at).toLocaleString('es')
                      : COPY.unknownDate}
                    . Haz clic en Verificar con Meta si los eventos dejan de
                    llegar.
                  </span>
                ) : lastRegistrationError ? (
                  <>
                    {COPY.lastAttemptFailed}
                    <span className="text-red-300">
                      &quot;{lastRegistrationError}&quot;
                    </span>
                    . {COPY.retryHint}
                  </>
                ) : (
                  COPY.noRegistrationHint
                )}
              </AlertDescription>

              {registrationProbe && (
                <div className="mt-3 rounded border border-border bg-card/60 px-3 py-2 space-y-1.5 text-[11px]">
                  <p className="font-medium text-foreground">
                    {COPY.diagnosticLastRun}
                    <span
                      className={
                        registrationProbe.live
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }
                    >
                      {registrationProbe.live ? COPY.live : COPY.notLive}
                    </span>
                  </p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {Object.entries(registrationProbe.checks).map(([k, v]) => (
                      <li key={k} className="flex items-center gap-1.5">
                        {v === true ? (
                          <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
                        ) : v === false ? (
                          <XCircle className="size-3 text-red-400 shrink-0" />
                        ) : (
                          <span className="size-3 rounded-full border border-border shrink-0" />
                        )}
                        <code className="text-muted-foreground">{k}</code>
                      </li>
                    ))}
                  </ul>
                  {(registrationProbe.errors ?? []).length > 0 && (
                    <ul className="pt-1 space-y-0.5 text-red-300">
                      {registrationProbe.errors?.map((error) => (
                        <li key={error}>• {error}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Alert>
          )}

          {/* API Credentials */}
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">
                {COPY.apiCredentialsTitle}
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {COPY.apiCredentialsDesc}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  {COPY.phoneNumberId}
                </Label>
                <Input
                  placeholder={COPY.phoneNumberIdPlaceholder}
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">{COPY.wabaId}</Label>
                <Input
                  placeholder={COPY.wabaIdPlaceholder}
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  {COPY.accessToken}
                </Label>
                <div className="relative">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    placeholder={COPY.accessTokenPlaceholder}
                    value={accessToken}
                    onChange={(e) => {
                      setAccessToken(e.target.value);
                      setTokenEdited(true);
                    }}
                    onFocus={() => {
                      if (accessToken === MASKED_TOKEN) {
                        setAccessToken('');
                        setTokenEdited(true);
                      }
                    }}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={
                      showToken
                        ? 'Ocultar token de acceso'
                        : 'Mostrar token de acceso'
                    }
                  >
                    {showToken ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                {config && !tokenEdited && (
                  <p className="text-xs text-muted-foreground">
                    {COPY.tokenHidden}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  {COPY.webhookVerifyToken}
                </Label>
                <Input
                  placeholder={COPY.webhookVerifyTokenPlaceholder}
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value)}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  {COPY.webhookVerifyTokenHint}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  {COPY.twoStepPin}
                  <span className="ml-1 text-muted-foreground">
                    {COPY.optional}
                  </span>
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={COPY.pinPlaceholder}
                  value={pin}
                  onChange={(e) =>
                    setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground tracking-widest"
                />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {COPY.pinHint}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Webhook URL */}
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">
                {COPY.webhookTitle}
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {COPY.webhookDesc}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  {COPY.webhookUrl}
                </Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={webhookUrl}
                    className="bg-muted border-border text-muted-foreground font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyWebhookUrl}
                    className="shrink-0 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                    aria-label="Copiar URL del webhook"
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Attachment retention. Only meaningful once a number is
            connected, since it governs what the webhook does with
            inbound media. */}
          {config && (
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">
                  {COPY.mediaTitle}
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  {COPY.mediaDesc}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {COPY.mirrorInbound}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {COPY.mirrorInboundDesc}
                    </p>
                    {!mirrorMedia && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                        {COPY.mirrorInboundOffWarning}
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={mirrorMedia}
                    onCheckedChange={handleToggleMirrorMedia}
                    disabled={savingMirror || !canEditSettings}
                    aria-label={COPY.mirrorInbound}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {COPY.saving}
                </>
              ) : (
                COPY.saveConfig
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || !config}
              className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              {testing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {COPY.testing}
                </>
              ) : (
                <>
                  <Zap className="size-4" />
                  {COPY.testConnection}
                </>
              )}
            </Button>
            {config && (
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={resetting}
                className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40"
              >
                {resetting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {COPY.resetting}
                  </>
                ) : (
                  <>
                    <RotateCcw className="size-4" />
                    {COPY.resetConfig}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Setup Instructions Sidebar */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground text-base">
                {COPY.setupInstructions}
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {COPY.setupInstructionsDesc}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion>
                <AccordionItem className="border-border">
                  <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                    <span className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        1
                      </span>
                      {COPY.step1}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>{COPY.step1_1}</li>
                      <li>{COPY.step1_2}</li>
                      <li>{COPY.step1_3}</li>
                      <li>{COPY.step1_4}</li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem className="border-border">
                  <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                    <span className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        2
                      </span>
                      {COPY.step2}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>{COPY.step2_1}</li>
                      <li>{COPY.step2_2}</li>
                      <li>{COPY.step2_3}</li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem className="border-border">
                  <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                    <span className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        3
                      </span>
                      {COPY.step3}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>{COPY.step3_1}</li>
                      <li>
                        Copia tu{' '}
                        <strong className="text-foreground">
                          Phone Number ID
                        </strong>
                      </li>
                      <li>
                        Copia tu{' '}
                        <strong className="text-foreground">
                          ID de la cuenta de WhatsApp Business
                        </strong>
                      </li>
                      <li>
                        Genera un{' '}
                        <strong className="text-foreground">
                          Token de acceso permanente
                        </strong>{' '}
                        en Configuración del negocio &gt; Usuarios del sistema
                      </li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem className="border-border">
                  <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                    <span className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        4
                      </span>
                      {COPY.step4}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>{COPY.step4_1}</li>
                      <li>{COPY.step4_2}</li>
                      <li>
                        Pega la{' '}
                        <strong className="text-foreground">
                          URL de callback del webhook
                        </strong>{' '}
                        de arriba
                      </li>
                      <li>
                        Ingresa el mismo{' '}
                        <strong className="text-foreground">
                          Token de verificación
                        </strong>{' '}
                        que configuraste aquí
                      </li>
                      <li>{COPY.step4_5}</li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="mt-4 pt-4 border-t border-border">
                <a
                  href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  <ExternalLink className="size-3.5" />
                  {COPY.metaDocs}
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
