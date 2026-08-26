import { CAMPAIGN_STATUSES, type Campaign, type CampaignStatus } from '@business-os/contracts';

/**
 * Kampanya odasının küçük gösterim parçaları (ADR-0047 §9).
 *
 * `feedback/chrome.tsx` ile aynı sınıf: modüle özgü, tek satırlık okuma
 * yardımcıları. `module-kit`e ÇIKARILMAZLAR — hiçbiri genel değil.
 */

const STATUS_LABELS: Readonly<Record<CampaignStatus, string>> = {
  draft: 'Taslak',
  active: 'Yayında',
  done: 'Bitti',
};

/**
 * DURUM ROZETİ.
 *
 * ============================================================================
 * ⚠️ DURUM BİR ETİKETTİR, BİR KİLİT DEĞİL (ADR-0047 §2.2)
 * ============================================================================
 * Rozet kampanyanın NEREDE olduğunu söyler; ne yapılabileceğini BELİRLEMEZ.
 * `done` bir kampanya da düzenlenebilir — çünkü sonuç notu tanımı gereği
 * kampanya BİTTİKTEN SONRA yazılır. Kilit olsaydı kullanıcı kampanyayı yapay
 * olarak `active` tutardı, yani **durum yalan söylerdi**.
 *
 * ⚠️ Bu yüzden rozetin yanında bir kilit ikonu, "düzenlenemez" ipucu ya da
 * pasifleştirilmiş bir alan YOKTUR. Teklif/Fatura'da olan tam tersidir ve
 * ikisi karıştırılmamalıdır: orada belge ŞİRKETTEN ÇIKMIŞTIR.
 *
 * ⚠️ `cancelled` diye bir durum YOKTUR (§1.6): iptal edilen kampanya
 * YAPILMAMIŞ kampanyadır ve kaydı silinir.
 *
 * ⚠️ RENK TEK AYIRT EDİCİ DEĞİLDİR — her rozet METNİ de taşır.
 */
