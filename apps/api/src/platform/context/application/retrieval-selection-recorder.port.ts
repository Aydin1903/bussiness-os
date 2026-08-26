import { type ContributionKind } from './retrieval-contributor.port';

/** DI token'i. Symbol kullanildi: string token'lar sessizce cakisabilir. */
export const RETRIEVAL_SELECTION_RECORDER = Symbol('RETRIEVAL_SELECTION_RECORDER');

/**
 * Bir katkicinin O CAGRIDAKI hali (ADR-0046 §4.1).
 *
 * ============================================================================
 * ⚠️ `empty` ILE `returned` AYRIMI BU PORT'UN VAR OLMA SEBEBIDIR
 * ============================================================================
 * ADR-0042 su soruyu **cevaplayamadan** kapandi:
 *
 *   _"`project-status` ve `appointment-schedule` ELENDI Mi, yoksa BOS MU
 *    DONDU — BILINMIYOR. Ikisi de mumkun ve fark onemlidir."_
 *
 * Fark onemlidir cunku ADR-0042 §3'un **T2** esigi _"SATIR DONDUREN yapisal
 * kaynak sayisi"_ni sayar, KAYITLI olani degil. Bu iki durum ayirt edilmeden
 * T2 **olculemez**.
 *
 *   `returned`  -> cagrildi, EN AZ BIR satir dondurdu  (T2'ye SAYILIR)
 *   `empty`     -> ⚠️ cagrildi, SIFIR satir dondurdu    (T2'ye SAYILMAZ)
 *   `forbidden` -> ⚠️ cagiran izni tasimiyor, HIC CAGRILMADI
 *   `degraded`  -> katkici COKTU (`degradedSources`ta da gorunur)
 */
export type RetrievalSourceStatus = 'returned' | 'empty' | 'forbidden' | 'degraded';

/**
 * Tek bir parcanin secim sonucu.
 *
 * ⚠️ `reference.id` VE `content` BURADA YOKTUR ve bu, ADR-0046 §4.3'un
 * kararidir — bkz. `RetrievalSelectionRecord`'un yorumu.
 */
export interface RetrievalScoreEntry {
  /** ⚠️ UC ONDALIGA yuvarlanmis (§4.4) — okunabilirlik icin. */
  readonly score: number;
  /**
   * ⚠️ Parcanin SORUYA yakinligi — band ici esitlik kiricinin LIYAKAT anahtari
   * (ADR-0049 §5). Uc ondaliga yuvarlanmis.
   *
   * ⚠️ BU ALAN ZORUNLUYDU, bir iyilestirme DEGIL: ADR-0049 sonrasi ayni
   * banddaki iki aday FARKLI sonuc alir ve `score` tek basina bunu
   * ACIKLAYAMAZ. Kaydettigi karari aciklayamayan bir teshis satiri,
   * OLMAMASINDAN daha kotudur — bakan kisi "rastgele" diye okur ve olmayan
   * bir mekanizma arar.
   */
  readonly affinity: number;
  /**
   * ⚠️ Kararli kur'a — `hash(soru + kaynak)`.
   *
   * ⚠️ BIR ALAKA OLCUSU DEGILDIR ve oyle okunmamalidir (ADR-0049 §3):
   * `affinity` de esitken sistematik acligi kirar, o kadar. Kaydedilmesinin
   * tek sebebi, `affinity` esitken secimin NEDEN o yone dustugunu
   * gosterebilmektir.
   */
  readonly lot: number;
  /** Bu parca modele GITTI mi. */
  readonly selected: boolean;
}

/**
 * Bir katkicinin o cagridaki kaydi.
 *
 * ⚠️ `rowCount` ICIN `null` VE `0` AYRI SEYLERDIR — `AiTokenUsage`in ayni
 * disiplini (_"`null`, 'sifir' DEGIL 'bilinmiyor' demektir; ikisini
 * karistirmak toplamlari sessizce yanlis yapardi"_):
 *
 *   `0`    -> katkici cagrildi ve GERCEKTEN sifir satir dondurdu (`empty`)
 *   `null` -> katkici HIC CAGRILMADI ya da COKTU; sayilacak bir sey YOK
 */
export interface RetrievalSourceRecord {
  /** Katkicinin etiketi (`crm-pipeline`) — kodda yazili SABIT, kullanici verisi DEGIL. */
  readonly source: string;
  readonly kind: ContributionKind;
  readonly status: RetrievalSourceStatus;
  readonly rowCount: number | null;
  readonly selectedCount: number;
  /** ⚠️ GIREN VE GIRMEYEN her parca (ADR-0042 §4 madde 3). */
  readonly scores: readonly RetrievalScoreEntry[];
}

