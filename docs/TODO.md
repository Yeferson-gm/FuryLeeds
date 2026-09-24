# TODO técnico y operativo de FuryLeeds

Este archivo registra deuda o hallazgos reales que están fuera del cambio activo. No sustituye un issue tracker ni convierte propuestas en arquitectura aceptada. Al resolver una entrada, actualizar también el documento dueño, `MEMORY.md`, las pruebas y, si corresponde, [`arquitecture/decisions.md`](arquitecture/decisions.md).

## Prioridad P0 — bloqueos de producción

### Operación de PostgreSQL y recuperación

- **Fecha:** 2026-09-24
- **Área:** Base de datos / operaciones
- **Contexto:** No están definidos el hosting final de PostgreSQL, backups off-host, cifrado, retención, RPO/RTO, responsable de restauración ni simulacros de restore.
- **Impacto:** Un fallo o una migración destructiva puede producir pérdida de datos sin una recuperación verificable.
- **Siguiente paso sugerido:** Adoptar la arquitectura de backup/restore, ejecutar una restauración completa sobre un entorno aislado y documentar evidencia, tiempos y responsables.

### Verificación real del deployment Dokploy

- **Fecha:** 2026-09-24
- **Área:** Deployment
- **Contexto:** Ya existen Dockerfile multi-stage, contexto mínimo, usuario no root, endpoint `/health` y contrato Dokploy/Dockerfile, pero en este entorno no está instalado Docker y todavía no se ejecutó un despliegue staging real.
- **Impacto:** La configuración estática puede contener una incompatibilidad que solo aparezca al construir la imagen o al pasar por Traefik/Swarm.
- **Siguiente paso sugerido:** Construir la etapa `runner` en un host Docker, desplegar en Dokploy staging y verificar health transition, HTTPS, login, migración one-off, WebSocket `/socket.io`, SIGTERM y rollback `start-first`.

### Compatibilidad de embeddings

- **Fecha:** 2026-09-24
- **Área:** IA / base de datos
- **Contexto:** `ai_knowledge_chunks.embedding` aparece como `real[]`, mientras consultas de recuperación usan semántica `vector(1536)` y el operador `<=>`.
- **Impacto:** La recuperación semántica puede fallar en runtime o producir una falsa expectativa de RAG listo para producción.
- **Siguiente paso sugerido:** Elegir `pgvector` o una estrategia compatible, crear migración, verificar extensión/tipo/índice/dimensiones y añadir pruebas de indexación y búsqueda. Hasta entonces mantener fallback FTS y no declarar semantic retrieval listo.

### Normalización telefónica generada

- **Fecha:** 2026-09-24
- **Área:** Contactos / migraciones
- **Contexto:** Existe una posible diferencia entre la expresión de normalización definida en Drizzle y la expresión presente en el SQL de migración aplanado.
- **Impacto:** Dedupe, unicidad o búsquedas por teléfono podrían comportarse distinto entre una base creada desde migraciones y el modelo esperado por código.
- **Siguiente paso sugerido:** Aplicar migraciones en PostgreSQL desechable, inspeccionar la expresión efectiva y probar números representativos antes de corregir mediante una nueva migración.

## Prioridad P1 — seguridad, confiabilidad y escalado

### Cola durable para trabajo asíncrono

- **Fecha:** 2026-09-24
- **Área:** Arquitectura / background jobs
- **Contexto:** Next `after()` mantiene trabajo tras la respuesta, pero no sobrevive de forma garantizada a terminación del proceso y está acotado por la ejecución de la ruta.
- **Impacto:** Webhooks entrantes, broadcasts u otros efectos pueden quedar incompletos durante reinicios, timeouts o fallos.
- **Siguiente paso sugerido:** Diseñar jobs persistidos con estado, lease, idempotencia, reintentos, backoff, dead-letter/reconciliación y observabilidad antes de mover efectos críticos.

### Reintentos de webhooks salientes

- **Fecha:** 2026-09-24
- **Área:** API pública / webhooks
- **Contexto:** Las entregas a clientes son best-effort, tienen un único intento de cinco segundos y no existe ledger durable de entregas/reintentos.
- **Impacto:** Eventos se pierden ante fallos transitorios y el consumidor no puede recuperar un historial confiable.
- **Siguiente paso sugerido:** Integrar las entregas en la futura cola durable, persistir intentos/respuesta segura y definir política de backoff, desactivación, retención y replay autorizado.

### Reconciliación Meta versus persistencia local

