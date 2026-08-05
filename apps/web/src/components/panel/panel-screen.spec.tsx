import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/problem';
import { PanelScreen } from './panel-screen';

/**
 * Panel — Genel Bakış ile Bilgi Bankası'nın birleştiği yüzey.
 *
 * En değerli iddialar: İKİ BOŞ DURUM (hiç not yok / not var rapor yok),
 * düşünme durumu (sahte daktilo YOK) ve öneri çiplerinin nereden geldiği.
 */
const listNotes = vi.hoisted(() => vi.fn());
const createNote = vi.hoisted(() => vi.fn());
const askKnowledge = vi.hoisted(() => vi.fn());
const fetchDailyReport = vi.hoisted(() => vi.fn());
const countUnindexedNotes = vi.hoisted(() => vi.fn());
const reindexNotes = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/knowledge', () => ({
  listNotes,
  createNote,
  askKnowledge,
  fetchDailyReport,
  countUnindexedNotes,
  reindexNotes,
}));

function note(overrides: Partial<{ id: string; title: string | null; preview: string }> = {}) {
  return {
    id: 'note-1',
    title: 'Fatura süreci',
    preview: 'Muhasebe her ayın son günü fatura keser.',
    bodyLength: 40,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function page(items: ReturnType<typeof note>[], total = items.length) {
  return { items, total, limit: 3, offset: 0 };
}

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

beforeEach(() => {
  listNotes.mockResolvedValue(page([note()], 12));
  fetchDailyReport.mockResolvedValue({
    report: {
      reportDate: '2026-08-05',
      summary: 'Dün geceden bu yana üç not eklendi.',
      generatedAt: new Date().toISOString(),
    },
  });
  createNote.mockResolvedValue({ noteId: 'n2', chunkCount: 1 });
  askKnowledge.mockResolvedValue({
    answer: 'Fatura sürecini Ayşe Yılmaz yönetiyor.',
    sourceNoteIds: ['note-1', 'note-2'],
    conversationId: 'conv-1',
    followUps: ['Yedek onaycı var mı?'],
  });
  countUnindexedNotes.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('PanelScreen — günün açılışı', () => {
  it('rapor VARSA AI gözlemi gösterilir', async () => {
    expect(render(<PanelScreen />)).toBeDefined();

    expect(await screen.findByText('Dün geceden bu yana üç not eklendi.')).toBeInTheDocument();
  });

  it('BOŞ DURUM 1 — hiç not yoksa karşılama metni', async () => {
    listNotes.mockResolvedValue(page([], 0));
    fetchDailyReport.mockResolvedValue({ report: null });

    render(<PanelScreen />);

    expect(await screen.findByText(/Kurumsal hafızanız henüz boş/)).toBeInTheDocument();
  });

  it('BOŞ DURUM 2 — not var ama rapor yoksa AYRI metin', async () => {
    // Yeni tenant, worker ilk turunu atmamış. Daha SIK karşılaşılan durum.
    listNotes.mockResolvedValue(page([note()], 5));
    fetchDailyReport.mockResolvedValue({ report: null });

    render(<PanelScreen />);

    expect(await screen.findByText(/İlk günlük özetiniz yarın sabah/)).toBeInTheDocument();
    expect(screen.queryByText(/henüz boş/)).not.toBeInTheDocument();
  });

  it('rapor çağrısı çökerse panel ÇÖKMEZ ama boş durum metni de UYDURULMAZ', async () => {
    // ESKİ DAVRANIŞ: çöken rapor "yok sayılır" ve boş durum metni gösterilirdi.
    // Bu, "rapor henüz üretilmedi" ile "raporu getiremedim"i aynı ekrana
    // düşürüyordu. Test silinmedi, yeni gerçeğe göre güncellendi.
    fetchDailyReport.mockRejectedValue(new Error('ağ'));

    render(<PanelScreen />);

    expect(await screen.findByText(/Bazı bilgiler yüklenemedi/)).toBeInTheDocument();
    expect(screen.queryByText(/İlk günlük özetiniz/)).not.toBeInTheDocument();
    // Panel çalışmaya devam eder.
    expect(screen.getByLabelText('Kurumsal hafızaya sor')).toBeInTheDocument();
  });
});

describe('PanelScreen — açılış verisi düşünce', () => {
  it('"0 not" ile "sunucu cevap veremedi" BİRBİRİNE KARIŞMAZ', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    listNotes.mockRejectedValue(apiError(500, 'Beklenmeyen bir hata olustu.'));
    fetchDailyReport.mockRejectedValue(apiError(500, 'Beklenmeyen bir hata olustu.'));

    render(<PanelScreen />);

    expect(await screen.findByText(/Bazı bilgiler yüklenemedi/)).toBeInTheDocument();
    // Sayaç ÇİZİLMEZ: "0 not" bir ölçüm değil, ölçememenin sonucudur.
    expect(screen.queryByText(/not$/)).not.toBeInTheDocument();
    // Hafıza hakkında hiçbir iddia edilmez.
    expect(screen.queryByText(/Kurumsal hafızanız henüz boş/)).not.toBeInTheDocument();
    warn.mockRestore();
  });

  it('düşen HER çağrı ADIYLA konsola yazılır', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    listNotes.mockRejectedValue(new Error('ağ'));
    fetchDailyReport.mockRejectedValue(new Error('ağ'));

    render(<PanelScreen />);
    await screen.findByText(/Bazı bilgiler yüklenemedi/);

    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.some((message) => message.includes('GET /knowledge/notes'))).toBe(true);
    expect(messages.some((message) => message.includes('GET /knowledge/daily-report'))).toBe(true);
    warn.mockRestore();
  });

  it('TEK çağrı düşerse diğerinin verisi KAYBOLMAZ', async () => {
    // `allSettled` korunuyor — bildirim onun yerine geçmiyor, üstüne biniyor.
    fetchDailyReport.mockRejectedValue(new Error('ağ'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(<PanelScreen />);

    expect(await screen.findByText(/Bazı bilgiler yüklenemedi/)).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    warn.mockRestore();
  });

  it('her şey yolundayken bildirim GÖRÜNMEZ', async () => {
    render(<PanelScreen />);
    await screen.findByText('Dün geceden bu yana üç not eklendi.');

    expect(screen.queryByText(/Bazı bilgiler yüklenemedi/)).not.toBeInTheDocument();
  });

  it('"Yeniden dene" veriyi TEKRAR ÇEKER', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    listNotes.mockRejectedValue(new Error('ağ'));
    fetchDailyReport.mockRejectedValue(new Error('ağ'));

    render(<PanelScreen />);
    await screen.findByText(/Bazı bilgiler yüklenemedi/);

    // Sunucu ayağa kalktı.
    listNotes.mockResolvedValue(page([note()], 12));
    fetchDailyReport.mockResolvedValue({ report: null });
    fireEvent.click(screen.getByRole('button', { name: 'Yeniden dene' }));

    expect(await screen.findByText(/İlk günlük özetiniz/)).toBeInTheDocument();
    expect(screen.queryByText(/Bazı bilgiler yüklenemedi/)).not.toBeInTheDocument();
    warn.mockRestore();
  });
});

describe('PanelScreen — başlangıç çipleri (LLM ÇAĞRILMADAN)', () => {
  it('hiç not yokken onboarding tarzı sorular', async () => {
    listNotes.mockResolvedValue(page([], 0));
    fetchDailyReport.mockResolvedValue({ report: null });

    render(<PanelScreen />);

    expect(
      await screen.findByRole('button', { name: 'Şirketiniz ne iş yapıyor?' }),
    ).toBeInTheDocument();
    expect(askKnowledge).not.toHaveBeenCalled();
  });

  it('not varken hafızaya yönelik sorular', async () => {
    render(<PanelScreen />);

    expect(
      await screen.findByRole('button', { name: 'Notlarımda neler var?' }),
    ).toBeInTheDocument();
  });

  it('başlangıç çipine tıklamak soruyu SORAR', async () => {
    render(<PanelScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notlarımda neler var?' }));

    await waitFor(() => {
      expect(askKnowledge).toHaveBeenCalledWith({
        question: 'Notlarımda neler var?',
        conversationId: null,
      });
    });
  });
});

describe('PanelScreen — soru-cevap akışı', () => {
  it('soru HEMEN akışa girer ve düşünme durumu gösterilir', async () => {
    // SAHTE DAKTİLO YOK: gerçek durum gösterilir. Cevap henüz gelmemişken
    // kullanıcı boş ekrana bakmaz.
    let resolve: (value: unknown) => void = () => undefined;
    askKnowledge.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<PanelScreen />);
    await screen.findByText('Dün geceden bu yana üç not eklendi.');

    ask('Onay adımı neden tek kişiye bağlı?');

    expect(await screen.findByText('Onay adımı neden tek kişiye bağlı?')).toBeInTheDocument();
    expect(screen.getByText('Notlarınıza bakıyorum…')).toBeInTheDocument();

    resolve({
      answer: 'Cevap.',
      sourceNoteIds: [],
      conversationId: 'c',
      followUps: [],
    });
    await waitFor(() => {
      expect(screen.queryByText('Notlarınıza bakıyorum…')).not.toBeInTheDocument();
    });
  });

  it('cevap ve kaynak sayısı gösterilir', async () => {
    render(<PanelScreen />);
    await screen.findByText('Dün geceden bu yana üç not eklendi.');

    ask('bir soru');

    expect(await screen.findByText('Fatura sürecini Ayşe Yılmaz yönetiyor.')).toBeInTheDocument();
    expect(screen.getByText('2 nota dayanıyor')).toBeInTheDocument();
  });

  it('MODELİN önerdiği çipler gösterilir', async () => {
    render(<PanelScreen />);
    await screen.findByText('Dün geceden bu yana üç not eklendi.');

    ask('bir soru');

    expect(await screen.findByRole('button', { name: 'Yedek onaycı var mı?' })).toBeInTheDocument();
  });

  it('İKİNCİ soru aynı konuşmayı sürdürür', async () => {
    render(<PanelScreen />);
    await screen.findByText('Dün geceden bu yana üç not eklendi.');

    ask('ilk soru');
    await screen.findByText('Fatura sürecini Ayşe Yılmaz yönetiyor.');

    ask('ikinci soru');

    await waitFor(() => {
      expect(askKnowledge).toHaveBeenLastCalledWith({
        question: 'ikinci soru',
        conversationId: 'conv-1',
      });
    });
  });

  it('hata olursa CEVAPSIZ TUR akışta BIRAKILMAZ', async () => {
    askKnowledge.mockRejectedValue(apiError(429, 'Saatlik istek sınırı aşıldı (en fazla 30).'));
    render(<PanelScreen />);
    await screen.findByText('Dün geceden bu yana üç not eklendi.');

    ask('bir soru');

    expect(await screen.findByRole('alert')).toHaveTextContent('en fazla 30');
    expect(screen.queryByText('bir soru')).not.toBeInTheDocument();
  });
});

describe('PanelScreen — not ekleme (panelden çıkmadan)', () => {
  it('mod değiştirilip not eklenebilir', async () => {
    render(<PanelScreen />);
    await screen.findByText('Dün geceden bu yana üç not eklendi.');

    fireEvent.click(screen.getByRole('button', { name: 'Not ekle' }));
    fireEvent.change(screen.getByLabelText('Not ekle'), { target: { value: 'Yeni bir not' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));

    await waitFor(() => {
      expect(createNote).toHaveBeenCalledWith({ title: null, body: 'Yeni bir not' });
    });
  });

  it('mod değişimi yazma alanının ODAĞINI KAYBETTİRMEZ', async () => {
    // Bildirilen hata: mod değiştirince alan sönüp yeniden "açılıyor"du.
    // Sebep remount değil, ODAK KAYBIYDI — form `focus-within` ile halka
    // taşıyor ve odak gidince halka 200 ms boyunca sönüyordu.
    render(<PanelScreen />);
    await screen.findByText('Dün geceden bu yana üç not eklendi.');

    const input = screen.getByLabelText('Kurumsal hafızaya sor');
    input.focus();

    // Odağı ÖNCE düşürüyoruz. jsdom'da `click` zaten odak taşımaz; blur
    // olmadan bu test düzeltme YOKKEN de geçerdi ve hiçbir şey kanıtlamazdı.
    // Böylece iddia netleşir: `pickMode` odağı GERİ VERİYOR mu?
    input.blur();
    expect(document.activeElement).not.toBe(input);

    fireEvent.click(screen.getByRole('button', { name: 'Not ekle' }));

    // AYNI düğüm (remount yok) ve odak geri geldi.
    expect(screen.getByLabelText('Not ekle')).toBe(input);
    expect(document.activeElement).toBe(input);
  });

  it('mod değişimi YAZILMIŞ METNİ korur', async () => {
    render(<PanelScreen />);
    await screen.findByText('Dün geceden bu yana üç not eklendi.');

    const input = screen.getByLabelText('Kurumsal hafızaya sor');
    fireEvent.change(input, { target: { value: 'yarım kalan metin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Not ekle' }));

    expect(screen.getByLabelText('Not ekle')).toHaveValue('yarım kalan metin');
  });

  it('mod düğmesi fare odağını ÇALMAZ (mousedown engellenir)', async () => {
    render(<PanelScreen />);
    await screen.findByText('Dün geceden bu yana üç not eklendi.');

    const button = screen.getByRole('button', { name: 'Not ekle' });
    // `preventDefault` çağrıldıysa tarayıcı odağı BU DÜĞMEYE taşımaz.
    const prevented = !fireEvent.mouseDown(button);
    expect(prevented).toBe(true);
  });

  it('not eklenince liste TAZELENİR', async () => {
    render(<PanelScreen />);
    await screen.findByText('Dün geceden bu yana üç not eklendi.');
    const before = listNotes.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Not ekle' }));
    fireEvent.change(screen.getByLabelText('Not ekle'), { target: { value: 'not' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));

    await waitFor(() => {
      expect(listNotes.mock.calls.length).toBeGreaterThan(before);
    });
  });
});

describe('PanelScreen — hafıza sayacı', () => {
  it('toplam not sayısı başlıkta', async () => {
    render(<PanelScreen />);

    expect(await screen.findByText('12')).toBeInTheDocument();
  });
});
