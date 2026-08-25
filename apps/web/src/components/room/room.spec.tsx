import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  Desk,
  DeskPill,
  Hero,
  HeroFigure,
  Room,
  RoomAi,
  RoomScroll,
  RoomTop,
  Satellite,
  Satellites,
} from './room';

/**
 * ODA İSKELETİ — sessizce bozulabilecek kurallar.
 *
 * ⚠️ RENK DEĞERLERİ BURADA TEST EDİLMEZ ve edilemez: değerler
 * `globals.css` / `module-colors.css`'te yaşar, jsdom stylesheet çözmez.
 * Test edilen şey hangi TOKEN AİLESİNİN seçildiğidir — ve asıl kural budur.
 */
describe('Oda — AI’ın sesi', () => {
  it('⚠️ `ai-accent` kullanır, `accent` DEĞİL — hiçbir oda ezemez', () => {
    /*
     * ============================================================================
     * BU, PROJENİN EN KOLAY SESSİZCE BOZULAN KURALI
     * ============================================================================
     * 2026-08-08 kararı: terracotta "AI'ın sesi"dir ve modülün rengi onu
     * ETKİLEMEZ. Oda sistemi bu kuralı GÜÇLENDİRDİ — odalar artık doygun renkli
     * olduğu için terracotta hiçbir odanın rengi değil, dolayısıyla her
     * görüldüğünde tek bir şey diyor.
     *
     * Biri `border-ai-accent`i `border-accent` yapsa ekran ÇALIŞMAYA DEVAM
     * EDER: Finans odasında asistanın çizgisi yeşile, CRM'de çivit mavisine
     * döner ve "burada asistan konuşuyor" cümlesi sessizce ölür. Ne lint ne tip
     * denetimi yakalar.
     */
    const { container } = render(<RoomAi>Personel gideri üç aydır artıyor.</RoomAi>);
    const line = container.firstElementChild;

    expect(line).not.toBeNull();
    expect(line?.className).toContain('border-ai-accent');
    expect(line?.className).not.toMatch(/\bborder-accent\b/);
  });

  it('serif ile konuşur — ürünün sesinden ayrılır', () => {
    // Üç ses üç aile (FRONTEND §4.5): sans ürün, serif AI, mono sistem.
    render(<RoomAi>Eylülde nakit daralabilir.</RoomAi>);

    expect(screen.getByText('Eylülde nakit daralabilir.')).toHaveClass('ai-voice');
  });
});

describe('Oda — tuval', () => {
  it('`room-canvas` sınıfını taşır', () => {
    /*
     * Tuval, modül renginin ekranın ZEMİNİNE yayıldığı yerdir (ADR-0038 §3).
     * Sınıf düşerse oda nötr bir kutuya döner: ekran çalışır, yalnızca
     * teşhisin 3. bulgusu ("renk %2") sessizce geri gelir.
     */
    const { container } = render(<Room>oda</Room>);

    expect(container.firstElementChild?.className).toContain('room-canvas');
  });
});

describe('Oda — kahraman', () => {
  it('etiket ZORUNLU olarak çizilir — bağlamsız rakam bir afiştir', () => {
    render(
      <Hero label="Net · Ağustos · TRY" delta={<span>geçen aya göre %12</span>}>
        <HeroFigure>1.284.500</HeroFigure>
      </Hero>,
    );

    expect(screen.getByText('Net · Ağustos · TRY')).toBeInTheDocument();
    expect(screen.getByText('1.284.500')).toBeInTheDocument();
    expect(screen.getByText('geçen aya göre %12')).toBeInTheDocument();
  });

  it('kahraman rakam `tabular` — yenilenince düzen ZIPLAMASIN', () => {
    // Bu boyutta (≈64px) bir genişlik değişimi ekranın tamamını sarsar.
    render(<HeroFigure>1.284.500</HeroFigure>);

    expect(screen.getByText('1.284.500')).toHaveClass('tabular');
  });
});

