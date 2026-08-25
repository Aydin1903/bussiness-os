/**
 * Drizzle sema tanimlarinin toplandigi yer.
 *
 * ARCHITECTURE 6.1: her modul kendi PostgreSQL schema'sina sahiptir ve
 * cross-schema foreign key YASAKTIR.
 *
 * ONEMLI: bu dosyalar yalnizca TIP GUVENLIGI saglar. RLS politikalari, CHECK
 * kisitlari ve SECURITY DEFINER fonksiyonlari Drizzle sema tanimindan
 * URETILEMEZ; onlar `drizzle/*.sql` altinda ELLE yazilir (DEVELOPMENT_RULES 6).
 * Bir tablonun burada tanimli olmasi, korunuyor oldugu anlamina GELMEZ —
 * korumanin kaniti entegrasyon testlerindedir (MULTI_TENANT_ARCHITECTURE 12.6).
 */
export { platformSchema } from './platform.schema';
export { tenants } from './tenants.schema';
export { memberships } from './memberships.schema';
export { outbox } from './outbox.schema';

// --- Audit (ADR-0043 §6, migration `0032`) ---
// ⚠️ ARCHITECTURE §6.2'nin platform zincirinin DORDUNCU halkasi. Yeni bir sema
// ACILMADI: bu bir is modulu degil, platform cekirdegidir.
//
// ⚠️ MT §12.4 bu tabloyu ZATEN yaziyordu ve satiri birebir uygulandi —
// standart RLS + `UPDATE`/`DELETE` yetkisi hicbir role verilmez. Dokuman
// guncellenmedi cunku guncellenecek bir sey yoktu; uc kez ertelenmis
// (ADR-0034 §8 -> ADR-0039/0040 -> ADR-0041 §8) bir kararin uygulamasidir.
//
// ⚠️ BU TABLODA "DEGER" KOLONU YOKTUR (§6.5): yalnizca hangi alanin degistigi
// saklanir. Ilk tuketici IK'dir ve orada degisen alanlardan biri MAAStir.
export { auditLog } from './audit-log.schema';

// Identity (Faz 3) — hepsi tenant-scoped DEGILDIR (MULTI_TENANT_ARCHITECTURE 12.4
// istisna listesi); tenant RLS uygulanmaz, erisim Identity repository'sinden.
export { users } from './users.schema';
export { credentials } from './credentials.schema';
export { emailVerificationCodes } from './email-verification-codes.schema';
export { tokenFamilies } from './token-families.schema';
export { refreshTokens } from './refresh-tokens.schema';
export { loginAttempts } from './login-attempts.schema';
export { verificationCodeRequests } from './verification-code-requests.schema';
export { passwordResetCodes } from './password-reset-codes.schema';
export { identityOutbox } from './identity-outbox.schema';

// Knowledge (Faz 4) — `platform` disindaki ILK modul semasi (ADR-0029, ADR-0030).
// Hepsi tenant-scoped: RLS ENABLE + FORCE, standart sablon (MT §12.2).
export { knowledgeSchema } from './knowledge.schema';
export { notes } from './notes.schema';
export { noteChunks } from './note-chunks.schema';
export { conversations } from './conversations.schema';
export { messages } from './messages.schema';
export { dailyReportRuns } from './daily-report-runs.schema';
export { rateLimits } from './rate-limits.schema';

// --- CRM (ADR-0031 §1) ---
export { crmSchema } from './crm.schema';
export { companies } from './companies.schema';
export { contacts } from './contacts.schema';
export { opportunities } from './opportunities.schema';
export { interactions } from './interactions.schema';
export { interactionChunks } from './interaction-chunks.schema';
// Katman 2 (ADR-0032) — ONBELLEK, kuyruk degil.
export { companySummaries } from './company-summaries.schema';

// --- Projeler (ADR-0033 §1) ---
// `projectsSchema` ayri bir dosyada: sema ve tablo AYNI adi tasiyor, cakismayi
// sema dosyasi ustlendi (gerekce `projects-schema.schema.ts`'te).
export { projectsSchema } from './projects-schema.schema';
export { projects } from './projects.schema';
export { tasks } from './tasks.schema';
export { progressNotes } from './progress-notes.schema';
export { progressNoteChunks } from './progress-note-chunks.schema';

