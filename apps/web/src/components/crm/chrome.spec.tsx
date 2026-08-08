import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CrmTabs } from './chrome';

/**
 * CRM bölüm sekmeleri.
 *
 * Aktiflik kuralı sidebar'ınkinden FARKLIDIR ve fark kasıtlıdır: burada TAM
 * eşleşme aranır. `/app/crm` her CRM yolunun önekidir, dolayısıyla önek
 * kontrolü müşteri detayında "Müşteriler"i de "Fırsatlar"ı da aktif
 * gösterirdi.
 */
const pathname = vi.hoisted((): { current: string } => ({ current: '/app/crm' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

function renderAt(path: string) {
  pathname.current = path;
  return render(<CrmTabs />);
}

describe('CrmTabs', () => {
  it('üç bölümü de gerçek bağlantı olarak verir', () => {
    renderAt('/app/crm');

    expect(screen.getByRole('link', { name: 'Müşteriler' })).toHaveAttribute('href', '/app/crm');
    expect(screen.getByRole('link', { name: 'Fırsatlar' })).toHaveAttribute(
      'href',
      '/app/crm/pipeline',
    );
    expect(screen.getByRole('link', { name: 'Takipler' })).toHaveAttribute(
      'href',
      '/app/crm/follow-ups',
    );
  });

  it('/app/crm üzerinde YALNIZCA Müşteriler aktif', () => {
    renderAt('/app/crm');

    expect(screen.getByRole('link', { name: 'Müşteriler' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Fırsatlar' })).not.toHaveAttribute('aria-current');
  });

  it('/app/crm/pipeline üzerinde Müşteriler DEĞİL Fırsatlar aktif', () => {
    renderAt('/app/crm/pipeline');

    expect(screen.getByRole('link', { name: 'Fırsatlar' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Müşteriler' })).not.toHaveAttribute('aria-current');
  });

  /**
   * Detay sayfası üç bölümden HİÇBİRİ değildir; orada bir sekmeyi yakmak
   * yanlış bir yer iddiası olurdu.
   */
  it('şirket detayında HİÇBİR sekme aktif değil', () => {
    renderAt('/app/crm/2f1c9a44-0000-4000-8000-000000000001');

    for (const label of ['Müşteriler', 'Fırsatlar', 'Takipler']) {
      expect(screen.getByRole('link', { name: label })).not.toHaveAttribute('aria-current');
    }
  });
});
