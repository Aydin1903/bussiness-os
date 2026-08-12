import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CompanySummaryPanel, firstSentence } from './company-summary';

/**
 * Müşteri özeti — beş ekran durumu (ADR-0032 §5) + "Asistanım" deseni
 * (FRONTEND §4.9).
 *
 * ============================================================================
 * RENK BURADA TEST EDİLMEZ, EDİLEMEZ
 * ============================================================================
 * `--ai-accent` bir CSS değişkenidir ve jsdom stylesheet çözmez. Test edilen
 * şey doğru olan tek şeydir: AI'a ait öğelerin `ai-*` SINIFLARINI taşıması.
 * Sınıf yerindeyse değer `module-colors.css`'in ve `globals.css`'in
 * sorumluluğundadır; gerçek renk tarayıcıda gezilir.
 *
 * ============================================================================
 * ⚠️ BU DOSYADAKİ TESTLER PANELİ ELLE AÇAR — DAVRANIŞ BİLİNÇLİ DEĞİŞTİ
 * ============================================================================
 * Panel bir süre koşulsuz açıktı ve bu testler özeti `render` sonrası doğrudan
 * arıyordu. Artık varsayılan DARALTILMIŞTIR (FRONTEND §4.9), yani "özet
 * görünür" iddiası bir tıklamanın ardındadır. Testler bu yüzden değişti —
 * kırıldıkları için değil, iddia ettikleri şey değiştiği için.
 */
const getCompanySummary = vi.hoisted(() => vi.fn());
const generateCompanySummary = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/crm', () => ({ getCompanySummary, generateCompanySummary }));

const COMPANY_ID = '018f3a2b-7c4d-7e1f-9b3c-0000000000c1';

const READY = {
  summary: 'Acme ile bütçe onaylandı, teklif aşamasında.',
  generatedAt: '2026-08-08T09:00:00.000Z',
  stale: false,
  generating: false,
  summarizable: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  getCompanySummary.mockResolvedValue(READY);
});

function renderPanel(readOnly = false) {
  return render(<CompanySummaryPanel companyId={COMPANY_ID} readOnly={readOnly} />);
}

/** Daraltılmış paneli açar — özet varken her iddia bunun ardındadır. */
async function expand(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { expanded: false }));
}

describe('CompanySummaryPanel — beş durum', () => {
  it('VAR: açıldığında özet metni ve "Yenile" görünür', async () => {
    renderPanel();
    await expand();

    expect(screen.getByText(READY.summary)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yenile' })).toBeInTheDocument();
  });

  it('YOK: davet metni ve "Özet çıkar" düğmesi — TIKLAMA GEREKTİRMEZ', async () => {
    // Özet yoksa daraltacak bir şey yoktur ve panel açık başlar. Aksi hâlde
    // üretim bir tıklamanın arkasında saklanır, yani keşfedilemez olurdu.
    getCompanySummary.mockResolvedValue({ ...READY, summary: null, generatedAt: null });

    renderPanel();

    expect(await screen.findByRole('button', { name: 'Özet çıkar' })).toBeInTheDocument();
  });

  it('BAYAT: rozet DARALTILMIŞKEN de görünür — renk TEK taşıyıcı değil', async () => {
    // Panelin tek satıra inmesinin bedeli bilgi kaybı olmamalı: bayat bir
    // özeti açmadan geçen kullanıcı onu güncel sanardı.
    getCompanySummary.mockResolvedValue({ ...READY, stale: true });

    renderPanel();

    expect(await screen.findByText('değişiklik var')).toBeInTheDocument();
  });

  it('ÜRETİLİYOR: açıldığında düğme kilitli, durum yazıyla söyleniyor', async () => {
    getCompanySummary.mockResolvedValue({ ...READY, generating: true });

    renderPanel();
    await expand();

    expect(screen.getByText('Özet hazırlanıyor…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hazırlanıyor…' })).toBeDisabled();
  });

  it('HATA: uç çökerse blok hiç çizilmez, sayfa çalışmaya devam eder', async () => {
    getCompanySummary.mockRejectedValue(new Error('ağ'));

    const { container } = renderPanel();

    await waitFor(() => {
      expect(container.querySelector('section')).toBeNull();
    });
  });
});

