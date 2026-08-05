'use client';

import type { NoteListItem } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { errorMessage } from '@/lib/api/error-message';
import { askKnowledge, createNote, fetchDailyReport, listNotes } from '@/lib/api/knowledge';
import { ReindexBanner } from '@/app/app/knowledge/reindex-banner';
import { Composer, type ComposerMode } from './composer';
import { MemoryRail } from './memory-rail';
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
 * Giriş sahnelemesi — ms cinsinden gecikmeler.
 *
 * ⚠️ YALNIZCA açılışta çalışır. Kullanıcının sorduğu turlar sahnelenmez:
 * cevabı 500 ms geciktirmek, hızlı gelen bir cevabı YAVAŞ göstermek olurdu.
 */
/*
 * `meta` (kaynak satırı) YOK: günlük rapor yanıtı kaynak sayısı taşımıyor,
 * açılışta gösterilecek bir "N nota dayanıyor" satırı da yok. Uydurma bir
 * sayı koymaktansa aşamayı hiç tanımlamamak doğru.
 */
const RISE = { title: 0, stats: 60, opening: 180, chips: 520 } as const;

/** Rayda gösterilen not sayısı — arşiv değil, "son ne oldu" penceresi. */
const RAIL_SIZE = 3;

/**
 * Hiç notu olmayan tenant için başlangıç soruları.
 *
 * LLM çağrılmadığı her yerde statik örnekler gösterilir (Product Owner kararı):
 * bağlam boşken model çağırmak hem para harcar hem de uydurmaya en uygun
 * koşuldur.
 */
const STARTERS_EMPTY: readonly string[] = [
  'Şirketiniz ne iş yapıyor?',
  'Kaç kişilik bir ekipsiniz?',
  'Şu an en çok zaman harcadığınız süreç ne?',
];

/** Not var ama rapor henüz üretilmemişken gösterilenler. */
const STARTERS_NO_REPORT: readonly string[] = [
  'Notlarımda neler var?',
  'Ekip hakkında ne biliyorsun?',
  'Süreçlerimizde tekrar eden bir sorun var mı?',
];

interface Turn {
  readonly id: number;
  readonly question: string;
  /** `null` iken düşünme durumu gösterilir. */
  readonly answer: string | null;
  readonly sourceCount: number;
  readonly followUps: readonly string[];
}

interface Snapshot {
  readonly items: readonly NoteListItem[];
  readonly total: number;
  /** Günlük rapor özeti; henüz üretilmediyse `null`. */
  readonly report: { summary: string; generatedAt: string } | null;
}

/**
 * Açılışta yapılan çağrılar — ad, `console.warn` için taşınır.
 *
 * Hangi ucun düştüğü LOG'A yazılır ama KULLANICIYA gösterilmez: uç adı onun
 * ilgilendiği bir şey değil, bakan kişinin ilgilendiği şeydir.
 */
const OPENING_CALLS = ['GET /knowledge/notes', 'GET /knowledge/daily-report'] as const;

/**
 * Hangi açılış çağrısının düştüğü — TEK bir bayrak YETMEZ.
 *
 * İkisi ayrı tutulur çünkü sonuçları ayrıdır: notlar geldiyse sayaç GERÇEK bir
 * ölçümdür ve rapor düştü diye gizlenmemelidir. Tek bir `degraded` bayrağı,
 * çalışan yarıyı da cezalandırırdı.
 */
interface Failures {
  readonly notes: boolean;
  readonly report: boolean;
}

const NO_FAILURES: Failures = { notes: false, report: false };

/**
 * `/app` — Panel. Genel Bakış ile Bilgi Bankası'nın BİRLEŞTİĞİ yüzey.
 *
 * ============================================================================
 * NE BİRLEŞTİ, NE BİRLEŞMEDİ
 * ============================================================================
 * Birleşen şey EYLEMLER: sormak ve not eklemek artık panelden çıkmadan
 * yapılıyor. Arşiv (142 kayıtlık sayfalı liste) `/app/knowledge`'te kaldı —
 * onu akışın içine koymak akışı mahvederdi.
 *
 * ============================================================================
 * İKİ BOŞ DURUM
 * ============================================================================
 * Onboarding gate hepsini karşılamıyor:
 *   1. HİÇ NOT YOK — wizard'ın yedi sorusu da atlandıysa ya da bayrak başka
 *      cihazdaysa buraya boş gelinir. Yazma alanı "Not ekle" modunda açılır:
 *      yapılacak iş not eklemek.
 *   2. NOT VAR, RAPOR YOK — yeni tenant, worker ilk turunu atmamış. Bu DAHA
 *      SIK karşılaşılan durum ve ayrı bir metin gerektiriyor.
 * ============================================================================
 */
