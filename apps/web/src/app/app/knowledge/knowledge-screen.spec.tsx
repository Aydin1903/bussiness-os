import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/problem';
import { KnowledgeScreen } from './knowledge-screen';

/**
 * ARŞİV ekranı — liste, sayfalama, kırpma işareti.
 *
 * Tasarım sürüm 2'de (2026-08-05) soru sorma ve not ekleme buradan Panel'e
 * TAŞINDI: birleşen şey eylemlerdi, arşiv değil. O davranışların testleri de
 * Panel'in spec'ine geçti — burada kalsalardı taşınmamış gibi görünürlerdi.
 */
const listNotes = vi.hoisted(() => vi.fn());
const createNote = vi.hoisted(() => vi.fn());
const countUnindexedNotes = vi.hoisted(() => vi.fn());
const reindexNotes = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/knowledge', () => ({
  listNotes,
  createNote,
  countUnindexedNotes,
  reindexNotes,
}));

function note(
  overrides: Partial<{
    id: string;
    title: string | null;
    preview: string;
    bodyLength: number;
  }> = {},
) {
  return {
    id: 'note-1',
    title: 'Fatura sureci',
    preview: 'Muhasebe ekibi her ayin son gunu fatura keser.',
    bodyLength: 45,
    createdAt: '2026-08-04T10:00:00.000Z',
    ...overrides,
  };
}

function page(items: ReturnType<typeof note>[], total = items.length) {
  return { items, total, limit: 20, offset: 0 };
}

function apiError(status: number, detail: string): ApiError {
  return new ApiError(
    status,
    { type: 'https://api.businessos.com/errors/test', title: 'Hata', status, detail },
    'Hata',
  );
}

beforeEach(() => {
  listNotes.mockResolvedValue(page([note()]));
  // Saglikli varsayilan: onarim banner'i cizilmez ve digerlerini bozmaz.
  countUnindexedNotes.mockResolvedValue({ count: 0 });
  createNote.mockResolvedValue({ noteId: 'note-2', chunkCount: 1 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('KnowledgeScreen — liste', () => {
  it('notlari gosterir', async () => {
    render(<KnowledgeScreen />);

    expect(
      await screen.findByText('Muhasebe ekibi her ayin son gunu fatura keser.'),
    ).toBeInTheDocument();
  });

  it('baslik gosterilir', async () => {
    render(<KnowledgeScreen />);

    expect(await screen.findByRole('heading', { name: 'Fatura sureci' })).toBeInTheDocument();
  });

  it('toplam not sayisini gosterir', async () => {
    listNotes.mockResolvedValue(page([note()], 42));
    render(<KnowledgeScreen />);

    expect(await screen.findByText('42 not')).toBeInTheDocument();
  });

  it('bos listede bilgilendirme gosterir', async () => {
    listNotes.mockResolvedValue(page([], 0));
    render(<KnowledgeScreen />);

    expect(await screen.findByText('Henüz not eklenmemiş.')).toBeInTheDocument();
  });

  it('KIRPILMIS not isaretlenir', async () => {
    // `bodyLength > preview.length` -> kullanicinin "burasi bitti mi" diye
    // tahmin etmesi gerekmemeli.
    listNotes.mockResolvedValue(page([note({ preview: 'ilk kisim', bodyLength: 5000 })]));
    render(<KnowledgeScreen />);

    expect(await screen.findByText(/5000 karakterin ilk kısmı/)).toBeInTheDocument();
  });

  it('KIRPILMAMIS notta uyari YOK', async () => {
    listNotes.mockResolvedValue(page([note({ preview: 'tam metin', bodyLength: 9 })]));
    render(<KnowledgeScreen />);

    await screen.findByText('tam metin');
    expect(screen.queryByText(/karakterin ilk kısmı/)).not.toBeInTheDocument();
  });

  it('liste HATASI gorunur olur', async () => {
    listNotes.mockRejectedValue(apiError(500, 'Sunucu hatasi'));
    render(<KnowledgeScreen />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucu hatasi');
  });
});

describe('KnowledgeScreen — sayfalama', () => {
  it('tek sayfada sayfalama butonlari GORUNMEZ', async () => {
    listNotes.mockResolvedValue(page([note()], 1));
    render(<KnowledgeScreen />);

    await screen.findByText('Muhasebe ekibi her ayin son gunu fatura keser.');
    expect(screen.queryByRole('button', { name: 'Sonraki' })).not.toBeInTheDocument();
  });

  it('daha fazla kayit varsa Sonraki gorunur', async () => {
    listNotes.mockResolvedValue(page([note()], 50));
    render(<KnowledgeScreen />);

    expect(await screen.findByRole('button', { name: 'Sonraki' })).toBeInTheDocument();
  });

  it('Sonraki offset i ILERLETIR', async () => {
    listNotes.mockResolvedValue(page([note()], 50));
    render(<KnowledgeScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Sonraki' }));

    await waitFor(() => {
      expect(listNotes).toHaveBeenLastCalledWith({ limit: 20, offset: 20 });
    });
  });

  it('ilk sayfada Onceki DEVRE DISI', async () => {
    listNotes.mockResolvedValue(page([note()], 50));
    render(<KnowledgeScreen />);

    expect(await screen.findByRole('button', { name: 'Önceki' })).toBeDisabled();
  });
});