describe('Oda — tezgah', () => {
  it('durum işareti renge TEK BAŞINA yaslanmaz', () => {
    /*
     * FRONTEND §4.8'in bağlayıcı kuralı: renk tek ayırt edici olamaz. `hot`
     * yalnızca rengi değil KENARLIĞI da değiştirir, ve etiketin kendisi zaten
     * sözcükle konuşur — renk körlüğü altında hiçbir anlam kaybolmaz.
     */
    const { rerender, container } = render(<DeskPill>gider</DeskPill>);
    const calm = container.firstElementChild?.className ?? '';

    rerender(<DeskPill hot>gelir</DeskPill>);
    const hot = container.firstElementChild?.className ?? '';

    expect(calm).toContain('border-border');
    expect(hot).toContain('border-accent');
    expect(screen.getByText('gelir')).toBeInTheDocument();
  });

  it('⚠️ tezgahın KENDİ kaydırması YOKTUR — duvarla aynı kaydırmadadır', () => {
    /*
     * ============================================================================
     * BU TEST BİR REGRESYONU KİLİTLER — hata çalışan uygulamada bulundu
     * ============================================================================
     * İlk yazımda `Desk` kendi `overflow-y-auto`sunu taşıyordu ve duvar
     * SABİTTİ. Geniş ekranda kusursuz görünüyordu; 1280×720 / DPR 1.5 bir
     * dizüstünde (CSS görünüm alanı 529 px) duvar tüm yüksekliği yedi ve
     * tezgaha ~20 px kaldı: başlığı görünüyor, içeriği görünmüyordu.
     *
     * Asıl mesele estetik değil, ADR-0038 §1'in ihlaliydi: "sekme YOK, mod
     * değiştirme YOK — ikisi AYNI DİKEY KAYDIRMADADIR". Kaydırma
     * `RoomScroll`a aittir.
     *
     * Hata SESSİZDİR: geliştiricinin geniş ekranında hiçbir şey görünmez.
     */
    const { container } = render(<Desk>satırlar</Desk>);

    expect(container.firstElementChild?.className).not.toContain('overflow-y-auto');
  });

  it('kaydırma `RoomScroll`a aittir', () => {
    const { container } = render(<RoomScroll>oda</RoomScroll>);

    expect(container.firstElementChild?.className).toContain('overflow-y-auto');
    // `min-h-0` olmadan flex çocuğu küçülmeyi reddeder ve kaydırma HİÇ oluşmaz.
    expect(container.firstElementChild?.className).toContain('min-h-0');
  });
});

describe('Oda — uydu', () => {
  it('etiket, değer ve not birlikte çizilir', () => {
    render(<Satellite label="Durgun" value={3} note="21 günden uzun" tone="accent" />);

    expect(screen.getByText('Durgun')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('21 günden uzun')).toBeInTheDocument();
  });
});

describe('Oda — uydu sütunu', () => {
  /**
   * ⚠️ VARSAYILAN DEĞİŞMEMELİ: on duvarın hepsi bu bileşeni kullanıyor ve
   * dokuzu tek sütun bekliyor. Varsayılan sessizce ızgaraya dönerse hiçbir
   * test kırmızı yanmaz, yalnızca dokuz ekranın düzeni bozulur.
   */
  it('varsayılan TEK SÜTUNDUR', () => {
    const { container } = render(
      <Satellites>
        <Satellite label="A" value={1} />
      </Satellites>,
    );

    expect(container.firstElementChild?.className).toContain('flex-col');
    expect(container.firstElementChild?.className).not.toContain('grid-cols-2');
  });

  /**
   * ⚠️ DÖRT VE ÜZERİ UYDU İÇİN: tek sütun kahramanın iki katına çıkar,
   * `items-end` hizası kahramanın üstünde büyük bir boşluk bırakır ve duvar
   * ekranı aşağı doğru gereksiz uzatır.
   */
  it('`layout="grid"` İKİ SÜTUNA açar', () => {
    const { container } = render(
      <Satellites layout="grid">
        <Satellite label="A" value={1} />
      </Satellites>,
    );

    expect(container.firstElementChild?.className).toContain('grid-cols-2');
    expect(container.firstElementChild?.className).not.toContain('flex-col');
  });
});

describe('Oda — üst şerit', () => {
  it('oda adını başlık olarak verir', () => {
    render(<RoomTop name="Finans" meta="Ağustos 2026" />);

    expect(screen.getByRole('heading', { name: 'Finans' })).toBeInTheDocument();
    expect(screen.getByText('Ağustos 2026')).toBeInTheDocument();
  });
});
