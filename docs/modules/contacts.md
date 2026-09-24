# Contacts

Related: [Inbox](inbox-and-messaging.md) · [WhatsApp](whatsapp.md) · [Automations](automations.md) · [Pipelines](pipelines.md)

## Purpose and ownership

Owns the tenant address book, WhatsApp identities, phone deduplication, tags, notes, custom-field definitions/values, and CSV import. Contacts are shared account data; `user_id` is audit provenance, not the tenant boundary.

## Important source paths

- `src/lib/contacts/{repository,dedupe,parse-contact-csv,resolve-import-tags,tag-write,tag-events,tag-chain}.ts`
- `src/lib/api/v1/contacts.ts`
- `src/lib/whatsapp/{phone-utils,wa-identity,resolve-conversation,db}.ts`
- `src/app/api/contacts/**`, `src/app/api/tags/**`

## Data model

- `contacts`: account, phone plus generated digit-only `phone_normalized`, name/email/company/avatar, BSUID (`wa_user_id`), parent BSUID and username.
- Uniqueness: `(account_id, phone_normalized)` when non-empty and `(account_id, wa_user_id)` when present.
- `tags` and join table `contact_tags` (unique contact/tag pair).
- `custom_fields` and unique `contact_custom_values(contact_id,custom_field_id)`.
- `contact_notes` contains account, contact and author.
- Cascades remove joins/values/notes/conversations with a contact.

## API endpoints

| Endpoint | Methods | Access / behavior |
|---|---|---|
| `/api/contacts` | GET, POST, DELETE | Member reads; agent+ creates/bulk deletes. Search/filter/pagination in repository. |
| `/api/contacts/:id` | GET, PATCH, DELETE | Member reads; agent+ mutates; phone is parsed as international and uniqueness conflicts become 409. |
| `/api/contacts/lookup?phone=` | GET | Member; phone lookup with tenant-aware fuzzy variants. |
| `/api/contacts/import` | POST | Agent+; parsed CSV rows, in-file/existing dedupe, optional tag creation/assignment. |
| `/api/contacts/tags` | GET | Member; contact UI tag resources. |
| `/api/contacts/:id/tags` | GET, POST, DELETE | Member reads; agent+ changes tags and dispatches `tag_added`. |
| `/api/tags` | GET, POST | Viewer+ reads; admin+ creates. |
| `/api/tags/:id` | DELETE | Admin+; cascades joins. |
| `/api/contacts/custom-fields` | GET, POST | Member reads; admin+ creates. |
| `/api/contacts/custom-fields/:id` | PATCH, DELETE | Admin+; values cascade on delete. |
| `/api/contacts/:id/custom-values` | PUT | Agent+; replaces validated tenant-owned field values, capped count. |
| `/api/contacts/:id/notes` | POST | Agent+; create note after ownership check. |
| `/api/contacts/:id/notes/:noteId` | DELETE | Agent+; account/contact scoped. |

Public contact endpoints are documented in [Public API](public-api-and-webhooks.md).

## Main flows

- Phone input must include `+` and country code where ambiguity matters; storage uses Meta-compatible digits.
- Lookup first uses normalized identity and may use safe last-eight/trunk variants; DB unique constraints close races.
- Inbound WhatsApp can create or enrich contacts from phone or BSUID; username-only users remain addressable.
- CSV import reports created/skipped/duplicate/invalid rows and resolves tag names case-insensitively.
- A newly inserted tag join fires `tag_added` automation once; recursive tag chains stop at depth 3.

## Authorization and tenant boundary

Direct tables are filtered by `contacts.account_id`, `tags.account_id`, or `custom_fields.account_id`. Join tables without `account_id` are accessed only through account-scoped parent validation/joins. Foreign IDs return not found rather than revealing cross-tenant existence.

## Realtime/events

Contacts/tags have no direct socket event. Their effects become visible through conversation refreshes. Tag insertion can synchronously dispatch automations. New inbound contacts can trigger `new_contact_created` and `first_inbound_message`.

## Failure modes

- National/ambiguous/empty phone → 400 or skipped import row.
- Duplicate normalized phone/BSUID → conflict or race recovery.
- Foreign contact/tag/custom field → 404 or guarded no-op.
- CSV malformed rows and duplicate rows are reported, not silently accepted.
- Tag automation failures do not roll back a successfully inserted tag.

## Tests

`test/lib/contacts/*`, `test/app/api/contacts/route.test.ts`, `test/app/api/contacts/[id]/tags/route.test.ts`, and `test/lib/api/v1/contacts.test.ts` cover phone normalization/dedupe, CSV parsing, account ownership, tag idempotency/chains, serialization and route behavior.

## Extension rules

- Reuse canonical phone/identity helpers; never invent a second normalization rule.
- Add contact attributes to schema, serializers, import/update allowlists and automation field handling together.
- Validate both sides of join-table writes against the same account.
- Dispatch `tag_added` only after a genuinely new join and propagate chain depth.
