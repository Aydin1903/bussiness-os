import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HrWall } from './hr-wall';

const EMPLOYEE = {
  id: '018f3a2b-7c4d-7e1f-8a2b-000000000001',
  fullName: 'Ayşe Yılmaz',
  jobTitle: 'Muhasebe Uzmanı',
  workEmail: null,
  workPhone: null,
  employmentStatus: 'active' as const,
  startedOn: '2026-01-15',
  endedOn: null,
  platformUserId: null,
  department: 'Muhasebe',
  employmentType: 'full_time' as const,
  workMode: 'office' as const,
  contractEndsOn: null,
  annualLeaveDays: 14,
  managerEmployeeId: null,
  createdAt: '2026-01-15T09:00:00.000Z',
  updatedAt: '2026-08-24T09:00:00.000Z',
};

const OVERVIEW = { onLeaveToday: 2, contractsEndingSoon: 1 };

describe('HrWall', () => {
  it('kahraman rakam AKTİF ÇALIŞAN SAYISIDIR', () => {
    render(<HrWall total={7} items={[EMPLOYEE]} overview={OVERVIEW} loading={false} />);

    expect(screen.getByText('Aktif çalışan')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  /**
   * ⚠️ DUVARDA HİÇBİR ÜCRET SAYISI YOKTUR — VE OLAMAZ (ADR-0043 §4.4).
   *
   * Bileşen `Employee[]` alır ve o tip ücret TAŞIMAZ. "Toplam maaş gideri"
   * gibi bir kahraman rakam, küçük bir ekipte tek tek maaşlara neredeyse
   * eşittir ve duvar `employee:read` taşıyan DÖRT ROLE de görünür.
   */
  it('⚠️ hiçbir para birimi ya da tutar GÖSTERMEZ', () => {
    const { container } = render(
      <HrWall total={3} items={[EMPLOYEE]} overview={OVERVIEW} loading={false} />,
    );

    expect(container.textContent).not.toMatch(/TRY|EUR|USD|₺|maaş|ücret/i);
  });

  /**
   * ⚠️ AYNI OLGU DUVARDA İKİ KEZ SÖYLENMEZ.
   *
   * "Unvan girilmemiş" sayısı kahramanın `delta` satırında zaten yazılıdır;
   * ayrıca bir uydu olsaydı uydu sütunu bir satır daha uzar ve duvar ekranı
   * aşağı doğru gereksiz uzatırdı.
   */
  it('⚠️ "unvan girilmemiş" YALNIZCA kahramanın altında geçer, uydu DEĞİLDİR', () => {
    const missing = { ...EMPLOYEE, jobTitle: null };
    render(<HrWall total={1} items={[missing]} overview={OVERVIEW} loading={false} />);

    expect(screen.getByText(/kayıtta unvan girilmemiş/)).toBeInTheDocument();
    expect(screen.queryByText('Unvan girilmemiş')).not.toBeInTheDocument();
  });

  /**
   * ⚠️ UYDULAR İKİ SÜTUNLU IZGARADA (`layout="grid"`).
   *
   * Dört uydu tek sütunda kahramanın iki katı yükseklik yapar; `items-end`
   * hizası kahramanın üstünde büyük bir boşluk bırakır ve iki sütun ayrı ayrı
   * yüzer gibi görünür.
   */
  it('⚠️ uydular İKİ SÜTUNLU ızgarada çizilir', () => {
    const { container } = render(
      <HrWall total={3} items={[EMPLOYEE]} overview={OVERVIEW} loading={false} />,
    );

    expect(container.querySelector('.grid-cols-2')).not.toBeNull();
  });

  describe('⚠️ sunucudan gelen iki uydu', () => {
    it('bugün izinde ve yaklaşan sözleşme bitişini gösterir', () => {
      render(<HrWall total={5} items={[EMPLOYEE]} overview={OVERVIEW} loading={false} />);

      expect(screen.getByText('Bugün izinde')).toBeInTheDocument();
      expect(screen.getByText('Sözleşmesi bitiyor')).toBeInTheDocument();
      expect(screen.getByText('30 gün içinde')).toBeInTheDocument();
    });

    /**
     * ⚠️ `null` iken SIFIR GÖSTERİLMEZ — çizilmez.
     *
     * "Bugün izinde: 0" yazmak, uç hata verdiğinde OKUNACAK BİR YALAN olurdu:
     * kullanıcı kimsenin izinde olmadığını sanar.
     */
    it('⚠️ özet gelmediyse iki uydu HİÇ ÇİZİLMEZ (sıfır göstermez)', () => {
      render(<HrWall total={5} items={[EMPLOYEE]} overview={null} loading={false} />);

      expect(screen.queryByText('Bugün izinde')).not.toBeInTheDocument();
      expect(screen.queryByText('Sözleşmesi bitiyor')).not.toBeInTheDocument();
      // Sayfadan türetilen uydular yine de yerinde.
      expect(screen.getByText('Ayrılmış')).toBeInTheDocument();
    });
  });

  it('yüklenirken iskelet çizer, sayı UYDURMAZ', () => {
    const { container } = render(<HrWall total={0} items={[]} overview={null} loading />);

    expect(screen.queryByText('Aktif çalışan')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-hidden]')).not.toBeNull();
  });
});
