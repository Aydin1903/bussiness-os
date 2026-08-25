import { type ContextFragment, type ContributionKind } from './retrieval-contributor.port';

/**
 * Havuzun kac parcasinin yapisal GENISLEME icin ayrilacagini belirleyen bolen.
 *
 * `ceil(K / 3)` — yani havuzun UCTE BIRI (yukari yuvarlanmis). `K = 8` icin 3.
 *
 * ============================================================================
 * ⚠️ NEDEN 3, VE NEDEN CONFIG'E ACILMADI
 * ============================================================================
 * Taban, olculen dagilimda ZATEN iceride olan yapisal kaynak sayisindan (2)
 * BUYUK olmak zorundaydi; 2 olsaydi kisit, onu doguran senaryoda hicbir sey
 * yapmayan bir no-op olurdu — ustelik yesil yanan bir testle korunan.
 *
 * Dort (bugunku yapisal kaynak sayisi) ise havuzun YARISINI rezerve ederdi ve
 * kaynak sayisi arttikca tutulamaz bir soz olurdu (ADR-0036 §3).
 *
 * Config'e ACILMADI (`MIN_SAMPLE` ile ayni gerekce): bu bir IS TERCIHI degil,
 * iki skor olcegi arasindaki MIMARI DENGEDIR. Ayarlanabilir olsaydi 0'a
 * cekilebilir ve ADR-0036 sessizce geri alinmis olurdu.
 * ============================================================================
 */
const STRUCTURAL_FLOOR_DIVISOR = 3;

/**
 * Havuza giren tek aday: parca + onu URETEN KATKICININ kimligi.
 *
 * ⚠️ `source` ve `contributionKind` KATKICI KAYDINDAN gelir, parcanin kendi
 * `fragment.source` alanindan DEGIL. Ikisi uretimde ayni sabittir, ama taban
 * garantisini parcanin KENDI BEYANINA baglamak, bir modulun yanlis etiket
 * yazmasi hâlinde garantiyi SESSIZCE kaybettirirdi. Platformun verdigi soz,
 * platformun bildigi bilgiye dayanmalidir.
 */
export interface RankedCandidate {
  readonly fragment: ContextFragment;
  /** Parcayi ureten katkicinin etiketi. */
  readonly source: string;
  /** Parcayi ureten katkicinin beyan ettigi tur. */
  readonly contributionKind: ContributionKind;
}

export interface SelectFragmentsInput {
  /** Tum katkicilardan gelen adaylar — siralanmamis olabilir. */
  readonly candidates: readonly RankedCandidate[];
  /** Global top-K. */
  readonly limit: number;
}

/**
 * Secimin SONUCU — parcalar VE nasil olustugu (ADR-0046 §5).
 *
 * ============================================================================
 * ⚠️ FONKSIYON SAF KALDI — RECORDER ICERI GIRMEDI
 * ============================================================================
 * ADR-0036 bu fonksiyonu bilerek SAF yapti (_"karar burada degil
 * `select-fragments.ts`te yasar — girdi/cikti olarak sinanabilir olmasi
 * icin"_). ADR-0046 gozlemlenebilirlik eklerken o karari BOZMADI: bir logger
 * iceri sokulmadi, bunun yerine CIKTI zenginlestirildi. Ayni girdi -> ayni
 * cikti, sifir yan etki.
 *
 * ============================================================================
 * ⚠️ `selected` NEDEN BURADAN DONUYOR — CAGIRAN TURETMIYOR
 * ============================================================================
 * Cagiranin secilenleri `new Set(fragments)` ile geri eslestirmesi
 * DEGERLENDIRILDI VE REDDEDILDI (ADR-0046 §5): bugun calisirdi — ayni nesne
 * referanslari geciyor — ama bu fonksiyonun icine bir gun tek bir `.map()`
 * eklendiginde eslestirme SESSIZCE bozulurdu: her parca `selected: false`
 * gorunur, testler yesil kalir ve KAYIT YALAN SOYLERDI.
 *
 * Secimi YAPAN taraf, kimi sectigini de SOYLER. Bu, turetilmis bir bilgi
 * degil BIRINCIL bir ciktidir.
 */
export interface SelectFragmentsResult {
  /** Modele gidecek parcalar — skor sirasinda. */
  readonly fragments: ContextFragment[];
  /**
   * Secilen ADAYLAR (parcalar degil).
   *
   * ⚠️ Aday nesnesi cagiran tarafindan uretilir ve cagri boyunca kimligi
   * SABITTIR; uyelik sorgusu bu yuzden guvenlidir.
   */
  readonly selected: ReadonlySet<RankedCandidate>;
  /**
   * O cagrida GERCEKTEN uygulanan yapisal taban (`ceil(K/3)`, `K-1` tavaniyla).
   *
   * ⚠️ Sabit `ceil(K/3)` DEGIL: `limit - 1` tavani kucuk `K` degerlerinde
   * devreye girer ve `K = 1`'de tabani 0 yapar. Kayda GERCEKTEN UYGULANAN
   * deger yazilmalidir, formulun teorik sonucu degil.
   */
  readonly structuralFloor: number;
}

