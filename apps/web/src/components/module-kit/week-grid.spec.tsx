import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { WeekGrid, addDays, startOfWeek, type TimeBlock } from './week-grid';

/**
 * `WeekGrid` — modül kitinin genel haftalık gridi (ADR-0035 §7).
 *
 * ⚠️ Testlerin ağırlık merkezi İKİ ŞEY:
 *   1. bileşenin GENEL kalması (hiçbir modüle özgü isim taşımaması),
 *   2. ÇAKIŞAN blokların yan yana çizilmesi — biri diğerini EZMEMESİ.
 */

const MONDAY = startOfWeek(new Date(2026, 7, 17, 12, 0, 0));

function block(overrides: Partial<TimeBlock> & { id: string; hour: number }): TimeBlock {
  const startsAt = new Date(MONDAY);
  startsAt.setHours(overrides.hour, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

  return {
    id: overrides.id,
    startsAt,
    endsAt,
    label: overrides.label ?? `Blok ${overrides.id}`,
    tone: overrides.tone ?? 'accent',
    ...(overrides.detail === undefined ? {} : { detail: overrides.detail }),
  };
}

describe('WeekGrid — hafta hesabı', () => {
  it('haftayı PAZARTESİ başlatır', () => {
    // `getDay()` Pazar=0 döndürür; kaydırma unutulursa hafta bir gün kayar ve
    // hata SESSİZ olur — ekran çalışır, yalnızca sütunlar yanlış güne düşer.
    const sunday = new Date(2026, 7, 23, 15, 0, 0);

    expect(startOfWeek(sunday).getDay()).toBe(1);
    expect(startOfWeek(sunday).getDate()).toBe(17);
  });

  it('hafta başlangıcı GECE YARISINA çekilir', () => {
    expect(startOfWeek(new Date(2026, 7, 19, 23, 45, 0)).getHours()).toBe(0);
  });

  it('gün ekleme saati SIFIRLAR — DST kaymasına dayanıklı', () => {
    expect(addDays(MONDAY, 3).getHours()).toBe(0);
  });
});

describe('WeekGrid — çizim', () => {
  it('YEDİ gün sütunu çizer', () => {
    render(<WeekGrid weekStart={MONDAY} blocks={[]} />);

    for (const label of ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('blok YOKSA boş durum metni gösterir', () => {
    render(<WeekGrid weekStart={MONDAY} blocks={[]} emptyLabel="Bu hafta kayıt yok." />);

    expect(screen.getByText('Bu hafta kayıt yok.')).toBeTruthy();
  });

  it('blokları etiketleriyle çizer', () => {
    render(
      <WeekGrid weekStart={MONDAY} blocks={[block({ id: 'a', hour: 10, label: 'Kontrol' })]} />,
    );

    expect(screen.getByText('Kontrol')).toBeTruthy();
  });

  it('⚠️ ÇAKIŞAN İKİ BLOK YAN YANA — biri diğerini EZMEZ', () => {
    // ⚠️ BU TESTİN İŞİ ADR-0035 §2e'NİN GÖRSEL KARŞILIĞINI KİLİTLEMEKTİR.
    // Çakışma kontrolü bilinçli olarak YOK; grid bunu gizlemez, GÖRÜNÜR kılar.
    // Bloklar üst üste çizilseydi kullanıcı ikinci kaydın VARLIĞINI hiç
    // göremezdi.
    render(
      <WeekGrid
        weekStart={MONDAY}
        blocks={[
          block({ id: 'a', hour: 10, label: 'Birinci' }),
          block({ id: 'b', hour: 10, label: 'Ikinci' }),
        ]}
      />,
    );

    const first = screen.getByText('Birinci').closest('button');
    const second = screen.getByText('Ikinci').closest('button');

    // İkisi de çizildi...
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    // ...ve FARKLI yatay konumdalar (şerit 0 ve şerit 1).
    expect(first?.style.left).not.toBe(second?.style.left);
    // Genişlik yarıya düştü: sütunu PAYLAŞIYORLAR.
    expect(first?.style.width).toContain('50%');
  });

  it('çakışmayan bloklar TAM genişlik alır', () => {
    render(
      <WeekGrid
        weekStart={MONDAY}
        blocks={[
          block({ id: 'a', hour: 9, label: 'Sabah' }),
          block({ id: 'b', hour: 14, label: 'Ogleden sonra' }),
        ]}
      />,
    );

    expect(screen.getByText('Sabah').closest('button')?.style.width).toContain('100%');
  });

  it('şerit sayısı GÜN BAŞINA hesaplanır', () => {
    // Yoğun bir gün, boş günleri DARALTMAMALI.
    const tuesday = new Date(addDays(MONDAY, 1));
    tuesday.setHours(10, 0, 0, 0);

    render(
      <WeekGrid
        weekStart={MONDAY}
        blocks={[
          block({ id: 'a', hour: 10, label: 'Pazartesi tek' }),
          {
            ...block({ id: 'b', hour: 10, label: 'Sali bir' }),
            startsAt: tuesday,
            endsAt: new Date(tuesday.getTime() + 3_600_000),
          },
          {
            ...block({ id: 'c', hour: 10, label: 'Sali iki' }),
            startsAt: tuesday,
            endsAt: new Date(tuesday.getTime() + 3_600_000),
          },
        ]}
      />,
    );

    // Pazartesi'nin tek bloğu tam genişlikte kalır.
    expect(screen.getByText('Pazartesi tek').closest('button')?.style.width).toContain('100%');
    // Salı'nın iki bloğu yarıya iner.
    expect(screen.getByText('Sali bir').closest('button')?.style.width).toContain('50%');
  });

  it('görünen pencerenin DIŞINDAKİ blok KAYBOLMAZ — sınıra yapışır', () => {
    // Gece 02:00'deki bir kayıt ekrandan tamamen kaybolsaydı kullanıcı onun
    // VARLIĞINI hiç öğrenemezdi.
    render(<WeekGrid weekStart={MONDAY} blocks={[block({ id: 'a', hour: 2, label: 'Gece' })]} />);

    expect(screen.getByText('Gece')).toBeTruthy();
  });
});

describe('⚠️ WeekGrid GENEL KALMALI — modül kiti sınavı', () => {
  it('kaynak dosyada RANDEVUYA ÖZGÜ hiçbir isim geçmez', () => {
    // ============================================================================
    // ⚠️ BU TEST BİR SINIRI MAKİNEYLE ZORLAR
    // ============================================================================
    // ADR-0033 Slice 5a'nın kuralı: `module-kit`e modüle özgü hiçbir şey
    // girmez. Kural bugüne kadar İNCELEMEYLE korunuyordu; bu satır onu
    // otomatikleştiriyor.
    //
    // ⚠️ YORUMLAR AYIKLANIR, KOD DENETLENİR. Kural API YÜZEYİ içindir: bir
    // prop, tip ya da alan adı modülü adlandıramaz. Bileşenin NEDEN genel
    // olduğunu anlatan yorumların ADR'ye ve modüle atıf yapması ise DOĞRUDUR —
    // gerekçeyi silmek, kuralı korumak adına onu okunmaz yapardı.
    //
    // Bileşen randevuya özgü bir alan kazanırsa (örneğin `serviceNote`) test
    // KIRMIZI yanar ve doğru cevap belli olur: o alan modülün kendi
    // klasörüne aittir.
    const source = readFileSync(join(__dirname, 'week-grid.tsx'), 'utf8');
    const code = source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/.*$/gm, '');

    for (const forbidden of [
      'appointment',
      'Appointment',
      'randevu',
      'Randevu',
      'serviceNote',
      'contactName',
      'noShow',
      'no_show',
    ]) {
      expect(code).not.toContain(forbidden);
    }
  });
});
