/**
 * CRM modulunun DISA ACIK TEK yuzeyi (ARCHITECTURE 6.1, ADR-0033 §2).
 *
 * ============================================================================
 * NEDEN VAR — cross-modul referansin ILK GERCEK UYGULAMASI
 * ============================================================================
 * Projeler, bir projeyi opsiyonel olarak bir CRM sirketine baglayabilir. Bu
 * soru CRM'de HIC dogmadi (CRM hicbir modulun verisine bakmiyordu); Projeler
 * bunu isteyen ILK moduldur ve verilen cevap kalan on modulu de baglar.
 *
 * Cross-schema FK YASAK (Mutlak Kural 5), dolayisiyla `projects.projects`
 * yalnizca ciplak bir `company_id` tasir. Sirket ADI oraya KOPYALANMAZ —
 * kopyalansaydi sirket yeniden adlandirildiginda proje listesi eski adi
 * gostermeye devam ederdi (turetilebilir bilgiyi kaliciya yazmak: projede bes
 * kez reddedilmis ayni karar). Ad, calisma zamaninda BURADAN okunur.
 *
 * ============================================================================
 * BAGIMLILIK YONU TEK YONLUDUR: Projeler -> CRM
 * ============================================================================
 * CRM, Projeler'i BILMEZ ve bilmemelidir. Tersi (sirket detayinda projelerin
 * listelenmesi) bir modul dongusu kurardi; projede bir kez yasandi
 * (Tenant <-> Identity) ve cozumu `forwardRef` degil UCUNCU BIR MODUL oldu
 * (`platform/session`). Ters yon istenirse ayni cozum uygulanir.
 *
 * ⚠️ Buraya bir sey EKLEMEDEN once sorulacak soru: "bunu baska bir IS MODULU
 * bilmek ZORUNDA mi?" Cevap hayirsa `application/` altinda kalir.
 * ============================================================================
 */

/** DI token'i. Symbol kullanildi: string token'lar sessizce cakisabilir. */
export const CRM_COMPANY_DIRECTORY = Symbol('CRM_COMPANY_DIRECTORY');

export interface FindCompanyNamesInput {
  /**
   * TOPLU — tekil DEGIL.
   *
   * Proje listesinde N proje vardir; tekil bir metot N+1 sorgu uretirdi.
   * `DrizzleCompanyRepository`nin sayac haritalariyla ayni disiplin: sayfanin
   * id'leri toplanir, TEK sorgu atilir.
   *
   * Bos dizi gecerlidir ve sorgu ACILMAZ.
   */
  readonly ids: readonly string[];

  /**
   * Cagiranin bu tenant'taki ROLU.
   *
   * ⚠️ ACIKCA GECILIYOR, istek baglamindan ORTULU okunmuyor. `getPrincipal()`
   * cagirmak bu arayuzu (a) test edilemez, (b) bagimliligi gizleyen bir sey
   * yapardi — bir public interface'in sozlesmesi imzasinda gorunmelidir.
   */
  readonly role: string;
}

/**
 * CRM'in sirket AD dizini (ADR-0033 §2b, §2c).
 *
 * DI token'i: `CRM_COMPANY_DIRECTORY`.
 */
export interface CompanyDirectory {
  /**
   * Verilen id'ler icin `id -> ad` haritasi.
   *
   * ============================================================================
   * BULUNAMAYAN = HARITADA YOK. HATA DEGIL.
   * ============================================================================
   * Uc durum AYNI sonucu verir ve bu KASITLIDIR:
   *   1. Sirket silinmis (ADR-0033 §2d — sarkan isaretci tolere edilir),
   *   2. Sirket baska bir tenant'in (RLS zaten gormez),
   *   3. Cagiran `company:read` TASIMIYOR (§2c).
   *
   * Cagiran ucunu AYIRT EDEMEZ, dolayisiyla SIZDIRAMAZ. Ve tek bir kod yolu
   * yazar: "ad yok" hali zaten ele alinmak zorundadir, cunku silinen sirket
   * her zaman mumkundur.
   *
   * ============================================================================
   * IZIN KONTROLU BU ARAYUZUN ICINDE — cagirana BIRAKILMAZ
   * ============================================================================
   * `company:read` CRM'in iznidir; zorlayan da CRM olmalidir. Cagirana
   * birakilsaydi, unutan TEK modul bir sizinti kapisi acardi — ve unutmak
   * sessiz olurdu, cunku ekran calismaya devam ederdi. ADR-0031 §5.3'un
   * `POST /ask` icin verdigi ayni ders, bu kez dogrudan bir okumada.
   *
   * Karar ADR-0025'in AYNI policy engine'ine sorulur (`PermissionChecker`);
   * ikinci bir kural kaynagi acilmaz.
   */
  findNames(input: FindCompanyNamesInput): Promise<ReadonlyMap<string, string>>;
}