// --- Finans (ADR-0034 §1) ---
// ⚠️ `finance.categories` uzerindeki `UNIQUE (id, direction)` kisiti burada
// TEMSIL EDILMEZ (yukaridaki "yalnizca tip guvenligi" uyarisinin somut bir
// ornegi) ama migration `0024`'un bilesik FK'sinin ON KOSULUDUR. Elle
// silinirse hata TIP DENETIMINDE degil, migration calisirken gorunur.
export { financeSchema } from './finance.schema';
export { financeCategories } from './finance-categories.schema';
export { financeTransactions } from './finance-transactions.schema';
// ⚠️ Finans'ta EMBED EDILEN TEK yuzey `commentaries`tir; `transactions
// .description` duz kolondur (ADR-0034 §6.1 — ortak top-K havuzu).
export { financeCommentaries } from './finance-commentaries.schema';
export { financeCommentaryChunks } from './finance-commentary-chunks.schema';

// --- Randevu / Rezervasyon (ADR-0035 §1) ---
// `appointmentsSchema` ayri bir dosyada: sema ve tablo AYNI adi tasiyor —
// `projects`teki cakismanin birebir aynisi, ikinci kez.
//
// ⚠️ BU MODULDE `*_chunks` TABLOSU YOKTUR (ADR-0035 §3). Dort onceki anlamsal
// kaynagin dordu de ayri bir parca tablosu tasiyordu; randevu notu kisa ve tek
// seferliktir, dolayisiyla vektor AYNI SATIRDA yasar.
export { appointmentsSchema } from './appointments-schema.schema';
export { appointments } from './appointments.schema';

// --- Belge / Sozlesme Yonetimi (ADR-0037 §1) ---
// `documentsSchema` ayri bir dosyada: sema ve tablo AYNI adi tasiyor —
// `projects` ve `appointments`taki cakismanin birebir aynisi, UCUNCU kez.
//
// ⚠️ CHUNK TABLOSU GERI DONDU (ADR-0037 §3): bir onceki modul (Randevu) onu
// bilincli olarak reddetmisti. Iki karar celismiyor — ayni olcut (metnin ust
// sinirini KULLANICI mi VERI mi belirliyor) iki farkli cevap veriyor.
//
// ⚠️ BU MODUL, PROJENIN VERITABANI DISINDAKI ILK KALICI DURUMUNU acar:
// dosyanin kendisi Cloudflare R2'dedir (ADR-0037 §5) ve `documents.storageKey`
// ona isaret eder. Nesne deposunda RLS YOKTUR — o taraftaki izolasyon tumuyle
// anahtar duzenine dayanir.
export { documentsSchema } from './documents-schema.schema';
export { documents } from './documents.schema';
export { documentChunks } from './document-chunks.schema';

// --- Stok / Envanter (ADR-0039 §1) ---
// YEDINCI sema. ⚠️ Sema adi ile tablo adlari CAKISMIYOR (`inventory` vs
// `items`/`movements`) — onceki uc modulun (`projects`, `appointments`,
// `documents`) yasadigi cakisma burada YOK. Dosya adlari yine de `inventory-`
// onekli: bu klasorde `notes`, `tasks`, `messages` gibi nitelenmemis adlar
// baska modullere ait ve `items.schema.ts` hangi modulun oldugunu SOYLEMEZDI.
//
// ⚠️ BU MODULUN EN ONEMLI OZELLIGI BIR KOLONUN YOKLUGUDUR: `items`te miktar
// kolonu YOKTUR (ADR-0039 §2). Mevcut miktar `movements`tan HER OKUMADA
// turetilir — `finance.balances`in reddiyle ayni karar, dokuzuncu kez.
//
// ⚠️ `movements` DEGISTIRILEMEZ bir defterdir (§3.3) ve `items`e `ON DELETE
// RESTRICT` ile baglidir: hareketi olan bir kalemin silinmesini VERITABANI
// reddeder, uygulama degil.
export { inventorySchema } from './inventory-schema.schema';
export { inventoryItems } from './inventory-items.schema';
export { inventoryMovements } from './inventory-movements.schema';

