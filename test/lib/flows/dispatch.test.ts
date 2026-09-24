import { describe, expect, it } from 'bun:test';

import { entryTriggerTexts, matchesKeywordTrigger } from '@/lib/flows/engine';

describe('flow entry trigger dispatch logic', () => {
  it('offers typed text to keyword triggers', () => {
    const texts = entryTriggerTexts({
      kind: 'text',
      text: 'order status',
      meta_message_id: 'm1',
    });

    expect(texts).toEqual(['order status']);
    expect(
      texts.some((text) =>
        matchesKeywordTrigger(text, { keywords: ['order status'] })
      )
    ).toBe(true);
  });

  it('offers both an interactive title and its stable reply id', () => {
    const texts = entryTriggerTexts({
      kind: 'interactive_reply',
      reply_id: 'order_status',
      reply_title: 'Where is my parcel?',
      meta_message_id: 'm1',
    });

    expect(texts).toEqual(['Where is my parcel?', 'order_status']);
    expect(
      texts.some((text) =>
        matchesKeywordTrigger(text, { keywords: ['order_status'] })
      )
    ).toBe(true);
  });

  it('deduplicates identical titles and ids and drops blank titles', () => {
    expect(
      entryTriggerTexts({
        kind: 'interactive_reply',
        reply_id: 'btn_1',
        reply_title: 'btn_1',
        meta_message_id: 'm1',
      })
    ).toEqual(['btn_1']);
    expect(
      entryTriggerTexts({
        kind: 'interactive_reply',
        reply_id: 'btn_1',
        reply_title: '   ',
        meta_message_id: 'm1',
      })
    ).toEqual(['btn_1']);
  });
});
