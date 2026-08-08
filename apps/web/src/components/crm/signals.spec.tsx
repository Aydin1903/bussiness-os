import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LastContactMark, StageAgeMark } from './signals';

/**
 * Kart sinyalleri — bedava akıllılık.
 *
 * ============================================================================
 * TESTLER SABİT TARİH YAZMAZ
 * ============================================================================
 * Her sinyal BUGÜNE göre hesaplanır; sabit bir tarih yazan test yarın kırmızıya
 * döner. Günler bugünden kaydırılarak üretilir.
 */
function dayOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `days` gün önceki bir ANI UTC ISO-8601 olarak verir (`stageChangedAt` biçimi). */
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

describe('LastContactMark', () => {
  /**
   * ⚠️ `null` ile `0` KARIŞTIRILIRSA ekran yalan söyler: hiç görüşülmemiş bir
   * müşteri "bugün görüşüldü" gibi görünürdü.
   */
  it('hiç görüşülmemişse "henüz görüşülmedi" der — "bugün" DEMEZ', () => {
    render(<LastContactMark day={null} />);

    expect(screen.getByText('Henüz görüşülmedi')).toBeInTheDocument();
  });

  it('yeni eklenmiş (hiç görüşülmemiş) müşteri UYARI SAYILMAZ', () => {
    const { container } = render(<LastContactMark day={null} />);

    // Uyarı işareti terracotta noktayla gelir; sessiz işarette nokta YOKTUR.
    expect(container.querySelector('.bg-accent')).toBeNull();
  });

  it('bugün görüşülmüşse "bugün" der', () => {
    render(<LastContactMark day={dayOffset(0)} />);

    expect(screen.getByText(/Son temas: bugün/)).toBeInTheDocument();
  });

  it('yakın geçmişte görüşülmüşse kaç gün önce olduğunu SESSİZCE söyler', () => {
    const { container } = render(<LastContactMark day={dayOffset(-3)} />);

    expect(screen.getByText(/3 gün önce/)).toBeInTheDocument();
    expect(container.querySelector('.bg-accent')).toBeNull();
  });

  it('eşiği aşan sessizlik UYARIYA döner', () => {
    const { container } = render(<LastContactMark day={dayOffset(-47)} />);

    expect(screen.getByText(/47 gündür temas yok/)).toBeInTheDocument();
    expect(container.querySelector('.bg-accent')).not.toBeNull();
  });

  it('bozuk tarihte gün sayısı UYDURULMAZ', () => {
    render(<LastContactMark day="bozuk" />);

    expect(screen.getByText(/Son temas: bozuk/)).toBeInTheDocument();
  });
});

describe('StageAgeMark', () => {
  /**
   * Her fırsata "3 gündür bu aşamada" yazmak bilgi değil GÜRÜLTÜDÜR ve gerçek
   * uyarıyı görünmez kılar. Kartın sessiz kalması "burada sorun yok" demektir.
   */
  it('eşiğin altında HİÇBİR ŞEY çizmez', () => {
    const { container } = render(<StageAgeMark stageChangedAt={isoDaysAgo(5)} closed={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('eşiği aşınca kaç gündür beklediğini yazar', () => {
    render(<StageAgeMark stageChangedAt={isoDaysAgo(34)} closed={false} />);

    expect(screen.getByText(/34 gündür bekliyor/)).toBeInTheDocument();
  });

  /**
   * Kazanılmış bir anlaşmanın aylardır "kazanıldı" aşamasında durması BEKLENEN
   * şeydir; uyarı değil.
   */
  it('KAPANMIŞ fırsatta çizilmez — ne kadar eski olursa olsun', () => {
    const { container } = render(<StageAgeMark stageChangedAt={isoDaysAgo(400)} closed />);

    expect(container).toBeEmptyDOMElement();
  });

  it('bozuk damgada sessiz kalır', () => {
    const { container } = render(<StageAgeMark stageChangedAt="bozuk" closed={false} />);

    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * Eşikler ortam değişkeninden gelir. Bozuk bir değer sessizce her
 * karşılaştırmayı `false` yapsaydı uyarılar HİÇ görünmezdi ve kimse fark
 * etmezdi — bu yüzden varsayılana düşüş test edilir.
 */
describe('eşik ayarı', () => {
  const original = process.env.NEXT_PUBLIC_CRM_STALE_STAGE_DAYS;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_CRM_STALE_STAGE_DAYS = '5';
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_CRM_STALE_STAGE_DAYS;
    } else {
      process.env.NEXT_PUBLIC_CRM_STALE_STAGE_DAYS = original;
    }
  });

  it('ortam değişkeni eşiği DÜŞÜRÜR', () => {
    render(<StageAgeMark stageChangedAt={isoDaysAgo(7)} closed={false} />);

    expect(screen.getByText(/7 gündür bekliyor/)).toBeInTheDocument();
  });

  it('bozuk değer varsayılana düşer — uyarılar KAYBOLMAZ', () => {
    process.env.NEXT_PUBLIC_CRM_STALE_STAGE_DAYS = 'abc';

    const { container } = render(<StageAgeMark stageChangedAt={isoDaysAgo(7)} closed={false} />);

    // Varsayılan 21 gün: 7 gün eşiğin altında, dolayısıyla sessiz.
    expect(container).toBeEmptyDOMElement();
  });
});
