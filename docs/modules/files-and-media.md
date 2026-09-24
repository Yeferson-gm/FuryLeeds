# Files and media

Related: [WhatsApp](whatsapp.md) · [Inbox](inbox-and-messaging.md) · [Flows](flows.md)

## Purpose and ownership

Owns account-scoped file upload/get/delete through Imgora, MIME/size/path policy, tamper-proof asset references, convenience media upload helpers, inbound WhatsApp media mirroring/proxying, and client download/gallery/blob caching.

## Important source paths

- `src/lib/storage/{imgora,policy,upload-media}.ts`
- `src/app/api/files/**`
- `src/app/api/whatsapp/media/[mediaId]/route.ts`
- `src/lib/whatsapp/mirror-inbound-media.ts`
- `src/lib/media/{blob-cache,download,filename,gallery}.ts`

## Data model

No dedicated file table. Message/template/flow configs store public CDN URLs or opaque references. Imgora object layout is namespaced under configured base folder, collection, and `account-<uuid>`.

Collections:
- `avatars`: images only, 2 MiB.
- `chat-media`: supported image/video/audio/document; images 5 MiB, others 16 MiB.
- `flow-media`: same media policy.

Opaque references contain version/account/collection/public ID/resource type plus HMAC-SHA256 signature.

## API endpoints

| Endpoint | Methods | Access / behavior |
|---|---|---|
| `/api/files` | POST | Session; multipart file + valid collection, upload and return signed path/public URL. |
| `/api/files/:collection/:path` | GET | Session; validate signed reference/account/collection and return provider asset metadata. |
| `/api/files/:collection/:path` | DELETE | Session; same validation then provider deletion. |
| `/api/whatsapp/media/:mediaId` | GET | Session; use current account's encrypted Meta token to proxy inbound bytes. |

## Main flows

- Normalize MIME, reject unsupported/oversize content before provider call, sanitize basename and canonicalize extension.
- Upload to MIME-specific Imgora Pro endpoint with server credentials and 120s timeout.
- Return public CDN URL plus signed reference; get/delete revalidate signature and tenant.
- Inbound media optionally downloads from Meta and mirrors to `chat-media` using deterministic names; failure falls back safely.
- Browser caches only authenticated proxy blobs (LRU 30, in-flight dedupe); public CDN media relies on HTTP cache.
- Filename helpers sanitize path/control characters and derive useful download names; gallery includes image/video only.

## Authorization and tenant boundary

Files have no DB row, so the signed reference is the critical boundary: its embedded account and collection must match the authenticated context. Object paths are account namespaced. Meta media proxy selects credentials only by current account.

## Realtime/events

No file event. Media becomes realtime-visible when a message row referencing its URL is inserted/updated.

## Failure modes

- Unsupported MIME/size/unsafe name, tampered or cross-account reference → 4xx (invalid references intentionally look like 404).
- Missing/invalid Imgora config/signing key → 500.
- Provider timeout/network/malformed payload/non-HTTP URL → 502.
- Deletion does not scan/remove message/config references.
- Mirroring is best-effort; expired Meta media can make the fallback proxy unavailable later.

## Tests

`test/lib/storage/{imgora,upload-media}.test.ts`, `test/lib/whatsapp/mirror-inbound-media.test.ts`, and `test/lib/media/*` cover policy, account signatures, provider failures, mirroring, cache behavior, filenames and gallery.

## Extension rules

- Add a collection to the union, policy and all API callers together.
- Validate MIME and size server-side before upload; do not trust filename extensions.
- Preserve signed account+collection references and constant-time signature comparison.
- Define cleanup/reference behavior before replacing or deleting durable media.
