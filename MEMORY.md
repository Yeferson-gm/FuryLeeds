# FuryLeeds — Memoria viva del proyecto

> Este archivo conserva el estado que los próximos agentes necesitan conocer sin reconstruir la conversación. Debe actualizarse cuando termina un hito, cambia una decisión, aparece un bloqueo o cambia la siguiente prioridad.

## Estado actual — 2026-09-24

FuryLeeds ya está migrado a una arquitectura propia sobre VPS:

- Bun como runtime, package manager, test runner y proveedor SQL nativo.
- Next.js 16 + React 19.
- PostgreSQL local como única base de datos.
- Drizzle ORM/Kit para esquema y migraciones.
- Better Auth para correo/contraseña y Google OAuth.
- ChatSend para correo transaccional de autenticación.
- Imgora para archivos persistentes externos al VPS.
- Meta WhatsApp Cloud API.
- Socket.IO WebSocket-only con PostgreSQL `LISTEN/NOTIFY`.
- Multi-tenancy por `account_id` y roles `owner`, `admin`, `agent`, `viewer`; `superadmin` es un rol de sistema.

Supabase e InsForge no forman parte del runtime ni de la arquitectura activa.

## Trabajo completado recientemente

### Identidad FuryLeeds y repositorio

- `FuryLeeds` es la única marca visible y documental; `furyleeds` queda reservado a identificadores técnicos que requieren minúsculas.
- Se migraron package/metadata, Better Auth, correos, UI, CSS, localStorage/eventos, prefijo `furyleeds_live_`, headers `X-FuryLeeds-*`, realtime PostgreSQL, pruebas, ejemplos, Docker y documentación.
- El cambio invalida intencionalmente API keys del prefijo retirado y reinicia preferencias locales del navegador bajo las claves nuevas; no existe shim de doble identidad.
- El repositorio canónico pasa a `git@github.com:Yeferson-gm/FuryLeeds.git`; el remoto anterior debe quedar eliminado antes del primer push.

### Modernización y calidad

- Dependencias principales actualizadas a versiones estables vigentes compatibles.
- TypeScript estricto, Biome y build de Next limpios.
- Tailwind v4/PostCSS/Drizzle modernizados sin shims legacy.
- Eliminados adaptadores y contratos residuales estilo Supabase.
- Eliminado AES-CBC; cifrado reversible activo únicamente con AES-256-GCM.
- Eliminada compatibilidad antigua del endpoint de broadcast.
- Eliminados componentes UI y columnas de perfil huérfanos.
- Mejorado manejo de `fetch`, accesibilidad, object URLs, búsquedas con Set/Map, formateadores y context providers.
- React Doctor bajó de 150 a 129 recomendaciones; las restantes son mayormente refactors estructurales o heurísticas que requieren evaluación semántica.

### Deployment y propiedad

- FuryLeeds quedó declarado como software privado propietario de CEDURS TECHNOLOGY GROUP S.A.C. en `LICENCE.md` y `package.json` usa `UNLICENSED`.
- El deployment aceptado es Dokploy Application con método Dockerfile, contexto `.`, etapa final `runner` y puerto interno `3000`.
- `Dockerfile` usa Bun 1.4 multi-stage, dependencias congeladas, usuario no root, `server.ts`, healthcheck y artefactos mínimos.
- `.dockerignore` usa allow-list; `.gitignore` conserva `.agents/skills/**` como fuente versionable.
- `compose.yml` fue eliminado porque Docker Compose no es el método seleccionado.
- `GET|HEAD /health` está implementado y probado para healthcheck/rollout de Dokploy.

### Datos

Migraciones presentes:

- `0000_auth_initial.sql`
- `0001_crm_initial.sql`
- `0002_realtime_socket.sql`
- `0003_remove_profile_obsolete_fields.sql`
- `0004_cultured_lady_bullseye.sql`
- `0005_rebrand_furyleeds.sql`

La migración `0005` retira de bases existentes los triggers/funciones realtime del identificador anterior, instala `furyleeds_realtime_v1` y revoca las API keys emitidas con el prefijo retirado; los clientes deben generar claves nuevas y actualizar consumidores de webhooks a `X-FuryLeeds-*`. Para instalaciones limpias, `0002` ya crea únicamente objetos FuryLeeds. La migración `0003` elimina `profiles.role` y `profiles.beta_features`, columnas sin uso funcional. El bootstrap de nuevos usuarios fue sincronizado y ya no intenta insertar `profiles.role`. La migración `0004` agrega defaults `gen_random_uuid()::text` a las cuatro PK de Better Auth; fue aplicada correctamente al PostgreSQL local y el inicio Google pasó de HTTP 500 a HTTP 200 al poder persistir el estado OAuth en `verification`.

