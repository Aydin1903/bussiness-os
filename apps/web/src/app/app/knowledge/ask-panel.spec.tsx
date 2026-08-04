import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/problem';
import { AskPanel } from './ask-panel';

/**
 * Soru-cevap paneli — konuşma akışı, kaynak rozeti, hata gösterimi.
 *
 * `askKnowledge` MOCK'lanır: test edilen şey panelin DAVRANIŞIDIR — ikinci
 * sorunun konuşmayı sürdürüp sürdürmediği, 429'un nasıl göründüğü.
 */
const askKnowledge = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/knowledge', () => ({ askKnowledge }));

const CONVERSATION_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000c1';

function answerResponse(overrides: Partial<{ answer: string; sourceNoteIds: string[] }> = {}) {
  return {
    answer: 'Fatura surecini Ayse Yilmaz yonetiyor.',
    sourceNoteIds: ['note-1', 'note-2'],
    conversationId: CONVERSATION_ID,
    ...overrides,
  };
}

function apiError(status: number, detail: string): ApiError {
  return new ApiError(
    status,
    { type: 'https://api.businessos.com/errors/test', title: 'Hata', status, detail },
    'Hata',
  );
}

function ask(text: string): void {
  fireEvent.change(screen.getByLabelText('Sorunuz'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Sor' }));
}

beforeEach(() => {
  askKnowledge.mockResolvedValue(answerResponse());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AskPanel — soru sorma', () => {
  it('cevabi thread e ekler', async () => {
    render(<AskPanel hasNotes />);

    ask('Fatura surecini kim yonetiyor?');

    expect(await screen.findByText('Fatura surecini Ayse Yilmaz yonetiyor.')).toBeInTheDocument();
  });

  it('sorulan soru da thread de kalir', async () => {
    render(<AskPanel hasNotes />);

    ask('Fatura surecini kim yonetiyor?');

    expect(await screen.findByText('Fatura surecini kim yonetiyor?')).toBeInTheDocument();
  });

  it('gonderdikten sonra girdi TEMIZLENIR', async () => {
    render(<AskPanel hasNotes />);

    ask('bir soru');

    await waitFor(() => {
      expect(screen.getByLabelText('Sorunuz')).toHaveValue('');
    });
  });

  it('BOS soru gonderilmez', () => {
    render(<AskPanel hasNotes />);

    fireEvent.change(screen.getByLabelText('Sorunuz'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sor' }));

    expect(askKnowledge).not.toHaveBeenCalled();
  });
});

describe('AskPanel — konusma sureklililigi (ADR-0030 §1.2)', () => {
  it('ILK soru conversationId SIZ gider', async () => {
    render(<AskPanel hasNotes />);

    ask('ilk soru');

    await waitFor(() => {
      expect(askKnowledge).toHaveBeenCalledWith({ question: 'ilk soru', conversationId: null });
    });
  });

  it('IKINCI soru sunucunun dondurdugu id ile gider', async () => {
    render(<AskPanel hasNotes />);

    ask('ilk soru');
    await screen.findByText('Fatura surecini Ayse Yilmaz yonetiyor.');

    ask('ikinci soru');

    await waitFor(() => {
      expect(askKnowledge).toHaveBeenLastCalledWith({
        question: 'ikinci soru',
        conversationId: CONVERSATION_ID,
      });
    });
  });

  it('thread BIRIKIR — onceki turlar silinmez', async () => {
    render(<AskPanel hasNotes />);

    ask('ilk soru');
    await screen.findByText('ilk soru');

    askKnowledge.mockResolvedValue(answerResponse({ answer: 'ikinci cevap' }));
    ask('ikinci soru');
    await screen.findByText('ikinci cevap');

    expect(screen.getByText('ilk soru')).toBeInTheDocument();
  });
});

describe('AskPanel — kaynak rozeti', () => {
  it('kaynak SAYISINI gosterir', async () => {
    render(<AskPanel hasNotes />);

    ask('bir soru');

    expect(await screen.findByText('2 nota dayanıyor')).toBeInTheDocument();
  });

  it('kaynak YOKSA rozet gosterilmez', async () => {
    askKnowledge.mockResolvedValue(answerResponse({ sourceNoteIds: [] }));
    render(<AskPanel hasNotes />);

    ask('bir soru');

    await screen.findByText('Fatura surecini Ayse Yilmaz yonetiyor.');
    expect(screen.queryByText(/nota dayanıyor/)).not.toBeInTheDocument();
  });
});

describe('AskPanel — bos baglam ipucu', () => {
  it('not YOKKEN ipucu gosterilir', () => {
    render(<AskPanel hasNotes={false} />);

    expect(screen.getByText(/Henüz notunuz yok/)).toBeInTheDocument();
  });

  it('not VARKEN ipucu gosterilmez', () => {
    render(<AskPanel hasNotes />);

    expect(screen.queryByText(/Henüz notunuz yok/)).not.toBeInTheDocument();
  });

  it('modelin "notunuz yok" cevabina OZEL MUAMELE YOK — normal cevap gibi gosterilir', async () => {
    // Ozel durum yazmak, model ciktisini string eslestirmek demekti ve sistem
    // promptu degisince sessizce bozulurdu.
    askKnowledge.mockResolvedValue(
      answerResponse({
        answer: 'Bu konuda henüz bir notunuz yok. Eklerseniz bir dahaki sefere cevaplayabilirim.',
        sourceNoteIds: [],
      }),
    );
    render(<AskPanel hasNotes />);

    ask('bilinmeyen bir sey');

    expect(await screen.findByText(/Bu konuda henüz bir notunuz yok/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('AskPanel — hata', () => {
  it('429 da SUNUCUNUN mesaji gosterilir', async () => {
    askKnowledge.mockRejectedValue(
      apiError(429, 'Saatlik istek siniri asildi (en fazla 30). 420 saniye sonra tekrar deneyin.'),
    );
    render(<AskPanel hasNotes />);

    ask('bir soru');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Saatlik istek siniri asildi (en fazla 30). 420 saniye sonra tekrar deneyin.',
    );
  });

  it('LIMIT SAYISI istemcide TEKRARLANMAZ', async () => {
    // Sunucu 30 dedi; istemci kendi metninde baska bir sayi tasimamali.
    askKnowledge.mockRejectedValue(apiError(429, 'Saatlik istek siniri asildi (en fazla 7).'));
    render(<AskPanel hasNotes />);

    ask('bir soru');

    expect(await screen.findByRole('alert')).toHaveTextContent('en fazla 7');
  });

  it('502 de gosterilir ve thread KIRLENMEZ', async () => {
    askKnowledge.mockRejectedValue(apiError(502, 'Cevap uretilemedi; lutfen tekrar deneyin.'));
    render(<AskPanel hasNotes />);

    ask('bir soru');

    await screen.findByRole('alert');
    // Cevapsiz bir soru thread'e YAZILMAZ.
    expect(screen.queryByText('bir soru')).not.toBeInTheDocument();
  });

  it('hatadan sonra soru girdide KALIR', async () => {
    askKnowledge.mockRejectedValue(apiError(502, 'Gecici hata.'));
    render(<AskPanel hasNotes />);

    ask('degerli sorum');

    await screen.findByRole('alert');
    expect(screen.getByLabelText('Sorunuz')).toHaveValue('degerli sorum');
  });
});
