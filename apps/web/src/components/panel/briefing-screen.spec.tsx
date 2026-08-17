import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/problem';
import { BriefingScreen } from './briefing-screen';

/**
 * BRİFİNG ODASI — `panel-screen.spec`in "günün açılışı" yarısı buraya taşındı.
 *
 * Ayrım Product Owner kararıdır (2026-08-17). Soru-cevap iddiaları
 * `chat-screen.spec`te.
 *
 * En değerli iddialar: İKİ BOŞ DURUM (hiç not yok / not var rapor yok) ve
 * "0 not" ile "sunucu cevap veremedi"nin BİRBİRİNE KARIŞMAMASI.
 */
const listNotes = vi.hoisted(() => vi.fn());
const createNote = vi.hoisted(() => vi.fn());
const fetchDailyReport = vi.hoisted(() => vi.fn());
const countUnindexedNotes = vi.hoisted(() => vi.fn());
const reindexNotes = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/knowledge', () => ({
  listNotes,
  createNote,
  fetchDailyReport,
  countUnindexedNotes,
  reindexNotes,
}));

function note(overrides: Partial<{ id: string; preview: string }> = {}) {
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

beforeEach(() => {
  listNotes.mockReset();
  createNote.mockReset();
  fetchDailyReport.mockReset();
  countUnindexedNotes.mockReset();

  listNotes.mockResolvedValue(page([note()], 12));
  fetchDailyReport.mockResolvedValue({
    report: {
      reportDate: '2026-08-05',
      summary: 'Dün geceden bu yana üç not eklendi.',
      generatedAt: new Date().toISOString(),
    },
  });
  createNote.mockResolvedValue({ noteId: 'n2', chunkCount: 1 });
  countUnindexedNotes.mockResolvedValue({ count: 0 });
});

describe('Brifing — günün açılışı', () => {
  it('rapor VARSA AI gözlemi duvarın kahramanıdır', async () => {
    render(<BriefingScreen />);

    expect(await screen.findByText('Dün geceden bu yana üç not eklendi.')).toBeInTheDocument();
  });

  it('BOŞ DURUM 1 — hiç not yoksa karşılama metni', async () => {
    listNotes.mockResolvedValue(page([], 0));
    fetchDailyReport.mockResolvedValue({ report: null });

    render(<BriefingScreen />);

    expect(await screen.findByText(/Kurumsal hafızanız henüz boş/)).toBeInTheDocument();
  });

  it('BOŞ DURUM 2 — not var ama rapor yoksa AYRI metin', async () => {
    // Bu DAHA SIK karşılaşılan durumdur (yeni tenant, worker ilk turunu atmamış)
    // ve ayrı bir metin gerektirir.
    fetchDailyReport.mockResolvedValue({ report: null });

    render(<BriefingScreen />);

    expect(await screen.findByText(/İlk günlük özetiniz yarın sabah/)).toBeInTheDocument();
  });

  it('rapor çağrısı çökerse brifing ÇÖKMEZ ama boş durum metni de UYDURULMAZ', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchDailyReport.mockRejectedValue(new Error('ağ'));

    render(<BriefingScreen />);

    // "İlk özetiniz yarın sabah" cümlesi, aslında VAR OLAN bir raporu yokmuş
    // gibi gösterebilirdi. Çekilemedi ≠ üretilmedi.
    expect(await screen.findByText(/Bazı bilgiler yüklenemedi/)).toBeInTheDocument();
    expect(screen.queryByText(/İlk günlük özetiniz yarın sabah/)).not.toBeInTheDocument();
    warn.mockRestore();
  });
});

