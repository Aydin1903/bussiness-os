import { type Clock } from '../../../shared/clock.port';
import { EmbeddingFailedError, type EmbeddingPort } from '../../../shared/embedding.port';
import { enforceRateLimit } from '../../../shared/enforce-rate-limit';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type RateLimitRepository } from '../../../shared/rate-limit.repository.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type ContactDirectory } from '../../crm/crm.public';
import {
  FeedbackResponse,
  assertEmbeddingDimensions,
  withFeedbackHeader,
  type FeedbackResponseState,
} from '../domain/feedback-response.entity';
import {
  FeedbackContactNotFoundError,
  FeedbackResponseNotFoundError,
} from '../domain/feedback.error';
import { FEEDBACK_EMBEDDING_ACTION } from '../feedback.rate-limits';
import {
  type FeedbackRepository,
  type FeedbackSummaryRow,
  type ListPage,
  type UnindexedResponse,
} from './feedback.repository.port';

/**
 * Listede donen satir — kayit + COZULMUS kisi adi.
 *
 * ⚠️ `contactName` KOLONDA SAKLANMAZ, her okumada cozulur (§6.1). Saklansaydi
 * CRM'de bir yeniden adlandirma bu listeyi BAYATLATIRDI — projede alti kez
 * reddedilmis ayni karar.
 *
 * ⚠️ ADR-0041'in `customer_name` istisnasi BURADA GECERLI DEGILDIR: orada ad
 * GONDERILMIS BIR BELGEYE basilmisti, yani o an DONDURULMUSTU. Bir geri
 * bildirim bir belge degildir; bugunku musteriyi gosterir.
 */
export interface FeedbackResponseRow extends FeedbackResponseState {
  /** `null` = anonim, kisi silinmis YA DA cagiranda `contact:read` yok. */
  readonly contactName: string | null;
}

/**
 * Duvarin penceresi — GUN (ADR-0045 §9).
 *
 * ⚠️ ADR §9 uydulari icin "bu ay" yaziyordu; UYGULAMADA DORT SAYI DA AYNI 30
 * GUNLUK PENCEREYI kullaniyor ve sapma BILINCLIDIR: kahraman rakam "son 30
 * gun" iken uydularin "bu ay" olmasi, ayni duvarda IKI FARKLI PENCERE demekti.
 * Kullanici ayin 2'sinde "ortalama 4,2 (son 30 gun)" ile "3 dusuk puan (bu ay)"
 * yan yana gorur ve ikisinin AYNI kumeden geldigini sanardi — hata SESSIZ
 * olurdu.
 *
 * ⚠️ Pencere SUNUCUDAN doner (`windowDays`), arayuzde SABITLENMEZ: etiket
 * ("son 30 gunde") o sayidan uretilir, yoksa burasi degistiginde ekran eski
 * sayiyi yazmaya devam ederdi.
 */
export const SUMMARY_WINDOW_DAYS = 30;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Duvarin ozeti — ekrana giden sekil.
 *
 * ⚠️ `average` `string | null` ve IKISI DE KASITLI (bkz.
 * `FeedbackSummaryRow`): `null`, "N=0 iken ortalama GOSTERILMEZ" kuralini
 * (§9.1) TIP SEVIYESINDE zorlar. `0` donseydi arayuz "0,0" basar ve "cok kotu"
 * ile "hic veri yok" AYNI GORUNURDU.
 */
export interface FeedbackSummary extends FeedbackSummaryRow {
  readonly windowDays: number;
  /** ⚠️ Esik de sunucudan doner: arayuz "≤2" metnini KENDI YAZMAZ. */
  readonly lowRatingMax: number;
}

