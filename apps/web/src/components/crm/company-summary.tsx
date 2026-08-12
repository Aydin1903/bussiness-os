'use client';

import type { CompanySummary } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { generateCompanySummary, getCompanySummary } from '@/lib/api/crm';
import { errorMessage } from '@/lib/api/error-message';
import { localRelativeWhen } from '@/lib/format/datetime';

/**
 * Müşteri özeti — AI'ın bir MODÜLÜN İÇİNDE konuştuğu ilk yer (ADR-0032 §5).
 *
 * ============================================================================
 * ⚠️ BURADA TERRACOTTA KULLANILIR, MODÜLÜN RENGİ DEĞİL
 * ============================================================================
 * Bu bileşen `[data-module="crm"]` ağacının içindedir, yani `bg-accent` yazsa
 * ÇİVİT MAVİSİ alırdı. Almamalı: `--ai-accent` / `--ai-ink` sabittir ve hiçbir
 * modül onu ezemez (FRONTEND §4.8).
 *
 * Kural şudur ve bu ekran onun ilk sınavıdır: **bir ekranda terracotta
 * görüldüğünde tek bir şey demelidir — "burada asistan konuşuyor".** Sayfanın
 * geri kalanı (düğmeler, rozetler, kartların çizgisi) CRM'in mavisini taşır;
 * yalnızca bu blok terracottadır ve fark, kullanıcıya kimin konuştuğunu
 * SÖYLEMEDEN anlatır.
 *
 * Aynı ayrımın tipografi tarafı zaten vardı: AI serif konuşur (`.ai-voice`,
 * FRONTEND §4.5). Renk onu tekrarlar — yani bilgi TEK kanalda taşınmaz ve
 * renk körlüğünde de ayrım korunur.
 *
 * ============================================================================
 * "ASİSTANIM" PANELİ — VARSAYILAN DARALTILMIŞ (FRONTEND §4.9)
 * ============================================================================
 * Bu panel bir süre koşulsuz açıktı ve sayfanın ilk ekranını `text-[26px]` bir
 * blokla kaplıyordu. Gerekçe şuydu ve HÂLÂ GEÇERLİDİR: modüller AI'a bağlam
 * sağlamak için vardır, müşteriyi aramadan önce okunacak şey telefon numarası
 * değil "nerede kaldık"tır.
 *
 * Değişen şey o gerekçe değil, **bedeli**: blok kaydırılan içerikten önce
 * geldiği ve tam genişlik kapladığı için kaydın kendisini (kimlik kartı,
 * yetkililer) ekranın dışına itiyordu. Yani AI'ı öne çıkarma isteği, modülün
 * kendi verisini görünmez kılıyordu.
 *
 * Çözüm ikisini karşı karşıya getirmemektir: panel **daraltılmış** başlar ama
 * SESSİZ DEĞİL — tek satırda AI'ın gerçekten yazdığı ilk cümleyi gösterir.
 * Kullanıcı hiçbir şeye tıklamadan bir şey öğrenir; tıklarsa tamamını okur.
 * Bu desen artık CRM'e özgü değildir, projenin standardıdır (FRONTEND §4.9) —
 * bir modülde bir varlık için AI özeti gösterilecekse böyle kurulur.
 *
 * ⚠️ Önizleme YALNIZCA özet varken vardır. Özet yoksa panel eskisi gibi açık
 * kalır: daraltacak bir şey yoktur ve "Özet çıkar" düğmesini bir tıklamanın
 * arkasına saklamak, hiç özeti olmayan müşteride üretimi keşfedilemez kılardı.
 */

type Phase = 'loading' | 'ready' | 'failed';

/**
 * Önizleme için ilk cümle.
 *
 * ============================================================================
 * ⚠️ "3 GÖZLEMİM VAR" YAZILAMAZ: BÖYLE BİR SAYI YOK
 * ============================================================================
 * `companySummarySchema` beş alan taşır ve hiçbiri sayılabilir bir birim
 * değildir (`summary: string | null` düz prozadır). `COMPANY_SUMMARY_SYSTEM_PROMPT`
 * bunu açıkça böyle ister: *"en fazla 4-5 cümle"* + *"görüşmeleri tek tek
 * listeleme"*. Yani madde işareti üretilmesi YASAKLANMIŞTIR.
 *
 * Sayıyı istemcide cümle sayarak türetmek denendi ve REDDEDİLDİ: Türkçe'de
 * binlik ayracı noktadır ve bu projede para sunucunun kanonik dizesi olarak
 * yazılır (Finans'ın bilinen sınırı: biçimlendirme yok). "1.500.000 TL" içeren
 * bir özet üç sahte cümleye bölünür ve kullanıcı "5 gözlem" okuyup panelde 3
 * cümle görür — hata SESSİZ olur, çünkü hiçbir test yanlış sayıyı yakalamaz.
 *
 * İlk cümlede aynı risk ZARARSIZDIR: yanlış bölünürse satır yalnızca kısa
 * görünür, yanlış BİLGİ vermez. Bu yüzden sınır arama korumalıdır ama
 * kusursuz olmak zorunda değildir.
 */
