'use client';

import {
  CLOSED_OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABELS,
  type OpportunityListRow,
} from '@business-os/contracts';
import Link from 'next/link';

import { Rise } from '@/components/panel/stream';
import { CrmHeader, CrmTabs, EmptyState, RISE, SectionLabel } from './chrome';
import { FollowUpMark } from './follow-up-mark';
import { formatMoney } from './stage-pill';
import { StageAgeMark } from './signals';
import { usePipeline, type StageColumn } from './use-pipeline';

/**
 * `/app/crm/pipeline` — fırsat hattı.
 *
 * ============================================================================
 * BEŞ SÜTUN AYNI ANDA — sabit genişlik değil, ESNEK ızgara
 * ============================================================================
 * Sütunlar 262px sabitken beş tanesi 1440px'lik bir pencerede sığmıyordu
 * (5×262 + boşluklar = 1358px, kullanılabilir alan 1074px) ve ekran yatay
 * kaydırma ile açılıyordu — yani hattın sonu ilk bakışta GÖRÜNMÜYORDU.
 *
 * `grid-cols-5` sütunları kalan genişliği paylaştırır: 1440'ta ~205px,
 * 1600'de ~240px. Beş aşama her zaman ekrandadır.
 *
 * ⚠️ DİKEY İSTİF (her aşama ayrı bir bölüm) DEĞERLENDİRİLDİ ve REDDEDİLDİ:
 * kaydırmayı kaldırmaz, eksenini değiştirir — beş bölüm alt alta bir ekrana
 * yine sığmaz. Üstelik aşama SIRALI bir şeydir; soldan sağa okuma "potansiyel
 * → kazanıldı" ilerlemesini taşır, gruplanmış bir liste yalnızca kümeleri
 * gösterir.
 *
 * Yoğunluk yatayda kaybedileni DİKEYDE kazanır: dar sütunda kart daha kalın
 * dolgu ve daha rahat satır aralığı taşır.
 *
 * Dar ekranda (`<1024px`) ızgara ikiye, en darda tek sütuna düşer; beş sütunu
 * 400px'e sıkıştırmak okunmaz bir şey üretirdi.
 *
 * ============================================================================
 * SÜRÜKLE-BIRAK YOK
 * ============================================================================
 * Kanban denince beklenen şey sürükleyerek aşama değiştirmektir; burada YOK ve
 * bu bilinçli. Aşama değişimi `stage_changed_at`'i ilerletir, yani "kaç gündür
 * bu aşamada" sinyalini ve dolayısıyla AI'ın yapısal katkısını etkiler. Kazara
 * bir sürükleme o sinyali sessizce bozardı. Aşama, fırsatın kendi formundan
 * değiştirilir (şirket detayında).
 */
export function PipelineScreen() {
  const { columns, loading } = usePipeline();

  const total = columns.reduce((sum, column) => sum + column.total, 0);
  const anyFailed = columns.some((column) => column.failed);
  const empty = !loading && !anyFailed && total === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CrmHeader
        title="Fırsatlar"
        subtitle={<Subtitle loading={loading} failed={anyFailed} total={total} />}
        right={<CrmTabs />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 pt-8 pb-10 md:px-10">
          {empty ? (
            <div className="mx-auto max-w-[720px]">
              <EmptyState
                title="Henüz fırsat yok"
                hint="Her fırsat bir müşteriye bağlıdır. Bir müşteri açıp sayfasından ilk fırsatı ekleyin; buraya düşecek."
                action={
                  <Link
                    href="/app/crm"
                    className="text-[12.5px] font-semibold text-ink underline-offset-2 hover:underline"
                  >
                    Müşterilere git
                  </Link>
                }
              />
            </div>
          ) : (
            <Rise delay={RISE.body}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {columns.map((column) => (
                  <Column key={column.stage} column={column} loading={loading} />
                ))}
              </div>
            </Rise>
          )}
        </div>
      </div>
    </div>
  );
}

