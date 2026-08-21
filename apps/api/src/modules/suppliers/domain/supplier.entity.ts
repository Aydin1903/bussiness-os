import {
  BlankSupplierNameError,
  InvalidSuppliersTimestampError,
  PaymentTermsTooLongError,
} from './suppliers.error';

/**
 * Odeme kosullarinin SERT karakter siniri (ADR-0040 §1.2).
 *
 * ⚠️ VERITABANINDA KARSILIGI YOKTUR ve bu bilinclidir: migration yalnizca "bos
 * olamaz" der. Sinir bir GIRDI kuralidir — `MAX_DURATION_MINUTES` /
 * `MAX_NAME` ile ayni sinifta.
 *
 * 200 karakter, bir odeme kosulu cumlesi icin genis ("60 gun vadeli, 10 gun
 * icinde odemede %2 iskonto, nakliye alicidan") ama bir PARAGRAF degil. Sinirsiz
 * birakmak alani ikinci bir serbest not alanina cevirirdi; oysa bu modulun
 * anlatisal yuzeyi GORUSME GUNLUGUDUR ve odeme kosullari EMBED EDILMEZ.
 */
export const MAX_PAYMENT_TERMS_CHARS = 200;

/**
 * Tedarikci firmasi (ADR-0040 §1).
 *
 * `crm.companies`in karsiligi — ROADMAP §3.5'in _"CRM deseninin ucuz tekrari"_
 * tanimi. ZAMAN VE KIMLIK DISARIDAN GELIR (DEVELOPMENT_RULES 3.2): entity
 * `new Date()` veya id uretmez.
 *
 * ============================================================================
 * ⚠️ "TERS YON"UN KARSILIGI: FIRSAT / ASAMA / TAKIP TARIHI YOKTUR (§2.1)
 * ============================================================================
 * `Opportunity`nin bu modulde bir karsiligi ACILMAZ. Bir satis hattinin var
 * olma sebebi BELIRSIZ BIR GELIRIN asamalar boyunca ilerlemesidir; satin alma
 * tarafinda belirsizlik tedarikcide degil SIPARISTEDIR ve siparis kapsam
 * disidir (§9).
 *
 * ⚠️ Bunun dogrudan sonucu: bu modulun YAPISAL KATKICISI YOKTUR (§3) ve
 * dolayisiyla ADR-0036'nin yeniden gozden gecirme esigi (yapisal kaynak 6)
 * ASILMAZ. Buraya bir `stage` kolonu eklemek, o esigi de birlikte getirir.
 *
 * ============================================================================
 * ⚠️ ARSIVLEME YOK — ADR-0039'DAN BILINCLI SAPMA
 * ============================================================================
 * `StockItem.archivedAt`in karsiligi BURADA YOKTUR. Stok'ta arsivleme
 * ZORUNLUYDU cunku silme, DEGISTIRILEMEZ ilan edilen defteri goturuyordu;
 * burada goturecegi bir defter yok ve bir tedarikciye ISARET EDEN HICBIR MODUL
 * DE YOK (§4). Silme bugun sarkan satir uretmez.
 *
 * ⚠️ 8. modul (Teklif/Fatura) bir satin alma faturasini bir tedarikciye
 * bagladigi gun bu karar DUSER ve `StockItemHasMovementsError` deseni burada da
 * uygulanir. Bugun eklemek, var olmayan bir iliskiyi IMA ETMEK olurdu.
 *
 * ============================================================================
 * IYIMSER ESZAMANLILIK YOK — SON YAZAN KAZANIR
 * ============================================================================
 * `Company` / `Project` / `StockItem` ile ayni bilinen sinir, YEDINCI kez.
 * ============================================================================
 */
export interface SupplierFields {
  readonly name: string;

  /**
   * ⚠️ Tekillik `lower(tax_number)` uzerinde ZORLANIR (§1.1) — kontrol
   * veritabanindadir, burada degil: bir tekillik kurali TEK BIR SATIRA bakarak
   * dogrulanamaz.
   *
   * `null` MESRUDUR: kucuk bir isletme tedarikcisinin vergi numarasini
   * bilmeyebilir.
   */
  readonly taxNumber: string | null;

  /** Serbest metin — `crm.companies.industry`nin karsiligi. */
  readonly category: string | null;

  readonly email: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly address: string | null;

  /**
   * ⚠️ SERBEST METIN (§1.2). Kolon HICBIR KISIT TASIMAZ: ne filtrelenir ne
   * hesaplanir, yalnizca OKUNUR.
   *
   * Yapisal hale getirmek (`netDays` + `discountPercent` + `discountDays`) uc
   * alan, uc dogrulama ve bir hesaplama kurali gerektirirdi — tasidigi tek
   * kisit icin: hicbiri.
   *
   * ⚠️ Bunun dogrudan sonucu §3.2'de yazili: serbest metinden vade
   * CIKARILAMAZ, dolayisiyla "odeme vadesi yaklasan" bir yapisal katkici
   * YAZILAMAZ. Regex ile "60 gun" aramak sessiz hata makinesi olurdu.
   */
  readonly paymentTerms: string | null;
}