export function firstSentence(text: string): string {
  const trimmed = text.trim();

  // Cümle sonu = noktalama + boşluk + ARDINDAN küçük harf ya da rakam GELMEYEN
  // bir karakter. Rakam dışlaması "1.500 TL"yi kurtarır; küçük harf dışlaması
  // "vb. ve" gibi kısaltmaları kurtarır.
  const boundary = /[.!?…]\s+(?=[^\p{Ll}\d])/u.exec(trimmed);

  if (boundary === null) {
    // Tek cümlelik özet ya da tanınmayan biçim: tamamını ver, kırpmayı CSS
    // yapsın. Boş dizeye düşmek panelde sebepsiz bir boşluk bırakırdı.
    return trimmed;
  }

  return trimmed.slice(0, boundary.index + 1);
}

export function CompanySummaryPanel({
  companyId,
  readOnly,
}: {
  companyId: string;
  /** `viewer` özet OKUR ama ÜRETEMEZ — üretmek para harcar (`company:summarize`). */
  readOnly: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [summary, setSummary] = useState<CompanySummary | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Panel her açılışta DARALTILMIŞ başlar ve tercih SAKLANMAZ.
   *
   * `localStorage`'a yazmak yeni bir anahtar, bir göç yolu ve "hangi kapsam —
   * kullanıcı mı şirket mi" sorusunu getirirdi. Önizleme zaten proaktif
   * olduğu için daraltılmış hâl bir kayıp değildir; saklanacak bir sıkıntı da
   * yoktur.
   */
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      setSummary(await getCompanySummary(companyId));
      setPhase('ready');
    } catch {
      // Özet YOKSA sayfa yine de çalışmalı: bu bir yardımcıdır, kaydın
      // kendisi değil. `PartialNotice` ile aynı ilke.
      setPhase('failed');
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate(): Promise<void> {
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const result = await generateCompanySummary(companyId);
      setSummary(result);
      setPhase('ready');
      if (!result.regenerated) {
        // İSRAF FRENİ devreye girdi. Söylenmeseydi kullanıcı "yenile"ye basıp
        // metnin değişmemesini bir hata sanardı.
        setNotice('Görüşmelerde değişiklik yok — mevcut özet güncel.');
      }
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setGenerating(false);
    }
  }

  if (phase === 'loading') {
    return <SummarySkeleton />;
  }

  // Uç çökerse blok TAMAMEN çizilmez. Boş bir çerçeve bırakmak, "AI burada
  // bir şey söyleyecekti ama söyleyemedi" izlenimi verirdi; oysa sayfanın
  // geri kalanı sağlam.
  if (phase === 'failed' || summary === null) {
    return null;
  }

  const busy = generating || summary.generating;

  // Yerel değişkene alınıyor ki daraltılabilirlik kontrolü TypeScript
  // tarafından daraltma olarak görülsün — `summary.summary` bir özellik
  // erişimi olduğu için alt bileşene geçerken cast gerektirirdi.
  const text = summary.summary;

  // Daraltılabilirlik özetin VARLIĞINA bağlıdır, kullanıcı tercihine değil:
  // özet yoksa saklanacak bir metin ve dolayısıyla bir önizleme yoktur.
  const open = text === null || expanded;
  const bodyId = `company-summary-body-${companyId}`;

  return (
    <section
      aria-label="Yapay zekâ özeti"
      className="border-b border-border px-5 pt-7 pb-8 md:px-10"
    >
      {text === null ? (
        <Eyebrow />
      ) : (
        <AssistantTrigger
          preview={firstSentence(text)}
          stale={summary.stale}
          expanded={expanded}
          /*
            ⚠️ `aria-controls` YALNIZCA gövde DOM'daysa verilir.

            Gövde koşullu çizilir (daraltılmışken hiç yok). Öznitelik koşulsuz
            verilseydi daraltılmış hâlde var olmayan bir id'yi işaret ederdi —
            ARIA'da IDREF'in çözülmesi zorunludur ve sarkan bir referans, ekran
            okuyucuya "burada bir gövde var" deyip bulunamayacak bir yere
            göndermektir. Tarayıcı bunu hata olarak bildirmez: sessiz bir
            yanlışlık olurdu.

            Durumu taşıyan öznitelik `aria-expanded`'dır ve o HER İKİ hâlde de
            verilir; bir disclosure düğmesi için tek başına yeterlidir.
          */
          controls={expanded ? bodyId : null}
          onToggle={() => {
            setExpanded((value) => !value);
          }}
        />
      )}

      {!open ? null : (
        <div id={bodyId}>
          {text === null ? (
            <EmptyInvitation summarizable={summary.summarizable} readOnly={readOnly} />
          ) : (
            /*
              ⚠️ KAYDIRMA KUTUSU — kabul ölçütünün "sayfayı taşırmıyor" maddesi.

              Özetin uzunluğu modelin elindedir: prompt "en fazla 4-5 cümle"
              der ama bu bir SINIR değil bir RİCADIR — model uzun yazarsa blok
              kaydın tamamını ekranın dışına iter. `max-h` + `overflow-y-auto`
              bunu panelin kendi içine kapatır.

              `min(46vh,420px)`: kısa ekranda oran (yarım ekranı geçmesin),
              uzun ekranda sabit tavan (1440p'de 46vh gereksiz büyüktü).
              `overscroll-contain` kutunun sonuna gelince sayfanın zıplamasını
              engeller.
            */
            <div className="mt-4 max-h-[min(46vh,420px)] overflow-y-auto overscroll-contain">
              <p className="ai-voice-lead max-w-[42ch] text-[22px] leading-[1.5] tracking-[-0.012em] text-fg md:text-[26px]">
                {text}
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Meta summary={summary} busy={busy} />

            {readOnly || !summary.summarizable ? null : (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void generate();
                }}
                className={[
                  'ml-auto inline-flex shrink-0 items-center gap-[7px] rounded-full',
                  'border border-ai-tint bg-raised px-[15px] py-[8px]',
                  'text-[12.5px] font-medium tracking-[-0.008em] text-ai-ink shadow-card',
                  'transition-[transform,box-shadow,color] duration-[260ms] ease-rise',
                  'hover:-translate-y-[2px] hover:shadow-float',
                  'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
                ].join(' ')}
              >
                {busy ? 'Hazırlanıyor…' : text === null ? 'Özet çıkar' : 'Yenile'}
              </button>
            )}
          </div>

          {notice === null ? null : (
            <p className="mt-3 text-[11.5px] text-fg-3" role="status">
              {notice}
            </p>
          )}
          {error === null ? null : (
            <p className="mt-3 text-[11.5px] text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Daraltılmış hâlin tamamı: etiket + önizleme + açma/kapama.
 *
 * ============================================================================
 * TEK BİR DÜĞME — İÇİNDE İKİNCİ BİR TIKLANABİLİR YOK
 * ============================================================================
 * "Asistanım" etiketi ile önizleme cümlesi AYNI düğmenin içindedir. İkisini
 * ayırmak (etiket düğme, cümle metin) kullanıcıya iki hedef verirdi ve
 * cümleye tıklamak — görünür en büyük hedef — hiçbir şey yapmazdı.
 *
 * ⚠️ YÜKSEKLİK ANİMASYONU YOK, VE BU BİLİNÇLİ. `auto` yüksekliği animasyona
 * sokmak ya JS ölçümü ya `grid-template-rows: 0fr→1fr` gerektirir; ikincisi
 * yeni bir tarayıcı taban çizgisi demektir ve FRONTEND §4.8 `color-mix`'i tam
 * bu sebeple terk etti (*"projede yazılı bir tarayıcı destek matrisi olmadığı
 * için bu, belgelenecek bir bağımlılıktan iyidir"*). Animasyon edilen tek şey
 * okun dönüşü: 260ms/`ease-rise` — kartların kalkma hareketiyle aynı reçete,
 * ve `prefers-reduced-motion` altında `globals.css` onu da susturur.
 */
function AssistantTrigger({
  preview,
  stale,
  expanded,
  controls,
  onToggle,
}: {
  preview: string;
  stale: boolean;
  expanded: boolean;
  /** Gövdenin id'si — gövde çizilmiyorsa `null` (sarkan IDREF yazılmaz). */
  controls: string | null;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      {...(controls === null ? {} : { 'aria-controls': controls })}
      className={[
        'group -mx-2 flex w-full max-w-full flex-wrap items-center gap-x-3 gap-y-1.5',
        'rounded-[10px] px-2 py-1.5 text-left',
        'transition-colors duration-150 hover:bg-fill',
      ].join(' ')}
    >
      <span className="flex shrink-0 items-center gap-2 font-mono text-[9px] font-semibold tracking-[0.18em] text-fg-3 uppercase">
        <span aria-hidden className="h-[5px] w-[5px] shrink-0 rounded-full bg-ai-accent" />
        Asistanım
      </span>

      {/*
        Önizleme AÇIKKEN ÇİZİLMEZ: tam özet hemen altındadır ve ilk cümle iki
        kez yazılırdı. `min-w-0` + `truncate` birlikte gerekir — `min-w-0`
        olmadan uzun bir ilk cümle satırı kırpılmak yerine kabı taşırır.
      */}
      {expanded ? (
        <span className="min-w-0 flex-1 text-[12.5px] text-fg-3">Özeti kapat</span>
      ) : (
        <span className="ai-voice min-w-0 flex-1 truncate text-[14px] leading-[1.6] text-fg-2">
          {preview}
        </span>
      )}

      {/*
        Bayatlık daraltılmışken de SÖYLENİR. Saklanırsa kullanıcı güncel
        sanacağı bir özeti açmadan geçer — panelin tek satıra inmesinin bedeli
        bilgi kaybı olmamalı. Renk TEK taşıyıcı değil: kelime zaten yazıyor.
      */}
      {stale ? (
        <span className="shrink-0 rounded-[6px] border border-ai-tint px-1.5 py-[2px] font-mono text-[9px] tracking-[0.08em] text-ai-ink">
          değişiklik var
        </span>
      ) : null}

      <span
        aria-hidden
        className={[
          'shrink-0 text-[13px] text-fg-3',
          'transition-transform duration-[260ms] ease-rise',
          expanded ? 'rotate-90' : 'group-hover:translate-x-[2px]',
        ].join(' ')}
      >
        →
      </span>
    </button>
  );
}

/**
 * "Asistanım" etiketi — noktası `bg-ai-accent`. Yalnızca daraltılacak bir şey
 * OLMADIĞINDA çizilir (özet yok / iskelet); özet varken yerini
 * `AssistantTrigger` alır ve etiketi o taşır.
 *
 * Panel'in akış noktalarıyla AYNI işaret (`stream.tsx`): kullanıcı bu noktayı
 * Panel'de zaten öğrendi ve burada aynı şeyi görür.
 *
 * ⚠️ Etiket iki yerde de birebir aynı olmalı. Ayrışırlarsa hata sessizdir:
 * özeti olan müşteride "Asistanım", olmayanda "Asistan" yazar ve kullanıcı iki
 * ayrı şey sanır.
 */
function Eyebrow() {
  return (
    <p className="flex items-center gap-2 font-mono text-[9px] font-semibold tracking-[0.18em] text-fg-3 uppercase">
      <span aria-hidden className="h-[5px] w-[5px] shrink-0 rounded-full bg-ai-accent" />
      Asistanım
    </p>
  );
}

/** Henüz özet yok — ne yapılacağını söyler, uyarı gibi görünmez. */
function EmptyInvitation({ summarizable, readOnly }: { summarizable: boolean; readOnly: boolean }) {
  if (!summarizable) {
    return (
      <p className="ai-voice mt-4 max-w-[52ch] text-[16.5px] leading-[1.7] text-fg-3">
        Bu müşteriyle henüz bir görüşme kaydedilmemiş. İlk görüşmeyi yazdığınızda ilişkinin özetini
        buradan okuyabilirsiniz.
      </p>
    );
  }

  return (
    <p className="ai-voice mt-4 max-w-[52ch] text-[16.5px] leading-[1.7] text-fg-3">
      {readOnly
        ? 'Bu müşteri için henüz bir özet çıkarılmamış.'
        : 'Görüşmelerinizden bu müşteriyle nerede kaldığınızı çıkarabilirim.'}
    </p>
  );
}

/** Tarih + tazelik durumu. Renk TEK taşıyıcı değil: metin de söyler. */
function Meta({ summary, busy }: { summary: CompanySummary; busy: boolean }) {
  if (busy) {
    return (
      <span className="font-mono text-[10px] tracking-[0.08em] text-fg-3 uppercase" role="status">
        Özet hazırlanıyor…
      </span>
    );
  }

  if (summary.generatedAt === null) {
    return null;
  }

  return (
    <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-fg-3 uppercase">
      <span>{localRelativeWhen(summary.generatedAt)} özetlendi</span>
      {summary.stale ? (
        <span className="rounded-[6px] border border-ai-tint px-1.5 py-[2px] text-ai-ink normal-case">
          sonrasında değişiklik var
        </span>
      ) : null}
    </span>
  );
}

/** Yükleniyor — metnin GELECEĞİ yeri tutar, sayfa zıplamaz. */
function SummarySkeleton() {
  return (
    <section className="border-b border-border px-5 pt-7 pb-8 md:px-10" aria-hidden>
      <Eyebrow />
      <div className="mt-5 h-[18px] w-[70%] max-w-[420px] rounded-full bg-fill" />
      <div className="mt-3 h-[18px] w-[45%] max-w-[280px] rounded-full bg-fill" />
    </section>
  );
}