function Subtitle({
  loading,
  failed,
  total,
}: {
  loading: boolean;
  failed: boolean;
  total: number;
}) {
  if (loading) {
    return <>Satış görüşmeleriniz ve teklifleriniz</>;
  }
  if (failed) {
    // Bir sütun bile düştüyse TOPLAM eksiktir; eksik bir toplamı kesin bir
    // sayı gibi yazmak, ölçememeyi ölçüm gibi göstermek olurdu.
    return <>Fırsatların bir kısmı şu an getirilemiyor</>;
  }

  return (
    <>
      <b className="font-semibold text-fg tabular">{total}</b> fırsat · beş aşama
    </>
  );
}

function Column({ column, loading }: { column: StageColumn; loading: boolean }) {
  return (
    // `aria-label`: ekran okuyucu kullanıcısı hangi sütunda olduğunu bilmeli.
    // Görsel kullanıcı bunu sütun başlığından ve konumdan okur; işaretlemede
    // karşılığı olmadan beş sütun ayırt edilemeyen beş liste olurdu.
    <section
      aria-label={OPPORTUNITY_STAGE_LABELS[column.stage]}
      className="flex min-w-0 flex-col gap-2.5"
    >
      {/*
        ============================================================================
        KAYDIRMA SAYFANIN, SÜTUNUN DEĞİL — ve başlık YAPIŞIK kalır
        ============================================================================
        Sütuna kendi `overflow-y-auto`'sunu vermek beş ayrı kaydırma bölgesi
        yaratırdı: fare tekerleğinin hangisini sürdüğü tahmin edilemez olur ve
        sayfanın kendi kaydırması bunlarla iç içe geçerdi. Bilinen ve kaçınılması
        gereken bir kalıp.

        Kaydırma zaten panelin gövdesinde (`overflow-y-auto`); başlık şeridi ve
        sekmeler onun DIŞINDA olduğu için yerinde kalıyor. Ayrıca sütun sınırlı:
        `COLUMN_SIZE` (20) kadar kart çizilir, gerisi "+N daha" olarak söylenir —
        yani bir sütun sınırsız uzayamaz.

        `sticky top-0`: on kartlık bir sütunda aşağı inerken "hangi aşamadayım"
        sorusu cevapsız kalmasın. Zemin (`bg-surface`) ŞART — saydam bir başlık
        altından geçen kartları gösterirdi.
      */}
      <div className="sticky top-0 z-10 flex items-baseline justify-between gap-2 bg-surface px-1 pt-1 pb-2">
        <SectionLabel>{OPPORTUNITY_STAGE_LABELS[column.stage]}</SectionLabel>
        {column.failed ? null : (
          <span className="text-[11.5px] text-fg-3 tabular">{column.total}</span>
        )}
      </div>

      {column.failed ? (
        <p className="px-1 text-[12px] leading-[1.5] text-fg-3">Bu sütun getirilemedi.</p>
      ) : column.items.length === 0 ? (
        <p className="px-1 text-[12px] text-fg-3">{loading ? 'Yükleniyor…' : '—'}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {column.items.map((item) => (
            <li key={item.id}>
              <PipelineCard item={item} />
            </li>
          ))}
        </ul>
      )}

      {/*
        ============================================================================
        PANO BİR ÖZET, ARŞİV DEĞİL — kalan TAM LİSTEYE bağlanır
        ============================================================================
        Sütun aşama başına yalnızca birkaç kart gösterir (config). Kalanı
        sessizce kırpmak hattı olduğundan küçük gösterirdi; düz bir "+N daha"
        metni ise bir çıkmaz sokaktı — sayıyı söyleyip yolu göstermiyordu.

        Bağlantı AYRI BİR ROTAYA gider, satır içinde açılmaz: ~205px'lik bir
        sütuna kompakt liste sığmaz, tam genişliğe açılsaydı panoyu aşağı iter
        ve az önce kazanılan ferahlığı bozardı. Rota ayrıca paylaşılabilir ve
        geri tuşu çalışır. (Atölye'de modal yok — üçüncü seçenek zaten yoktu.)
      */}
      {!column.failed && column.items.length < column.total ? (
        <Link
          href={`/app/crm/pipeline/${column.stage}`}
          className="px-1 text-[11px] font-medium text-fg-3 tabular transition-colors duration-150 hover:text-ink"
        >
          +{column.total - column.items.length} tümünü gör
        </Link>
      ) : null}
    </section>
  );
}