- **Fecha:** 2026-09-24
- **Área:** WhatsApp / mensajería
- **Contexto:** Meta puede aceptar un envío y luego fallar la inserción o actualización local.
- **Impacto:** El destinatario recibe el mensaje mientras la interfaz no lo muestra o intenta reenviarlo, generando divergencia y duplicados.
- **Siguiente paso sugerido:** Definir idempotency/correlation IDs y un proceso de reconciliación que registre estados parciales sin reenviar ciegamente.

### Rate limiting distribuido

- **Fecha:** 2026-09-24
- **Área:** Seguridad / escalado
- **Contexto:** Los contadores actuales viven en memoria y son independientes por proceso.
- **Impacto:** Reinicios y múltiples réplicas reinician o multiplican límites; no son controles globales.
- **Siguiente paso sugerido:** Antes de escalar horizontalmente, elegir un backend/algoritmo distribuido, definir identidad y política de fallo, y añadir pruebas multiinstancia.

### Socket.IO multiinstancia

- **Fecha:** 2026-09-24
- **Área:** Realtime / escalado
- **Contexto:** Socket.IO usa adapter en memoria. PostgreSQL puede notificar a varios listeners, pero rooms y sockets permanecen por proceso.
- **Impacto:** Escalar sin diseño puede perder emisiones, duplicar trabajo o romper afinidad de conexiones.
- **Siguiente paso sugerido:** Adoptar adapter, sticky routing y responsabilidades de listener/worker; validar reconexión y entrega a rooms en varias réplicas. No sustituirlo por polling.

### CSP solo report-only

- **Fecha:** 2026-09-24
- **Área:** Seguridad de navegador
- **Contexto:** La Content Security Policy actual reporta violaciones pero no las bloquea.
- **Impacto:** La política no reduce activamente el impacto de inyección de contenido/script en producción.
- **Siguiente paso sugerido:** Recolectar reportes, eliminar violaciones legítimas, diseñar nonces/hashes si hacen falta y pasar a enforcement con rollout medido.

### Credenciales de IA sin cifrado de aplicación

- **Fecha:** 2026-09-24
- **Área:** IA / secretos
- **Contexto:** `ai_configs.api_key` y `embeddings_api_key` son columnas de texto; no se observó cifrado de aplicación equivalente al usado para Meta/webhooks.
- **Impacto:** Una lectura de base de datos expone claves financiadas por los clientes.
- **Siguiente paso sugerido:** Diseñar migración y rotación hacia AES-256-GCM, evitar exponer valores existentes y documentar recuperación cuando la clave maestra cambia.

### Política de trusted proxy para límites por IP

- **Fecha:** 2026-09-24
- **Área:** Seguridad / deployment
- **Contexto:** Algunos límites usan el primer valor de `x-forwarded-for`; aún no está definido qué proxy puede escribirlo.
- **Impacto:** Un cliente que alcance directamente la app podría falsificar IP y evadir límites o contaminar observabilidad.
- **Siguiente paso sugerido:** Bloquear acceso directo, definir cadena de proxies confiables y normalizar la IP únicamente desde headers garantizados por ingress.

### CI/CD y checks requeridos

- **Fecha:** 2026-09-24
- **Área:** Entrega / calidad
- **Contexto:** No hay workflow CI activo verificado ni política adoptada de branches, revisión, releases o checks obligatorios.
- **Impacto:** Cambios con errores pueden desplegarse sin una puerta reproducible de calidad y seguridad.
- **Siguiente paso sugerido:** Adoptar el flujo, ejecutar Bun/TypeScript/Biome/tests/build/Drizzle/link checks en CI y definir responsables de aprobación y releases.

### Observabilidad e incidentes

- **Fecha:** 2026-09-24
- **Área:** Operaciones
- **Contexto:** No están adoptados agregación de logs, métricas, trazas/error tracking, alertas, retención, SLO ni rutas de escalamiento.
- **Impacto:** Fallos de Meta, ChatSend, Imgora, PostgreSQL, cron o realtime pueden permanecer invisibles o ser difíciles de diagnosticar.
- **Siguiente paso sugerido:** Definir señales mínimas sin PII/secretos, dashboards, umbrales, alertas accionables y procedimiento de incidentes.

## Prioridad P2 — completitud funcional

### Productor de `conversation_assigned`

- **Fecha:** 2026-09-24
- **Área:** Notificaciones
- **Contexto:** El tipo de notificación `conversation_assigned` está soportado, pero no se encontró un productor activo de filas asociado a la asignación.
- **Impacto:** La interfaz puede prometer alertas de asignación que nunca se generan.
- **Siguiente paso sugerido:** Confirmar la experiencia deseada e insertar la notificación transaccionalmente al cambiar assignee, con deduplicación y pruebas tenant/user.

