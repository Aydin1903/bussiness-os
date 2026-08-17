import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Rail } from '@/components/room/rail';

/**
 * MOBİL — dokunma hedefleri ve marka görünürlüğü.
 *
 * ============================================================================
 * ⚠️ BU TESTLERİN SINIRI: DÜZEN DEĞİL, ÖLÇÜ
 * ============================================================================
 * jsdom düzen hesaplamaz ve medya sorgularını uygulamaz; "dar ekranda nasıl
 * görünüyor" sorusu burada CEVAPLANAMAZ. Cevaplanabilen şey, dokunma
 * hedeflerinin sınıf düzeyinde beyan edilip edilmediğidir.
 *
 * ⚠️ Gerçek dar ekran turu HÂLÂ YAPILMADI ve bu kayıtlıdır: geliştirme
 * ortamındaki tarayıcı penceresi 1280 px'in altına inmiyor, dolayısıyla
 * `md` altındaki düzen (çekmece, alt şerit, klavye/`dvh` davranışı) gerçek
 * bir cihazda sınanmalıdır.
 */
const pathname = vi.hoisted(() => ({ current: '/app' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));
vi.mock('@/components/app-shell/company-switcher', () => ({
  CompanySwitcher: () => <div data-testid="company-switcher" />,
}));
vi.mock('@/components/app-shell/user-menu', () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

describe('Koridor — dokunma hedefleri', () => {
  it('⚠️ kapılar 44 px yüksekliği GARANTİ eder', () => {
    /*
     * Parmak ucunun ortalama teması ~45 px'tir; daha küçük hedefler ıskalanır.
     * `min-h-11` (44 px) sınıf düzeyinde bir GARANTİdir — dolgu değiştiğinde
     * bile taban korunur.
     *
     * Mobil çekmecede koridor daima GENİŞ açılır, yani parmakla kullanılan
     * hâl budur; ikisi de ayrıca sınanıyor.
     */
    render(<Rail collapsed={false} />);

    for (const name of ['Panel', 'Müşteriler', 'Projeler', 'Finans', 'Randevular']) {
      expect(screen.getByRole('link', { name }).className).toContain('min-h-11');
    }
  });

  it('dar hâlde de 44 px korunur', () => {
    render(<Rail collapsed />);

    expect(screen.getByRole('link', { name: 'Finans' }).className).toContain('min-h-11');
  });
});
