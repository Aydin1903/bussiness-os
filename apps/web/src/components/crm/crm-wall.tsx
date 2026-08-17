'use client';

import type { OpportunityListRow } from '@business-os/contracts';
import { useEffect, useState } from 'react';

import { Rise } from '@/components/panel/stream';
import { Hero, HeroFigure, ROOM_RISE, Satellite, Satellites, Wall } from '@/components/room/room';
import { listFollowUps, listOpportunities } from '@/lib/api/crm';
import { isOverdue } from './follow-up-mark';

/**
 * MÜŞTERİLER ODASININ DUVARI — CRM'in beş rotasının PAYLAŞTIĞI yüzey.
 *
 * ============================================================================
 * KAHRAMAN NEDEN "AÇIK FIRSAT TOPLAMI" (ADR-0038 §5)
 * ============================================================================
 * Bir işletme sahibi CRM'e "kaç kayıt var" diye bakmaz — o sayıyı bilmek
 * hiçbir şeyi değiştirmez. Sorduğu şey **"ne kadar iş havada"**dır. Duvarın
 * kahramanı bu yüzden kapanmamış fırsatların toplamıdır.
 *
 * ⚠️ Duvar ORTAKTIR, tezgah değişir (ADR-0038 §6.5): şirketler, hat, takipler
 * ve aşama listesi aynı odanın farklı çalışma yüzeyleridir. Sekmeler arasında
 * gezerken "ne kadar iş havada" cevabı gözden kaybolmaz.
 *
 * ============================================================================
 * ⚠️ PARA BİRİMLERİ TOPLANMAZ — Finans'ın aynı kuralı
 * ============================================================================
 * `estimatedValue` yanında `currency` taşır ve ADR-0034 §5.1 farklı para
 * birimlerinin toplanmasını yasaklar. Kahraman bu yüzden **en büyük hacimli
 * para biriminin** toplamıdır ve etiketi kodu açıkça yazar; kalanlar uydu
 * olarak sayılır.
 *
 * ⚠️ `currency`si NULL olan fırsatlar toplama GİRMEZ ve ayrıca sayılır.
 * Para birimi bilinmeyen bir tutarı herhangi bir toplama katmak, hangi parayla
 * ölçüldüğü belli olmayan bir sayı üretirdi.
 *
 * ============================================================================
 * ⚠️ ZAMAN KARŞILAŞTIRMASI YOK — ve uydurulmadı
 * ============================================================================
 * ADR-0038 §5 duvar rakamının "dönem + değişim + eğilim" ile gelmesini ister.
 * Hat (pipeline) bir DÖNEM ölçüsü değildir: sunucu geçmiş anlık görüntü
 * tutmuyor, dolayısıyla "geçen aya göre" hesaplanamaz. Sahte bir delta
 * üretmek yerine bağlam **bileşimle** veriliyor: kaç fırsat, kaçı gecikmiş.
 *
 * Gerçek bir zaman karşılaştırması istenirse sunucuda anlık görüntü tablosu
 * gerekir — bir modül kararıdır, arayüz işi değil.
 */

/** Sunucu üst sınırı (`crm.dto.ts › MAX_LIMIT`). */
const PAGE = 100;

interface Pipeline {
  readonly rows: readonly OpportunityListRow[];
  /** Sunucunun bildirdiği toplam — sayfaya sığmayan varsa `rows`tan büyüktür. */
  readonly total: number;
  readonly overdue: number;
  /** Teklif gönderilmiş, cevap bekleyen fırsat sayısı. */
  readonly proposalCount: number;
}

