import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/problem';
import { ONBOARDING_QUESTIONS } from './questions';
import { OnboardingWizard } from './wizard';

/**
 * Wizard akışı — ADR-0030 §3.
 *
 * `createNote` ve `getCurrentTenantId` MOCK'lanır: burada test edilen API
 * sözleşmesi değil, wizard'ın DAVRANIŞIDIR — hangi cevabın nota dönüştüğü,
 * atlamanın ağa çıkmadığı, hatanın kullanıcıyı nerede bıraktığı.
 */
const createNote = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
const getCurrentTenantId = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/knowledge', () => ({ createNote }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/lib/session/session-store', () => ({ getCurrentTenantId }));

const TENANT_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000a1';

function apiError(status: number, title: string): ApiError {
  return new ApiError(
    status,
    { type: 'https://api.businessos.com/errors/test', title, status },
    title,
  );
}

function answerInput(): HTMLElement {
  return screen.getByLabelText(ONBOARDING_QUESTIONS[0]?.question ?? '');
}

function type(value: string): void {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } });
}

function next(): void {
  fireEvent.click(screen.getByRole('button', { name: 'İleri' }));
}

function skip(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Atla' }));
}

/** Tüm soruları atlayarak kapanış ekranına gelir. */
function skipAll(): void {
  for (const _question of ONBOARDING_QUESTIONS) {
    skip();
  }
}

beforeEach(() => {
  createNote.mockResolvedValue({ noteId: 'note-1', chunkCount: 1 });
  getCurrentTenantId.mockReturnValue(TENANT_ID);
  window.localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

// --- Soru-cevap-soru akışı ---------------------------------------------------

describe('OnboardingWizard — akış', () => {
  it('ilk soruyu gosterir', () => {
    render(<OnboardingWizard />);

    expect(answerInput()).toBeInTheDocument();
    expect(screen.getByText(`Soru 1 / ${String(ONBOARDING_QUESTIONS.length)}`)).toBeInTheDocument();
  });

  it('SORULAR TEK TEK gelir — hepsi bir arada DEGIL', async () => {
    // ADR-0030 §3'un "sohbet tarzi" kosulu: ikinci soru, birincisi
    // cevaplanmadan ekranda OLMAMALI.
    render(<OnboardingWizard />);

    expect(screen.queryByText(ONBOARDING_QUESTIONS[1]?.question ?? '')).not.toBeInTheDocument();

    type('Kurumsal yazilim');
    next();

    await waitFor(() => {
      expect(screen.getByText(ONBOARDING_QUESTIONS[1]?.question ?? '')).toBeInTheDocument();
    });
    expect(screen.queryByText(ONBOARDING_QUESTIONS[0]?.question ?? '')).not.toBeInTheDocument();
  });

  it('cevaplanan soru NOT olur: baslik = soru, govde = cevap', async () => {
    render(<OnboardingWizard />);

    type('Kurumsal yazilim gelistiriyoruz');
    next();

    await waitFor(() => {
      expect(createNote).toHaveBeenCalledWith({
        title: ONBOARDING_QUESTIONS[0]?.question,
        body: 'Kurumsal yazilim gelistiriyoruz',
      });
    });
  });

  it('her cevap AYRI not olur (tek birlesik not DEGIL)', async () => {
    render(<OnboardingWizard />);

    type('birinci cevap');
    next();
    await waitFor(() => {
      expect(createNote).toHaveBeenCalledTimes(1);
    });

    type('ikinci cevap');
    next();
    await waitFor(() => {
      expect(createNote).toHaveBeenCalledTimes(2);
    });

    expect(createNote.mock.calls[1]?.[0]).toEqual({
      title: ONBOARDING_QUESTIONS[1]?.question,
      body: 'ikinci cevap',
    });
  });

  it('cevap alani sonraki soruda TEMIZLENIR', async () => {
    render(<OnboardingWizard />);

    type('birinci cevap');
    next();

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('');
    });
  });
});

// --- Atlama ------------------------------------------------------------------

