'use client';

import type { NoteListItem } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { errorMessage } from '@/lib/api/error-message';
import { listNotes } from '@/lib/api/knowledge';
import { AskPanel } from './ask-panel';
import { NoteForm } from './note-form';
import { NoteList, PAGE_SIZE } from './note-list';

interface ListState {
  readonly items: readonly NoteListItem[];
  readonly total: number;
}

/** Liste cekme — gorunumden ayri; ekran yalnizca DURUMU cizer. */
function useNoteList(offset: number) {
  const [state, setState] = useState<ListState>({ items: [], total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Yeniden cekmeyi tetikler; not eklendiginde artar. */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);

    void listNotes({ limit: PAGE_SIZE, offset })
      .then((page) => {
        if (!active) {
          return;
        }
        setState({ items: page.items, total: page.total });
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) {
          // Liste hatasi GORUNUR: soru sormak ve not eklemek calismaya devam
          // eder, ama "notlarim nerede" sorusu cevapsiz kalmamali.
          setError(errorMessage(caught));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [offset, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((previous) => previous + 1);
  }, []);

  return { state, error, loading, reload };
}

/**
 * `/app/knowledge` — Knowledge modülünün ana ekranı.
 *
 * ============================================================================
 * SIRALAMA: ÖNCE SORU, SONRA NOT
 * ============================================================================
 * CLAUDE.md'nin ürün kısıtı: "AI merkezdedir, modüller onun etrafında ve ona
 * hizmet etmek için vardır." Ekranın da bunu yansıtması gerekiyor — soru sormak
 * ÜRÜN, not eklemek ona hizmet eden eylemdir. Not formunu üste koymak, ürünü
 * bir not defteri gibi gösterirdi.
 *
 * ============================================================================
 * LİSTE VERİSİ BURADA ÇEKİLİR, ÜÇ BÖLÜM DE ONU KULLANIR
 * ============================================================================
 * `total` iki yerde gerekli: listenin sayfalaması ve soru panelinin "hiç
 * notunuz yok" ipucu. İki ayrı yerden çekmek aynı veriyi iki kez istemek ve
 * ikisinin ayrışabilmesi demekti.
 *
 * Not eklendiğinde liste TAZELENİR (`onCreated`): yeni notun listede
 * görünmemesi, kaydedilmediği izlenimi verirdi.
 * ============================================================================
 */
export function KnowledgeScreen() {
  const [offset, setOffset] = useState(0);
  const { state, error, loading, reload } = useNoteList(offset);

  const handleCreated = useCallback(() => {
    // Yeni not EN YENI oldugu icin ilk sayfada; oradaysak yalnizca tazele,
    // degilsek basa don ki kullanici ekledigini gorsun.
    setOffset(0);
    reload();
  }, [reload]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Bilgi Bankası</h1>
        <p className="text-sm text-fg-muted">
          Şirketinizin kurumsal hafızası — notlarınız ve onlara dayanan cevaplar.
        </p>
      </header>

      <AskPanel hasNotes={state.total > 0} />

      <NoteForm onCreated={handleCreated} />

      <NoteList
        items={state.items}
        total={state.total}
        offset={offset}
        loading={loading}
        error={error}
        onPrevious={() => {
          setOffset((previous) => Math.max(0, previous - PAGE_SIZE));
        }}
        onNext={() => {
          setOffset((previous) => previous + PAGE_SIZE);
        }}
      />
    </div>
  );
}