// --- Tedarikci Yonetimi (ADR-0040 §1) ---
// SEKIZINCI sema. ⚠️ Sema ve tablo AYNI adi tasiyor (`suppliers.suppliers`) —
// `projects`, `appointments` ve `documents`taki cakismanin DORDUNCU tekrari;
// sema tanimi bu yuzden ayri bir dosyada.
//
// ⚠️ EXPORT ADI `supplierCompanies`, tablo adi `suppliers`. Cakisan sey sema
// degil TypeScript export'udur: `suppliersSchema` zaten bu adi kullaniyor.
// Ayni sebeple `contacts` -> `supplierContacts`, `interactions` ->
// `supplierInteractions` (CRM'in `contacts` ve `interactions`i zaten export
// edilmis durumda ve iki farkli tablo tek kelimeyi PAYLASAMAZ).
//
// ⚠️ CHUNK TABLOSU YOK (ADR-0040 §2.2): vektor `interactions` satirinin
// KENDISINDE yasar. Bu, CRM'i "ucuza tekrar ederken" ondan BILINCLI olarak
// AYRILDIGIMIZ yerdir — CRM'in `interaction_chunks`i bir emsal degil, chunk
// olcutu yazilmadan onceki bir MIRASTIR.
//
// ⚠️ BU MODUL BAGIMLILIK GRAFIGINE HICBIR KENAR EKLEMEZ (§4). Stok'ta da boyle
// olmustu ama sebebi farkliydi (hedef sema yoktu); burada hedef VAR ve kenar
// yine eklenmiyor. Grafik alti kenarda ve DAG.
export { suppliersSchema } from './suppliers-schema.schema';
export { supplierCompanies } from './suppliers.schema';
export { supplierContacts } from './supplier-contacts.schema';
export { supplierInteractions } from './supplier-interactions.schema';

// --- Teklif / Fatura (ADR-0041 §1) ---
// DOKUZUNCU sema. ⚠️ Tablo adi `sales_documents`, `documents` DEGIL:
// sema-nitelenmis oldugu icin `invoicing.documents` yasaldi ama
// `documents.documents` ile yan yana okundugunda iki farkli kavrami ayni
// kelimeyle adlandirirdi. Ayni belirsizlik izin tarafinda da reddedildi —
// `document:read` Belge modulunundur (§9.1).
//
// ⚠️ TEK BELGE TABLOSU + `kind` (§1.1): teklif ve fatura taslagi ayni tabloda
// yasar. Emsal ADR-0034 §5 (`finance.transactions` + `direction`) ve risk
// oradakinden ZAYIFTIR — `kind` unutulursa yanlis listede satir gorunur, bir
// SAYI bozulmaz.
//
// ⚠️ BU SEMADA VEKTOR YOKTUR ve bu Faz 5'te BIR ILKTIR (§5): sekiz modulun
// sekizi de bir `vector(1536)` tasiyordu. Bir teklif kalemi ADR-0034 §6.1'in
// tarif ettigi seydir — yuzlerce neredeyse ozdes kisa vektor top-K havuzunu
// kirletir. Bu modulun katkisi ANLAMSAL degil YAPISALDIR.
//
// ⚠️ `sales_document_lines` bir TRIGGER ile korunur (§2): ebeveyn belge `draft`
// degilse yazma VERITABANI seviyesinde reddedilir. Ucuncu katman SART cunku
// kalemler AYRI BIR TABLODADIR — baslik uzerindeki kontrol onlari kapsamaz.
export { invoicingSchema } from './invoicing-schema.schema';
export { salesDocuments } from './sales-documents.schema';
export { salesDocumentLines } from './sales-document-lines.schema';
export { invoicingNumberSequences } from './invoicing-number-sequences.schema';