### Auth y sistema visual graphite

- Login, registro, recuperación, reset e invitaciones comparten `AuthPageShell`: una sola marca FuryLeeds fuera del formulario, fondo técnico sutil, panel graphite y navegación coherente.
- Login y registro ya no duplican icono dentro del panel; sus títulos están centrados y reforzados, y las acciones primarias usan contraste neutro alto.
- Los tokens oscuros, `Card`, `Input`, `Button`, sidebar y metadata visual se alinearon con una estética Better Auth sobria para que auth y dashboard compartan tonalidad.
- El proxy redirige páginas protegidas a `/login` sin el parámetro muerto `next=%2Fdashboard`; la regresión está cubierta en `test/proxy.test.ts`.
- El cambio claro/oscuro del encabezado y de Apariencia usa una revelación circular desde el control, adaptada del Animated Theme Toggler de Magic UI sobre View Transitions; conserva `ThemeProvider`, cae al cambio inmediato sin soporte y respeta `prefers-reduced-motion`.
- El feedback efímero migró de Sonner a Sileo en `top-center` mediante un adaptador local; Sonner fue retirado. SweetAlert2 se carga dinámicamente y queda limitado a confirmaciones de acciones/efectos externos, cierre o revocación de sesión y revelaciones únicas de API keys/URLs de invitación, insertadas mediante DOM seguro y limpiadas al cerrar.
- El shell autenticado usa Boneyard con un fallback estructural responsive para sidebar, header y contenido centrado mientras resuelven sesión y perfil. La generación geométrica real del dashboard queda pendiente de ejecutar mediante CDP con una cuenta de desarrollo autenticada; no se agregó bypass de auth ni se almacenaron cookies.
- Se auditó y completó ChatSend para el ciclo de autenticación: registro conserva verificación por enlace, la recuperación usa OTP nativo de Better Auth de seis dígitos (hash en DB, 10 minutos, cinco intentos y rate limit), y se añadieron correos de bienvenida y confirmación posterior al cambio de contraseña. `/forgot-password` contiene solicitud, validación y nueva contraseña sin secretos en URL; la antigua ruta `/reset-password` fue retirada. ChatSend valida URL/protocolo, exige HTTPS en producción y aplica timeout de 10 segundos. El envío OTP se difiere con `advanced.backgroundTasks.handler` de Better Auth para reducir diferencias temporales de enumeración y se documenta como process-bound/no durable. No se importa `next/server` desde la configuración compartida de auth, porque `server.ts` la carga directamente bajo Bun y esa importación provoca el error de `AsyncLocalStorage` fuera del runtime de rutas Next.

### Servidor local y URL canónica

- `server.ts` ya no usa la variable estándar del sistema `HOSTNAME` como dirección de escucha ni como URL visible; Fedora la establece con el nombre de la máquina (`fedora`), lo que antes producía `http://fedora:3000`.
- Desarrollo enlaza explícitamente en `127.0.0.1` y anuncia `http://localhost:<PORT>`; producción enlaza en `0.0.0.0` y conserva `BETTER_AUTH_URL` como origen público canónico.
- El Dockerfile y los inventarios de entorno retiraron `HOSTNAME` como configuración de FuryLeeds. Reiniciar el proceso es obligatorio para aplicar este cambio.

### API externa y pruebas de contrato

- `api.http` documenta con comentarios en español todas las operaciones entrantes para integraciones: health, las 16 operaciones `/api/v1`, verificación/recepción Meta y los dos cron.
- Las solicitudes manuales que escriben datos, llaman a Meta o ejecutan trabajo programado están marcadas `EFECTO REAL` y usan únicamente placeholders.
- `test/test.sh` y `bun run test:external` recorren esa superficie contra una instancia no productiva sin efectos persistentes: usan lecturas, UUID inexistente, validaciones deliberadamente fallidas, ausencia de firma Meta y secreto cron incorrecto.
- El smoke test no imprime API keys, encabezados de autorización ni cuerpos con datos tenant; requiere una clave no productiva con los siete scopes y no forma parte de `bun run test` porque necesita servidor y base reales.

### Documentación

Se creó una documentación completa y enlazada:

- raíz: `AGENTS.md`, `ROLE.md`, `SYSTEM.md`, `MEMORY.md`, `README.md`;
- índice central: `docs/README.md`, con recorridos de lectura y matriz de ownership;
- arquitectura: runtime, DB, API, seguridad, realtime, integraciones, frontend, diseño y decisiones ADR;
- módulos: todos los dominios, páginas, 107 componentes y 10 hooks;
- proceso: intake, DoD, seguridad, testing, dependencias, upgrades, deploy, observabilidad, performance, Git, fallos, tooling y documentación;
- deuda: `docs/TODO.md` con hallazgos priorizados, contexto, impacto y siguiente paso;
- inventarios completos de 102 archivos API / 149 combinaciones método-ruta y 23 rutas UI.


