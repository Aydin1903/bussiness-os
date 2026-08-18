/**
 * Belge'nin DEKLARE ettigi oran siniri eylemi (ADR-0029 §5, ADR-0031 §4.2,
 * ADR-0037 §10).
 *
 * ============================================================================
 * AD `document_embedding` — ADR-0035'IN ADLANDIRMA DERSI IZLENIYOR
 * ============================================================================
 * Randevu, `create_appointment` yerine `appointment_embedding` yazmisti ve
 * gerekce sinirlanan seyin ne oldugunu SOYLEMEKTI: notsuz bir randevu hicbir
 * sey harcamiyordu, ama bir GUNCELLEME harciyordu.
 *
 * Burada da fiil TEK DEGIL: hem `POST /documents` hem `PUT /documents/:id/file`
 * hem `POST /documents/reindex` embedding uretir. `create_` oneki, sayacin NE
 * OLCTUGU konusunda yanlis bilgi verirdi. Kural tek cumleyle: **cagri para
 * harciyorsa sayilir, harcamiyorsa sayilmaz.**
 *
 * ⚠️ Metadata guncellemesi (`PATCH /documents/:id`) paydan DUSMEZ: etiket ya da
 * baglanti degistirmek dosyaya dokunmaz... AMA ETIKET BAGLAM BASLIGINA GIRER
 * (§8.1). Bu yuzden etiket degisiminde parcalar YENIDEN URETILIR ve o yol pay
 * ODER. Ayrim use case'te yapilir, burada degil.
 *
 * ============================================================================
 * ⚠️ BU MODULDE "ISTEK SAYAN SINIR" ILK KEZ GERCEKTEN YANILTICI
 * ============================================================================
 * ADR-0029 §5'ten beri yazili bilinen sinir sudur: oran siniri ISTEK sayisini
 * baglar, TOKEN harcamasini degil. Bugune kadar bu sinir PRATIKTE zararsizdi
 * cunku sayac ile maliyet arasindaki oran SABITTI — onceki dort modulde bir
 * istek bir embedding cagrisi uretiyordu (Randevu'da en fazla bir, cogu zaman
 * sifir).
 *
 * BURADA DEGIL. Bir belge = N parca = N embedding cagrisi ve N, 300'e kadar
 * cikabilir (`DOCUMENTS_MAX_CHUNKS`). Ayni saatlik limit, bu modulde
 * oncekilerin ONLARCA KATI maliyete izin verirdi.
 *
 * Iki telafi:
 *   1. Kova KUCUK (`DOCUMENTS_EMBEDDING_RATE_LIMIT` varsayilani 10 — Randevu'da
 *      60),
 *   2. Asil fren PARCA SINIRIDIR: kova istekleri sayar, `DOCUMENTS_MAX_CHUNKS`
 *      her istegin USTUNU kapatir.
 *
 * ⚠️ Ikisi birlikte bile TAM bir butce degildir; gercek cozum token bazli
 * olcumdur ve o hala acik bir kalemdir (ROADMAP §8.1 — olcum var, zorlama yok).
 *
 * ============================================================================
 * NEDEN AYRI KOVA
 * ============================================================================
 * `create_commentary` Finans'in, `appointment_embedding` Randevu'nun
 * sozlugudur; Belge onlari deklare edemez. Asil gerekce semantiktir
 * (ADR-0029 §5): bunlar FARKLI IS AKISLARIDIR. Ay sonu finans yorumunu yazmis
 * bir kullanicinin sozlesme yukleyememesi anlamsiz olurdu.
 *
 * ⚠️ Mekanizma PLATFORMUN (`platform.rate_limits`); modul yalnizca kendi
 * kalemini deklare eder ve platform icerigi YORUMLAMAZ (ADR-0031 §4.2).
 * ALTINCI modulde de ALTINCI bir sayac tablosu ACILMIYOR.
 *
 * ============================================================================
 * YENIDEN INDEKSLEME BU KOVAYI PAYLASIR
 * ============================================================================
 * ADR-0029'un gerekcesi birebir gecerli: "ayri bir kova, onarimi BUTCESIZ BIR
 * YAN KAPIYA cevirirdi." Ayni maliyet profili, ayni kova — ve burada bu, onceki
 * modullerden DAHA onemli: bir `reindex` cagrisi
 * `DOCUMENTS_REINDEX_BATCH_SIZE` × `DOCUMENTS_MAX_CHUNKS` kadar cagri
 * uretebilir.
 */
export const DOCUMENT_EMBEDDING_ACTION = 'document_embedding';
