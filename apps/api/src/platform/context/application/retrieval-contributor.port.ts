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