/**
 * Modele gidecek parcalari secer — SAF fonksiyon (ADR-0036).
 *
 * ============================================================================
 * SAF SKOR SIRALAMASI KALDIRILMADI; USTUNE BIR TABAN EKLENDI
 * ============================================================================
 * Once `ceil(K/3)` kadar yuva, AYRI yapisal kaynaklara birer birer dagitilir
 * (en iyi skoru yuksek olandan baslayarak). Kalan yuvalar, TUR AYRIMI
 * GOZETMEDEN saf skor sirasina gore doldurulur.
 *
 * ⚠️ TABAN, KAYNAK BASINA BIR YUVADIR — TOPLU BIR KOTA DEGIL.
 * Olculen dagilimda yapisal kaynaklar zaten 3/8 yuva almisti, ama ikisi TEK
 * bir kaynaga (`project-status`) gidiyordu ve iki kaynak SIFIR aliyordu. Toplu
 * bir kota bu senaryoyu HIC DEGISTIRMEZDI. Sorun toplam pay degil, yapisal
 * kaynaklar ARASINDAKI acliktir — taban bu yuzden DERINLIK degil GENISLIK
 * satin alir.
 *
 * ⚠️ TABAN BIR TAVAN DEGILDIR: rezerve dagitildiktan sonra yapisal parcalar
 * serbest havuzda da yarisir. Alarm durumundaki bir kaynak (0.95) hem tabandan
 * yuvasini alir hem de ek satirlar kazanabilir.
 *
 * ⚠️ BOS KAYNAGA YUVA AYRILMAZ: taban, GERCEKTEN satir donduren yapisal kaynak
 * sayisiyla sinirlidir. Bos bir tenant'ta yapisal katkicilar zaten `[]` doner;
 * onlar icin yuva ayirmak havuzu bos yuvalarla harcamak olurdu.
 * ============================================================================
 */
export function selectFragments(input: SelectFragmentsInput): SelectFragmentsResult {
  const { candidates, limit } = input;

  if (limit <= 0) {
    return { fragments: [], selected: new Set(), structuralFloor: 0 };
  }

  // ⚠️ `toSorted` DEGIL `[...].sort()`: girdi `readonly` ve kopya UZERINDE
  // siralanir — cagiranin dizisi DEGISMEZ. `Array.prototype.sort` ES2019'dan
  // beri KARARLIDIR, yani esit skorlu adaylar katkici kayit sirasini korur ve
  // secim DETERMINISTIKTIR (ayni girdi, ayni cikti).
  const ranked = [...candidates].sort((a, b) => b.fragment.score - a.fragment.score);

  const structuralFloor = structuralFloorFor(limit);
  const reserved = reserveStructuralSlots(ranked, structuralFloor);

  const selected = [...reserved];
  const taken = new Set(reserved);

  // Kalan yuvalar: TUR AYRIMI YOK, saf skor. Taban bir tavan olmadigi icin
  // yapisal adaylar burada da yarisir.
  for (const candidate of ranked) {
    if (selected.length >= limit) {
      break;
    }
    if (!taken.has(candidate)) {
      selected.push(candidate);
      taken.add(candidate);
    }
  }

  // ⚠️ SON SIRALAMA SKORA GORE: secim degisti, SIRALAMA SOZLESMESI DEGISMEDI.
  // `distinctSources` "alaka sirasi"na dayanir ve atif listesi bunun uzerinden
  // uretilir; rezerve edilmis bir satiri listenin basina zorlamak, kullaniciya
  // yanlis bir "en alakali kaynak" gosterirdi.
  const fragments = selected
    .sort((a, b) => b.fragment.score - a.fragment.score)
    .map((candidate) => candidate.fragment);

  // ⚠️ `taken` ZATEN secilen adaylarin kumesidir — ikinci bir kume kurmak
  // gerekmiyor. Aday nesneleri cagiran tarafindan uretildigi icin kimlikleri
  // cagri boyunca sabittir.
  return { fragments, selected: taken, structuralFloor };
}

/**
 * O cagrida GERCEKTEN uygulanacak taban.
 *
 * ⚠️ `limit - 1` TAVANI: taban hicbir kosulda havuzun GENEL BIRINCISINI disari
 * itemez. `K = 8`'de devreye girmez (3 < 7); anlami kucuk K degerlerindedir —
 * `K = 1`'de taban 0 olur ve davranis saf skora doner.
 *
 * ⚠️ AYRI BIR FONKSIYONA CIKARILDI (ADR-0046) cunku artik IKI tuketicisi var:
 * rezervasyon ve KAYIT. Iki yerde ayri hesaplansaydi, formul degistiginde
 * kayit eski degeri yazmaya devam edebilirdi — ve o sapma SESSIZ olurdu.
 */
function structuralFloorFor(limit: number): number {
  return Math.max(0, Math.min(Math.ceil(limit / STRUCTURAL_FLOOR_DIVISOR), limit - 1));
}

/**
 * Yapisal kaynaklara birer yuva ayirir.
 *
 * Kaynaklar, kendi EN IYI parcalarinin skoruna gore azalan sirada secilir —
 * `ranked` zaten skora gore sirali oldugu icin bu, "ilk gorulen kaynak once"
 * demektir.
 */
function reserveStructuralSlots(
  ranked: readonly RankedCandidate[],
  cap: number,
): RankedCandidate[] {
  if (cap <= 0) {
    return [];
  }

  const reserved: RankedCandidate[] = [];
  const claimedSources = new Set<string>();

  for (const candidate of ranked) {
    if (reserved.length >= cap) {
      break;
    }
    if (candidate.contributionKind !== 'structural') {
      continue;
    }
    // Her yapisal kaynak tabandan EN FAZLA BIR yuva alir — derinlik degil
    // genislik.
    if (claimedSources.has(candidate.source)) {
      continue;
    }

    claimedSources.add(candidate.source);
    reserved.push(candidate);
  }

  return reserved;
}
