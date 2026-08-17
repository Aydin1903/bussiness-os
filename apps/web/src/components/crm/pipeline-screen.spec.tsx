import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PipelineScreen } from './pipeline-screen';

/**
 * `/app/crm/pipeline` — Fırsatlar sayfası.
 *
 * En değerli iddialar: (1) her sütun KENDİ isteğini atar ve KENDİ toplamını
 * gösterir, (2) bir sütun düşerse diğerleri çizilir ama düşen sütun bunu
 * söyler, (3) gösterilenden fazlası varsa sessizce kırpılmaz.
 */
const listOpportunities = vi.hoisted(() => vi.fn());

/*
 * ⚠️ ODANIN DUVARI MOCK'LANIR — bu testin konusu ekranın KENDİ mantığı.
 * Duvar ayrı bir bileşendir, kendi veri çağrılarını yapar ve kendi testini
 * hak eder; buraya karıştırmak her ekran testine ilgisiz mock'lar
 * eklettirirdi (ADR-0038 §6.5 — duvar ortak, tezgah değişir).
 */
vi.mock('./crm-wall', () => ({ CrmWall: () => null }));
vi.mock('@/lib/api/crm', () => ({ listOpportunities }));
// `CrmTabs` aktif sekmeyi yoldan okur.
vi.mock('next/navigation', () => ({ usePathname: () => '/app/crm/pipeline' }));

const STAGES = ['potential', 'in_discussion', 'proposal_sent', 'won', 'lost'] as const;

function opportunity(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    companyId: '22222222-2222-4222-8222-222222222222',
    companyName: 'Kuzey Mimarlık',
    contactId: null,
    title: 'Yıllık sözleşme',
    stage: 'potential',
    estimatedValue: null,
    currency: null,
    nextFollowUpOn: null,
    stageChangedAt: '2026-08-01T09:00:00.000Z',
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  };
}

function page(items: ReturnType<typeof opportunity>[], total = items.length) {
  return { items, total, limit: 20, offset: 0 };
}

/** Aşamaya göre yanıt kuran mock — her sütun ayrı çağrı aldığı için gerekli. */
function respondByStage(map: Partial<Record<string, ReturnType<typeof page>>>) {
  listOpportunities.mockImplementation((params: { stage?: string }) => {
    const stage = params.stage ?? '';
    return Promise.resolve(map[stage] ?? page([]));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  respondByStage({});
});

describe('PipelineScreen — sütun başına bir istek', () => {
  it('BEŞ aşama için BEŞ ayrı istek atar', async () => {
    render(<PipelineScreen />);

    await waitFor(() => {
      expect(listOpportunities).toHaveBeenCalledTimes(5);
    });

    // Her aşama için AYRI çağrı: tek çağrı çekip istemcide gruplamak, 100'ü
    // aşan tenant'ta sütunları keyfî biçimde budardı.
    for (const stage of STAGES) {
      expect(listOpportunities).toHaveBeenCalledWith({
        limit: 4,
        offset: 0,
        stage,
        order: 'priority',
      });
    }
  });

  /**
   * Sayaç SUNUCUDAN gelir. Tek çağrı çekip istemcide gruplamak, sayacı
   * "getirebildiğim kadarı"na indirirdi; kullanıcı onu "hattımda bu aşamada
   * kaç anlaşma var" diye okur.
   */
  it('sütun sayacı sunucunun TOPLAMINI gösterir, gösterilen satır sayısını değil', async () => {
    respondByStage({ potential: page([opportunity()], 37) });

    render(<PipelineScreen />);

    const column = await screen.findByRole('region', { name: /Potansiyel/ });
    expect(within(column).getByText('37')).toBeInTheDocument();
  });

  /**
   * Pano bir ÖZETTİR: aşama başına yalnızca birkaç kart. Kalanı sessizce
   * kırpmak hattı olduğundan küçük gösterirdi; düz bir metin ise sayıyı söyleyip
   * yolu göstermeyen bir çıkmaz sokaktı.
   */
  it('gösterilenden fazlası varsa TAM LİSTEYE bağlanır', async () => {
    respondByStage({ potential: page([opportunity()], 37) });

    render(<PipelineScreen />);

    const link = await screen.findByRole('link', { name: '+36 tümünü gör' });
    expect(link).toHaveAttribute('href', '/app/crm/pipeline/potential');
  });

  it('hepsi görünüyorsa bağlantı ÇİZİLMEZ', async () => {
    respondByStage({ potential: page([opportunity()], 1) });

    render(<PipelineScreen />);

    await screen.findByRole('link', { name: 'Yıllık sözleşme' });
    expect(screen.queryByRole('link', { name: /tümünü gör/ })).not.toBeInTheDocument();
  });

  it('başlık toplamı BEŞ sütunun toplamıdır', async () => {
    respondByStage({
      potential: page([opportunity()], 3),
      won: page([opportunity({ id: 'x', stage: 'won' })], 4),
    });

    render(<PipelineScreen />);

    expect(await screen.findByText('7')).toBeInTheDocument();
  });
});

describe('PipelineScreen — kısmi hata', () => {
  it('bir sütun düşerse diğerleri çizilir ve düşen sütun bunu söyler', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    listOpportunities.mockImplementation((params: { stage?: string }) =>
      params.stage === 'won'
        ? Promise.reject(new Error('ağ'))
        : Promise.resolve(page([opportunity({ stage: params.stage })])),
    );

    render(<PipelineScreen />);

    expect(await screen.findByText('Bu sütun getirilemedi.')).toBeInTheDocument();
    expect(screen.getAllByText('Yıllık sözleşme').length).toBeGreaterThan(0);
  });

  it('bir sütun düşerse başlıkta KESİN bir toplam iddia edilmez', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    listOpportunities.mockImplementation((params: { stage?: string }) =>
      params.stage === 'won' ? Promise.reject(new Error('ağ')) : Promise.resolve(page([], 5)),
    );

    render(<PipelineScreen />);

    expect(
      await screen.findByText('Fırsatların bir kısmı şu an getirilemiyor'),
    ).toBeInTheDocument();
  });
});