## Última validación confirmada

Antes de la documentación raíz se ejecutó correctamente:

```text
bun run check                 PASS
bun run typecheck             PASS
bun run test                  PASS — 972 tests, 0 failures
bun run build                 PASS — Next.js 16.3.6
bunx drizzle-kit check        PASS
git diff --check              PASS
bun outdated                  no pending packages reported
```

La aplicación de migraciones falló por configuración local: el `DATABASE_URL` activo todavía utilizaba el usuario placeholder `USUARIO`, y PostgreSQL devolvió autenticación fallida. No afirmar que `0003` fue aplicada.

Al cerrar la documentación el 2026-09-24 también se validó:

```text
bun run check                 PASS — 494 archivos, sin fixes
Markdown links                PASS — 47 archivos / 318 enlaces locales / 0 rotos
Markdown code fences          PASS — 0 desbalanceados
git diff --check              PASS
secret/absolute-path scan     PASS — 0 coincidencias en Markdown
```

Esta segunda validación fue documental/configuración; no sustituye la validación de aplicación completa indicada arriba.

Para el hito de licencia y deployment Dokploy se ejecutó:

```text
bun run check                 PASS — 496 archivos, sin fixes
bun run typecheck             PASS
bun run test                  PASS — 974 tests, 0 failures
bun run build                 PASS — Next.js 16.3.6, /health incluida
bunx drizzle-kit check        PASS
git diff --check              PASS
Markdown links/fences         PASS — 48 archivos, 325 enlaces, 0 rotos
Docker image build            NOT RUN — Docker no está instalado
```

El build emitió advertencias porque el `BETTER_AUTH_SECRET` local es de baja entropía. No se modificó ni publicó el secreto; Dokploy debe recibir uno aleatorio de al menos 32 caracteres.

Para el hito de colección y smoke test de API externa se ejecutó:

```text
sh -n test/test.sh             PASS
bun install --frozen-lockfile  PASS — sin cambios
bun run check                  PASS — 496 archivos, sin fixes
bun run typecheck              PASS
bun run test                   PASS — 974 tests, 0 failures
bun run build                  PASS — Next.js 16.3.6
bunx drizzle-kit check         PASS
git diff --check               PASS
bun run test:external          NOT RUN — no se proporcionó servidor/API key no productivos
```

El build mantuvo la advertencia conocida sobre la baja entropía de `BETTER_AUTH_SECRET`. El smoke externo no debe ejecutarse contra producción ni con credenciales inventadas; requiere una instancia activa y una API key de pruebas con los siete scopes.

Para el hito de corrección visual y funcional de autenticación se ejecutó:

```text
bun run db:generate            PASS — migración 0004 generada
bun run db:migrate             PASS — PostgreSQL local
Google OAuth state request     PASS — HTTP 200 (antes HTTP 500)
profile bootstrap columns      PASS — consulta LIMIT 0, sin lectura/escritura
bun test test/proxy.test.ts    PASS — 4 tests
bun run check                  PASS — 498 archivos, sin fixes
bun run typecheck              PASS
bun run test                   PASS — 974 tests, 0 failures
bun run build                  PASS — Next.js 16.3.6
bunx drizzle-kit check         PASS
git diff --check               PASS
```

El build sigue advirtiendo que el `BETTER_AUTH_SECRET` cargado tiene baja entropía; debe rotarse antes de producción. Las credenciales visibles en capturas compartidas durante el desarrollo deben considerarse expuestas y rotarse.

### Validación del hito de feedback y loading

La implementación quedó preparada para validación automática completa. La verificación visual y la generación Boneyard autenticada requieren una sesión de desarrollo en navegador; no deben realizarse con credenciales productivas.

### Validación del hito de correo de autenticación

```text
focused ChatSend/auth-email tests  PASS — 8 tests
bun run check                      PASS — 503 archivos
bun run typecheck                  PASS
bun run test                       PASS — 982 tests, 0 failures
bunx drizzle-kit check             PASS
git diff --check                   PASS
bun run dev startup smoke          PASS — CRM ready; proceso detenido por timeout de prueba
bun run build                      PASS — Next.js 16.3.6; ruta antigua /reset-password ausente
live ChatSend smoke                NOT RUN — no se usaron credenciales/proveedor real
```

