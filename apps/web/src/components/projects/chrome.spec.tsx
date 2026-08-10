import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProjectTabs } from './chrome';

/**
 * Projeler bölüm sekmeleri.
 *
 * Aktiflik kuralı `CrmTabs` ile AYNIDIR ve fark kasıtlıdır: TAM eşleşme aranır.
 * `/app/projects` her Projeler yolunun önekidir, dolayısıyla önek kontrolü
 * proje detayında "Projeler"i de aktif gösterirdi.
 *
 * ⚠️ Bu şerit Slice 5a'da HİÇ çizilmiyordu (`/app/projects/tasks` yoktu);
 * ikinci rota gelince açıldı. Test o geçişi kilitler.
 */
const pathname = vi.hoisted((): { current: string } => ({ current: '/app/projects' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

function renderAt(path: string) {
  pathname.current = path;
  return render(<ProjectTabs />);
}

describe('ProjectTabs', () => {
  it('iki bölümü de gerçek bağlantı olarak verir', () => {
    renderAt('/app/projects');

    expect(screen.getByRole('link', { name: 'Projeler' })).toHaveAttribute('href', '/app/projects');
    expect(screen.getByRole('link', { name: 'Yapılacaklar' })).toHaveAttribute(
      'href',
      '/app/projects/tasks',
    );
  });

  it('/app/projects üzerinde YALNIZCA Projeler aktif', () => {
    renderAt('/app/projects');

    expect(screen.getByRole('link', { name: 'Projeler' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Yapılacaklar' })).not.toHaveAttribute('aria-current');
  });

  it('/app/projects/tasks üzerinde Projeler DEĞİL Yapılacaklar aktif', () => {
    // ⚠️ Önek kontrolü olsaydı burada İKİSİ birden aktif görünürdü:
    // `/app/projects/tasks`, `/app/projects` ile başlıyor.
    renderAt('/app/projects/tasks');

    expect(screen.getByRole('link', { name: 'Yapılacaklar' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Projeler' })).not.toHaveAttribute('aria-current');
  });

  it('proje DETAYINDA hiçbir sekme aktif değil', () => {
    // Detay sayfası hiçbir sekmeye ait değildir; orada aktiflik iddiası yanlış
    // olurdu (`CrmTabs`'ın şirket detayı için verdiği aynı karar).
    renderAt('/app/projects/2f1c9a44-0000-4000-8000-000000000001');

    expect(screen.getByRole('link', { name: 'Projeler' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Yapılacaklar' })).not.toHaveAttribute('aria-current');
  });
});