### Fuentes automáticas de triggers de automations

- **Fecha:** 2026-09-24
- **Área:** Automations
- **Contexto:** Existen triggers `conversation_assigned` y `time_based`, pero no se identificó una fuente automática completa para ejecutarlos.
- **Impacto:** Reglas configurables pueden parecer activas y no dispararse.
- **Siguiente paso sugerido:** Mapear cada trigger a un productor explícito, definir idempotencia/ventana temporal y añadir pruebas end-to-end del evento al log de ejecución.

### Nodo `http_fetch` de flows

- **Fecha:** 2026-09-24
- **Área:** Flows / seguridad
- **Contexto:** El esquema permite `http_fetch`, pero tipos y runtime del ejecutor no lo implementan completamente.
- **Impacto:** Un flow puede guardar una capacidad que no se ejecuta; una implementación apresurada también introduciría SSRF y filtración de datos.
- **Siguiente paso sugerido:** Mantener rechazo de activación hasta definir contrato, allow-list/SSRF, secretos, timeout, límites, respuesta, retries y pruebas; o retirar el nodo mediante migración si no será soportado.

### Endpoint de inicio manual de flows

- **Fecha:** 2026-09-24
- **Área:** Flows / API
- **Contexto:** El modelo contempla trigger manual, pero no existe un endpoint dedicado para iniciar una ejecución con contrato y autorización claros.
- **Impacto:** La funcionalidad no es accesible de forma estable o puede terminar acoplada a rutas no diseñadas para ello.
- **Siguiente paso sugerido:** Definir usuario/API, rol/scope, conversación, idempotencia, respuesta, realtime y auditoría; luego implementar ruta y pruebas.

### Round robin real en automations

- **Fecha:** 2026-09-24
- **Área:** Automations / asignación
- **Contexto:** La acción denominada round robin selecciona el primer perfil elegible y no mantiene cursor o historial de rotación.
- **Impacto:** La carga no se distribuye y el nombre de la opción induce expectativas incorrectas.
- **Siguiente paso sugerido:** Definir algoritmo, elegibilidad, concurrencia y persistencia del cursor; implementar selección atómica y pruebas simultáneas, o renombrar la acción a su comportamiento real.

### Timezone por cuenta o usuario

- **Fecha:** 2026-09-24
- **Área:** Dashboard / reporting
- **Contexto:** Las métricas temporales usan la zona horaria local del servidor y no existe preferencia de cuenta/usuario.
- **Impacto:** Rangos diarios y gráficos pueden diferir del calendario comercial del cliente.
- **Siguiente paso sugerido:** Adoptar timezone IANA, definir almacenamiento y fallback, ejecutar agregaciones con zona explícita y probar cambios de día/DST.

### ChatSend: timeout, reutilización y retry

- **Fecha:** 2026-09-24
- **Área:** Autenticación / correo
- **Contexto:** El adapter obtiene un bearer por envío y no define timeout, cache seguro ni política de retry.
- **Impacto:** Una caída de ChatSend puede prolongar requests de auth y aumentar intercambios de tokens; retries improvisados podrían duplicar correo.
- **Siguiente paso sugerido:** Medir primero; luego definir timeout abortable, reutilización segura limitada por expiración y retry solo con la idempotencia documentada.

### Escaneo de flows activos

- **Fecha:** 2026-09-24
- **Área:** Flows / cron
- **Contexto:** El sweep de expiración carga actualmente todos los runs activos y evalúa el timeout de cada flow.
- **Impacto:** El trabajo y memoria crecen con el número de ejecuciones activas.
- **Siguiente paso sugerido:** Añadir expiración consultable/índice o consulta acotada por lotes, con claim concurrente e instrumentación.

## Bloqueo local conocido

### Aplicación de migraciones pendiente

- **Fecha:** 2026-09-24
- **Área:** Desarrollo local / base de datos
- **Contexto:** La última ejecución de `bun run db:migrate` falló porque el `DATABASE_URL` activo contenía el usuario placeholder `USUARIO`.
- **Impacto:** No existe evidencia de que las migraciones `0002` y `0003` estén aplicadas en la base autorizada.
- **Siguiente paso sugerido:** Configurar localmente una URL real sin publicarla, ejecutar la migración y realizar smoke tests de login, Socket.IO e inbox. No marcar esta entrada resuelta solo porque el SQL existe.