export interface FeedbackDependencies {
  readonly repository: FeedbackRepository;
  readonly rateLimitRepository: RateLimitRepository;
  readonly embeddingPort: EmbeddingPort;
  readonly contactDirectory: ContactDirectory;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  /** Saatlik EMBEDDING payi — geri bildirim payi DEGIL (§8). */
  readonly rateLimit: number;
  /** Tek onarim cagrisinda islenecek EN FAZLA kayit. */
  readonly reindexBatchSize: number;
  /**
   * "Dusuk puan" esigi — bu degere KADAR (dahil).
   *
   * ⚠️ BIR RISK MERDIVENI DEGILDIR ve `INVENTORY_NEAR_THRESHOLD_RATIO` gibi
   * env'e ACILMAZ: olcek SABITTIR (1..5, §1.3), dolayisiyla "dusuk = 1 veya 2"
   * olcegin bir OZELLIGIDIR, ayarlanabilir bir tercih degil. Deger
   * `@business-os/contracts`ta TEK YERDE yasar ve arayuz de ayni sabiti okur —
   * iki tarafta ayri yazilsaydi ekran "≤2" der, sunucu baska bir sayi sayardi
   * ve fark SESSIZ olurdu.
   */
  readonly lowRatingMax: number;
}

/**
 * Geri bildirim yasam dongusu (ADR-0045 §1, §2, §8).
 *
 * ============================================================================
 * ⚠️ `update` DIYE BIR METOT YOKTUR — VE ARANMASIN (§2)
 * ============================================================================
 * `createResponse` · `listResponses` · `getResponse` · `deleteResponse` ·
 * `reindex`. Bir `updateResponse` yazmak degistirilemezligin IKINCI katmanini
 * delerdi; ucuncu katman (veritabani) onu yine reddederdi ama hata o zaman
 * 500 olarak gorunurdu.
 *
 * ============================================================================
 * ⚠️ YAPISAL BIR KATKI URETEN HICBIR METOT YOKTUR (§3)
 * ============================================================================
 * `summarizeSatisfaction` / `findLowRatings` gibi bir "durum ozeti" metodu
 * BURADA ARANMASIN — ama gerekce ADR-0040 ve ADR-0043'tekiyle AYNI DEGILDIR ve
 * bu ayrim onemlidir:
 *
 *   ADR-0040 (Tedarikci) -> uc aday, ucu de LIYAKATSIZ. "Bakildi ve yoktu."
 *   ADR-0043 (IK)        -> uc aday, ucu de LIYAKATSIZ. "Bakildi ve yoktu."
 *   ⚠️ ADR-0045 (burasi) -> aday LIYAKATLI. "Bakildi, VAR, ve TEK BASINA
 *                           EKLENEMEZ."
 *
 * `feedback-satisfaction` adayi §3.2'nin dort testinden UCUNU geciyor: bir
 * esik asilinca konusur (sayim degil), bir FIILE dayanir (katalog degil) ve
 * seyrek degildir. Dorduncu testte (⚠️ "ayni haberi soyleyen bir ses zaten var
 * mi") buyuk olcude kaliyor — olumsuz geri bildirimin haberi MUSTERININ KENDI
 * CUMLESIDIR ve o cumle zaten `feedback-comments` ile havuza girer.
 *
 * ⚠️ Ama eklenmemesinin ASIL sebebi usuldur: eklemek ADR-0042 §3'un T2 esigini
 * (`2K/3`, bugun 6) tetikler ve ⚠️ T2'NIN GIRDISI BUGUN OLCULEMIYOR —
 * "satir donduren yapisal kaynak sayisi" hicbir yerde kaydedilmiyor
 * (ADR-0043'un kapanis denetimi ADR-0042 §4'un protokolunu UYGULAYAMADI).
 *
 * ADR-0042'nin ilkesinin aynasi: _"bir esik, onu olcecek arac yokken
 * GECILMEZ."_ Sira TERSINE CEVRILEMEZ (§3.4): (1) `retrieval.select`
 * gozlemlenebilirlik satiri, (2) olcum, (3) ADR-0036/0042 revizyonu (AYRI bir
 * platform ADR'si), (4) ancak ondan sonra katkici.
 */