/* ==========================================================================
 * KISI DIZINI (ADR-0035 §4) — IKINCI dizin, AYNI sozlesme sekli
 * ==========================================================================
 * ⚠️ ADR-0034 §4 su cumleyi kurmustu ve desenin ise yaradiginin kaniti diye
 * kaydetmisti: "`crm.public.ts` bu iste TEK SATIR degismez." RANDEVU'DA
 * DEGISIYOR — ve bu, desenin bir ZAYIFLIGI degil, KAPSAMININ dogru olcusudur.
 *
 * Fark dizinin TURUDUR: bugune kadar iki modul de (Projeler, Finans) CRM'in
 * SIRKETINE baglandi ve `CompanyDirectory` zaten vardi. Randevu bir KISIYE
 * baglanir; kisi adlarini veren bir dizin HIC YAZILMADI.
 *
 * Kural boylece netlesiyor:
 *   - yeni bir TALIP eklendiginde (ucuncu modul de sirkete baglanirsa)
 *     BU DOSYA DEGISMEZ,
 *   - yeni bir KAYNAK TURU talep edildiginde o kaynagin SAHIBI modul kendi
 *     dizinini yazar ve kendi izin kapisini kendi eliyle kurar.
 *
 * ⚠️ `CompanyDirectory` BU EKLEMEDEN ETKILENMEDI: tek satiri degismedi, imzasi
 * kirilmadi. Iki dizin birbirinden BAGIMSIZDIR ve oyle kalmalidir —
 * birlestirilmis bir "CrmDirectory" arayuzu, `company:read` tasiyip
 * `contact:read` tasimayan bir cagirani ifade EDEMEZDI.
 *
 * ⚠️ GENELLESTIRME YINE REDDEDILDI (ADR-0034 §4.1, dorduncu talip icin tekrar
 * okundu): ortak bir `ExternalRefDirectory` izin kapisini ya cagirana
 * (sizinti) ya `shared/`a (Mutlak Kural 6) devrederdi. Genellesen sey KOD
 * degil SOZLESME SEKLIDIR — `findNames(ids, role) -> ReadonlyMap<id, name>`
 * artik UCUNCU kez yaziliyor ve bir KONVANSIYONDUR.
 * ========================================================================== */

/** DI token'i. Symbol kullanildi: string token'lar sessizce cakisabilir. */
export const CRM_CONTACT_DIRECTORY = Symbol('CRM_CONTACT_DIRECTORY');

export interface FindContactNamesInput {
  /** TOPLU — tekil DEGIL. Gerekce `FindCompanyNamesInput`te. */
  readonly ids: readonly string[];

  /**
   * Cagiranin bu tenant'taki ROLU.
   *
   * ⚠️ ACIKCA GECILIYOR, istek baglamindan ORTULU okunmuyor — gerekce
   * `FindCompanyNamesInput`te ve degismedi.
   */
  readonly role: string;
}

/**
 * CRM'in KISI AD dizini (ADR-0035 §4).
 *
 * DI token'i: `CRM_CONTACT_DIRECTORY`.
 */
export interface ContactDirectory {
  /**
   * Verilen id'ler icin `id -> ad` haritasi (`contacts.full_name`).
   *
   * ============================================================================
   * BULUNAMAYAN = HARITADA YOK. HATA DEGIL.
   * ============================================================================
   * Uc durum AYNI sonucu verir ve bu KASITLIDIR:
   *   1. Kisi silinmis (ADR-0035 §4 — sarkan isaretci tolere edilir),
   *   2. Kisi baska bir tenant'in (RLS zaten gormez),
   *   3. Cagiran `contact:read` TASIMIYOR.
   *
   * Cagiran ucunu AYIRT EDEMEZ, dolayisiyla SIZDIRAMAZ. Randevu tarafinda
   * bunun somut karsiligi sudur: arayuz `contactName: null` gelince HICBIR SEY
   * yazmaz — "silinmis" bile yazmaz, cunku o kelime silinmis bir kaydin BIR
   * ZAMANLAR VAR OLDUGUNU sizdirirdi.
   *
   * ============================================================================
   * IZIN KONTROLU BU ARAYUZUN ICINDE — cagirana BIRAKILMAZ
   * ============================================================================
   * `contact:read` CRM'in iznidir; zorlayan da CRM olmalidir. Cagirana
   * birakilsaydi, unutan TEK modul bir sizinti kapisi acardi — ve unutmak
   * SESSIZ olurdu, cunku ekran calismaya devam ederdi.
   *
   * Karar ADR-0025'in AYNI policy engine'ine sorulur (`PermissionChecker`);
   * ikinci bir kural kaynagi acilmaz.
   */
  findNames(input: FindContactNamesInput): Promise<ReadonlyMap<string, string>>;
}