/**
 * Hat kartı — `RecordCard`'ın dar sütundaki hâli.
 *
 * Kart bileşeni yeniden kullanılmadı çünkü `RecordCard` ana sütunun dolgusunu
 * (22/20) taşıyor; ~205px'lik bir sütunda o dolgu içeriği boğardı.
 *
 * Yoğunluk artışı burada DİKEYE gider: dolgu 15/13 → 17/16, satır aralığı
 * 6 → 9px. Yatayda yer yok (sütun daraldı), ama kart daha kalın bir gövde ve
 * daha rahat bir satır düzeni kazanıyor — istenen "daha dolu kart" hissi
 * dar sütunda böyle elde edilir.
 */
function PipelineCard({ item }: { item: OpportunityListRow }) {
  const money = formatMoney(item.estimatedValue, item.currency);

  return (
    <div
      className={[
        'group relative flex flex-col gap-[9px] overflow-hidden rounded-card px-[17px] py-[16px]',
        'border border-border bg-surface shadow-card',
        'transition-[transform,box-shadow] duration-[260ms] ease-rise',
        'hover:-translate-y-[2px] hover:shadow-float',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'absolute top-3.5 bottom-3.5 left-0 w-[2.5px] origin-center scale-y-[0.25] rounded-r-[3px] bg-accent',
          'opacity-0 transition-[opacity,transform] duration-[260ms] ease-rise',
          'group-hover:scale-y-100 group-hover:opacity-100',
        ].join(' ')}
      />

      {/*
        Bağlantı ŞİRKETE gider: fırsatın kendi sayfası YOK ve olmamalı —
        bir fırsat şirket bağlamı olmadan okunmaz. Örtü tekniği `CardTitleLink`
        ile aynı: kartın her yeri tıklanır, DOM geçerli kalır.
      */}
      {/*
        Başlık İKİ SATIRA sabitlenir (`line-clamp-2` + `min-h`): tek satırlık
        "Depo kiralama" ile iki satırlık "Yıllık bakım sözleşmesi" aksi halde
        kartları farklı yükseklikte bırakırdı.
      */}
      <Link
        href={`/app/crm/${item.companyId}`}
        className="line-clamp-2 min-h-[37px] text-[13.5px] leading-[1.35] font-semibold tracking-[-0.01em] text-fg transition-colors duration-[260ms] ease-rise after:absolute after:inset-0 group-hover:text-ink"
      >
        {item.title}
      </Link>

      <p className="truncate text-[12px] text-fg-2">{item.companyName}</p>

      {/*
        Tutar YOKSA da satır yüksekliği ayrılır — boş bırakılır, "—" yazılmaz.
        Bir yer tutucu işareti, olmayan bir veriyi varmış gibi gösterirdi.
      */}
      <p className="min-h-[17px] font-mono text-[12px] font-medium text-fg tabular">{money}</p>

      {/*
        ============================================================================
        SİNYAL YUVASI — SABİT YÜKSEKLİK, rozet olsun ya da olmasın
        ============================================================================
        İki işaret sığacak kadar yer HER KARTTA ayrılır (`min-h`). Rozetler
        koşullu çizildiği için yükseklik kart kart değişiyordu ve bir satırdaki
        kartların alt kenarı hizalanmıyordu — "testere dişi" görünüm.

        Yer tutucu GÖRÜNMEZDİR: boş bir kutu, uyarısı olan kartla olmayanı
        ayırt edilebilir tutar; oraya bir tire ya da "—" koymak, sinyal
        yokluğunu bir sinyal gibi gösterirdi.
      */}
      <div className="flex min-h-[32px] flex-col gap-[6px]">
        {item.nextFollowUpOn === null ? null : <FollowUpMark day={item.nextFollowUpOn} />}

        {/* Sütun zaten aşamayı söylüyor; bu satır KAÇ GÜNDÜR orada olduğunu söyler. */}
        <StageAgeMark
          stageChangedAt={item.stageChangedAt}
          closed={CLOSED_OPPORTUNITY_STAGES.includes(item.stage)}
        />
      </div>
    </div>
  );
}
