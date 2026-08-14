import { type Permission } from '../../authz/authz.public';

/** DI token'i — modullerin katki kaydettigi ve `AskUseCase`'in okudugu defter. */
export const RETRIEVAL_CONTRIBUTOR_REGISTRY = Symbol('RETRIEVAL_CONTRIBUTOR_REGISTRY');

/** Modele gidecek tek baglam parcasi. */
export interface ContextFragment {
  /** Modele verilecek METIN. Kaynak id'leri modele GONDERILMEZ. */
  readonly content: string;
  /** 0..1, yuksek = daha alakali. Siralama bunun uzerinden yapilir. */
  readonly score: number;
  /** Katkiciyi tanitan etiket (`knowledge`, ileride `crm`). */
  readonly source: string;
  /** Kaynak atfi — istemciye doner, MODELE gitmez. */
  readonly reference: { readonly kind: string; readonly id: string };
}

/**
 * Bir katkinin TURU — ADR-0036.
 *
 * ============================================================================
 * NEDEN PORT'TA: PLATFORM BUNU TURETEMEZ
 * ============================================================================
 * `POST /ask`in havuzunda yapisal kaynaklara bir TABAN yuva garanti edilir
 * (ADR-0036 §1). Bunun icin platformun bir kaynagin yapisal mi anlamsal mi
 * oldugunu bilmesi gerekir — ama platform `crm`/`knowledge` kelimelerinin
 * ANLAMINI bilmez ve bilmemelidir (bkz. `RetrievalContributor`).
 *
 * Alternatif, platformun icine bir kaynak adi listesi koymakti; o liste her
 * yeni modulde **sessizce bayatlardi** — yeni yapisal katkici garantisini
 * alamaz ve hicbir test kirmizi yanmazdi. Bu yuzden turu MODUL DEKLARE EDER.
 *
 * ⚠️ ALAN ZORUNLUDUR, opsiyonel + varsayilan DEGIL. Varsayilani `'semantic'`
 * olan opsiyonel bir alan, yazmayi unutan bir yapisal katkiciyi sessizce
 * anlamsal sayar ve garanti yuvasini kaybettirirdi. Zorunlu alan unutuldugunda
 * DERLEME HATASIDIR.
 * ============================================================================
 *
 * - `semantic`  — vektor benzerligiyle bulunan ANLATISAL icerik. Skoru bir
 *   siralama korumasidir ve en iyi isabeti 1.0'a yakin doner.
 * - `structural` — kolonlardan TURETILEN deterministik ozet. Skoru riske gore
 *   sabit tavanli bir merdivendir (0.95/0.90/0.75) ve anlamsal bir en-iyi
 *   isabeti hicbir kosulda gecemez.
 */
export type ContributionKind = 'semantic' | 'structural';

export interface ContributeInput {
  readonly question: string;
  /** Soru BIR KEZ embed edilir ve tum katkicilara ayni vektor verilir. */
  readonly embedding: readonly number[];
  /** Bu katkicidan istenen EN FAZLA parca sayisi. */
  readonly limit: number;
}

/**
 * Bir modulun kurumsal hafizaya KATKISI (ADR-0031 §5.1).
 *
 * ============================================================================
 * MODUL KENDI SEMASINDAN KATKI VERIR — PLATFORM BIRLESTIRIR
 * ============================================================================
 * Bu port, Mutlak Kural 5-6 ile "tek kurumsal hafiza" urun vaadini AYNI ANDA
 * saglayan seydir. Knowledge `crm.interaction_chunks`'i okuyamaz, CRM
 * `knowledge.note_chunks`'i okuyamaz; her modul YALNIZCA kendi semasina bakar
 * ve sonucu buradan verir. Birlestirmeyi platform yapar.
 *
 * Platform `knowledge`/`crm` kelimelerinin ANLAMINI bilmez — ADR-0025'te
 * Authorization'in permission string'lerini yorumlamamasiyla birebir ayni
 * disiplin.
 *
 * ============================================================================
 * VEKTOR TABANLI OLMA ZORUNLULUGU YOKTUR
 * ============================================================================
 * Metot `contribute` adini tasir, `search` degil — ve bu kasitlidir. Bir
 * katkici deterministik SQL de dondurebilir. CRM iki katkici kaydedecek:
 * anlamsal (gorusmeler) + YAPISAL (pipeline). "Hangi anlasmalar takipte
 * gecikti" sorusunun cevabi bir gorusme notunda yazmaz, bir kolonda yazar
 * (ADR-0031 §5.4).
 * ============================================================================
 */
export interface RetrievalContributor {
  /** Koken etiketi; `ContextFragment.source` ve `degradedSources` bunu tasir. */
  readonly source: string;

  /**
   * Katkinin TURU (ADR-0036). Havuzun taban kisiti bunun uzerinden isler.
   *
   * ⚠️ Bu bir SKOR ayari DEGILDIR: katkicinin kendi skorlama mantigi bu alandan
   * etkilenmez. Alan yalnizca platformun secim asamasini ilgilendirir.
   */
  readonly contributionKind: ContributionKind;

  /**
   * Bu kaynagi gormeyi saglayan izin (ADR-0031 §5.3).
   *
   * Cagiran bu izni TASIMIYORSA katkici HIC CAGRILMAZ — eleme, pahali istan
   * once yapilir.
   */
  readonly permission: Permission;

  contribute(input: ContributeInput): Promise<ContextFragment[]>;
}

/**
 * Katkicilarin kayit defteri.
 *
 * `PermissionRegistry` ile ayni desen ve ayni gerekce: platform bir kayit
 * defteri ve bir birlestiricidir; is modullerini import ETMEZ.
 */
export interface RetrievalContributorRegistry {
  /**
   * Bir modulun katkicisini kaydeder. Modul init'te, ilk istekten ONCE.
   *
   * AYNI `source` etiketinin iki kez kaydi bir PROGRAMLAMA hatasidir (iki
   * modul ayni kokeni sahiplenemez) ve sessizce yutulmaz — `degradedSources`
   * ve kaynak atfi bu etikete dayanir, cakisirsa ikisi de yalan soyler.
   */
  register(contributor: RetrievalContributor): void;

  /** Kayitli tum katkicilar. Kayit sirasi korunur. */
  all(): readonly RetrievalContributor[];
}
