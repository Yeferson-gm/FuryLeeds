import type {
  Contact,
  ContactCustomValue,
  ContactNote,
  ContactTag,
  CustomField,
  Deal,
  Tag,
} from '@/types';

export interface ContactWithTags extends Contact {
  tags: Tag[];
}

export interface ContactDetailPayload {
  contact: Contact;
  tags: Tag[];
  contactTags: ContactTag[];
  notes: ContactNote[];
  customFields: CustomField[];
  customValues: ContactCustomValue[];
  deals: Deal[];
}

export interface ImportContactsResult {
  imported: number;
  skipped: number;
  invalidPhone: number;
  failed: number;
  failedDetails: { phone: string; name?: string; reason: string }[];
  tagsAssigned: number;
  skippedTagNames: string[];
}

export class ContactsApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ContactsApiError';
    this.status = status;
    this.code = code;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    throw new ContactsApiError(
      body.error ?? 'Error al procesar la solicitud',
      response.status,
      body.code
    );
  }
  return (await response.json().catch(() => ({}))) as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export async function fetchContacts(input: {
  page: number;
  pageSize: number;
  search: string;
  tagIds: string[];
}) {
  const params = new URLSearchParams({
    page: String(input.page),
    page_size: String(input.pageSize),
  });
  if (input.search.trim()) params.set('search', input.search.trim());
  for (const tagId of input.tagIds) params.append('tag_id', tagId);
  return requestJson<{ contacts: ContactWithTags[]; total: number }>(
    `/api/contacts?${params}`
  );
}

export function fetchTags() {
  return requestJson<{ tags: Tag[] }>('/api/contacts/tags');
}

export function fetchContactTags(contactId: string) {
  return requestJson<{ contactTags: ContactTag[] }>(
    `/api/contacts/${contactId}/tags`
  );
}

export function fetchContactDetail(contactId: string) {
  return requestJson<ContactDetailPayload>(`/api/contacts/${contactId}`);
}

export function findDuplicateContact(phone: string) {
  const params = new URLSearchParams({ phone });
  return requestJson<{ contact: Contact | null }>(
    `/api/contacts/lookup?${params}`
  );
}

export function createContact(input: {
  name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
}) {
  return requestJson<{ contact: Contact }>(
    '/api/contacts',
    jsonInit('POST', input)
  );
}

export function updateContact(contactId: string, input: object) {
  return requestJson<{ contact: Contact }>(
    `/api/contacts/${contactId}`,
    jsonInit('PATCH', input)
  );
}

export function deleteContacts(ids: string[]) {
  return requestJson<{ deleted: number }>(
    '/api/contacts',
    jsonInit('DELETE', { ids })
  );
}

export function fetchCustomFields() {
  return requestJson<{ fields: CustomField[] }>('/api/contacts/custom-fields');
}

export function createCustomField(field_name: string) {
  return requestJson<{ field: CustomField }>(
    '/api/contacts/custom-fields',
    jsonInit('POST', { field_name })
  );
}

export function updateCustomField(id: string, field_name: string) {
  return requestJson<{ field: CustomField }>(
    `/api/contacts/custom-fields/${id}`,
    jsonInit('PATCH', { field_name })
  );
}

export function deleteCustomField(id: string) {
  return requestJson<{ ok: true }>(`/api/contacts/custom-fields/${id}`, {
    method: 'DELETE',
  });
}

export function addContactNote(contactId: string, note_text: string) {
  return requestJson<{ note: ContactNote }>(
    `/api/contacts/${contactId}/notes`,
    jsonInit('POST', { note_text })
  );
}

export function deleteContactNote(contactId: string, noteId: string) {
  return requestJson<{ ok: true }>(
    `/api/contacts/${contactId}/notes/${noteId}`,
    { method: 'DELETE' }
  );
}

export function saveContactCustomValues(
  contactId: string,
  values: Record<string, string>
) {
  return requestJson<{ values: ContactCustomValue[] }>(
    `/api/contacts/${contactId}/custom-values`,
    jsonInit('PUT', { values })
  );
}

export function importContacts(
  rows: Array<{
    phone: string;
    name?: string;
    email?: string;
    company?: string;
    tagNames: string[];
  }>
) {
  return requestJson<ImportContactsResult>(
    '/api/contacts/import',
    jsonInit('POST', { rows })
  );
}
