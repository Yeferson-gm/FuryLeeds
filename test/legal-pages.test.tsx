import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import DataDeletionPage, {
  metadata as dataDeletionMetadata,
} from '@/app/data-deletion/page';
import PrivacyPage, { metadata as privacyMetadata } from '@/app/privacy/page';
import TermsPage, { metadata as termsMetadata } from '@/app/terms/page';

const pages = [
  {
    path: '/privacy',
    render: PrivacyPage,
    metadata: privacyMetadata,
    requiredText: 'Política de privacidad',
  },
  {
    path: '/terms',
    render: TermsPage,
    metadata: termsMetadata,
    requiredText: 'Condiciones del servicio',
  },
  {
    path: '/data-deletion',
    render: DataDeletionPage,
    metadata: dataDeletionMetadata,
    requiredText: 'Eliminación de datos de usuario',
  },
] as const;

describe('Meta legal pages', () => {
  for (const page of pages) {
    test(`${page.path} is indexable and identifies the legal operator`, () => {
      const html = renderToStaticMarkup(page.render());

      expect(page.metadata.robots).toEqual({ index: true, follow: true });
      expect(html).toContain(page.requiredText);
      expect(html).toContain('CEDURS TECHNOLOGY GROUP S.A.C.');
      expect(html).toContain('href="/privacy"');
      expect(html).toContain('href="/terms"');
      expect(html).toContain('href="/data-deletion"');
    });
  }

  test('data deletion page provides explicit request steps and Meta guidance', () => {
    const html = renderToStaticMarkup(DataDeletionPage());

    expect(html).toContain('Pasos para solicitar la eliminación');
    expect(html).toContain('Meta/WhatsApp');
    expect(html).toContain('verificación de identidad');
    expect(html).toContain('copias de seguridad');
  });
});