export function PanelScreen() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ items: [], total: 0, report: null });
  const [loading, setLoading] = useState(true);
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [mode, setMode] = useState<ComposerMode>('ask');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState<Failures>(NO_FAILURES);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    // İki çağrı PARALEL: biri diğerini beklemesin, ilk boyama gecikmesin.
    const results = Promise.allSettled([
      listNotes({ limit: RAIL_SIZE, offset: 0 }),
      fetchDailyReport(),
    ]);

    void results
      .then(([notes, report]) => {
        if (!active) {
          return;
        }

        // ⚠️ `allSettled` REDDI YUTAR — bu satırlar bir teşhis sırasında yazıldı.
        //
        // Sunucu tarafında `knowledge` şeması yokken her iki uç da 500 döndü;
        // panel yine de sakince "0 not / hafızanız henüz boş" dedi. Yani
        // "gerçekten hiç not yok" ile "sunucu cevap veremiyor" EKRANDA
        // BİRBİRİNDEN AYIRT EDİLEMİYORDU — sessiz bir doğruluk deliği.
        //
        // `allSettled` KORUNUYOR (bir uç düşünce diğerinin verisi de kaybolmasın),
        // ama artık düşen çağrı hem log'a hem ekrana iz bırakıyor.
        for (const [index, result] of [notes, report].entries()) {
          if (result.status === 'rejected') {
            // OnboardingGate ile AYNI desen: kullanıcıya değil, bakana bilgi.
            // eslint-disable-next-line no-console
            console.warn(
              `[PanelScreen] Açılış verisi yüklenemedi: ${OPENING_CALLS[index] ?? 'bilinmeyen çağrı'}.`,
              result.reason,
            );
          }
        }

        setFailures({
          notes: notes.status === 'rejected',
          report: report.status === 'rejected',
        });
        setSnapshot({
          items: notes.status === 'fulfilled' ? notes.value.items : [],
          total: notes.status === 'fulfilled' ? notes.value.total : 0,
          report: report.status === 'fulfilled' ? report.value.report : null,
        });
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((previous) => previous + 1);
  }, []);

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
                sourceCount: result.sourceNoteIds.length,
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

  async function addNote(body: string): Promise<void> {
    setError(null);
    setPending(true);
    try {
      await createNote({ title: null, body });
      reload();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  const degraded = failures.notes || failures.report;
  const hasNotes = snapshot.total > 0;
  const starters = hasNotes ? STARTERS_NO_REPORT : STARTERS_EMPTY;
  const todayCount = snapshot.items.filter((item) => isToday(item.createdAt)).length;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          Not listesi düştüyse sayaç ÇİZİLMEZ: "0 not" bir ölçüm değil,
          ölçememenin sonucudur. Yalnızca RAPOR düştüyse sayaç GERÇEKTİR ve
          gösterilmeye devam eder — çalışan yarı cezalandırılmaz.
        */}
        <PanelHeader
          total={snapshot.total}
          todayCount={todayCount}
          loading={loading || failures.notes}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[880px] px-6 pt-7 pb-4 md:px-8">
            <ReindexBanner onRepaired={reload} />

            {degraded ? <PartialLoadNotice failures={failures} onRetry={reload} /> : null}

            {loading ? null : (
              <Opening
                report={snapshot.report}
                hasNotes={hasNotes}
                reportFailed={failures.report}
              />
            )}

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
                          <b className="font-semibold text-ink">
                            {turn.sourceCount} nota dayanıyor
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

            {/* Boş durumda başlangıç soruları — LLM çağrılmadan. */}
            {!loading && turns.length === 0 ? (
              <div className="pl-[82px]">
                <Rise delay={RISE.chips}>
                  <FollowUpChips
                    items={starters}
                    onPick={(question) => {
                      setMode('ask');
                      void ask(question);
                    }}
                    disabled={pending}
                  />
                </Rise>
              </div>
            ) : null}
          </div>
        </div>

        <Composer
          mode={mode}
          onModeChange={setMode}
          pending={pending}
          error={error}
          hint={
            mode === 'ask'
              ? 'Cevaplar yalnızca sizin notlarınızdan üretilir.'
              : 'Eklediğiniz not kurumsal hafızaya girer ve sorularınızda bağlam olur.'
          }
          onSubmit={(text) => {
            void (mode === 'ask' ? ask(text) : addNote(text));
          }}
        />
      </div>

      <MemoryRail
        items={snapshot.items}
        total={snapshot.total}
        todayCount={todayCount}
        degraded={failures.notes}
      />
    </div>
  );
}