/**
 * Beş sütun AYNI ANDA görünür: sabit genişlikli, yatay kaydırmalı düzen
 * (`min-w-max` + `overflow-x-auto`) esnek bir ızgarayla değiştirildi. Sabit
 * genişlik geri gelirse hattın sonu yine ilk bakışta görünmez olur.
 */
describe('PipelineScreen — düzen', () => {
  it('beş sütun tek ızgarada, yatay kaydırma kabı YOK', async () => {
    respondByStage({ potential: page([opportunity()]) });

    const { container } = render(<PipelineScreen />);

    await screen.findByRole('link', { name: 'Yıllık sözleşme' });

    // Sabit genişlik + yatay kaydırma geri gelirse hattın sonu ilk bakışta
    // yine görünmez olur; bu iki sınıf o düzenin imzasıydı.
    expect(container.querySelector('.overflow-x-auto')).toBeNull();
    expect(container.querySelector('.min-w-max')).toBeNull();
    // Sınıf adında `:` var; öznitelik eşlemesi kaçış sorununa girmez.
    expect(container.querySelector('[class*="grid-cols-5"]')).not.toBeNull();
  });

  it('beş aşamanın beşi de çizilir', async () => {
    // ⚠️ Veri ŞART: hiç fırsat yoksa ekran boş durumu gösterir, sütunları değil.
    respondByStage({ potential: page([opportunity()]) });

    render(<PipelineScreen />);

    for (const label of [
      'Potansiyel',
      'Görüşülüyor',
      'Teklif gönderildi',
      'Kazanıldı',
      'Kaybedildi',
    ]) {
      expect(await screen.findByRole('region', { name: label })).toBeInTheDocument();
    }
  });
});

describe('PipelineScreen — içerik', () => {
  it('kart müşteri adını gösterir ve MÜŞTERİYE bağlanır', async () => {
    respondByStage({ potential: page([opportunity()]) });

    render(<PipelineScreen />);

    const link = await screen.findByRole('link', { name: 'Yıllık sözleşme' });
    expect(link).toHaveAttribute('href', '/app/crm/22222222-2222-4222-8222-222222222222');
    expect(screen.getByText('Kuzey Mimarlık')).toBeInTheDocument();
  });

  it('tutarı binlik ayracıyla ve para birimiyle yazar', async () => {
    respondByStage({
      potential: page([opportunity({ estimatedValue: '250000.00', currency: 'TRY' })]),
    });

    render(<PipelineScreen />);

    // Kuruş sıfırsa yazılmaz: "250.000,00" listeyi gürültüyle doldururdu.
    expect(await screen.findByText('250.000 TRY')).toBeInTheDocument();
  });

  it('hiç fırsat yoksa nereden başlanacağını söyler', async () => {
    render(<PipelineScreen />);

    expect(await screen.findByText('Henüz fırsat yok')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Müşterilere git' })).toHaveAttribute(
      'href',
      '/app/crm',
    );
  });

  /**
   * Sürükle-bırak YOK ve bu bilinçli: aşama değişimi `stage_changed_at`'i
   * ilerletir, yani AI'ın yapısal katkısını etkiler. Kazara bir sürükleme o
   * sinyali sessizce bozardı.
   */
  it('Fırsatlar sayfası SALT OKURDUR — kartta hiçbir eylem düğmesi yok', async () => {
    respondByStage({ potential: page([opportunity()]) });

    render(<PipelineScreen />);

    await screen.findByRole('link', { name: 'Yıllık sözleşme' });
    expect(screen.queryByRole('button', { name: /düzenle/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sil/i })).not.toBeInTheDocument();
  });
});
