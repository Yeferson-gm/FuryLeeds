import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { required, stubGlobal, unstubAllGlobals } from '@test/support/mocks';
import {
  INTERACTIVE_LIMITS,
  sendInteractiveButtons,
  sendInteractiveList,
} from '@/lib/whatsapp/meta-api';

// All assertions in this file run BEFORE the network call. We stub fetch
// to a never-resolving mock so a test that accidentally falls through to
// the request body would hang (and fail) rather than silently hit
// graph.facebook.com.
const neverFetch = () =>
  new Promise<Response>(() => {
    /* intentionally never resolves */
  });

const BASE_ARGS = {
  phoneNumberId: 'test-phone',
  accessToken: 'test-token',
  to: '1234567890',
  bodyText: 'Body text',
} as const;

describe('sendInteractiveButtons — validation', () => {
  beforeEach(() => {
    stubGlobal('fetch', mock(neverFetch));
  });
  afterEach(() => {
    unstubAllGlobals();
  });

  it('rejects an empty buttons array', async () => {
    await expect(
      sendInteractiveButtons({ ...BASE_ARGS, buttons: [] })
    ).rejects.toThrow(/entre 1 y 3 botones/);
  });

  it(`rejects more than ${INTERACTIVE_LIMITS.maxButtons} buttons (Meta cap)`, async () => {
    await expect(
      sendInteractiveButtons({
        ...BASE_ARGS,
        buttons: [
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B' },
          { id: 'c', title: 'C' },
          { id: 'd', title: 'D' },
        ],
      })
    ).rejects.toThrow(/entre 1 y 3 botones/);
  });

  it('rejects a button title longer than 20 chars (Meta cap)', async () => {
    await expect(
      sendInteractiveButtons({
        ...BASE_ARGS,
        buttons: [
          {
            id: 'a',
            title: 'x'.repeat(INTERACTIVE_LIMITS.buttonTitleMaxLength + 1),
          },
        ],
      })
    ).rejects.toThrow(/supera los 20 caracteres/);
  });

  it('rejects a button missing its id', async () => {
    await expect(
      sendInteractiveButtons({
        ...BASE_ARGS,
        buttons: [{ id: '', title: 'Choose me' }],
      })
    ).rejects.toThrow(/Falta el id/);
  });

  it('rejects an empty body text', async () => {
    await expect(
      sendInteractiveButtons({
        ...BASE_ARGS,
        bodyText: '',
        buttons: [{ id: 'a', title: 'A' }],
      })
    ).rejects.toThrow(/requiere un bodyText/);
  });

  it('rejects a header text over the limit', async () => {
    await expect(
      sendInteractiveButtons({
        ...BASE_ARGS,
        headerText: 'x'.repeat(INTERACTIVE_LIMITS.headerTextMaxLength + 1),
        buttons: [{ id: 'a', title: 'A' }],
      })
    ).rejects.toThrow(/headerText interactivo supera/);
  });

  it('sends the right payload shape when all inputs are valid', async () => {
    let captured: { url: string; body: unknown; method: string } | null = null;
    stubGlobal(
      'fetch',
      mock(async (url: string, init: RequestInit) => {
        captured = {
          url,
          method: init.method ?? 'GET',
          body: JSON.parse(String(init.body)),
        };
        return new Response(
          JSON.stringify({ messages: [{ id: 'wamid.PASS' }] }),
          { status: 200 }
        );
      })
    );

    const result = await sendInteractiveButtons({
      ...BASE_ARGS,
      headerText: 'Hello',
      footerText: 'Tap one',
      buttons: [
        { id: 'yes', title: 'Yes' },
        { id: 'no', title: 'No' },
      ],
    });

    expect(result).toEqual({ messageId: 'wamid.PASS' });
    const request = required<{ url: string; body: unknown; method: string }>(
      captured,
      'Expected fetch to capture the request'
    );
    expect(request.method).toBe('POST');
    expect(request.url).toContain('test-phone/messages');
    expect(request.body).toMatchObject({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '1234567890',
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Body text' },
        header: { type: 'text', text: 'Hello' },
        footer: { text: 'Tap one' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'yes', title: 'Yes' } },
            { type: 'reply', reply: { id: 'no', title: 'No' } },
          ],
        },
      },
    });
  });
});

describe('sendInteractiveList — validation', () => {
  beforeEach(() => {
    stubGlobal('fetch', mock(neverFetch));
  });
  afterEach(() => {
    unstubAllGlobals();
  });

  const ROW = { id: 'r1', title: 'Row 1' };

  it('rejects zero sections', async () => {
    await expect(
      sendInteractiveList({
        ...BASE_ARGS,
        buttonLabel: 'Open',
        sections: [],
      })
    ).rejects.toThrow(/entre 1 y 10 secciones/);
  });

  it(`rejects more than ${INTERACTIVE_LIMITS.maxListRowsTotal} rows total across sections (Meta cap)`, async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      id: `r${i}`,
      title: `Row ${i}`,
    }));
    await expect(
      sendInteractiveList({
        ...BASE_ARGS,
        buttonLabel: 'Open',
        sections: [{ rows }],
      })
    ).rejects.toThrow(/entre 1 y 10 filas en total/);
  });

  it('rejects a row title longer than 24 chars (Meta cap)', async () => {
    await expect(
      sendInteractiveList({
        ...BASE_ARGS,
        buttonLabel: 'Open',
        sections: [
          {
            rows: [
              {
                id: 'r1',
                title: 'x'.repeat(INTERACTIVE_LIMITS.listRowTitleMaxLength + 1),
              },
            ],
          },
        ],
      })
    ).rejects.toThrow(/supera los 24 caracteres/);
  });

  it('rejects duplicate row ids across sections', async () => {
    await expect(
      sendInteractiveList({
        ...BASE_ARGS,
        buttonLabel: 'Open',
        sections: [
          { rows: [{ id: 'dupe', title: 'First' }] },
          { rows: [{ id: 'dupe', title: 'Second' }] },
        ],
      })
    ).rejects.toThrow(/id de fila duplicado/);
  });

  it('rejects an empty buttonLabel', async () => {
    await expect(
      sendInteractiveList({
        ...BASE_ARGS,
        buttonLabel: '',
        sections: [{ rows: [ROW] }],
      })
    ).rejects.toThrow(/requiere un buttonLabel/);
  });

  it('sends the right payload shape when valid', async () => {
    let captured: { body: unknown } | null = null;
    stubGlobal(
      'fetch',
      mock(async (_url: string, init: RequestInit) => {
        captured = { body: JSON.parse(String(init.body)) };
        return new Response(
          JSON.stringify({ messages: [{ id: 'wamid.LIST' }] }),
          { status: 200 }
        );
      })
    );

    const result = await sendInteractiveList({
      ...BASE_ARGS,
      buttonLabel: 'Open menu',
      sections: [
        {
          title: 'Orders',
          rows: [
            { id: 'order_1', title: 'Order #1', description: '€12' },
            { id: 'order_2', title: 'Order #2' },
          ],
        },
      ],
    });

    expect(result).toEqual({ messageId: 'wamid.LIST' });
    const request = required<{ body: unknown }>(
      captured,
      'Expected fetch to capture the request'
    );
    expect(request.body).toMatchObject({
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: 'Body text' },
        action: {
          button: 'Open menu',
          sections: [
            {
              title: 'Orders',
              rows: [
                { id: 'order_1', title: 'Order #1', description: '€12' },
                { id: 'order_2', title: 'Order #2' },
              ],
            },
          ],
        },
      },
    });
  });
});
