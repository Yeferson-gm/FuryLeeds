import { describe, expect, it } from 'bun:test';
import {
  renderTemplateBody,
  resolveTemplateRow,
  templateBodyParams,
  templateContentText,
} from '@/lib/whatsapp/template-body';
import type { MessageTemplate } from '@/types';
import { createDrizzleMock } from './drizzle-mock';

const TEMPLATE_ROW = {
  id: 'tpl-1',
  accountId: 'acct-1',
  userId: 'u-1',
  name: 'order_update',
  category: 'Utility',
  language: 'en',
  headerType: null,
  headerContent: null,
  bodyText: 'Your order {{1}} ships on {{2}}',
  footerText: null,
  buttons: null,
  status: 'APPROVED',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: null,
  sampleValues: null,
  metaTemplateId: 'meta-1',
  rejectionReason: null,
  qualityScore: null,
  headerHandle: null,
  headerMediaUrl: null,
  submissionError: null,
  lastSubmittedAt: null,
};

function legacyRow(): MessageTemplate {
  return {
    id: 'tpl-1',
    user_id: 'u-1',
    name: 'order_update',
    category: 'Utility',
    language: 'en',
    body_text: 'Your order {{1}} ships on {{2}}',
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('template body helpers', () => {
  it('substitutes known placeholders and keeps missing ones visible', () => {
    expect(renderTemplateBody('Hi {{1}}, code {{2}}', ['Sam'])).toBe(
      'Hi Sam, code {{2}}'
    );
  });

  it('prefers structured body params', () => {
    expect(templateBodyParams(['direct'], { body: ['structured', 7] })).toEqual(
      ['structured']
    );
  });

  it('renders persisted template text', () => {
    expect(templateContentText(legacyRow(), ['A123', 'Friday'])).toBe(
      'Your order A123 ships on Friday'
    );
  });
});

describe('resolveTemplateRow', () => {
  it('maps a typed Drizzle row and resolves the local language', async () => {
    const { db } = createDrizzleMock({
      select: { messageTemplates: [[TEMPLATE_ROW]] },
    });
    const resolved = await resolveTemplateRow(db, 'acct-1', 'order_update');
    expect(resolved.row?.body_text).toBe(TEMPLATE_ROW.bodyText);
    expect(resolved.language).toBe('en');
  });

  it('keeps a caller-pinned compatible language', async () => {
    const { db } = createDrizzleMock({
      select: { messageTemplates: [[TEMPLATE_ROW]] },
    });
    const resolved = await resolveTemplateRow(
      db,
      'acct-1',
      'order_update',
      'en_US'
    );
    expect(resolved.row?.language).toBe('en');
    expect(resolved.language).toBe('en_US');
  });

  it('returns no row when the local catalog has no match', async () => {
    const { db } = createDrizzleMock({
      select: { messageTemplates: [[]] },
    });
    expect(await resolveTemplateRow(db, 'acct-1', 'missing', 'fr')).toEqual({
      row: null,
      malformed: false,
      language: 'fr',
    });
  });
});