describe('OnboardingWizard — Atla', () => {
  it('atlanan soru icin NOT YAZILMAZ (aga hic cikilmaz)', async () => {
    render(<OnboardingWizard />);

    skip();

    await waitFor(() => {
      expect(screen.getByText(ONBOARDING_QUESTIONS[1]?.question ?? '')).toBeInTheDocument();
    });
    expect(createNote).not.toHaveBeenCalled();
  });

  it('BOS cevapla Ileri, atlamayla ayni sonucu verir', async () => {
    render(<OnboardingWizard />);

    type('   ');
    next();

    await waitFor(() => {
      expect(screen.getByText(ONBOARDING_QUESTIONS[1]?.question ?? '')).toBeInTheDocument();
    });
    expect(createNote).not.toHaveBeenCalled();
  });

  it('atlanan ve cevaplanan sorular KARISMAZ', async () => {
    render(<OnboardingWizard />);

    skip(); // 1. soru atlandi
    type('ikinci sorunun cevabi');
    next();

    await waitFor(() => {
      expect(createNote).toHaveBeenCalledTimes(1);
    });
    expect(createNote.mock.calls[0]?.[0]).toEqual({
      title: ONBOARDING_QUESTIONS[1]?.question,
      body: 'ikinci sorunun cevabi',
    });
  });
});

// --- Kapanis -----------------------------------------------------------------

describe('OnboardingWizard — kapanis', () => {
  it('son sorudan sonra KAPANIS MESAJI gosterilir', () => {
    render(<OnboardingWizard />);

    skipAll();

    expect(screen.getByText(/sistem kullandıkça sizi daha iyi tanıyacak/i)).toBeInTheDocument();
  });

  it('kapanista artik soru YOKTUR', () => {
    render(<OnboardingWizard />);

    skipAll();

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('"Panele git" /app e yonlendirir', () => {
    render(<OnboardingWizard />);

    skipAll();
    fireEvent.click(screen.getByRole('button', { name: 'Panele git' }));

    expect(replace).toHaveBeenCalledWith('/app');
  });

  it('tamamlanmada bayrak YAZILIR — bir daha gosterilmesin', () => {
    render(<OnboardingWizard />);

    skipAll();
    fireEvent.click(screen.getByRole('button', { name: 'Panele git' }));

    expect(window.localStorage.getItem(`bo_onboarding_done:${TENANT_ID}`)).toBe('1');
  });

  it('HEPSI ATLANSA BILE bayrak yazilir', () => {
    // Kritik durum: hic not olusmadigi icin "notu yoksa goster" kosulu HALA
    // dogrudur. Bayrak olmasaydi wizard bir sonraki giriste yeniden acilirdi.
    render(<OnboardingWizard />);

    skipAll();
    fireEvent.click(screen.getByRole('button', { name: 'Panele git' }));

    expect(createNote).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(`bo_onboarding_done:${TENANT_ID}`)).toBe('1');
  });
});

// --- Hata yolu ---------------------------------------------------------------

describe('OnboardingWizard — hata', () => {
  it('not yazilamazsa AYNI soruda kalinir', async () => {
    createNote.mockRejectedValue(apiError(502, 'Not kaydedildi ancak indekslenemedi.'));
    render(<OnboardingWizard />);

    type('bir cevap');
    next();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    // Ilerlenmedi: hala 1. soru.
    expect(screen.getByText(`Soru 1 / ${String(ONBOARDING_QUESTIONS.length)}`)).toBeInTheDocument();
  });

  it('hatada CEVAP EKRANDA KALIR — yeniden yazdirilmaz', async () => {
    createNote.mockRejectedValue(apiError(502, 'Saglayici cevap veremedi.'));
    render(<OnboardingWizard />);

    type('degerli bir cevap');
    next();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('textbox')).toHaveValue('degerli bir cevap');
  });

  it('sunucunun mesaji gosterilir (429 dahil)', async () => {
    createNote.mockRejectedValue(apiError(429, 'Saatlik istek siniri asildi.'));
    render(<OnboardingWizard />);

    type('bir cevap');
    next();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Saatlik istek siniri asildi.');
    });
  });

  it('hata sonrasi TEKRAR denenebilir', async () => {
    createNote.mockRejectedValueOnce(apiError(502, 'Gecici hata.'));
    render(<OnboardingWizard />);

    type('bir cevap');
    next();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    next();

    await waitFor(() => {
      expect(screen.getByText(ONBOARDING_QUESTIONS[1]?.question ?? '')).toBeInTheDocument();
    });
  });
});