function PanelHeader({
  total,
  todayCount,
  loading,
}: {
  total: number;
  todayCount: number;
  loading: boolean;
}) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4 md:px-8">
      <Rise delay={RISE.title}>
        <h1 className="text-[15px] font-semibold tracking-[-0.018em]">Panel</h1>
        <p className="mt-0.5 text-[11.5px] text-fg-3">Şirketinizin kurumsal hafızası</p>
      </Rise>

      {loading ? null : (
        <Rise delay={RISE.stats}>
          <div className="flex items-center gap-2.5 text-[12px] text-fg-2 tabular">
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_0_3.5px_var(--glow)]"
            />
            <span>
              <b className="font-semibold text-fg">{total}</b> not
            </span>
            {todayCount > 0 ? (
              <>
                <span className="text-fg-3 opacity-50">·</span>
                <span>
                  bugün <b className="font-semibold text-fg">{todayCount} yeni</b>
                </span>
              </>
            ) : null}
          </div>
        </Rise>
      )}
    </header>
  );
}

/**
 * Günün ilk girdisi — üç hâlden biri.
 *
 * Rapor varsa AI'ın gerçek gözlemi; yoksa duruma göre iki farklı statik metin.
 * Statik metinler LLM ÇAĞIRMAZ (Product Owner kararı).
 */
/**
 * "Bazı bilgiler yüklenemedi" — SAKİN ama GÖRÜNÜR.
 *
 * ============================================================================
 * NEDEN ALARM DEĞİL
 * ============================================================================
 * Panelin kalanı çalışmaya devam ediyor: soru sorulabilir, not eklenebilir.
 * Kırmızı bir hata bloğu, çalışan bir ekranı çökmüş gibi gösterirdi. Bu yüzden
 * `ReindexBanner`'ın `danger` yüzeyi DEĞİL, nötr bir dolgu kullanılıyor —
 * "bir şey eksik" der, "her şey bitti" demez.
 *
 * NEDEN SESSİZ DE DEĞİL: sessiz kalırsa "hiç notunuz yok" ile "notlarınızı
 * getiremedim" aynı ekrana düşer ve kullanıcı var olan hafızasını KAYBOLMUŞ
 * sanar. İkisini ayırmak bu bileşenin tek varlık sebebidir.
 * ============================================================================
 */
function PartialLoadNotice({ failures, onRetry }: { failures: Failures; onRetry: () => void }) {
  // NE'nin eksik olduğu söylenir, uç adı DEĞİL. Kullanıcı "notlarım mı, özetim
  // mi" sorusunun cevabını hak eder; "GET /knowledge/notes"i değil.
  const missing = [
    failures.notes ? 'notlarınız' : null,
    failures.report ? 'günlük özetiniz' : null,
  ].filter((part): part is string => part !== null);

  return (
    <section
      role="status"
      className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border bg-fill px-4 py-3"
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-fg-3" />
      <p className="min-w-0 flex-1 text-[12.5px] text-fg-2">
        Bazı bilgiler yüklenemedi — {missing.join(' ve ')} şu an görüntülenemiyor. Soru sormaya ve
        not eklemeye devam edebilirsiniz.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-full bg-tint px-3 py-1.5 text-[12px] font-medium text-fg transition-colors duration-150 hover:bg-tint-2"
      >
        Yeniden dene
      </button>
    </section>
  );
}

function Opening({
  report,
  hasNotes,
  reportFailed,
}: {
  report: { summary: string; generatedAt: string } | null;
  hasNotes: boolean;
  /** Rapor ÇEKİLEMEDİ — "henüz üretilmedi" ile aynı şey DEĞİL. */
  reportFailed: boolean;
}) {
  // Rapor çekilemediyse hiçbir iddia edilmez: "İlk özetiniz yarın sabah"
  // cümlesi, aslında var olan bir raporu yokmuş gibi gösterebilirdi. Yukarıdaki
  // bildirim zaten durumu söylüyor.
  if (reportFailed) {
    return null;
  }

  if (report !== null) {
    return (
      <StreamEntry when={clockOf(report.generatedAt)} variant="ai">
        <Rise delay={RISE.opening}>
          <AiSaid lead>{report.summary}</AiSaid>
        </Rise>
      </StreamEntry>
    );
  }

  return (
    <StreamEntry when="Bugün" variant="ai">
      <Rise delay={RISE.opening}>
        <AiSaid lead>
          {hasNotes
            ? 'Notlarınız kaydediliyor. İlk günlük özetiniz yarın sabah burada olacak; o zamana kadar aşağıdan soru sorabilirsiniz.'
            : 'Merhaba. Kurumsal hafızanız henüz boş — aşağıdan birkaç not ekleyin, sonra sorularınızı o notlardan cevaplayayım.'}
        </AiSaid>
      </Rise>
    </StreamEntry>
  );
}

function clockOf(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return 'Bugün';
  }
  const date = new Date(parsed);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function isToday(iso: string): boolean {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return false;
  }
  const date = new Date(parsed);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}
