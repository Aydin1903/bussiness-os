'use client';

import type { NoteListItem } from '@business-os/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { ReindexBanner } from '@/app/app/knowledge/reindex-banner';
import { errorMessage } from '@/lib/api/error-message';
import { createNote, fetchDailyReport, listNotes } from '@/lib/api/knowledge';
import { isToday, localClock } from '@/lib/format/datetime';
import { TextAreaField } from '@/components/module-kit/form-kit';
import {
  Desk,
  DeskBody,
  DeskHead,
  Hero,
  Room,
  ROOM_RISE,
  RoomScroll,
  RoomTop,
  Satellite,
  Satellites,
  Wall,
} from '@/components/room/room';
import { FormError } from '@/components/ui/form-error';
import { Rise } from './stream';

/**
 * `/app` — BRİFİNG ODASI. Koridorun kendisi, asistanın kendi yüzeyi.
 *
 * ============================================================================
 * ⚠️ SOHBET BURADAN ÇIKARILDI (Product Owner kararı, 2026-08-17)
 * ============================================================================
 * Bu ekran bir süre iki işi birden yapıyordu: sabah brifingini okumak ve
 * asistanla konuşmak. Bildirilen sorun tam olarak buydu — "günlük özet ile
 * sohbet tek odada karışıyor".
 *
 * İkisi farklı zihinsel modlardır:
 *   OKUMAK   → sakin, tek yönlü, "bugün ne olmuş?"
 *   KONUŞMAK → aktif, çift yönlü, boş sayfa ve hazır imleç ister
 *
 * Aynı ekranda yarıştıklarında kullanıcı hangi moda ait olduğunu bilemiyordu:
 * altta yanıp sönen bir imleç varken üstteki metni okumak zor, okurken de o
 * imleç "bir şey yazmalıyım" diye bastırıyordu. Sohbet artık `/app/chat`.
 *
 * ============================================================================
 * BURADA KALAN İKİ İŞ
 * ============================================================================
 * 1. OKUMAK — duvarın kahramanı asistanın o sabahki cümlesi (beş odanın
 *    içinde kahramanı sayı olmayan tek yer).
 * 2. KAYDETMEK — tezgahta bir not alanı. Sohbetle karışmaz çünkü not almak
 *    bir konuşma değil, brifingin doğal devamıdır: "bunu da not edeyim".
 *
 * ⚠️ `data-module` TAŞIMAZ: Panel bir modül değil, tuval terracotta yıkanır.
 */

/** Tezgahta gösterilen not sayısı — arşiv değil, "son ne oldu" penceresi. */
const RECENT_SIZE = 3;

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