La validación confirma contratos locales, tipos, plantillas escapadas y transporte simulado. La entrega real aún requiere un smoke test controlado con configuración ChatSend no productiva; no debe afirmarse que el proveedor real aceptó mensajes hasta ejecutarlo.

### Validación del rebranding FuryLeeds

```text
bun install --frozen-lockfile  PASS — sin cambios
bun run check                  PASS — 504 archivos
bun run typecheck              PASS
bun run test                   PASS — 982 tests, 0 failures
bun run build                  PASS — Next.js 16.3.6
bunx drizzle-kit check         PASS
bun run db:migrate             PASS — PostgreSQL local
realtime DB verification       PASS — 7 funciones/triggers nuevos, 0 retirados
old-name source scan           PASS — 0 coincidencias
git diff --check               PASS
```

La migración `0005` está aplicada en el PostgreSQL local configurado y la identidad retirada ya no aparece en fuentes versionables. El build mantiene la advertencia conocida sobre la baja entropía del `BETTER_AUTH_SECRET` local; debe rotarse antes de producción sin publicarlo.

## Próxima acción operativa inmediata

1. Iniciar el sistema con `bun run dev` cuando se necesite continuar la validación local; el proceso se detuvo ordenadamente antes del build.
2. Hacer un smoke test de login, conexión Socket.IO y un flujo básico de inbox.
3. Verificar el Docker build, healthcheck, HTTPS, WebSocket y migración one-off en un Dokploy staging autorizado.

## Hallazgos abiertos prioritarios

### P0/P1 antes de producción

- Verificar en un Dokploy staging real el Docker build, healthcheck, HTTPS, WebSocket, migración one-off, SIGTERM y rollback `start-first`; Docker no está instalado en el entorno local actual.
- Implementar backups PostgreSQL off-host, retención y restore drills.
- Resolver la compatibilidad real entre `ai_knowledge_chunks.embedding` (`real[]` en esquema) y las consultas `vector(1536)`/`<=>`; no declarar semantic retrieval listo hasta verificarlo.
- Verificar en una base migrada la expresión generada de normalización telefónica; existe una posible diferencia entre el schema Drizzle y SQL aplanado.
- Decidir una cola durable para side effects que no puedan depender de `after()`.

### Escalado

- Rate limit actual es por proceso.
- Socket.IO usa adapter en memoria.
- Escalado horizontal requiere rate limit distribuido, adapter Socket.IO, estrategia de sticky routing y coordinación de workers/listeners.

### Producto y dominio

- Notificaciones soportan `conversation_assigned`, pero no se encontró un productor activo de filas.
- Triggers de automatización `conversation_assigned` y `time_based` existen, pero no se identificó fuente automática completa.
- El schema permite nodo de flow `http_fetch`, pero runtime/types no lo implementan; activación debe rechazarlo hasta implementación completa.
- Trigger manual de flows no tiene endpoint dedicado.
- “Round robin” de automations selecciona el primer perfil y no mantiene rotación real.
- Webhooks salientes son best-effort, sin ledger durable ni reintentos persistentes.
- Un envío a Meta puede completarse y fallar después al persistir localmente; falta reconciliación explícita.
- Métricas del dashboard usan timezone local del servidor; no hay timezone por cuenta/usuario.

Todos estos puntos deben mantenerse sincronizados con `docs/TODO.md`.

## Restricciones que no deben romperse

- No Supabase, InsForge, SQLite ni DB hospedada como segunda fuente de verdad.
- No almacenamiento persistente en filesystem del VPS.
- No polling para reemplazar Socket.IO.
- No `next start` como proceso único de producción.
- No credenciales en cliente, logs o documentación.
- No aceptar `accountId` del browser como prueba de autorización.
- No RLS ficticio: hoy el aislamiento se implementa en queries de aplicación.
- No agregar compatibilidad legacy “por si acaso”.
- No simplificar el lazy runtime de `src/lib/db/index.ts` sin validar build: imports estáticos de `bun` fallan en workers Node usados por el build de Next.
- No cambiar a una release candidate de Drizzle solo porque una guía muestre paquetes `@rc`; usar latest stable salvo decisión explícita.

## Cómo continuar

Siempre empezar por:

1. `AGENTS.md`
2. `ROLE.md`
3. `SYSTEM.md`
4. este archivo
5. `docs/README.md`
6. documentos de arquitectura/módulo/proceso dueños del cambio

Al cerrar una tarea:

- actualizar documentación funcional;
- actualizar esta memoria si cambió el estado o el siguiente paso;
- registrar deuda fuera de alcance en `docs/TODO.md`;
- ejecutar validación real y reportarla con honestidad.
