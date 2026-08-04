import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/problem';
import { ReindexBanner } from './reindex-banner';

/**
 * Onarım banner'ı — sessiz doğruluk deliğini görünür kılan tek yüzey.
 *
 * `countUnindexedNotes` / `reindexNotes` MOCK'lanır; test edilen şey banner'ın
 * NE ZAMAN göründüğü ve onarımdan sonra ne yaptığıdır.
 */
const countUnindexedNotes = vi.hoisted(() => vi.fn());
const reindexNotes = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/knowledge', () => ({ countUnindexedNotes, reindexNotes }));

function apiError(status: number, detail: string): ApiError {
  return new ApiError(
    status,
    { type: 'https://api.businessos.com/errors/test', title: 'Hata', status, detail },
    'Hata',
  );
}

function repairButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Düzelt' });
}

beforeEach(() => {
  countUnindexedNotes.mockResolvedValue({ count: 3 });
  reindexNotes.mockResolvedValue({ repaired: 3, failed: 0, remaining: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ReindexBanner — gorunurluk', () => {
  it('bozuk not VARSA sayiyi gosterir', async () => {
    render(<ReindexBanner onRepaired={vi.fn()} />);

    expect(await screen.findByText('3 notunuz aranabilir değil')).toBeInTheDocument();
  });

  it('bozuk not YOKSA hicbir sey cizilmez', async () => {
    // Olagan durumda uyari gostermek, uyariyi degersizlestirir.
    countUnindexedNotes.mockResolvedValue({ count: 0 });

    const { container } = render(<ReindexBanner onRepaired={vi.fn()} />);

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });

  it('SAYIM COKERSE banner gosterilmez, sayfa da cokmez', async () => {
    countUnindexedNotes.mockRejectedValue(new Error('ag hatasi'));

    const { container } = render(<ReindexBanner onRepaired={vi.fn()} />);

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });
});

describe('ReindexBanner — onarim', () => {
  it('Duzelt onarimi tetikler', async () => {
    render(<ReindexBanner onRepaired={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Düzelt' }));

    await waitFor(() => {
      expect(reindexNotes).toHaveBeenCalled();
    });
  });

  it('onarim bitince banner KAYBOLUR', async () => {
    render(<ReindexBanner onRepaired={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Düzelt' }));

    await waitFor(() => {
      expect(screen.queryByText(/notunuz aranabilir değil/)).not.toBeInTheDocument();
    });
  });

  it('KALAN varsa banner yeni sayiyla DURUR', async () => {
    // Tek cagri batch kadar onarir; kalan sunucudan gelir, istemci TAHMIN ETMEZ.
    reindexNotes.mockResolvedValue({ repaired: 2, failed: 0, remaining: 5 });
    render(<ReindexBanner onRepaired={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Düzelt' }));

    expect(await screen.findByText('5 notunuz aranabilir değil')).toBeInTheDocument();
  });

  it('onarim olunca LISTE TAZELENIR', async () => {
    const onRepaired = vi.fn();
    render(<ReindexBanner onRepaired={onRepaired} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Düzelt' }));

    await waitFor(() => {
      expect(onRepaired).toHaveBeenCalled();
    });
  });

  it('hicbir sey onarilmadiysa liste TAZELENMEZ', async () => {
    reindexNotes.mockResolvedValue({ repaired: 0, failed: 3, remaining: 3 });
    const onRepaired = vi.fn();
    render(<ReindexBanner onRepaired={onRepaired} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Düzelt' }));

    await waitFor(() => {
      expect(reindexNotes).toHaveBeenCalled();
    });
    expect(onRepaired).not.toHaveBeenCalled();
  });
});

describe('ReindexBanner — hata', () => {
  it('429 da SUNUCUNUN mesaji gosterilir', async () => {
    reindexNotes.mockRejectedValue(
      apiError(429, 'Saatlik istek siniri asildi (en fazla 60). 300 saniye sonra tekrar deneyin.'),
    );
    render(<ReindexBanner onRepaired={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Düzelt' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('en fazla 60');
  });

  it('hatadan sonra Duzelt TEKRAR denenebilir', async () => {
    reindexNotes.mockRejectedValueOnce(apiError(502, 'Gecici hata.'));
    render(<ReindexBanner onRepaired={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Düzelt' }));
    await screen.findByRole('alert');

    fireEvent.click(repairButton());

    await waitFor(() => {
      expect(reindexNotes).toHaveBeenCalledTimes(2);
    });
  });
});