/**
 * KISMI guncelleme govdesi.
 *
 * `Partial<SupplierFields>` YETMEZ: `exactOptionalPropertyTypes` altinda o tip
 * "alan YOK" der, "alan var ama `undefined`" DEMEZ. Zod'un `.partial()` ciktisi
 * ikincisidir. Ayrim anlamlidir: `undefined` = dokunma, `null` = temizle.
 */
export type SupplierPatch = {
  readonly [K in keyof SupplierFields]?: SupplierFields[K] | undefined;
};

export interface SupplierState extends SupplierFields {
  readonly id: string;
  readonly tenantId: string;
  /**
   * ⚠️ Yalnizca OLUSTURANI tutar; denetim izi DEGILDIR (ADR-0040 §9).
   *
   * ⚠️ Bu borc bu modulde KENDILIGINDEN KAPANMAZ — ADR-0039'un aksine.
   * Orada hareket defteri degistirilemez oldugu icin "miktar nasil bu hale
   * geldi" HER ZAMAN sorulabiliyordu. Burada bir tedarikcinin ODEME
   * KOSULLARINI kimin degistirdigi sorulamaz. Tetikleyici 8. modul.
   */
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Supplier {
  private constructor(private readonly state: SupplierState) {}

  static create(input: {
    id: string;
    tenantId: string;
    createdByUserId: string;
    fields: SupplierFields;
    now: Date;
  }): Supplier {
    return new Supplier({
      id: input.id,
      tenantId: input.tenantId,
      createdByUserId: input.createdByUserId,
      ...normalize(input.fields),
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  /** Kaliciliktan geri yukler; ALAN DOGRULAMASI YAPMAZ (veri zaten gecerliydi). */
  static fromPersistence(state: SupplierState): Supplier {
    if (state.updatedAt < state.createdAt) {
      throw new InvalidSuppliersTimestampError();
    }
    return new Supplier(state);
  }

  /**
   * KISMI guncelleme.
   *
   * `undefined` = "dokunma". `PUT` secilseydi unutulan her alan sessizce
   * varsayilanina duserdi — bir tedarikcide bu, iletisim bilgisinin kaybolmasi
   * demekti.
   *
   * ⚠️ AD DEGISIMI BU MODULDE BEDAVA DEGILDIR ve bu, ADR-0039'dan ayrildigi
   * yerdir: ad BAGLAM BASLIGINA girer (§6) ama `suppliers.suppliers`ta yasar,
   * vektor ise `suppliers.interactions`ta. Yani yeniden adlandirma TUM
   * gorusmelerin vektorunu BAYATLATIR ve telafi AYNI ISLEMDE degil `reindex`te
   * odenir. Stok'ta ad AYNI SATIRDA oldugu icin bayatlama penceresi YOKTU.
   */
  update(changes: SupplierPatch, now: Date): Supplier {
    const current = this.state;

    const merged: SupplierFields = {
      name: changes.name ?? current.name,
      // ⚠️ `??` DEGIL: `null` = TEMIZLE ve mesrudur. `changes.x ?? current.x`
      // yazilsaydi `null` gonderen bir istek SESSIZCE yok sayilirdi —
      // kullanici alani temizledigini sanip temizlememis olurdu.
      taxNumber: pick(changes.taxNumber, current.taxNumber),
      category: pick(changes.category, current.category),
      email: pick(changes.email, current.email),
      phone: pick(changes.phone, current.phone),
      website: pick(changes.website, current.website),
      address: pick(changes.address, current.address),
      paymentTerms: pick(changes.paymentTerms, current.paymentTerms),
    };

    return new Supplier({ ...current, ...normalize(merged), updatedAt: now });
  }

  toState(): SupplierState {
    return this.state;
  }
}

/** Tum alan kurallari TEK yerde — `create` ve `update` ayni yoldan gecer. */
function normalize(fields: SupplierFields): SupplierFields {
  const name = fields.name.trim();
  if (name === '') {
    throw new BlankSupplierNameError();
  }

  const paymentTerms = blankToNull(fields.paymentTerms);

  // ⚠️ Kontrol `blankToNull`DAN SONRA: bosluklarla sisirilmis bir metin,
  // kirpildiktan sonraki GERCEK uzunluguyla olculur.
  if (paymentTerms !== null && paymentTerms.length > MAX_PAYMENT_TERMS_CHARS) {
    throw new PaymentTermsTooLongError(paymentTerms.length, MAX_PAYMENT_TERMS_CHARS);
  }

  return {
    name,
    // ⚠️ Vergi numarasi BURADA normalize edilir ama KUCUK HARFE CEVRILMEZ:
    // kullanicinin yazdigi bicim korunur ve tekillik `lower()` IFADE INDEX'iyle
    // saglanir. Kucuk harfe cevirmek, ekranda kullanicinin girdiginden farkli
    // bir deger gostermek olurdu.
    taxNumber: blankToNull(fields.taxNumber),
    category: blankToNull(fields.category),
    email: blankToNull(fields.email),
    phone: blankToNull(fields.phone),
    website: blankToNull(fields.website),
    address: blankToNull(fields.address),
    paymentTerms,
  };
}

/** Bos dizeler `null`a cevrilir: "girilmedi" ile "bos girildi" ayni seydir. */
function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** `undefined` = dokunma, `null`/bos = temizle. */
function pick(change: string | null | undefined, current: string | null): string | null {
  return change === undefined ? current : blankToNull(change);
}
