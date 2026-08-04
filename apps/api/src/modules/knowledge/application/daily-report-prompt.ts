/**
 * Gunluk rapor sistem promptu (ADR-0030 §2.2).
 *
 * ============================================================================
 * NEDEN `KNOWLEDGE_SYSTEM_PROMPT` YENIDEN KULLANILMIYOR
 * ============================================================================
 * Ayni ILKEYI tasirlar (yalnizca verilen baglami kullan, uydurma) ama FARKLI
 * GOREVLERDIR. Soru-cevap promptu bir soruya cevap verir ve gerektiginde
 * "netlestirici soru sor" der; bir raporun soracak kimsesi yoktur. Onun 2.
 * kurali ("bu konuda henuz bir notunuz yok, eklerseniz...") bir rapor metninde
 * anlamsiz olurdu.
 *
 * Tek prompt'a iki gorevi bindirmek, ikisini de bulaniklastirirdi: her yeni
 * kural digerinin de yuku olurdu.
 *
 * ============================================================================
 * 1. KURAL AYNI VE PAZARLIK KONUSU DEGIL
 * ============================================================================
 * Rapor da halusinasyon uretmemeli. Bir yoneticinin sabah okudugu ozet,
 * sirketinde OLMAYAN bir gelismeden bahsediyorsa, urunun tum degeri (kurumsal
 * hafizaya guven) tek seferde kaybolur.
 * ============================================================================
 */
export const DAILY_REPORT_SYSTEM_PROMPT = `Sen bir sirketin kurumsal hafizasindan gunluk ozet cikaran asistansin.

1. YALNIZCA sana verilen notlardaki bilgiyi kullan. Notlarda olmayan hicbir seyi kendi genel bilginden EKLEME veya UYDURMA. Yorum, tahmin veya tavsiye URETME.
2. Kisa yaz: en fazla birkac cumle. Amac, gunu bir bakista hatirlatmaktir.
3. Notlari tek tek listeleme; ortak temalari birlestirerek anlat.

Sirketin kendi dilinde yaz (notlar hangi dildeyse o dilde).`;

/**
 * Hic not eklenmemis gun icin SABIT ozet — LLM CAGRILMAZ.
 *
 * ADR-0030 "Bilinen sinirlar": _"Hafta sonu hic not eklenmediyse BOS BIR RAPOR
 * URETILIR; bos raporu atlama kurali v1'de yoktur."_ Yani satir isaretlenir —
 * atlanmaz. Atlanmasi zaten teknik olarak da yanlis olurdu: claim sorgusu
 * `generated_at IS NULL` filtreler, isaretlenmeyen satir HER TURDA yeniden
 * claim edilir (`publish-tenant-events`'teki "is yoktu ama isaretlenir"
 * dersinin aynisi).
 *
 * ⚠️ Model CAGRILMAZ: cevabini zaten bildigimiz bir soru icin para harcamak
 * anlamsiz. Dahasi BOS baglamla model cagirmak, 1. kuralin engellemeye
 * calistigi riski davet etmek olurdu — soyleyecek seyi olmayan bir modele
 * "ozet yaz" demek, uydurmasi icin en uygun kosuldur.
 */
export const EMPTY_DAILY_REPORT_SUMMARY = 'Bu donemde yeni not eklenmedi.';
