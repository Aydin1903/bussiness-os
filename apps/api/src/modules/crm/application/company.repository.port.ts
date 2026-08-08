import { type Company, type CompanyState } from '../domain/company.entity';

export const COMPANY_REPOSITORY = Symbol('COMPANY_REPOSITORY');

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * Musteri listesinin tek satiri — `CompanyState` + SON TEMAS gunu.
 *
 * ============================================================================
 * `lastInteractionOn` TURETILIR, KOPYALANMAZ
 * ============================================================================
 * `crm.companies` uzerinde "son temas" diye bir kolon YOKTUR ve olmayacaktir.
 * Deger her sorguda `crm.interactions`tan turetilir. Kaliciya yazmak ikinci bir
 * dogruluk kaynagi yaratir ve iki kaynak zamanla birbirini yalanlar — projede
 * dorduncu kez verilen ayni karar (`daily_report_runs`ta `status` kolonunun
 * reddi, yeniden indeksleme is listesi, takipler gorunumu, `companyName` join'i).
 *
 * Somut bedeli: bir gorusme silindiginde ya da tarihi degistiginde deger
 * KENDILIGINDEN duzelir. Kopyalanmis bir kolonda bunu elle guncellemek
 * gerekirdi ve biri unutuldugunda kart yalan soylerdi.
 *
 * ============================================================================
 * `occurred_on`, `created_at` DEGIL
 * ============================================================================
 * "Son temas" gorusmenin GERCEKLESTIGI gundur, kayda gecirildigi gun degil.
 * Dun yapilan bir gorusme bugun yazilabilir; kullanicinin sordugu soru
 * "en son ne zaman konustuk", "en son ne zaman not aldim" degil.
 *
 * `null` = bu musteriyle HIC gorusulmemis. Sifir gun DEGIL — ekran ikisini
 * ayirmak zorundadir.
 */
export interface CompanyListRow extends CompanyState {
  /** `YYYY-MM-DD` takvim gunu; hic gorusme yoksa `null`. */
  readonly lastInteractionOn: string | null;

  /**
   * Musteriye bagli yetkili sayisi.
   *
   * Kart genisligini HAK ETMESI icin var: 720px'lik bir kartta iki kisa satir,
   * dolgu ne kadar kalin olursa olsun seyrek gorunur. "Kac yetkilisi var, kac
   * acik isi var" musteri listesine bakarken gercekten sorulan sorulardir.
   */
  readonly contactCount: number;

  /**
   * ACIK firsat sayisi — kapanmislar (`won`/`lost`) HARIC.
   *
   * Kapanmis anlasmalari saymak sayaci "bu musteriyle toplam kac is yaptik"a
   * cevirirdi; sorulan soru ise "su an kac isim var". Ayni ayrim takipler
   * gorunumunde ve `listOpenPipeline`'da da yapiliyor.
   */
  readonly openOpportunityCount: number;
}

/**
 * `crm.companies` kaliciligi.
 *
 * ============================================================================
 * HICBIR METOT `tenantId` ALMAZ — ve bu bilincli
 * ============================================================================
 * Daraltmayi RLS yapar (`ENABLE` + `FORCE`, migration `0016`) ve cagiran zaten
 * tenant transaction'i icindedir. `DrizzleNoteChunkSearchRepository` ile ayni
 * gerekce: elle bir `WHERE tenant_id` eklemek (a) korumanin RLS'te oldugu
 * gercegini bulanikllastirir, (b) filtre bir gun unutulursa RLS'in hala
 * koruyor oldugu FARK EDILMEZ ve yanlis bir guven duygusu olusur.
 *
 * `null` DONUSU BIR HATA DEGILDIR: "bulunamadi" gecerli bir sonuctur
 * (`shared/README.md` — exception yalnizca BEKLENMEYEN durumlar icin).
 * ============================================================================
 */
export interface CompanyRepository {
  save(company: Company): Promise<void>;
  findById(id: string): Promise<Company | null>;
  /**
   * Sayfali liste — SON TEMAS gunuyle birlikte (projeksiyon).
   *
   * `findById` entity doner (yazma yolu onu kullanir); burasi donmez. Ayrim
   * `OpportunityRepository.list` ile ayni gerekcededir: bir liste sorgudur,
   * komut degil — ve `lastInteractionOn` `Company` aggregate'ine ait bir alan
   * DEGILDIR, baska bir tablodan turer.
   */
  list(input: { limit: number; offset: number }): Promise<ListPage<CompanyListRow>>;
  /** Silinen satir sayisi; `0` = kayit yok (ya da baska tenant'in). */
  deleteById(id: string): Promise<number>;
}
