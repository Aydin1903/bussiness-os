import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/problem';
import { ChatScreen } from './chat-screen';

/**
 * SOHBET ODASI — `panel-screen.spec`in soru-cevap yarısı buraya taşındı.
 *
 * Ayrım Product Owner kararıdır (2026-08-17): günlük özet ile sohbet aynı
 * ekranda yarışıyordu. Testler de o ayrımı izliyor — brifingin iddiaları
 * `briefing-screen.spec`te.
 *
 * En değerli iddialar: düşünme durumu (sahte daktilo YOK), önerilerin
 * NEREDEN geldiği, ve cevapsız turun akışta bırakılmaması.
 */
const askKnowledge = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/knowledge', () => ({ askKnowledge }));

function apiError(status: number, detail: string): ApiError {
  return new ApiError(
    status,
    { type: 'https://api.businessos.com/errors/test', title: 'Hata', status, detail },
    'Hata',
  );
}

function ask(text: string): void {
  fireEvent.change(screen.getByLabelText('Kurumsal hafızaya sor'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
}

/*
 * ⚠️ jsdom `scrollIntoView` ve `matchMedia` UYGULAMAZ — ikisi de düzen/görünüm
 * API'si ve jsdom düzen hesaplamaz. Bunlar kod kusuru değil ORTAM sınırıdır;
 * mock'lanmazsa otomatik kaydırma efekti `TypeError` fırlatır ve alakasız
 * testler kırmızı yanar.
 *
 * ⚠️ Bu yüzden kaydırmanın GERÇEKTEN çalıştığı burada kanıtlanamaz; yalnızca
 * ÇAĞRILDIĞI kanıtlanır. Davranışın kendisi tarayıcıda doğrulandı.
 */
const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
  askKnowledge.mockReset();
  askKnowledge.mockResolvedValue({
    answer: 'Fatura sürecini Ayşe Yılmaz yönetiyor.',
    sources: [
      { source: 'knowledge', kind: 'note', id: 'note-1' },
      { source: 'knowledge', kind: 'note', id: 'note-2' },
    ],
    degradedSources: [],
    conversationId: 'conv-1',
    followUps: ['Yedek onaycı var mı?'],
  });
});

describe('Sohbet odası — temiz sayfa', () => {
  it('boş açılır: hiçbir tur yok', () => {
    /*
     * ⚠️ "Sohbet et"e tıklayan kullanıcı TEMİZ bir sayfa bekler (Product
     * Owner'ın açık talebi). Odaya girerken geçmiş bir konuşmanın yüklenmesi
     * o beklentiyi bozardı.
     */
    render(<ChatScreen />);

    expect(screen.queryByText('Fatura sürecini Ayşe Yılmaz yönetiyor.')).not.toBeInTheDocument();
    expect(askKnowledge).not.toHaveBeenCalled();
  });

  it('başlangıç soruları LLM ÇAĞRILMADAN gösterilir', () => {
    // Bağlam boşken model çağırmak hem para harcar hem de uydurmaya en uygun
    // koşuldur (ADR-0030).
    render(<ChatScreen />);

    expect(screen.getByRole('button', { name: 'Son altı ayımızı analiz et' })).toBeInTheDocument();
    expect(askKnowledge).not.toHaveBeenCalled();
  });

  it('başlangıç sorusuna tıklamak soruyu SORAR', () => {
    render(<ChatScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Son altı ayımızı analiz et' }));

    expect(askKnowledge).toHaveBeenCalledWith({
      question: 'Son altı ayımızı analiz et',
      conversationId: null,
    });
  });

  it('Panel’e dönüş yolu ekranda GÖRÜNÜR', () => {
    // Sohbet koridorda bir kapı değil; buraya Panel'den gelinir. Tarayıcının
    // geri tuşuna güvenmek, yolu yalnızca onu düşünen kullanıcıya vermek olurdu.
    render(<ChatScreen />);

    expect(screen.getByRole('link', { name: '← Panel' })).toHaveAttribute('href', '/app');
  });

  it('⚠️ mod anahtarı YOK — bu odada tek iş var', () => {
    // "Sor / Not ekle" şeridi burada olsaydı ayrım yeniden bulanırdı; not
    // almak brifingin tezgahındadır.
    render(<ChatScreen />);

    expect(screen.queryByRole('button', { name: 'Not ekle' })).not.toBeInTheDocument();
  });
});

describe('Sohbet odası — soru-cevap akışı', () => {
  it('soru HEMEN akışa girer ve düşünme durumu gösterilir', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    askKnowledge.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    render(<ChatScreen />);
    ask('Fatura sürecini kim yönetiyor?');

    // Soru anında görünür; cevap beklenirken kullanıcı boşluğa bakmaz.
    expect(screen.getByText('Fatura sürecini kim yönetiyor?')).toBeInTheDocument();

    resolve({
      answer: 'Ayşe Yılmaz.',
      sources: [],
      degradedSources: [],
      conversationId: 'conv-1',
      followUps: [],
    });
    expect(await screen.findByText('Ayşe Yılmaz.')).toBeInTheDocument();
  });

  it('cevap ve kaynak sayısı gösterilir', async () => {
    render(<ChatScreen />);
    ask('Fatura sürecini kim yönetiyor?');

    expect(await screen.findByText('Fatura sürecini Ayşe Yılmaz yönetiyor.')).toBeInTheDocument();
    expect(screen.getByText('2 kayda dayanıyor')).toBeInTheDocument();
  });

  it('MODELİN önerdiği çipler gösterilir', async () => {
    render(<ChatScreen />);
    ask('Fatura sürecini kim yönetiyor?');

    expect(await screen.findByRole('button', { name: 'Yedek onaycı var mı?' })).toBeInTheDocument();
  });

  it('İKİNCİ soru aynı konuşmayı sürdürür', async () => {
    render(<ChatScreen />);
    ask('İlk soru');
    await screen.findByText('Fatura sürecini Ayşe Yılmaz yönetiyor.');

    ask('İkinci soru');

    // ⚠️ `conversationId` taşınmazsa asistan her soruda hafızasını kaybeder ve
    // hata SESSİZDİR: cevaplar gelmeye devam eder, yalnızca bağlamsızdır.
    expect(askKnowledge).toHaveBeenLastCalledWith({
      question: 'İkinci soru',
      conversationId: 'conv-1',
    });
  });

  it('yeni tur gelince akışın SONUNA kaydırır', async () => {
    /*
     * Bildirilen hata (Product Owner, 2026-08-17): "ai ile yapılan sohbet
     * otomatik olarak aşağı akmıyor". Cevap görünüm alanının altında kalıyor
     * ve kullanıcı elle kaydırmak zorunda kalıyordu — bir sohbette bu, cevabın
     * hiç gelmediğini sanmaya kadar gider.
     */
    render(<ChatScreen />);
    ask('Bir soru');
    await screen.findByText('Fatura sürecini Ayşe Yılmaz yönetiyor.');

    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('hata olursa CEVAPSIZ TUR akışta BIRAKILMAZ', async () => {
    askKnowledge.mockRejectedValue(apiError(502, 'Sağlayıcı yanıt vermedi.'));

    render(<ChatScreen />);
    ask('Cevapsız kalacak soru');

    // Yarım bir girdi, bir sonraki sorunun bağlamını kirletir gibi görünürdü.
    expect(await screen.findByText(/Sağlayıcı yanıt vermedi/)).toBeInTheDocument();
    expect(screen.queryByText('Cevapsız kalacak soru')).not.toBeInTheDocument();
  });
});