describe('Brifing — açılış verisi düşünce', () => {
  it('"0 not" ile "sunucu cevap veremedi" BİRBİRİNE KARIŞMAZ', async () => {
    /*
     * Sunucu tarafında `knowledge` şeması yokken her iki uç da 500 döndü ve
     * panel sakince "0 not / hafızanız boş" dedi — kullanıcı var olan
     * hafızasını KAYBOLMUŞ sanardı. Sessiz bir doğruluk deliğiydi.
     */
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    listNotes.mockRejectedValue(new Error('ağ'));

    render(<BriefingScreen />);

    expect(await screen.findByText(/Bazı bilgiler yüklenemedi/)).toBeInTheDocument();
    // Sayaç ÇİZİLMEZ: "0" bir ölçüm değil, ölçememenin sonucudur.
    expect(screen.queryByText('Hafıza')).not.toBeInTheDocument();
    warn.mockRestore();
  });

  it('düşen HER çağrı ADIYLA konsola yazılır', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    listNotes.mockRejectedValue(new Error('ağ'));
    fetchDailyReport.mockRejectedValue(new Error('ağ'));

    render(<BriefingScreen />);
    await screen.findByText(/Bazı bilgiler yüklenemedi/);

    // Uç adı KULLANICIYA değil, bakan kişiye söylenir.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('GET /knowledge/notes'),
      expect.anything(),
    );
    warn.mockRestore();
  });

  it('TEK çağrı düşerse diğerinin verisi KAYBOLMAZ', async () => {
    // `allSettled` korunuyor — bildirim onun yerine geçmiyor, üstüne biniyor.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchDailyReport.mockRejectedValue(new Error('ağ'));

    render(<BriefingScreen />);

    expect(await screen.findByText(/Bazı bilgiler yüklenemedi/)).toBeInTheDocument();
    // Notlar geldi: sayaç GERÇEK bir ölçümdür, rapor düştü diye gizlenmez.
    expect(screen.getByText('12')).toBeInTheDocument();
    warn.mockRestore();
  });

  it('her şey yolundayken bildirim GÖRÜNMEZ', async () => {
    render(<BriefingScreen />);
    await screen.findByText('Dün geceden bu yana üç not eklendi.');

    expect(screen.queryByText(/Bazı bilgiler yüklenemedi/)).not.toBeInTheDocument();
  });

  it('"Yeniden dene" veriyi TEKRAR ÇEKER', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    listNotes.mockRejectedValue(new Error('ağ'));
    fetchDailyReport.mockRejectedValue(new Error('ağ'));

    render(<BriefingScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Yeniden dene' }));

    await waitFor(() => {
      expect(listNotes).toHaveBeenCalledTimes(2);
    });
    warn.mockRestore();
  });
});

describe('Brifing — sohbetten AYRI', () => {
  it('⚠️ soru sorma alanı YOK — sohbet ayrı odada', async () => {
    /*
     * ============================================================================
     * BU TESTİN İŞİ BİR ŞEYİN OLMADIĞINI KANITLAMAKTIR
     * ============================================================================
     * Product Owner'ın bildirdiği sorun buydu: "günlük özet ile chat tek odada
     * karışıyor". Brifinge bir soru kutusu geri konursa ekran ÇALIŞMAYA DEVAM
     * EDER ve hiçbir test kırmızı yanmazdı — yalnızca ayrım sessizce ölürdü.
     */
    render(<BriefingScreen />);
    await screen.findByText('Dün geceden bu yana üç not eklendi.');

    expect(screen.queryByLabelText('Kurumsal hafızaya sor')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gönder' })).not.toBeInTheDocument();
  });

  it('sohbete giden düğme birincil eylemdir', async () => {
    render(<BriefingScreen />);

    expect(await screen.findByRole('link', { name: 'Sohbet et →' })).toHaveAttribute(
      'href',
      '/app/chat',
    );
  });

  it('arşive giden tek yol korunur', async () => {
    // `MemoryRail` emekliye ayrıldı; "Tümünü gör" onunla kaybolsaydı
    // `/app/knowledge` kullanıcı için ERİŞİLEMEZ kalırdı.
    render(<BriefingScreen />);

    expect(await screen.findByRole('link', { name: 'Arşiv →' })).toHaveAttribute(
      'href',
      '/app/knowledge',
    );
  });
});

describe('Brifing — not alma', () => {
  it('not eklenir ve liste TAZELENİR', async () => {
    render(<BriefingScreen />);
    await screen.findByText('Dün geceden bu yana üç not eklendi.');

    fireEvent.change(screen.getByLabelText('Not ekle'), {
      target: { value: 'Yeni bir gözlem.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => {
      expect(createNote).toHaveBeenCalledWith({ title: null, body: 'Yeni bir gözlem.' });
    });
    await waitFor(() => {
      expect(listNotes).toHaveBeenCalledTimes(2);
    });
  });

  it('boş not GÖNDERİLMEZ', async () => {
    render(<BriefingScreen />);
    await screen.findByText('Dün geceden bu yana üç not eklendi.');

    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeDisabled();
  });

  it('kayıt hatası kullanıcıya SÖYLENİR', async () => {
    createNote.mockRejectedValue(apiError(500, 'Not kaydedilemedi.'));

    render(<BriefingScreen />);
    await screen.findByText('Dün geceden bu yana üç not eklendi.');

    fireEvent.change(screen.getByLabelText('Not ekle'), { target: { value: 'Bir şey' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText(/Not kaydedilemedi/)).toBeInTheDocument();
  });
});
