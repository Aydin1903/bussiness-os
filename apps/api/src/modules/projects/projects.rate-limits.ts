/**
 * Projeler'in DEKLARE ettigi oran siniri eylemi (ADR-0029 §5, ADR-0031 §4.2,
 * ADR-0033 §9).
 *
 * ============================================================================
 * NEDEN AYRI KOVA — `create_interaction` YENIDEN KULLANILMADI
 * ============================================================================
 * `create_interaction` CRM'in sozlugudur; Projeler onu deklare edemez. Ama
 * asil gerekce semantiktir ve ADR-0029 §5'in "iki eylem AYRI KOVADIR"
 * kararinin aynisidir: bunlar FARKLI IS AKISLARIDIR. Gunun musteri
 * gorusmelerini girmis bir kullanicinin proje ilerlemesini yazamamasi anlamsiz
 * olurdu.
 *
 * ⚠️ Mekanizma PLATFORMUN (`platform.rate_limits`); modul yalnizca kendi
 * kalemini deklare eder ve platform icerigi YORUMLAMAZ (ADR-0031 §4.2).
 * Ucuncu modulde de ucuncu bir tablo acilmiyor — desenin ise yaradiginin
 * olcusu budur.
 *
 * ============================================================================
 * YENIDEN INDEKSLEME BU KOVAYI PAYLASIR
 * ============================================================================
 * ADR-0029'un gerekcesi birebir gecerli: "ayri bir kova, onarimi BUTCESIZ BIR
 * YAN KAPIYA cevirirdi." Ayni maliyet profili (parca basina bir embedding
 * cagrisi), ayni kova.
 *
 * ⚠️ Oran siniri ISTEK SAYISINI baglar, TOKEN harcamasini degil (ADR-0029 §5
 * bilinen sinir, ROADMAP §8.1'de olculebilir hale geldi ama hala
 * zorlanmiyor). Asil fren `PROJECTS_REINDEX_BATCH_SIZE`'dir: tek bir onarim
 * cagrisinda kac notun islenecegini o belirler.
 */
export const PROJECTS_CREATE_PROGRESS_NOTE_ACTION = 'create_progress_note';