export class FeedbackUseCases {
  constructor(private readonly deps: FeedbackDependencies) {}

  /**
   * Geri bildirim kaydeder ve (yorumu varsa) gomer.
   *
   * ============================================================================
   * UC ASAMA, IKI TRANSACTION — VE PAHALI CAGRI IKISININ DE DISINDA
   * ============================================================================
   *   T0  oran siniri  -> ⚠️ YALNIZCA YORUM VARSA (asagida)
   *   T1  kayit        -> `INSERT`, `embedding` BOS
   *   ag  embedding    -> transaction DISINDA
   *   T2  vektor       -> `UPDATE ... SET embedding`
   *
   * Gerekce ADR-0040'inkiyle ayni: bir OpenAI cagrisi boyunca havuzdan baglanti
   * tutmak yuk altinda havuzu tuketir; ve GERI BILDIRIMIN KENDISI birincil
   * veridir, aranabilirligi ikincildir — embedding cokerse KAYIT KAYBOLMAMALIDIR.
   *
   * ⚠️ BEDELI ACIKCA: T1 ile T2 arasinda kisa bir pencere vardir; embedding
   * cokerse ortaya VEKTORU OLMAYAN bir kayit cikar. Hata YUZEYE CIKAR (502,
   * `DisclosableProblem` ile GOVDESI ACIK) ve kayit SILINMEZ.
   *
   * ============================================================================
   * ⚠️ ORAN SINIRI KOSULLUDUR — VE BU, TEDARIKCI'DEN AYRILDIGIMIZ YER
   * ============================================================================
   * Tedarikci'de gorusme metni ZORUNLUYDU, yani her yazma bir embedding
   * uretiyor ve her yazma pay oduyordu. Burada yorum OPSIYONELDIR (§1.4):
   * yorumsuz bir kayit saglayiciya HIC GITMEZ ve payi da DUSMEZ.
   *
   * ⚠️ Kosulsuz bir sayac, kotasini "kac geri bildirim girdim" diye sayan bir
   * kullaniciya YANLIS BILGI verirdi ve bu bilgi SESSIZ kalirdi (Randevu ve
   * Stok'un ayni karari, ucuncu kez). Kural tek cumleyle: **cagri para
   * harciyorsa sayilir, harcamiyorsa sayilmaz.**
   */
  async createResponse(input: {
    tenantId: string;
    userId: string;
    role: string;
    rating: number;
    comment: string | null;
    channel: string | null;
    crmContactId: string | null;
    receivedAt: Date;
  }): Promise<FeedbackResponseRow> {
    // Entity ONCE kurulur: puan araligi, uzunluk ve zaman dogrulamasi (SESSIZ
    // KIRPMA YOK, §1.4) bir veritabani sorgusu ACMADAN once patlar.
    const response = FeedbackResponse.create({
      id: this.deps.idGenerator.nextId(),
      tenantId: input.tenantId,
      createdByUserId: input.userId,
      rating: input.rating,
      comment: input.comment,
      channel: input.channel,
      crmContactId: input.crmContactId,
      receivedAt: input.receivedAt,
      now: this.deps.clock.now(),
    });

    const state = response.toState();

    // ⚠️ Goremedigi bir kisiye geri bildirim baglayamaz — ve reddin sebebinden
    // o kisinin VAR OLDUGUNU cikaramaz (§6.1).
    await this.#assertContactVisible(state.crmContactId, input.role);

    // ⚠️ `null` = yorum yok = gomulecek metin yok (§1.4).
    const content = response.embeddableContent();

    // --- T0: oran siniri — YALNIZCA gercekten embedding uretilecekse ---------
    if (content !== null) {
      await this.#enforceEmbeddingBudget(input.tenantId, input.userId);
    }

    // --- T1: kayit ----------------------------------------------------------
    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.insertResponse(response),
    );

    // --- Ag + T2: vektor ----------------------------------------------------
    if (content !== null) {
      await this.#embed(state.id, content);
    }

