/**
 * Argon2id parametreleri (ADR-0017, AUTH_ARCHITECTURE 6.2).
 *
 * ============================================================================
 * BU DEGERLER BIR TABANDIR, HEDEF DEGIL
 * ============================================================================
 * ADR-0017: uretim donaniminda olculmeli ve tek hash ~100-250 ms surecek
 * sekilde `memoryCost` YUKARI CEKILMELIDIR. Ama bu bir denge isidir — hash
 * maliyeti ayni zamanda kendi giris uc noktamiza karsi bir DoS vektorudur
 * (kimliksiz), bu yuzden parametre secimi ADR-0022'deki oran sinirlamasiyla
 * BIRLIKTE kararlastirilir.
 *
 * PHC formati (`$argon2id$v=19$m=...$...`) sayesinde bu degerler ileride
 * artirildiginda eski hash'ler hala dogrulanabilir; kademeli yeniden hash'leme
 * (§6.3) onlari giriste sessizce yukseltir.
 * ============================================================================
 *
 * NOT: `saltLength` burada YOK. ADR-0017 16 bayt rastgele salt ister; bu, alt
 * kutuphanenin (`@node-rs/argon2`) varsayilanidir ve `Options` uzerinden ayri
 * bir alanla ayarlanmaz. Deger sabit oldugu icin burada modellemek, ayarlanabilir
 * SANILAN ama etkisi olmayan bir parametre yaratirdi.
 */
export interface Argon2Parameters {
  /** Bellek maliyeti (KiB). GPU/ASIC kirmayi pahali kilan ASIL parametre. */
  readonly memoryCost: number;
  /** Iterasyon sayisi. */
  readonly timeCost: number;
  /** Paralellik derecesi. */
  readonly parallelism: number;
  /** Uretilen hash uzunlugu (bayt). */
  readonly hashLength: number;
}

/** ADR-0017 taban parametreleri. */
export const ADR_0017_ARGON2_PARAMETERS: Argon2Parameters = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
};
