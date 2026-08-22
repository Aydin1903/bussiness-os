import { type SalesDocumentKind } from './sales-document.entity';

/**
 * Belge numarasi bicimi (ADR-0041 §1.6).
 *
 * ============================================================================
 * ⚠️ YIL NUMARANIN ICINDE YOKTUR — VE BU BIR RETENTION KARARIDIR
 * ============================================================================
 * `TKF-2026-000123` yerine `TKF-000123`. Iki sonucu var:
 *
 *   1. Sayac (`invoicing.number_sequences`) tenant + tur basina TEK SATIRDIR ve
 *      ZAMANLA COGALMAZ — yani ROADMAP §8.5'in retention listesine GIRMEZ.
 *      Yil eklenseydi her yil iki yeni satir olusurdu ve liste "yilda iki
 *      satir" gibi bir tartisma acardi.
 *   2. "Yil basinda numara sifirlanir mi" sorusu HIC DOGMAZ. O soru bir
 *      politikadir ve v1'de cevaplanmasi gerekmeyen bir politikadir; belgenin
 *      tarihi zaten `issued_on`dadir.
 *
 * ⚠️ BICIM OZELLESTIRILEMEZ (§12): onek ve hane sayisi SABITTIR. Tenant basina
 * bicim, sablon ozellestirmesiyle AYNI GUN karara baglanmalidir — ayri ayri
 * verilirse iki ayri "belge gorunumu" kaynagi dogar.
 */
const PREFIXES: Readonly<Record<SalesDocumentKind, string>> = {
  quote: 'TKF',
  invoice: 'FTR',
};

/** Sifir dolgusu — `TKF-000123`. Asildiginda dolgu KIRILIR, kesilmez. */
const PAD_LENGTH = 6;

/**
 * Sayac degerini belge numarasina cevirir.
 *
 * ⚠️ BOSLUK OLUSABILIR ve bu DOGRUDUR (§1.6): iptal edilen bir kesim
 * numarasini geri vermez. Bosluk GORUNUR, tekrar GORUNMEZ — ve bir numaranin
 * iki belgede tekrarlanmasi, bizim goremedigimiz yerde (musterinin elinde)
 * ortaya cikan bir hatadir.
 */
export function formatDocumentNumber(kind: SalesDocumentKind, value: number): string {
  return `${PREFIXES[kind]}-${String(value).padStart(PAD_LENGTH, '0')}`;
}
