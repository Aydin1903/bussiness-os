import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listFeedback = vi.fn();
const getFeedbackSummary = vi.fn();
const createFeedback = vi.fn();
const deleteFeedback = vi.fn();
const useCurrentRole = vi.fn();

vi.mock('@/lib/api/feedback', () => ({
  listFeedback,
  getFeedbackSummary,
  createFeedback,
  deleteFeedback,
}));

vi.mock('@/lib/session/use-current-role', () => ({
  useCurrentRole,
  isReadOnly: (role: string) => role === 'viewer',
}));

const { FeedbackListScreen } = await import('./feedback-list-screen');

const TENANT_ID = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const USER_ID = '018f3a2b-7c4d-7e1f-9b3c-0000000000b1';

function response(overrides: Record<string, unknown> = {}) {
  return {
    id: '018f3a2b-7c4d-7e1f-8a2b-000000000001',
    tenantId: TENANT_ID,
    rating: 2,
    comment: 'siparişim iki hafta gecikti',
    channel: 'Google',
    crmContactId: null,
    contactName: null,
    receivedAt: '2026-08-24T16:30:00.000Z',
    createdByUserId: USER_ID,
    createdAt: '2026-08-24T16:31:00.000Z',
    ...overrides,
  };
}

const SUMMARY = {
  average: '4.2',
  count: 12,
  lowRatingCount: 3,
  withoutCommentCount: 5,
  windowDays: 30,
  lowRatingMax: 2,
};

/**
 * Geri bildirim odası (ADR-0045 §2, §9).
 *
 * ⚠️ BU DOSYANIN EN ÖNEMLİ TESTLERİ BİR ŞEYİN YOKLUĞUNU korur: ekranda HİÇBİR
 * DÜZENLEME YÜZEYİ olmamalı (§2). Birisi iyi niyetle bir "Düzenle" düğmesi
 * eklerse, sunucuda ÜÇ KATMANDA reddedilen şeyi arayüzde vaat etmiş olur ve
 * hiçbir başka test kırmızı yanmaz.
 */
