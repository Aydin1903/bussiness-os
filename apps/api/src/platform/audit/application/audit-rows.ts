import { type AuditAction, type AuditEntry } from '../../../shared/audit.port';

/**
 * `platform.audit_log`a yazilacak TEK satirin sekli.
 *
 * ⚠️ Bu tip, tablonun kolon kumesinin TS tarafindaki aynasidir ve
 * `audit-rows.spec.ts` anahtar kumesini SABITLER — yani bir gun birisi
 * `newValue` eklemek isterse once bu testi kirmasi gerekir.
 */
export interface AuditRow {
  readonly id: string;
  readonly tenantId: string;
  readonly actorUserId: string | null;
  readonly occurredAt: Date;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly action: AuditAction;
  readonly fieldName: string | null;
}

export interface ToAuditRowsInput {
  /** DOGRULANMIS transaction baglamindan — cagirandan DEGIL. */
  readonly tenantId: string;
  /** ⚠️ `null` = sistem/worker. Sahte bir kullanici uydurulmaz. */
  readonly actorUserId: string | null;
  /** ⚠️ TEK bir deger: ayni islemin satirlari ayni damgayi paylasir. */
  readonly occurredAt: Date;
  readonly entry: AuditEntry;
  readonly nextId: () => string;
}

/**
 * Bir denetim olayini yazilacak satirlara cevirir — SAF fonksiyon.
 *
 * ============================================================================
 * ⚠️ DEGERIN SISTEME GIREMEDIGI YER BURASIDIR
 * ============================================================================
 * Fonksiyon `entry`den YALNIZCA bildigi uc alani okur (`resourceType`,
 * `resourceId`, `action`) ve `fieldNames`i ADLARA cevirir. Nesne SPREAD
 * EDILMEZ (`...entry` YOK) — spread edilseydi cagiranin nesnesine iliskilendirdigi
 * her fazladan alan (ornegin `newValue: '75000'`) satira SESSIZCE tasinirdi ve
 * TypeScript bunu YAKALAMAZDI: fazladan alan, bir degisken uzerinden gecen
 * nesnede tip hatasi uretmez.
 *
 * Bu, ADR-0043 §6.5'in tek RUNTIME dayanagidir ve `audit-rows.spec.ts` onu
 * dogrudan kanitlar: kacak bir `newValue` verilir ve uretilen satirda
 * BULUNMADIGI gosterilir.
 *
 * ============================================================================
 * ⚠️ BOS `updated` -> SIFIR SATIR
 * ============================================================================
 * Hicbir alan degismediyse kayit tutulmaz ve HATA DA VERILMEZ. ADR-0039'un
 * fiziksel sayim karariyla ayni sekil: _"fark sifirsa hicbir satir yazilmaz"_.
 *
 * Alternatif — alan adi olmayan bir `updated` satiri — veritabani kisitina
 * (`audit_log_field_name_matches_action`) takilirdi ve kullanici, hicbir sey
 * degistirmedigi icin bir hata alirdi.
 * ============================================================================
 */
export function toAuditRows(input: ToAuditRowsInput): AuditRow[] {
  const { tenantId, actorUserId, occurredAt, entry, nextId } = input;

  const base = {
    tenantId,
    actorUserId,
    occurredAt,
    // ⚠️ Yalnizca BILINEN alanlar okunur. `...entry` YASAK (bkz. yukarisi).
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    action: entry.action,
  };

  if (entry.action !== 'updated') {
    // `created` / `deleted`: alan adi TASIYAMAZ — bir kaydin olusturulmasi
    // "tek bir alanin" olayi degildir. Kisit veritabaninda da zorlanir.
    return [{ id: nextId(), ...base, fieldName: null }];
  }

  // Ayni alan iki kez bildirilirse tek satir yazilir: bir alan bir islemde
  // bir kez degisir. Tekrar, cagiranin dizisini olusturma bicimidir; denetim
  // kaydina yansitmak yaniltici olurdu.
  const uniqueFields = [...new Set(entry.fieldNames)];

  return uniqueFields.map((fieldName) => ({ id: nextId(), ...base, fieldName }));
}