// --- IK / Personel (ADR-0043 §1) ---
// ONUNCU sema. ⚠️ Sema adi ile tablo adlari CAKISMIYOR (`hr` vs `employees` /
// `compensation_records`).
//
// ⚠️ BU SEMADA VEKTOR YOKTUR — Faz 5'te IKINCI kez (ADR-0041'den sonra) ve
// ilk kez UST USTE. Modul `POST /ask` havuzuna HIC baglanmaz: ne anlamsal ne
// yapisal katkicisi vardir (§5). Uc gerekce ayni yere cikar: anlatisal icerik
// yok (serbest not alani da yok), bir ekip listesi KATALOGDUR (olgu degil,
// ADR-0040 §3'un olcutu), ve katkici yoklugu §4.2'nin UCUNCU izolasyon
// katmanidir.
//
// ⚠️ `employees` `platform.memberships`ten TURETILMEZ (§2): "kim calisiyor" ile
// "kimin girisi var" iki ayri sorudur ve kumeler iki yonde de ayrisir.
// Belirleyici dayanak koddadir: `identity.public.ts` ad/e-posta ACMAZ.
//
// ⚠️ MAAS AYRI TABLODADIR (`compensation_records`) ve bu, §4.2'nin BIRINCI
// izolasyon katmanidir — `employees`te maas kolonu YOKTUR, yani bir `SELECT *`
// onu yanlislikla tasiyamaz. Defter EKLEME-YALNIZDIR ve degistirilemezligi
// §6.2'ye gore DENETIM IZININ KENDISIDIR.
export { hrSchema } from './hr-schema.schema';
export { hrEmployees } from './hr-employees.schema';
export { hrCompensationRecords } from './hr-compensation-records.schema';

// --- IK v2 (ADR-0044) — izin takibi ---
// ⚠️ BU TABLODA "SEBEP" ALANI YOKTUR ve `type` icinde `sick`/`raporlu` YOKTUR
// (§2.1): ikisi de ADR-0043 §3'ün sağlık verisi sınırının TAŞIYICISIDIR. Bir
// "sebep" alanı o sınırın ARKA KAPISIDIR — sınır yerinde görünür, kullanıcı
// onu ihlal eder ve hata SESSİZDİR.
//
// ⚠️ `days` ve `bakiye` de kolon DEĞİLDİR: ikisi de TÜRETİLİR (§2.3, §2.5).
export { hrLeaveRequests } from './hr-leave-requests.schema';

// --- Musteri Geri Bildirimi / Anket (ADR-0045 §1) ---
// ONBIRINCI sema. ⚠️ Sema adi ile tablo adi CAKISMIYOR (`feedback` vs
// `responses`) — `inventory` ve `hr` ile ayni sinif.
//
// ⚠️ TEK TABLO: chunk tablosu YOK (§1.2, ust siniri BIZ koyuyoruz) ve anket
// TANIMI tablosu da YOK — "anket" v1'de bir VARLIK DEGILDIR (§10).
//
// ⚠️ DOKUZUNCU VEKTOR TABLOSU ve havuzdaki DOKUZUNCU anlamsal kaynak. Yapisal
// katkici EKLENMEDI — ama ADR-0040/0043'teki gibi "bakildi ve yoktu" DEGIL,
// ⚠️ "bakildi, VAR, ve tek basina eklenemez" (§3.4): eklemek ADR-0042 §3'un T2
// esigini tetikler ve T2'nin girdisi (satir donduren yapisal kaynak sayisi)
// BUGUN OLCULEMIYOR.
//
// ⚠️ SATIR GUNCELLENMEZ AMA SILINEBILIR — projede UCUNCU degistirilebilirlik
// sekli (§2). Guncelleme yok cunku kayit BIZIM SOZUMUZ DEGIL, bir ucuncu
// kisinin beyanidir; silme VAR cunku yorum KISISEL VERI ICEREBILIR ve veri
// sahibinin silme talebi hakki vardir (KVKK m.7 / m.11).
export { feedbackSchema } from './feedback-schema.schema';
export { feedbackResponses } from './feedback-responses.schema';
