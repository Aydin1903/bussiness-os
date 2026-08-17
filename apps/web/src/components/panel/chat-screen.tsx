'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/api/error-message';
import { askKnowledge } from '@/lib/api/knowledge';
import { DeskBody, Room, RoomScroll, RoomTop } from '@/components/room/room';
import { Composer } from './composer';
import {
  AiSaid,
  FollowUpChips,
  Rise,
  SourceMeta,
  StreamEntry,
  ThinkingLine,
  UserAsked,
} from './stream';

/**
 * `/app/chat` — SOHBET ODASI.
 *
 * ============================================================================
 * NEDEN AYRI BİR YÜZEY (Product Owner kararı, 2026-08-17)
 * ============================================================================
 * Panel bir süre iki işi birden yapıyordu: sabah brifingini OKUMAK ve asistanla
 * KONUŞMAK. İkisi farklı zihinsel modlardır ve aynı ekranda yarıştıklarında
 * ekran karmaşıklaşıyordu — bildirilen sorun buydu.
 *
 * Ayrım şu soruya göre yapıldı: **kullanıcı bu ekrana ne yapmaya geliyor?**
 *   `/app`      → "bugün ne olmuş?"  — okunur, sakin, tek cümlelik cevap
 *   `/app/chat` → "şunu sormak istiyorum" — boş sayfa, imleç hazır
 *
 * ⚠️ HER GİRİŞTE TEMİZ SAYFA. `conversationId` bileşenle birlikte doğar;
 * odadan çıkıp geri gelmek YENİ bir konuşma başlatır. Kalıcı bir sohbet
 * geçmişi listesi bilinçli olarak YOK: işletme sahibi için değerli olan şey
 * geçmiş sorular değil, o anki cevaptır — ve konuşma sunucuda zaten saklanıyor
 * (`platform.conversations`), yani veri kaybı değil arayüz sadeliği.
 *
 * ============================================================================
 * ⚠️ BU ODANIN DUVARI YOKTUR — ve bu bilinçli bir istisnadır
 * ============================================================================
 * Oda dilbilgisi "duvar (ne oluyor) + tezgah (ne yapacağım)" der. Bir sohbetin
 * özetlenecek bir DURUMU yoktur; konuşmanın kendisi zaten çalışma yüzeyidir.
 * Buraya zorla bir kahraman rakam koymak ("3 soru soruldu") bilgi değil süs
 * olurdu.
 *
 * ⚠️ Panel gibi bu da bir MODÜL DEĞİL: `data-module` taşımaz, tuval terracotta
 * yıkanır. Asistanın kendi yüzeyi.
 */

interface Turn {
  readonly id: number;
  readonly question: string;
  /** `null` iken düşünme durumu gösterilir. */
  readonly answer: string | null;
  readonly sourceCount: number;
  readonly followUps: readonly string[];
}

/**
 * Boş sohbet için başlangıç soruları — LLM ÇAĞRILMADAN.
 *
 * Bağlam boşken model çağırmak hem para harcar hem de uydurmaya en uygun
 * koşuldur (Product Owner kararı, ADR-0030).
 */
const STARTERS: readonly string[] = [
  'Son altı ayımızı analiz et',
  'Nakit akışımızda dikkat etmem gereken bir şey var mı?',
  'Hangi müşteri riskli görünüyor?',
];