export function CrmWall() {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    /*
     * Aşama başına AYRI istek. `listOpportunities` "yalnızca açıklar" diye bir
     * filtre sunmuyor; tek bir sayfa çekip istemcide elemek, kapanmış fırsatlar
     * sayfayı doldurduğunda açıkları KAYBETTİRİRDİ. Üç istek paraleldir ve her
     * biri kendi `total`ini bildirir — eksik sayfa böylece görülebilir.
     */
    /*
     * ⚠️ AŞAMALAR AÇIKÇA YAZILIR, `map` ile ÜRETİLMEZ.
     *
     * `Promise.all([...spread, digeri])` tuple tipini kaybettirir ve sonucu
     * kullanmak için tip iddiası (`as`) gerektirir — projenin lint kuralı da
     * bunu yasaklıyor, haklı olarak: iddia, derleyicinin kanıtlayamadığı bir
     * şeyi varsaymaktır. Açık liste hem tipleri korur hem okunur.
     */
    Promise.all([
      listOpportunities({ limit: PAGE, offset: 0, stage: 'potential' }),
      listOpportunities({ limit: PAGE, offset: 0, stage: 'in_discussion' }),
      listOpportunities({ limit: PAGE, offset: 0, stage: 'proposal_sent' }),
      listFollowUps({ limit: PAGE, offset: 0 }),
    ])
      .then(([potential, discussion, proposal, followUps]) => {
        if (!active) {
          return;
        }
        const pages = [potential, discussion, proposal];

        setPipeline({
          rows: pages.flatMap((page) => page.items),
          total: pages.reduce((sum, page) => sum + page.total, 0),
          /*
           * ⚠️ `nextFollowUpOn` burada NULL OLAMAZ ve bir null kontrolü
           * yazılmadı: `GET /crm/follow-ups` tanımı gereği yalnızca takip
           * tarihi OLAN ve kapanmamış fırsatları döndürür (crm.ts). Gereksiz
           * bir kontrol, sözleşmeyi okumayan birine "burada null gelebilir"
           * diye yanlış bilgi verirdi — lint de bunu yakaladı.
           *
           * "Gecikmiş" işaretini İSTEMCİ koyar: sunucunun `CURRENT_DATE`i ile
           * kullanıcının takvim günü aynı olmak zorunda değil.
           */
          overdue: followUps.items.filter((row) => isOverdue(row.nextFollowUpOn)).length,
          proposalCount: proposal.total,
        });
      })
      .catch(() => {
        if (active) {
          // ⚠️ Duvar çizilmez. "0 TRY" bir ölçüm değil, ölçememenin sonucudur
          // ve bu odada en büyük puntoyla yazılırdı.
          setFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (failed) {
    return null;
  }

  if (pipeline === null) {
    return (
      <Wall>
        <div aria-hidden className="flex flex-col gap-3">
          <span className="block h-[9px] w-[150px] rounded bg-fill-2" />
          <span className="block h-[52px] w-[72%] rounded-[10px] bg-fill-2" />
          <span className="block h-[11px] w-[130px] rounded bg-fill-2" />
        </div>
      </Wall>
    );
  }

  const money = summarise(pipeline.rows);
  const incomplete = pipeline.total > pipeline.rows.length;

  return (
    <Wall>
      <Rise delay={ROOM_RISE.wall}>
        {money.lead === null ? (
          <Hero label="Açık fırsat">
            <HeroFigure>{pipeline.total}</HeroFigure>
            <p className="mt-2 max-w-[42ch] text-[12.5px] leading-[1.6] text-fg-2">
              {pipeline.total === 0
                ? 'Henüz açık fırsat yok. Bir şirkete fırsat eklediğinizde havadaki işin toplamı burada görünür.'
                : 'Açık fırsatların hiçbirinde tutar girilmemiş; tutar girdikçe toplam burada oluşur.'}
            </p>
          </Hero>
        ) : (
          <Hero
            label={`Açık fırsat · ${money.lead.currency}`}
            delta={
              <>
                <span>
                  <b className="tabular font-semibold text-fg">{pipeline.total}</b> fırsat havada
                </span>
                {money.withoutCurrency > 0 ? (
                  <span className="text-fg-3">· {money.withoutCurrency} tanesi para birimsiz</span>
                ) : null}
                {/*
                  ⚠️ EKSİK SAYFA GİZLENMEZ. Sunucu sayfa başına en fazla 100
                  satır verir; daha fazlası varsa toplam GERÇEĞİN ALTINDADIR ve
                  bunu söylememek, ekranın en büyük rakamını sessizce yanlış
                  yapmak olurdu.
                */}
                {incomplete ? (
                  <span className="text-fg-3">· ilk {pipeline.rows.length} fırsat toplandı</span>
                ) : null}
              </>
            }
          >
            <HeroFigure>{money.lead.total}</HeroFigure>
          </Hero>
        )}
      </Rise>

      <Rise delay={ROOM_RISE.ai}>
        <Satellites>
          <Satellite
            label="Gecikmiş takip"
            value={pipeline.overdue}
            note={pipeline.overdue > 0 ? 'bugün ilgilenilmeli' : 'takipler güncel'}
            tone={pipeline.overdue > 0 ? 'accent' : 'plain'}
          />
          <Satellite
            label="Teklif aşamasında"
            value={pipeline.proposalCount}
            note="cevap bekliyor"
          />
        </Satellites>
      </Rise>
    </Wall>
  );
}

/**
 * Para birimi başına toplam + kahraman seçimi.
 *
 * Kahraman EN BÜYÜK TOPLAMLI para birimidir. Finans'ta ölçüt hacimdi (gelir +
 * gider) çünkü orada yön vardı; burada tek bir yığın var, dolayısıyla toplamın
 * kendisi doğru ölçüttür.
 *
 * ⚠️ Dönen `total` bir DİZEDİR ve ekrana olduğu gibi basılır. Toplama
 * `Number` üzerinden yapılıyor ama sonuç `toFixed(2)` ile kanonik biçime geri
 * dönüyor — sunucunun ondalık sözleşmesiyle aynı şekil.
 */
function summarise(rows: readonly OpportunityListRow[]): {
  lead: { currency: string; total: string } | null;
  withoutCurrency: number;
} {
  const byCurrency = new Map<string, number>();
  let withoutCurrency = 0;

  for (const row of rows) {
    const value = Number(row.estimatedValue);
    if (row.estimatedValue === null || !Number.isFinite(value)) {
      continue;
    }
    if (row.currency === null) {
      withoutCurrency += 1;
      continue;
    }
    byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + value);
  }

  let lead: { currency: string; total: string } | null = null;
  let best = -Infinity;
  for (const [currency, total] of byCurrency) {
    if (total > best) {
      best = total;
      lead = { currency, total: total.toFixed(2) };
    }
  }

  return { lead, withoutCurrency };
}
