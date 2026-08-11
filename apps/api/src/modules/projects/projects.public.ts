/**
 * Projeler modulunun DISA ACIK TEK yuzeyi (ARCHITECTURE 6.1, ADR-0034 §4).
 *
 * ============================================================================
 * NEDEN VAR — cross-modul referansin IKINCI uygulamasi
 * ============================================================================
 * Finans bir gelir/gider kaydini opsiyonel olarak bir projeye baglayabilir
 * ("bu masraf hangi ise ait"). Cross-schema FK YASAK (Mutlak Kural 5),
 * dolayisiyla `finance.transactions` yalnizca ciplak bir `project_id` tasir.
 * Proje ADI oraya KOPYALANMAZ — kopyalansaydi proje yeniden adlandirildiginda
 * islem listesi eski adi gostermeye devam ederdi.
 *
 * ============================================================================
 * ⚠️ BU DOSYA `crm.public.ts`IN KOPYASIDIR — VE GENELLESTIRILMEDI
 * ============================================================================
 * ADR-0033 "desen bir kez daha tekrarlandiginda genellestirme degerlendirilir"
 * demisti. ADR-0034 §4.1'de DEGERLENDIRILDI ve REDDEDILDI. Gerekce mimaridir,
 * "erken" degil:
 *
 * Ortak bir `ExternalRefDirectory` yardimcisi `shared/`'a konsaydi, izin
 * kontrolunu iki yoldan biriyle ele almak zorunda kalirdi ve IKISI DE BOZUK:
 *
 *   1. Izni PARAMETRE olarak disaridan almak — `findNames(ids, role,
 *      'project:read')`. Bu, asagidaki "izin kontrolu bu arayuzun icinde"
 *      kararini TERSINE CEVIRIR; yani genellestirme, desenin onlemek icin var
 *      oldugu hatayi geri getirir.
 *   2. Modulleri BILMEK — `shared/` bir kaynagin hangi module ait oldugunu
 *      bilseydi Mutlak Kural 6'yi ihlal ederdi.
 *
 * Genellesen sey KOD degil SOZLESME SEKLIDIR: `findNames(ids, role) ->
 * ReadonlyMap<id, name>`. Bu sekil artik IKI kez yazildi ve bir
 * KONVANSIYONDUR; ucuncu talip (Tedarikci -> Stok) da onu izleyecek.
 *
 * Bedeli acikca: ~40 satirlik iki dosya birbirinin kopyasidir ve biri
 * degistiginde digeri elle hizalanmalidir. Bu, izin kapisini KAYNAGIN SAHIBI
 * MODULDE tutmanin fiyatidir.
 *
 * ============================================================================
 * BAGIMLILIK YONU TEK YONLUDUR: Finans -> Projeler
 * ============================================================================
 * Projeler, Finans'i BILMEZ ve bilmemelidir. Tersi (proje detayinda o projenin
 * masraflarinin gosterilmesi) bir modul dongusu kurardi; projede bir kez
 * yasandi (Tenant <-> Identity) ve cozumu `forwardRef` degil UCUNCU BIR MODUL
 * oldu (`platform/session`).
 *
 * ⚠️ Grafik artik DALLI: `Projeler -> CRM`, `Finans -> CRM`, `Finans ->
 * Projeler`. Uc kenar, dongu yok — bir DAG. Yeni bir kenar eklenmeden ONCE
 * dongu kontrol edilir.
 *
 * ⚠️ Buraya bir sey EKLEMEDEN once sorulacak soru: "bunu baska bir IS MODULU
 * bilmek ZORUNDA mi?" Cevap hayirsa `application/` altinda kalir.
 * ============================================================================
 */

/** DI token'i. Symbol kullanildi: string token'lar sessizce cakisabilir. */
export const PROJECTS_PROJECT_DIRECTORY = Symbol('PROJECTS_PROJECT_DIRECTORY');

export interface FindProjectNamesInput {
  /**
   * TOPLU — tekil DEGIL.
   *
   * Islem listesinde N satir vardir; tekil bir metot N+1 sorgu uretirdi.
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
 * Projeler'in proje AD dizini (ADR-0034 §4).
 *
 * DI token'i: `PROJECTS_PROJECT_DIRECTORY`.
 */
export interface ProjectDirectory {
  /**
   * Verilen id'ler icin `id -> ad` haritasi.
   *
   * ============================================================================
   * BULUNAMAYAN = HARITADA YOK. HATA DEGIL.
   * ============================================================================
   * Uc durum AYNI sonucu verir ve bu KASITLIDIR:
   *   1. Proje silinmis (sarkan isaretci tolere edilir — ADR-0034 §4.2),
   *   2. Proje baska bir tenant'in (RLS zaten gormez),
   *   3. Cagiran `project:read` TASIMIYOR.
   *
   * Cagiran ucunu AYIRT EDEMEZ, dolayisiyla SIZDIRAMAZ. Ve tek bir kod yolu
   * yazar: "ad yok" hali zaten ele alinmak zorundadir, cunku silinen proje her
   * zaman mumkundur.
   *
   * ============================================================================
   * IZIN KONTROLU BU ARAYUZUN ICINDE — cagirana BIRAKILMAZ
   * ============================================================================
   * `project:read` Projeler'in iznidir; zorlayan da Projeler olmalidir.
   * Cagirana birakilsaydi, unutan TEK modul bir sizinti kapisi acardi — ve
   * unutmak SESSIZ olurdu, cunku ekran calismaya devam ederdi.
   *
   * ⚠️ Bu, yukarida genellestirmenin neden reddedildigini aciklayan cumlenin
   * tam olarak kendisidir: bu kontrolu disari tasiyan her soyutlama, onu
   * yeniden unutulabilir kilar.
   *
   * Karar ADR-0025'in AYNI policy engine'ine sorulur (`PermissionChecker`);
   * ikinci bir kural kaynagi acilmaz.
   */
  findNames(input: FindProjectNamesInput): Promise<ReadonlyMap<string, string>>;
}