describe('CompanySummaryPanel — görüşme yoksa üretim KAPALI', () => {
  it('düğme çizilmez ve sebep yazıyla söylenir', async () => {
    getCompanySummary.mockResolvedValue({
      ...READY,
      summary: null,
      generatedAt: null,
      summarizable: false,
    });

    renderPanel();

    expect(await screen.findByText(/henüz bir görüşme kaydedilmemiş/)).toBeInTheDocument();
    // Özet de yok, üretim de kapalı → genişletici DE yok. Hiç düğme olmamalı.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('CompanySummaryPanel — israf freni KULLANICIYA söylenir', () => {
  it('regenerated:false ise "mevcut özet güncel" bildirimi çıkar', async () => {
    // Söylenmeseydi kullanıcı "yenile"ye basıp metnin değişmemesini bir hata
    // sanardı — sessiz doğruluk, görünür yanlışlıktan iyi değildir.
    generateCompanySummary.mockResolvedValue({ ...READY, regenerated: false });

    renderPanel();
    await expand();
    fireEvent.click(screen.getByRole('button', { name: 'Yenile' }));

    expect(await screen.findByText(/mevcut özet güncel/)).toBeInTheDocument();
  });

  it('regenerated:true ise bildirim ÇIKMAZ, yeni metin görünür', async () => {
    generateCompanySummary.mockResolvedValue({
      ...READY,
      summary: 'Yeni özet.',
      regenerated: true,
    });

    renderPanel();
    await expand();
    fireEvent.click(screen.getByRole('button', { name: 'Yenile' }));

    expect(await screen.findByText('Yeni özet.')).toBeInTheDocument();
    expect(screen.queryByText(/mevcut özet güncel/)).not.toBeInTheDocument();
  });

  it('409 gelirse hata gösterilir, mevcut özet SİLİNMEZ', async () => {
    generateCompanySummary.mockRejectedValue(new Error('Bu musterinin ozeti su anda hazirlaniyor'));

    renderPanel();
    await expand();
    fireEvent.click(screen.getByRole('button', { name: 'Yenile' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(READY.summary)).toBeInTheDocument();
  });
});

describe('CompanySummaryPanel — viewer OKUR, üretemez', () => {
  it('readOnly iken üretme düğmesi yok ama özet okunabilir', async () => {
    renderPanel(true);
    await expand();

    expect(screen.getByText(READY.summary)).toBeInTheDocument();
    // Tek düğme genişleticidir; "Yenile"/"Özet çıkar" YOKTUR.
    expect(screen.queryByRole('button', { name: 'Yenile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Özet çıkar' })).not.toBeInTheDocument();
  });
});

describe('CompanySummaryPanel — AI sesi', () => {
  it('özet metni serif AI sınıfını taşır', async () => {
    const { container } = renderPanel();
    await expand();

    expect(container.querySelector('.ai-voice-lead')).not.toBeNull();
  });

  it('asistan noktası `bg-ai-accent` taşır — modülün rengini DEĞİL', async () => {
    const { container } = renderPanel();

    await screen.findByRole('button', { expanded: false });
    expect(container.querySelector('.bg-ai-accent')).not.toBeNull();
    expect(container.querySelector('.bg-accent')).toBeNull();
  });
});

/**
 * ============================================================================
 * "ASİSTANIM" DESENİ (FRONTEND §4.9) — daraltılmış varsayılan
 * ============================================================================
 * Bu blok deseni KİLİTLER. Panel yeniden koşulsuz açık hâle getirilirse ya da
 * önizleme sessizce boşalırsa testler kırmızı yanar.
 */
describe('CompanySummaryPanel — "Asistanım" deseni', () => {
  it('VARSAYILAN DARALTILMIŞ: tam özet çizilmez, önizleme çizilir', async () => {
    renderPanel();

    const trigger = await screen.findByRole('button', { expanded: false });
    expect(trigger).toHaveTextContent('Asistanım');
    // Tek cümlelik özette önizleme = özetin kendisi; iddia edilen şey tam
    // metnin `ai-voice-lead` bloğunun ÇİZİLMEMESİDİR.
    expect(document.querySelector('.ai-voice-lead')).toBeNull();
  });

  it('önizleme İLK CÜMLEDİR, tamamı değil', async () => {
    getCompanySummary.mockResolvedValue({
      ...READY,
      summary: 'Bütçe onaylandı. Teklif hazırlanıyor. Cuma günü aranacak.',
    });

    renderPanel();

    expect(await screen.findByText('Bütçe onaylandı.')).toBeInTheDocument();
    expect(screen.queryByText(/Cuma günü aranacak/)).not.toBeInTheDocument();
  });

  it('tıklayınca AÇILIR, tekrar tıklayınca KAPANIR', async () => {
    renderPanel();

    const trigger = await screen.findByRole('button', { expanded: false });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('.ai-voice-lead')).not.toBeNull();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('.ai-voice-lead')).toBeNull();
  });

  it("⚠️ `aria-controls` SARKMAZ: yalnızca gövde DOM'dayken verilir", async () => {
    // Gövde koşullu çizilir. Öznitelik koşulsuz verilseydi daraltılmış hâlde
    // var olmayan bir id'yi işaret ederdi ve bu SESSİZ bir ARIA hatasıdır:
    // tarayıcı uyarmaz, ekran okuyucu bulunamayacak bir gövdeye yönlendirilir.
    // Gerçek tarayıcıda ölçülerek yakalandı (`govdeVar: false`).
    renderPanel();

    const trigger = await screen.findByRole('button', { expanded: false });
    expect(trigger).not.toHaveAttribute('aria-controls');

    fireEvent.click(trigger);

    const bodyId = trigger.getAttribute('aria-controls');
    // Cast yok (proje tip assertion yasaklar): `throw` hem daraltmayı yapar
    // hem öznitelik hiç yoksa testi anlamlı bir mesajla düşürür.
    if (bodyId === null) {
      throw new Error('`aria-controls` yok — genişletici gövdeyi işaret etmiyor.');
    }

    expect(document.getElementById(bodyId)).not.toBeNull();
  });

  it('açık gövde KENDİ İÇİNDE kaydırır — sayfayı taşırmaz', async () => {
    // Kabul ölçütü: uzun bir özetle bile sayfa taşmaz. jsdom düzen hesaplamaz,
    // bu yüzden test edilebilen doğru şey kaydırma kutusunun VARLIĞIDIR.
    renderPanel();
    await expand();

    const box = document.querySelector('.overflow-y-auto');
    expect(box).not.toBeNull();
    expect(box?.className).toContain('max-h-');
  });
});

/**
 * ============================================================================
 * `firstSentence` — SAHTE SAYI ÜRETMEME kararının test edilebilir çekirdeği
 * ============================================================================
 * Bu yardımcı "3 gözlemim var" cümlesinin YERİNE geçti (bkz. bileşendeki
 * gerekçe: sayılabilir bir birim backend'de yok). Buradaki testler onun
 * korumalarını kilitler.
 */
describe('firstSentence', () => {
  it('ilk cümleyi noktasıyla birlikte verir', () => {
    expect(firstSentence('Bütçe onaylandı. Teklif hazırlanıyor.')).toBe('Bütçe onaylandı.');
  });

  it('⚠️ PARAYI BÖLMEZ: binlik ayracı cümle sonu sayılmaz', () => {
    // Türkçe'de binlik ayracı noktadır ve bu projede para sunucunun kanonik
    // dizesi olarak yazılır. Naif bir `.` bölmesi burada üç sahte cümle
    // üretirdi — sayı göstermeme kararının asıl sebebi budur.
    expect(firstSentence('Teklif 1.500.000 TL olarak verildi. Cevap bekleniyor.')).toBe(
      'Teklif 1.500.000 TL olarak verildi.',
    );
  });

  it('kısaltmadan sonra küçük harf gelirse bölmez', () => {
    expect(firstSentence('Sunum, demo vb. ve fiyat konuşuldu. Sonra karar verilecek.')).toBe(
      'Sunum, demo vb. ve fiyat konuşuldu.',
    );
  });

  it('tek cümlelik özette tamamını verir', () => {
    expect(firstSentence('Bütçe onaylandı')).toBe('Bütçe onaylandı');
  });

  it('soru ve ünlem de cümle sonudur', () => {
    expect(firstSentence('Fiyat neden yüksek? Açıklama istendi.')).toBe('Fiyat neden yüksek?');
  });

  it('baştaki/sondaki boşluğu temizler — ASLA boş dize dönmez', () => {
    expect(firstSentence('   Bütçe onaylandı.   ')).toBe('Bütçe onaylandı.');
  });
});