describe('FeedbackListScreen (ADR-0045)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCurrentRole.mockReturnValue('owner');
    listFeedback.mockResolvedValue({ items: [response()], total: 1, limit: 20, offset: 0 });
    getFeedbackSummary.mockResolvedValue(SUMMARY);
    createFeedback.mockResolvedValue(response());
    deleteFeedback.mockResolvedValue(undefined);
  });

  // ==========================================================================
  // ⚠️ DEGISTIRILEMEZLIGIN ARAYUZ KATMANI (§2)
  // ==========================================================================

  it('⚠️ HİÇBİR "Düzenle" YÜZEYİ YOKTUR — kayıt GÜNCELLENMEZ', async () => {
    // Sunucuda üç katman bunu zaten reddediyor (izin yok · metot yok ·
    // veritabanı yetkisi yok). Arayüz DÖRDÜNCÜ katman değil — AYNI GERÇEĞİN
    // görünür hâlidir: bir "Düzenle" düğmesi, sunucu onu reddedecek olsa bile
    // kullanıcıya müşterinin sözünün DÜZELTİLEBİLİR olduğunu söylerdi.
    render(<FeedbackListScreen />);

    await waitFor(() => {
      expect(screen.getByText('siparişim iki hafta gecikti')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /düzenle/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /kaydet/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /detay/i })).not.toBeInTheDocument();
  });

  it('⚠️ owner SİLEBİLİR — ve onay cümlesi NE gideceğini söyler (§2.2)', async () => {
    render(<FeedbackListScreen />);

    await waitFor(() => {
      expect(screen.getByText('siparişim iki hafta gecikti')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /geri bildirimi sil/i }));

    // ⚠️ İki adımlı onay: ikinci adım vektörün de gideceğini SÖYLER. "Emin
    // misiniz" tek başına bilgi taşımaz.
    expect(screen.getByText(/asistanın aramasındaki karşılığı da gider/i)).toBeInTheDocument();
  });

  it('⚠️ member SİLEMEZ — düğme HİÇ ÇİZİLMEZ (§5)', async () => {
    // `feedback:delete` owner/admin'dir. `isReadOnly` KULLANILMAZ: o, member'ı
    // silebilir sayardı.
    useCurrentRole.mockReturnValue('member');
    render(<FeedbackListScreen />);

    await waitFor(() => {
      expect(screen.getByText('siparişim iki hafta gecikti')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /sil/i })).not.toBeInTheDocument();
  });

  it('⚠️ member YAZABİLİR — ekleme yüzeyi çizilir', async () => {
    useCurrentRole.mockReturnValue('member');
    render(<FeedbackListScreen />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /geri bildirim ekle/i })).toBeInTheDocument();
    });
  });

  it('viewer YAZAMAZ — ekleme yüzeyi çizilmez', async () => {
    useCurrentRole.mockReturnValue('viewer');
    render(<FeedbackListScreen />);

    await waitFor(() => {
      expect(screen.getByText('siparişim iki hafta gecikti')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /geri bildirim ekle/i })).not.toBeInTheDocument();
  });

  it('⚠️ rol BİLİNMEZKEN silme düğmesi çizilmez — fail-closed', async () => {
    // Silme GERİ ALINAMAZ; rolü henüz öğrenilmemiş bir kullanıcıya geri
    // alınamaz bir eylem göstermek, iki adımlı onayla bile ilk adımı görünür
    // kılardı.
    useCurrentRole.mockReturnValue('unknown');
    render(<FeedbackListScreen />);

    await waitFor(() => {
      expect(screen.getByText('siparişim iki hafta gecikti')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /sil/i })).not.toBeInTheDocument();
  });

  // ==========================================================================
  // Duvar + liste — İKİ AYRI İSTEK (§9)
  // ==========================================================================

  it('duvar ve liste AYRI uçlardan gelir', async () => {
    render(<FeedbackListScreen />);

    await waitFor(() => {
      expect(getFeedbackSummary).toHaveBeenCalledTimes(1);
    });
    expect(listFeedback).toHaveBeenCalledTimes(1);
  });

  it('⚠️ SİLME SONRASI İKİSİ DE tazelenir — ayrışma olmaz', async () => {
    // Yalnızca liste tazelenseydi duvar eski ortalamayı göstermeye devam
    // ederdi ve hata SESSİZ olurdu.
    render(<FeedbackListScreen />);

    await waitFor(() => {
      expect(screen.getByText('siparişim iki hafta gecikti')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /geri bildirimi sil/i }));
    fireEvent.click(screen.getByRole('button', { name: /evet, sil/i }));

    await waitFor(() => {
      expect(deleteFeedback).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(getFeedbackSummary).toHaveBeenCalledTimes(2);
      expect(listFeedback).toHaveBeenCalledTimes(2);
    });
  });

  it('⚠️ ÖZET HATASI LİSTEYİ ÇÖKERTMEZ', async () => {
    // Ortak bir hata bandına bağlansaydı, çalışan bir listeyi bir toplama
    // sorgusu yüzünden gizlemiş olurduk.
    getFeedbackSummary.mockRejectedValue(new Error('toplama coktu'));
    render(<FeedbackListScreen />);

    await waitFor(() => {
      expect(screen.getByText('siparişim iki hafta gecikti')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Puan bandı filtresi (§10 — arama YOK)
  // ==========================================================================

  it('⚠️ BİR ARAMA KUTUSU YOKTUR — ne anlamsal ne klasik (§10)', async () => {
    render(<FeedbackListScreen />);

    await waitFor(() => {
      expect(screen.getByText('siparişim iki hafta gecikti')).toBeInTheDocument();
    });

    expect(screen.queryByPlaceholderText(/ara/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('düşük puan bandı sunucuya `maxRating` olarak gider', async () => {
    render(<FeedbackListScreen />);

    await waitFor(() => {
      expect(screen.getByText('siparişim iki hafta gecikti')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '≤2' }));

    await waitFor(() => {
      expect(listFeedback).toHaveBeenLastCalledWith({ limit: 20, offset: 0, maxRating: 2 });
    });
  });

  it('⚠️ FİLTRE ÖZETİ ETKİLEMEZ — duvar TÜM pencereyi özetler', async () => {
    // Bağlansaydı "düşük puanlar" filtresinde ortalama 1,4'e düşer ve kullanıcı
    // işletmenin gerçekten öyle olduğunu sanardı.
    render(<FeedbackListScreen />);

    await waitFor(() => {
      expect(getFeedbackSummary).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: '≤2' }));

    await waitFor(() => {
      expect(listFeedback).toHaveBeenCalledTimes(2);
    });
    expect(getFeedbackSummary).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // Yorumsuz kayıt — modülün kendi sınırı (§3.5)
  // ==========================================================================

  it('⚠️ YORUMSUZ kayıt "aramaya girmez" diye AÇIKÇA işaretlenir (§3.5)', async () => {
    // Söylememek, kullanıcının "asistan neden bu puanı bilmiyor" sorusunu
    // CEVAPSIZ bırakırdı. Belge'nin `chunkCount: 0` → "Aranamıyor" rozetiyle
    // aynı desen.
    listFeedback.mockResolvedValue({
      items: [response({ comment: null })],
      total: 1,
      limit: 20,
      offset: 0,
    });
    render(<FeedbackListScreen />);

    await waitFor(() => {
      expect(screen.getByText(/asistanın aramasına girmez/i)).toBeInTheDocument();
    });
  });
});
