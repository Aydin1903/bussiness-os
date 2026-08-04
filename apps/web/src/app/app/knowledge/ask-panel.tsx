'use client';

import { useState } from 'react';

import { SparkleIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api/error-message';
import { askKnowledge } from '@/lib/api/knowledge';

interface Turn {
  readonly question: string;
  readonly answer: string;
  /** Cevabın dayandığı not sayısı — 0 ise rozet gösterilmez. */
  readonly sourceCount: number;
}

/**
 * Konusma mantigi — gorunumden ayri.
 *
 * Panel yalnizca DURUMU cizer; `conversationId`'nin nasil tasindigi, hatanin
 * nasil cevrildigi burada.
 */
function useConversation() {
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask(asked: string): Promise<boolean> {
    setError(null);
    setLoading(true);
    try {
      const result = await askKnowledge({ question: asked, conversationId });

      setTurns((previous) => [
        ...previous,
        { question: asked, answer: result.answer, sourceCount: result.sourceNoteIds.length },
      ]);
      // Sunucunun dondurdugu id saklanir: sonraki soru ayni konusmayi surdurur.
      setConversationId(result.conversationId);
      return true;
    } catch (caught) {
      // 429 dahil her hata sunucunun RFC 7807 mesajiyla gosterilir. Saatlik
      // limitin SAYISI istemcide TEKRARLANMAZ — tek dogruluk kaynagi sunucu.
      setError(errorMessage(caught));
      return false;
    } finally {
      setLoading(false);
    }
  }

  return { turns, error, loading, ask };
}

/**
 * Soru-cevap paneli (ADR-0029 §4, ADR-0030 §1).
 *
 * ============================================================================
 * `conversationId` İSTEMCİDE, GEÇMİŞ SUNUCUDA
 * ============================================================================
 * İstemci yalnızca konuşmanın KİMLİĞİNİ taşır. Geçmiş mesajları modele
 * göndermek sunucunun işidir (ADR-0030 §1.2): istemci taşısaydı, ne kadarının
 * gönderileceği (token bütçesi) istemci kararı olurdu ve her istemci farklı
 * davranırdı.
 *
 * Ekrandaki thread yalnızca GÖRÜNTÜDÜR: sayfa yenilenince kaybolur. Konuşma
 * geçmişinin kalıcı listelenmesi bilinçli olarak kapsam dışı — sunucuda veri
 * var ama listeleme ucu yok.
 *
 * ============================================================================
 * BOŞ BAĞLAMA ÖZEL MUAMELE YOK
 * ============================================================================
 * Bağlamda ilgili not yoksa model kendi yönlendirme cümlesini döner ve bu
 * NORMAL bir 200'dür. İstemcide özel durum yazmak, model çıktısını string
 * eşleştirmek demekti ve sistem promptu değiştiğinde sessizce bozulurdu.
 *
 * Bunun yerine deterministik olan gösterilir: tenant'ın hiç notu yoksa
 * (`hasNotes === false`) kutunun üstünde bir ipucu (bilgi `total`'dan gelir,
 * tahminden değil).
 * ============================================================================
 */
export function AskPanel({ hasNotes }: { hasNotes: boolean }) {
  const [question, setQuestion] = useState('');
  const { turns, error, loading, ask } = useConversation();

  async function submit(): Promise<void> {
    const asked = question.trim();
    if (asked === '') {
      return;
    }

    if (await ask(asked)) {
      setQuestion('');
    }
  }

  return (
    <section className="rounded-card border border-border bg-surface p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">
          <SparkleIcon width={18} height={18} />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Kurumsal hafızaya sor</h2>
          <p className="max-w-xl text-sm text-fg-muted">
            Cevaplar yalnızca sizin notlarınızdan üretilir; sistem bilmediği bir şeyi uydurmaz.
          </p>
        </div>
      </div>

      {hasNotes ? null : (
        <p className="mt-4 rounded-lg border border-border bg-bg px-3.5 py-2.5 text-sm text-fg-muted">
          Henüz notunuz yok. Aşağıdan bir not ekleyin; sorularınız o notlardan cevaplanacak.
        </p>
      )}

      <form
        className="mt-5 flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormError message={error} />

        <Field label="Sorunuz" htmlFor="knowledge-question">
          <Input
            id="knowledge-question"
            value={question}
            placeholder="Örn. Fatura sürecini kim yönetiyor?"
            autoComplete="off"
            onChange={(event) => {
              setQuestion(event.target.value);
            }}
          />
        </Field>

        <Button type="submit" loading={loading} disabled={question.trim() === ''}>
          Sor
        </Button>
      </form>

      {turns.length > 0 ? <Thread turns={turns} /> : null}
    </section>
  );
}

/** Oturum boyunca biriken soru-cevap akışı — en yeni ALTTA (sohbet sırası). */
function Thread({ turns }: { turns: readonly Turn[] }) {
  return (
    <ol className="mt-6 flex flex-col gap-5 border-t border-border pt-5">
      {turns.map((turn, index) => (
        <li key={index} className="flex flex-col gap-2">
          <p className="text-sm font-medium text-fg">{turn.question}</p>
          <p className="whitespace-pre-wrap text-sm text-fg-muted">{turn.answer}</p>
          {turn.sourceCount > 0 ? (
            <span className="self-start rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-fg-muted">
              {turn.sourceCount} nota dayanıyor
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