/**
 * Tek bir `POST /ask` cagrisinin SECIM kaydi (ADR-0046).
 *
 * ============================================================================
 * ⚠️ ICERIK TASINMAZ — VE KURAL `reference.id`YI DE KAPSAR
 * ============================================================================
 * `AiCallRecord`in kurali aynen devralinir:
 *
 *   _"Burada soru metni, cevap metni, prompt ya da embed edilen icerik
 *    ARANMAZ ve EKLENMEMELIDIR. (...) Tasinan sey yalnizca SAYILARDIR."_
 *
 * ⚠️ ADR-0046 §4.3 o kurali BIR ADIM GENISLETTI: `ContextFragment.reference`
 * (`{ kind, id }`) **de yazilmaz**. Id bir metin degildir ama bir
 * ISARETCIDIR — `feedback-response` id'lerini loglamak, log'a erisen birinin
 * _"hangi musteriler sikayet etti"_ listesini cikarabilmesi demektir. Bir
 * teshis satirinin, kullanici verisini NUMARALANDIRMANIN yolu olmasi kabul
 * edilemez.
 *
 * ⚠️ Satirda gecen tek serbest metin KAYNAK ADIDIR (`crm-pipeline`) ve o,
 * kodda yazili sabit bir etikettir.
 *
 * ============================================================================
 * ⚠️ `forbidden` LOGA YAZILIR, API'DE GIZLI KALIR — CELISKI DEGIL (§4.2)
 * ============================================================================
 * ADR-0031 §5.3: izin yuzunden elenen kaynak `degradedSources`ta GORUNMEZ,
 * cunku _"gorulemeyen bir kaynagin varligi sizardi"_.
 *
 * O kural CAGIRAN icindir, OPERATOR icin degil:
 *   - API cevabinda `forbidden` gostermek bir YETKI SIZINTISIDIR,
 *   - log satirinda ayni bilgi operatorun ZATEN sahip oldugu bilgidir (izin
 *     katalogu koddadir) ve teshis degeri yuksektir.
 *
 * ⚠️ Bu kayit HICBIR KANALDAN kullaniciya donmez; `AskResult` sekli DEGISMEZ.
 */
export interface RetrievalSelectionRecord {
  /** Global top-K (`retrievalLimit`). */
  readonly limit: number;
  /** O cagrida gecerli yapisal taban (`ceil(K/3)`, `K-1` tavaniyla). */
  readonly structuralFloor: number;
  /** Modele giden parca sayisi. */
  readonly selectedCount: number;
  /** Taban ONCESI toplam aday sayisi. */
  readonly candidateCount: number;
  readonly sources: readonly RetrievalSourceRecord[];
}

/**
 * `POST /ask`in secim kararini kaydeder (ADR-0046).
 *
 * ============================================================================
 * ⚠️ NEDEN `shared/`DA DEGIL — `AiUsageRecorder`DAN AYRILDIGI YER
 * ============================================================================
 * `AiUsageRecorder` `shared/`tadir cunku ON BIR MODULUN adapter'lari onu
 * cagirir — gercekten paylasilan bir kernel parcasidir.
 *
 * Bunun TEK URETICISI vardir: `platform/context`. Bir kernel'e tek tuketicisi
 * olan bir port koymak, `shared/`i "ortak gorunen her sey" cop kutusuna
 * cevirmenin ilk adimidir (CLAUDE.md'nin `shared/` ile `infrastructure/`
 * ayrimi).
 *
 * ============================================================================
 * `void` DONER VE ASLA FIRLATMAZ
 * ============================================================================
 * `AiUsageRecorder`in sozlesmesi birebir devralinir ve bu madde PAZARLIK
 * DISIDIR: kayit tutmak, kaydedilen isin BASARISINI etkilememelidir. Bir log
 * satiri yazilamadi diye kullanicinin sorusu cevapsiz kalamaz.
 *
 * Implementasyonlar hatayi kendi icinde yutar; cagiran `await` etmez.
 *
 * ============================================================================
 * ⚠️ BU PORT HICBIR KARARI ETKILEMEZ
 * ============================================================================
 * Secim `selectFragments`te yapilir ve BITER; bu port yalnizca OLAN BITENI
 * kaydeder. Kaydin varligi ya da yoklugu, modele giden parcalari DEGISTIRMEZ.
 * ⚠️ ADR-0046'nin kendi cumlesi: _"aletin varligi, olculen seyin degismesi
 * gerektigi anlamina gelmez."_
 */
export interface RetrievalSelectionRecorder {
  record(selection: RetrievalSelectionRecord): void;
}