export function BriefingScreen() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ items: [], total: 0, report: null });
  const [loading, setLoading] = useState(true);
  const [failures, setFailures] = useState<Failures>(NO_FAILURES);
  const [reloadToken, setReloadToken] = useState(0);

  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    // İki çağrı PARALEL: biri diğerini beklemesin, ilk boyama gecikmesin.
    const results = Promise.allSettled([
      listNotes({ limit: RECENT_SIZE, offset: 0 }),
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
        for (const [index, result] of [notes, report].entries()) {
          if (result.status === 'rejected') {
            // OnboardingGate ile AYNI desen: kullanıcıya değil, bakana bilgi.
            // eslint-disable-next-line no-console
            console.warn(
              `[BriefingScreen] Açılış verisi yüklenemedi: ${OPENING_CALLS[index] ?? 'bilinmeyen çağrı'}.`,
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

  async function addNote(): Promise<void> {
    const text = note.trim();
    if (text === '') {
      return;
    }

    setSaving(true);
    setNoteError(null);
    try {
      await createNote({ title: null, body: text });
      setNote('');
      reload();
    } catch (caught) {
      setNoteError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  const degraded = failures.notes || failures.report;
  const hasNotes = snapshot.total > 0;
  const todayCount = snapshot.items.filter((item) => isToday(item.createdAt)).length;

  return (
    <Room>
      <RoomScroll>
        <RoomTop
          name="Panel"
          meta="Şirketinizin kurumsal hafızası"
          action={
            /*
             * ⚠️ ODANIN BİRİNCİL EYLEMİ — ve artık gerçekten bir EYLEM.
             *
             * Önceden bu yuvada bir sayaç duruyordu; sayaç bir eylem değildir
             * ve üst şerit "bu odada yapılacak asıl iş" için ayrılmıştır
             * (ADR-0038 §5). Brifingi okuyan kullanıcının bir sonraki adımı
             * neredeyse her zaman bir soru sormaktır — düğme onu temiz bir
             * sayfaya götürür.
             */
            <Rise delay={ROOM_RISE.top}>
              <Link
                href="/app/chat"
                className="inline-flex items-center gap-2 rounded-card bg-linear-150 from-ai-accent to-ai-ink px-[18px] py-[10px] text-[13px] font-semibold tracking-[-0.008em] text-accent-fg shadow-card transition-[filter,transform,box-shadow] duration-150 ease-rise hover:-translate-y-px hover:saturate-[1.08] hover:shadow-float"
              >
                Sohbet et →
              </Link>
            </Rise>
          }
        />

        <Wall>
          <Rise delay={ROOM_RISE.wall}>
            <Hero label="Bu sabah">
              {loading ? (
                <HeroSkeleton />
              ) : (
                <Opening
                  report={snapshot.report}
                  hasNotes={hasNotes}
                  reportFailed={failures.report}
                />
              )}
            </Hero>
          </Rise>

          {/*
            ⚠️ Not listesi düştüyse uydular ÇİZİLMEZ: "0 not" bir ölçüm değil,
            ölçememenin sonucudur. Yalnızca RAPOR düştüyse sayaçlar GERÇEKTİR ve
            gösterilmeye devam eder — çalışan yarı cezalandırılmaz.
          */}
          {loading || failures.notes ? null : (
            <Rise delay={ROOM_RISE.ai}>
              <Satellites>
                <Satellite label="Hafıza" value={snapshot.total} note="not" />
                <Satellite
                  label="Bugün"
                  value={todayCount}
                  note={todayCount > 0 ? 'yeni kayıt' : 'henüz kayıt yok'}
                  tone={todayCount > 0 ? 'accent' : 'plain'}
                />
              </Satellites>
            </Rise>
          )}
        </Wall>

        <Desk>
          <DeskHead
            title="Son notlar"
            right={
              /*
               * ⚠️ ARŞİVE GİDEN TEK YOL BURASI. `MemoryRail` emekliye ayrıldı ve
               * "Tümünü gör" bağlantısı onunla birlikte kaybolsaydı
               * `/app/knowledge` kullanıcı için ERİŞİLEMEZ kalırdı.
               */
              <Link
                href="/app/knowledge"
                className="font-mono text-[8.5px] tracking-[0.14em] text-fg-3 uppercase transition-colors hover:text-ink"
              >
                Arşiv →
              </Link>
            }
          />

          <DeskBody>
            <ReindexBanner onRepaired={reload} />

            {degraded ? <PartialLoadNotice failures={failures} onRetry={reload} /> : null}

            {loading ? null : (
              <Rise delay={ROOM_RISE.desk}>
                {failures.notes ? null : <RecentNotes items={snapshot.items} />}

                {/*
                  NOT ALANI — sohbet DEĞİL, brifingin devamı.
                  Konuşma kutusu gibi görünmemesi için `TextAreaField` kullanır
                  (çok satırlı, gönder düğmesi ayrı): tek satırlık yanıp sönen
                  bir imleç, ekranın "seninle konuşuyorum" demesine yol açardı.
                */}
                <div className="rounded-card border border-border bg-raised p-4 shadow-card">
                  <TextAreaField
                    id="briefing-note"
                    label="Not ekle"
                    value={note}
                    onChange={setNote}
                    rows={2}
                    disabled={saving}
                    placeholder="Bugün olan bir şeyi kaydedin…"
                    hint="Eklediğiniz not kurumsal hafızaya girer ve sorularınızda bağlam olur."
                  />
                  <FormError message={noteError} />
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      disabled={saving || note.trim() === ''}
                      onClick={() => {
                        void addNote();
                      }}
                      className="rounded-[10px] border border-border-strong px-4 py-2 text-[12.5px] font-semibold text-fg transition-colors hover:bg-fill disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? 'Kaydediliyor…' : 'Kaydet'}
                    </button>
                  </div>
                </div>
              </Rise>
            )}
          </DeskBody>
        </Desk>
      </RoomScroll>
    </Room>
  );
}

/**
 * Duvarın yükleniyor hâli — ODANIN KENDİ ŞEKLİNİ taşır (ADR-0038 bulgu 5).
 *
 * Eskiden burada `Yükleniyor…` yazıyordu: ekran bir an BOŞ görünüyor, sonra
 * içerik gelince ZIPLIYORDU.
 */
function HeroSkeleton() {
  return (
    <div aria-hidden className="mt-2 flex flex-col gap-2.5">
      <span className="block h-[19px] w-[92%] rounded bg-fill-2" />
      <span className="block h-[19px] w-[74%] rounded bg-fill-2" />
    </div>
  );
}

/**
 * Günün ilk girdisi — üç hâlden biri.
 *
 * Rapor varsa AI'ın gerçek gözlemi; yoksa duruma göre iki farklı statik metin.
 * Statik metinler LLM ÇAĞIRMAZ (Product Owner kararı).
 */
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
  // cümlesi, aslında var olan bir raporu yokmuş gibi gösterebilirdi.
  if (reportFailed) {
    return null;
  }

  return (
    <p className="ai-voice-lead mt-2 text-[clamp(19px,2.3vw,27px)] leading-[1.32] tracking-[-0.014em] text-fg">
      {report !== null
        ? report.summary
        : hasNotes
          ? 'Notlarınız kaydediliyor. İlk günlük özetiniz yarın sabah burada olacak; o zamana kadar sohbet ederek sorularınızı sorabilirsiniz.'
          : 'Merhaba. Kurumsal hafızanız henüz boş — aşağıdan birkaç not ekleyin, sonra sorularınızı o notlardan cevaplayayım.'}
    </p>
  );
}

/**
 * "Bazı bilgiler yüklenemedi" — SAKİN ama GÖRÜNÜR.
 *
 * Panelin kalanı çalışmaya devam ediyor. Kırmızı bir hata bloğu, çalışan bir
 * ekranı çökmüş gibi gösterirdi. Sessiz kalmak ise daha kötü: "hiç notunuz yok"
 * ile "notlarınızı getiremedim" aynı ekrana düşer ve kullanıcı var olan
 * hafızasını KAYBOLMUŞ sanar.
 */
function PartialLoadNotice({ failures, onRetry }: { failures: Failures; onRetry: () => void }) {
  // NE'nin eksik olduğu söylenir, uç adı DEĞİL.
  const missing = [
    failures.notes ? 'notlarınız' : null,
    failures.report ? 'günlük özetiniz' : null,
  ].filter((part): part is string => part !== null);

  return (
    <section
      role="status"
      className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border bg-fill px-4 py-3"
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-fg-3" />
      <p className="min-w-0 flex-1 text-[12.5px] text-fg-2">
        Bazı bilgiler yüklenemedi — {missing.join(' ve ')} şu an görüntülenemiyor. Not eklemeye ve
        sohbet etmeye devam edebilirsiniz.
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

/**
 * Son notlar.
 *
 * ⚠️ Boş liste ile ÇEKİLEMEDİ ayrımı burada YAPILMAZ, çağıran yerde yapılır
 * (`failures.notes` ise bu bileşen hiç çizilmez).
 */
function RecentNotes({ items }: { items: readonly NoteListItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="mb-5 flex flex-col gap-1.5">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-card border border-border bg-surface px-3.5 py-2.5 shadow-card"
        >
          <p className="font-mono text-[8.5px] tracking-[0.14em] text-fg-3 uppercase">
            {localClock(item.createdAt, '')}
          </p>
          {/* `preview` — sunucunun kısalttığı hâli. Tam gövde listede GELMEZ. */}
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-[1.55] text-fg-2">{item.preview}</p>
        </li>
      ))}
    </ul>
  );
}