    // Ad, kayit yazildiktan SONRA cozulur: `#assertContactVisible` zaten
    // gorunurlugu dogruladi, burada yalnizca ETIKET aliniyor.
    const names = await this.#resolveNames([state.crmContactId], input.role);

    return {
      ...state,
      contactName: state.crmContactId === null ? null : (names.get(state.crmContactId) ?? null),
    };
  }

  /**
   * Duvarin ozeti (ADR-0045 §9).
   *
   * ============================================================================
   * ⚠️ BU BIR YAPISAL KATKICI DEGILDIR (§3.4)
   * ============================================================================
   * Ayni sayilari uretiyor gibi gorunur ama yalnizca EKRANA gider:
   * `POST /ask` havuzuna girmez, taban yuvasi tuketmez ve ADR-0042'nin T2
   * esigini ETKILEMEZ. Modulun havuza katkisi HALA TEK ve ANLAMSALDIR.
   *
   * ⚠️ Bu ayrim kaydedilmezse, ileride birisi "zaten ozet var" diye katkiciyi
   * BEDAVA sanabilir — oysa bedeli bir metot degil, BIR PLATFORM KARARIDIR
   * (once `retrieval.select`, sonra olcum, sonra ayri bir ADR).
   *
   * ⚠️ PENCERE SUNUCUDA HESAPLANIR: `Clock`tan okunur, repository `now()`
   * cagirmaz (DEVELOPMENT_RULES 3.2). Istemciye birakilsaydi saat sapmasi olan
   * bir tarayici FARKLI bir pencere isteyebilirdi.
   */
  async getSummary(): Promise<FeedbackSummary> {
    const since = new Date(
      this.deps.clock.now().getTime() - SUMMARY_WINDOW_DAYS * MILLISECONDS_PER_DAY,
    );

    const row = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.summarize({ since, lowRatingMax: this.deps.lowRatingMax }),
    );

    return { ...row, windowDays: SUMMARY_WINDOW_DAYS, lowRatingMax: this.deps.lowRatingMax };
  }

  async listResponses(input: {
    limit: number;
    offset: number;
    minRating: number | null;
    maxRating: number | null;
    role: string;
  }): Promise<ListPage<FeedbackResponseRow>> {
    // ⚠️ `role` AYRILIYOR ve porta GECMIYOR. Repository yetki BILMEZ, yalnizca
    // veri okur; izin kapisi `ContactDirectory`nin ICINDEDIR (§6.1).
    const { role, ...query } = input;

    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.listResponses(query),
    );

    const rows = page.items.map((item) => item.toState());

    return { items: await this.#withContactNames(rows, role), total: page.total };
  }

  async getResponse(input: { id: string; role: string }): Promise<FeedbackResponseRow> {
    const state = await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const found = await this.deps.repository.findResponseById(input.id);

      if (found === null) {
        throw new FeedbackResponseNotFoundError();
      }

      return found.toState();
    });

    const [row] = await this.#withContactNames([state], input.role);

    // `#withContactNames` girdiyle AYNI uzunlukta doner; savunma katmani.
    return row ?? { ...state, contactName: null };
  }

  /**
   * Kaydi SILER (ADR-0045 §2.2).
   *
   * ============================================================================
   * ⚠️ BU METOT BIR KOLAYLIK DEGIL, BIR YUKUMLULUKTUR
   * ============================================================================
   * `SupplierUseCases`te bir `deleteInteraction` YOKTU ve olmamasi dogruydu.
   * Burada VAR, cunku bir yorum KISISEL VERI ICEREBILIR (ad, telefon, sikayet
   * detayi) ve veri sahibinin SILME TALEBI HAKKI vardir (KVKK m.7 / m.11).
   *
   * ⚠️ Silme GERCEKTIR, "soft-delete" DEGIL: `deleted_at` isaretli bir satir,
   * silinmesi ISTENEN veriyi tabloda TUTMAYA devam ederdi.
   *
   * ⚠️ VEKTOR DE GIDER — `embedding` satirin kendi kolonunda yasar (§1.2), yani
   * silinen bir geri bildirim AI'IN HAFIZASINDAN DA silinir. Bu, ADR-0031 §7'nin
   * "CRM verisi Knowledge'a YAZILMAZ" gerekcesinin SEKIZINCI uygulamasidir:
   * chunk'lar baska bir semada yasasaydi silme cascade'i YAZILAMAZDI.
   *
   * ⚠️ Silme GERI ALINAMAZ ve DENETIM IZI YOKTUR; `feedback:delete`in ayri bir
   * izin olmasinin ve `member`a VERILMEMESININ sebebi budur (§5).
   */
  async deleteResponse(id: string): Promise<void> {
    await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const deleted = await this.deps.repository.deleteResponseById(id);

      // ⚠️ Sessizce basarili donmek, yanlis id yazan kullanicinin kaydin HALA
      // DURDUGUNU ogrenmesini engellerdi — ve bu, KVKK talebi baglaminda
      // "silindi sandim" demektir.
      if (deleted === 0) {
        throw new FeedbackResponseNotFoundError();
      }
    });
  }

  /**
   * Vektorleri onarir (ADR-0045 §8).
   *
   * ============================================================================
   * ⚠️ BU UCUN TEK ISI VAR — TEDARIKCI'DE IKI ISI VARDI
   * ============================================================================
   * Yalnizca BASARISIZ embedding'leri onarir (saglayici cokmesinden kalan
   * kayitlar). ADR-0040'in IKINCI isi (BAYAT baslikli vektorleri tazelemek)
   * BURADA YOKTUR ve bu bir eksik degil, §4'un dogrudan sonucudur:
   *
   *     basligin uc bileseni de (tarih · puan · kanal) DEGISTIRILEMEZ (§2),
   *     dolayisiyla bu modulde BAYATLAMA PENCERESI YOKTUR.
   *
   * ⚠️ Bu yuzden `reindex` govdesi bir hedef parametresi (ADR-0040'in
   * `supplierId`i) TASIMAZ ve `staleAfterRename` gibi bir bayrak GEREKMEZ —
   * projede ILK KEZ.
   *
   * ⚠️ Is listesi TURETILMISTIR: `embedding IS NULL AND comment IS NOT NULL`.
   * Ikinci yuklem SART (bkz. `findUnindexedResponses`) — yorumsuz kayitlar
   * KALICI OLARAK vektorsuzdur ve suzulmeselerdi her cagrida yuvalari isgal
   * ederlerdi.
   *
   * ⚠️ Oran siniri yazma yoluyla AYNI kovayi paylasir (ADR-0029'un gerekcesi,
   * YEDINCI kez: ayri bir kova, onarimi BUTCESIZ BIR YAN KAPIYA cevirirdi).
   */
  async reindex(input: {
    tenantId: string;
    userId: string;
  }): Promise<{ repaired: number; failed: number }> {
    await this.#enforceEmbeddingBudget(input.tenantId, input.userId);

    const pending = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findUnindexedResponses(this.deps.reindexBatchSize),
    );

    let repaired = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        // Her kayit AYRI ele alinir: birinin cokmesi digerlerini engellemez.
        // Toplu bir transaction, tek bir bozuk kayit yuzunden onarilan her seyi
        // geri alirdi.
        await this.#embed(item.id, toEmbeddableContent(item));
        repaired += 1;
      } catch {
        failed += 1;
      }
    }

    return { repaired, failed };
  }

  // ==========================================================================
  // Yardimcilar
  // ==========================================================================

  /**
   * T0 — pahali is BASLAMADAN once payi oder, gerekirse reddeder.
   *
   * ⚠️ CAGRILDIGI YERLER SECICIDIR: yalnizca GERCEKTEN embedding uretilecek
   * yollarda. Yorumsuz bir kayit, okuma ve silme paydan DUSMEZ — hicbiri
   * saglayiciya gitmez.
   */
  async #enforceEmbeddingBudget(tenantId: string, userId: string): Promise<void> {
    await enforceRateLimit(this.deps, {
      tenantId,
      userId,
      action: FEEDBACK_EMBEDDING_ACTION,
      limit: this.deps.rateLimit,
    });
  }

  /** Gomer ve vektoru YAZAR. */
  async #embed(id: string, content: string): Promise<void> {
    const embedding = await this.#callEmbedding(content);
    // Boyut SINIRDA dogrulanir: yanlis yapilandirilmis bir model VERI
    // YAZILMADAN yakalanir.
    assertEmbeddingDimensions(embedding);

    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.setResponseEmbedding({ id, embedding }),
    );
  }

  /** Adapter'in firlattigi her hatayi TEK bir domain hatasina cevirir. */
  async #callEmbedding(text: string): Promise<number[]> {
    try {
      return await this.deps.embeddingPort.embed(text);
    } catch (error) {
      throw new EmbeddingFailedError(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Bagli kisi GORUNUYOR mu — yoksa 404 (§6.1).
   *
   * ⚠️ "Kisi yok", "baska tenant'in" ve "`contact:read` tasimiyorsun" AYNI
   * hatayi verir; dizin ucunu ayirt etmez.
   *
   * `null` gecerlidir ve KONTROL EDILMEZ: geri bildirimlerin cogu ANONIMDIR
   * (§6.2) ve zorunlu kilmak kullaniciyi SAHTE CRM KISILERI acmaya iterdi.
   */
  async #assertContactVisible(crmContactId: string | null, role: string): Promise<void> {
    if (crmContactId === null) {
      return;
    }

    const names = await this.deps.contactDirectory.findNames({ ids: [crmContactId], role });

    if (!names.has(crmContactId)) {
      throw new FeedbackContactNotFoundError();
    }
  }

  /**
   * Satirlara kisi adini ekler — TEK toplu sorgu.
   *
   * ⚠️ IZINSIZ CAGIRAN ICIN SORGU HIC ACILMAZ: dizin kapiyi kendi icinde
   * uygular ve bos harita doner, yani her satir `contactName: null` alir. Geri
   * bildirimlerin KENDISI yine gorunur (`feedback:read` dort rolde de var) —
   * gizlenen sey yalnizca CRM'e ait AD'dir.
   */
  async #withContactNames(
    rows: readonly FeedbackResponseState[],
    role: string,
  ): Promise<FeedbackResponseRow[]> {
    const names = await this.#resolveNames(
      rows.map((row) => row.crmContactId),
      role,
    );

    return rows.map((row) => ({
      ...row,
      contactName: row.crmContactId === null ? null : (names.get(row.crmContactId) ?? null),
    }));
  }

  /** `null`lari eleyip TEKILLESTIRIR; bos listede sorgu ACILMAZ. */
  async #resolveNames(
    ids: readonly (string | null)[],
    role: string,
  ): Promise<ReadonlyMap<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => id !== null))];

    if (unique.length === 0) {
      return new Map();
    }

    return this.deps.contactDirectory.findNames({ ids: unique, role });
  }
}

/**
 * `reindex` satirindan gomulecek metni kurar.
 *
 * ⚠️ `withFeedbackHeader` — yazma yolunun kullandigi AYNI fonksiyon. Iki yerde
 * ayri bicimlendirilseydi model ayni kaydi IKI FARKLI SEKILDE gorurdu ve fark
 * SESSIZ olurdu (onarilan bir kayit, yeni yazilanla ayni sorguya farkli cevap
 * verirdi).
 */
function toEmbeddableContent(item: UnindexedResponse): string {
  return withFeedbackHeader({
    receivedAt: item.receivedAt,
    rating: item.rating,
    channel: item.channel,
    comment: item.comment,
  });
}