export function ChatScreen() {
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  /*
   * Yeni tur geldiğinde akışın sonuna in.
   *
   * ⚠️ `turns` bağımlılığı SORU eklenince de, CEVAP gelince de tetiklenir —
   * ikisi de ayrı bir `setTurns` çağrısıdır. Yalnızca uzunluğa bakmak cevabın
   * gelişini kaçırırdı: dizi uzunluğu değişmez, yalnızca içeriği değişir.
   *
   * ⚠️ Hareket tercihi: kullanıcı azaltılmış hareket istiyorsa yumuşak
   * kaydırma yapılmaz. `globals.css`in `prefers-reduced-motion` bloğu CSS
   * animasyonlarını kapatır ama `scrollIntoView`a ulaşmaz — burada elle
   * sorulması gerekir.
   */
  useEffect(() => {
    if (turns.length === 0) {
      return;
    }
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    endRef.current?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'end' });
  }, [turns]);

  async function ask(question: string): Promise<void> {
    const id = Date.now();
    // Soru HEMEN akışa girer; cevap gelene kadar düşünme durumu görünür.
    setTurns((previous) => [
      ...previous,
      { id, question, answer: null, sourceCount: 0, followUps: [] },
    ]);
    setError(null);
    setPending(true);

    try {
      const result = await askKnowledge({ question, conversationId });
      setConversationId(result.conversationId);
      setTurns((previous) =>
        previous.map((turn) =>
          turn.id === id
            ? {
                ...turn,
                answer: result.answer,
                sourceCount: result.sources.length,
                followUps: result.followUps,
              }
            : turn,
        ),
      );
    } catch (caught) {
      // Cevapsız tur akışta BIRAKILMAZ: yarım bir girdi, bir sonraki sorunun
      // bağlamını kirletir gibi görünürdü.
      setTurns((previous) => previous.filter((turn) => turn.id !== id));
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <Room>
      <RoomTop
        name="Sohbet"
        meta="Cevaplar yalnızca sizin kayıtlarınızdan üretilir"
        action={
          /*
           * ⚠️ GERİ YOLU ZORUNLU. Sohbet koridorda bir kapı DEĞİL (koridor beş
           * modülün yeridir); buraya Panel'den gelinir, dolayısıyla dönüş yolu
           * ekranda görünür olmak zorunda. Tarayıcının geri tuşuna güvenmek,
           * yolu yalnızca onu düşünen kullanıcıya vermek olurdu.
           */
          <Link
            href="/app"
            className="rounded-[9px] border border-border px-3 py-1.5 font-mono text-[9px] tracking-[0.14em] text-fg-2 uppercase transition-colors hover:border-ai-accent hover:text-ai-ink"
          >
            ← Panel
          </Link>
        }
      />

      <RoomScroll>
        <DeskBody>
          {turns.length === 0 ? (
            <Rise>
              <p className="ai-voice max-w-[46ch] text-[15px] leading-[1.6] text-fg-2">
                Şirketinizin kayıtları hakkında ne sormak istersiniz?
              </p>
              <div className="mt-4">
                <FollowUpChips
                  items={STARTERS}
                  onPick={(question) => {
                    void ask(question);
                  }}
                  disabled={pending}
                />
              </div>
            </Rise>
          ) : null}

          {turns.map((turn, index) => (
            <div key={turn.id}>
              <StreamEntry when="Sen" variant="you">
                <UserAsked>{turn.question}</UserAsked>
              </StreamEntry>
              <StreamEntry
                when={turn.answer === null ? '···' : 'Şimdi'}
                variant="ai"
                last={index === turns.length - 1}
              >
                {turn.answer === null ? (
                  <ThinkingLine />
                ) : (
                  <>
                    <AiSaid>{turn.answer}</AiSaid>
                    {turn.sourceCount > 0 ? (
                      <SourceMeta>
                        {/* AI'ın kendi cevabına yaptığı atıf → `ai-ink`. */}
                        <b className="font-semibold text-ai-ink">
                          {turn.sourceCount} kayda dayanıyor
                        </b>
                      </SourceMeta>
                    ) : null}
                    <FollowUpChips
                      items={turn.followUps.length > 0 ? turn.followUps : []}
                      onPick={(question) => {
                        void ask(question);
                      }}
                      disabled={pending}
                    />
                  </>
                )}
              </StreamEntry>
            </div>
          ))}

          {/*
            ⚠️ KAYDIRMA ÇAPASI — bildirilen hata (Product Owner, 2026-08-17):
            "ai ile yapılan sohbet otomatik olarak aşağı akmıyor".

            Cevap geldiğinde akışın sonu görünüm alanının ALTINDA kalıyordu ve
            kullanıcı elle kaydırmak zorundaydı — bir sohbette bu, cevabın
            gelmediğini sanmaya kadar gider.

            Çapa yaklaşımı `scrollTop = scrollHeight`e tercih edildi: ikincisi
            kaydırma kabına bir ref geçirmeyi ve `RoomScroll`u kirletmeyi
            gerektirirdi. `scrollIntoView` en yakın kaydırılabilir atayı kendi
            bulur, yani oda iskeleti değişse de çalışmaya devam eder.
          */}
          <div ref={endRef} aria-hidden />
        </DeskBody>
      </RoomScroll>

      {/*
        ⚠️ `onModeChange` VERİLMEZ — mod şeridi çizilmez (composer.tsx notu).
        Bu odada tek bir iş var: sormak. Not eklemek Panel'in tezgahındadır.
      */}
      <Composer
        mode="ask"
        pending={pending}
        error={error}
        hint="Sorularınız CRM, Projeler, Finans ve Randevu kayıtlarınızın tamamından cevaplanır."
        onSubmit={(text) => {
          void ask(text);
        }}
      />
    </Room>
  );
}