export function StatusBadge({ value }: { readonly value: CampaignStatus }) {
  const tone =
    value === 'active'
      ? 'bg-accent-tint text-ink'
      : value === 'done'
        ? 'bg-fill-2 text-fg-2'
        : 'bg-fill-1 text-fg-3';

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] ${tone}`}
    >
      {STATUS_LABELS[value]}
    </span>
  );
}

/**
 * TARİH ARALIĞI — ve `null` bitişin AÇIKÇA söylenmesi.
 *
 * ⚠️ `endsOn === null` bir EKSİK VERİ DEĞİLDİR (§1.5): sürekli yayındaki bir
 * Google Ads kampanyasının bitişi yoktur. "—" ya da boş bırakmak, kullanıcıya
 * "tarih girilmemiş" dedirtir; "süresiz" gerçeği söyler.
 *
 * ⚠️ Tarihler `date`tir, `timestamptz` DEĞİL — bir kampanyanın SAATİ YOKTUR.
 * Bu yüzden burada saat dilimi çevrimi YAPILMAZ: `new Date('2026-09-01')` UTC
 * gece yarısı olarak okunur ve yerel saate göre BİR GÜN KAYABİLİR. Gün
 * parçaları elle biçimlendirilir.
 */
export function DateRange({
  startsOn,
  endsOn,
}: {
  readonly startsOn: string;
  readonly endsOn: string | null;
}) {
  return (
    <span className="font-mono text-[11px] tabular-nums text-fg-2">
      {formatDay(startsOn)}
      <span className="px-1 text-fg-3">→</span>
      {endsOn === null ? <span className="text-fg-3">süresiz</span> : formatDay(endsOn)}
    </span>
  );
}

/**
 * KANAL ETİKETİ — olduğu gibi basılır.
 *
 * ⚠️ HİÇBİR ŞEY AYRIŞTIRILMAZ ve normalize EDİLMEZ (§1.4): `"instagram"` ile
 * `"Instagram"` iki ayrı değerdir ve öyle gösterilir. Arayüzde birleştirmek,
 * sunucuda gruplanamayan bir veriyi gruplanabilir GÖSTERİRDİ.
 */
export function Channel({ value }: { readonly value: string | null }) {
  if (value === null) {
    return <span className="text-fg-3">Kanal belirtilmemiş</span>;
  }

  return <span className="text-fg-2">{value}</span>;
}

/**
 * ⚠️ BOŞLUK GÖSTERGESİ — `campaign-gap` KATKICISININ ARAYÜZ KARŞILIĞI
 * (ADR-0047 §3.3, §9.1).
 *
 * ============================================================================
 * ⚠️ AYNI KÜME, İKİ FARKLI YER — VE BU AYRIM KAYDA DEĞER
 * ============================================================================
 * Bu işaret, `campaign-gap` katkıcısının `POST /ask` havuzuna taşıdığı kümenin
 * TAM OLARAK AYNISINI gösterir. Ama:
 *
 *   ekran    -> yalnızca KULLANICIYA görünür
 *   katkıcı  -> `POST /ask` havuzuna girer, taban yuvası tüketir, T2'yi etkiler
 *
 * ⚠️ Kaydedilmeseydi ileride birisi "zaten ekranda gösteriyoruz" diye yapısal
 * katkıcıyı GEREKSİZ sanabilirdi — ya da tersi.
 *
 * ============================================================================
 * ⚠️ BİR HATA DEĞİL, BİR EKSİK — VE TON BUNU SÖYLEMELİ
 * ============================================================================
 * Sonucu yazılmamış bir kampanya bozuk bir kayıt değildir; yalnızca
 * TAMAMLANMAMIŞTIR. Kırmızı bir hata tonu, kullanıcıyı sonuç notunu
 * UYDURMAYA iterdi (ADR-0033'ün "sahte Genel projesi" dersinin aynı sınıfı).
 *
 * ⚠️ Metin ayrıca modülün kendi sınırını söyler: bu kayıtların gömülecek
 * metni yoktur, yani asistanın aramasına GİRMEZLER.
 */
export function GapMark({ campaign }: { readonly campaign: Campaign }) {
  // ⚠️ ARAYÜZ ARTIK KENDİ HESABINI YAPMIYOR — bayrak SUNUCUDAN gelir.
  //
  // Önce burada bir `hasResultGap(campaign)` vardı ve tanım sunucudaki
  // `gapSnapshot` SQL'iyle SENKRON kalmak zorundaydı. ADR-0047'nin kapanış
  // denetimi bunu bir SINIR olarak kaydetmişti: ayrışırlarsa ekran bir şey
  // der, `/ask` başka bir şey sayar ve fark SESSİZDİR.
  //
  // ⚠️ Risk bir testle değil, TANIMI TEKİLLEŞTİREREK kapatıldı: `resultGap`
  // sunucuda `resultGapExpression` ile türetilir ve `campaign-gap`
  // katkıcısıyla duvarın `missingResultCount`u AYNI ifadeyi kullanır.
  if (!campaign.resultGap) {
    return null;
  }

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-line-2 px-1.5 py-0.5 text-[11px] text-fg-2"
      title="Kampanya bitti ama sonucu yazılmadı — bu kayıt asistanın aramasına girmez."
    >
      <span aria-hidden>◌</span>
      Sonucu yazılmadı
    </span>
  );
}

/**
 * ⚠️ ELLE BİÇİMLENDİRİLİR — `new Date(...)` KULLANILMAZ.
 *
 * `new Date('2026-09-01')` UTC gece yarısı olarak okunur; negatif ofsetli bir
 * saat diliminde `toLocaleDateString` **31 Ağustos** basar. Bir kampanyanın
 * saati olmadığı için (§1.5) çevrilecek bir şey de yoktur.
 */
function formatDay(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date ?? ''}.${month ?? ''}.${year ?? ''}`;
}

/**
 * `<select>`ten gelen dizeyi `CampaignStatus`a DARALTIR.
 *
 * ⚠️ `as CampaignStatus` KULLANILMAZ: bir tip iddiası, değerin gerçekten o
 * kümede olduğunu DOĞRULAMAZ — yalnızca derleyiciyi susturur. `<select>`in
 * seçenekleri bugün doğru olsa bile, bir gün listeye yanlış bir değer
 * eklendiğinde iddia SESSİZCE yanlış olurdu ve sunucu 422 dönerdi.
 *
 * Bilinmeyen bir değer `null` döner ve çağıran "filtre yok" olarak okur.
 */
export function toCampaignStatus(value: string): CampaignStatus | null {
  return CAMPAIGN_STATUSES.find((status) => status === value) ?? null;
}
