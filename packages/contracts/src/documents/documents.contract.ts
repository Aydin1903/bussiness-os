import { z } from 'zod';

/**
 * Belge / Sözleşme modülü uçları — api ↔ web paylaşılan şemaları (ADR-0037).
 *
 * ============================================================================
 * ⚠️ BU MODÜLÜN İSTEK GÖVDESİ JSON DEĞİL — `multipart/form-data`
 * ============================================================================
 * Projede ilk kez bir uç dosya alıyor. Sonucu bu dosyanın şeklini doğrudan
 * etkiliyor: **yükleme isteği için bir Zod şeması YOKTUR**. `FormData` bir JSON
 * gövdesi değildir; şema yazmak, doğrulamadığı bir şeyi doğruluyormuş gibi
 * gösteren ölü bir tip üretirdi.
 *
 * Paylaşılan olan şey CEVAP şemaları ve SINIRLARDIR (aşağıdaki üç sabit).
 *
 * ============================================================================
 * ⚠️ `contactName` / `projectName` NULLABLE VE HER BİRİ ÜÇ ANLAMA GELİR
 * ============================================================================
 * Belge o kayda bağlı değildir, kayıt silinmiştir (sarkan işaretçi —
 * ADR-0037 §4), ya da çağıran `contact:read` / `project:read` taşımıyordur.
 * Sunucu üçünü AYIRT ETMEZ ve istemci de etmemelidir: arayüz hiçbir şey yazmaz
 * — "silinmiş" bile yazmaz, çünkü o kelime bir kaydın BİR ZAMANLAR VAR
 * OLDUĞUNU sızdırırdı.
 *
 * ⚠️ İKİSİ BİRBİRİNDEN BAĞIMSIZDIR: bir belge ikisine birden, yalnızca birine
 * ya da hiçbirine bağlı olabilir (ADR-0037 §4).
 */

/**
 * ⚠️ SINIRLAR — TEK KAYNAK BURASIDIR.
 *
 * ============================================================================
 * NEDEN `contracts`TA, İKİ TARAFTA AYRI AYRI DEĞİL
 * ============================================================================
 * Sunucu bu üç sınırı `env.schema.ts`ten okur (`DOCUMENTS_MAX_FILE_BYTES`,
 * `DOCUMENTS_MAX_CHUNKS`) ve DTO'sunda etiket uzunluğunu zorlar. Arayüzün de
 * aynı sayıları bilmesi gerekiyor: dosya seçilir seçilmez boyut kontrolü ve
 * canlı karakter sayacı onlara dayanıyor.
 *
 * İki tarafta ayrı ayrı yazılsaydı biri değiştiğinde diğeri SESSİZCE ayrışırdı
 * — kullanıcı formda "tamam" görür, sunucu 413 döner ve neden reddedildiğini
 * anlayamazdı. `MAX_SERVICE_NOTE_CHARS`ın (ADR-0035) aynı gerekçesi.
 *
 * ⚠️ Sunucudaki değerler YAPILANDIRILABİLİR (env), buradakiler SABİT. Ayrışma
 * mümkündür ve bilinçlidir: env varsayılanları değiştirilirse bu dosya da
 * güncellenmelidir. Arayüzün yaptığı kontrol bir KOLAYLIKTIR, bir güvenlik
 * sınırı değil — sunucu her koşulda kendi sınırını uygular.
 */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_DOCUMENT_CHUNKS = 300;
export const MAX_DOCUMENT_LABEL_CHARS = 120;

/**
 * v1 ALLOWLIST'i (ADR-0037 §6.1).
 *
 * ⚠️ Sunucu türü İÇERİKTEN tespit eder; buradaki liste yalnızca `<input
 * accept>` ve dosya seçildikten sonraki HIZLI uyarı içindir. Uzantı
 * kontrolü bir doğrulama DEĞİLDİR — `sozlesme.pdf` adlı bir dosya PDF olmak
 * zorunda değil ve son sözü her zaman sunucu söyler (415).
 */
export const PDF_MIME_TYPE = 'application/pdf';
export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const documentMimeTypeSchema = z.enum([PDF_MIME_TYPE, DOCX_MIME_TYPE]);

export type DocumentMimeType = z.infer<typeof documentMimeTypeSchema>;

/** Dosya seçicinin kabul ettiği uzantılar + MIME'ler. */
export const DOCUMENT_ACCEPT = `.pdf,.docx,${PDF_MIME_TYPE},${DOCX_MIME_TYPE}`;

/**
 * Ekranda gösterilecek kısa tür adları.
 *
 * ⚠️ Veri modeli MIME, arayüz insan dili — `APPOINTMENT_STATUS_LABELS` ile
 * aynı ayrım.
 */
export const DOCUMENT_TYPE_LABELS: Readonly<Record<DocumentMimeType, string>> = {
  [PDF_MIME_TYPE]: 'PDF',
  [DOCX_MIME_TYPE]: 'Word',
};

const instant = z.iso.datetime({ offset: true });

export const documentSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  originalFilename: z.string().min(1),
  /**
   * ⚠️ Nesne deposundaki anahtar — arayüzde GÖSTERİLMEZ ve İSTEK GÖVDESİNE
   * KONULMAZ. Sunucu onu her okumada veritabanından alır (ADR-0037 §5.2); bu
   * alanın burada bulunması yalnızca cevabın şeklini doğru tarif etmek
   * içindir.
   */
  storageKey: z.string().min(1),
  mimeType: documentMimeTypeSchema,
  sizeBytes: z.number().int().positive(),
  label: z.string().nullable(),
  crmContactId: z.uuid().nullable(),
  projectId: z.uuid().nullable(),
  createdByUserId: z.string(),
  createdAt: instant,
  updatedAt: instant,
});

export type Document = z.infer<typeof documentSchema>;

/**
 * Liste/detay satırı — `Document` + ÇÖZÜLMÜŞ adlar + PARÇA SAYISI.
 *
 * ============================================================================
 * ⚠️ `chunkCount: 0` MEŞRUDUR VE EKRANDA SÖYLENMEK ZORUNDADIR (ADR-0037 §6.3)
 * ============================================================================
 * İki sebebi var ve ikisi de normaldir: (a) belgenin metni çıkarılamadı —
 * taranmış (yalnızca görüntü içeren) PDF, (b) embedding çöktü ve onarım
 * bekliyor.
 *
 * ADR §6.3 bunu açıkça bir arayüz yükümlülüğü olarak yazdı: _"Sessiz
 * olmamasını sağlayan şey `chunkCount: 0`ın açıkça dönmesidir; arayüz bunu
 * görünür kılmak ZORUNDADIR."_ Yazılmazsa karar sessiz başarısızlığa döner:
 * kullanıcı sözleşmesini yüklediğini sanır, aylar sonra aradığında bulamaz ve
 * sebebini asla öğrenemez.
 */
export const documentRowSchema = documentSchema.extend({
  contactName: z.string().nullable(),
  projectName: z.string().nullable(),
  chunkCount: z.number().int().nonnegative(),
});

export type DocumentRow = z.infer<typeof documentRowSchema>;

export const documentListResponseSchema = z.object({
  items: z.array(documentRowSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export type DocumentListResponse = z.infer<typeof documentListResponseSchema>;

/**
 * Yazma uçlarının cevabı — belge + o an üretilen parça sayısı.
 *
 * ⚠️ `chunkCount` yükleme cevabında da döner ve arayüz onu HEMEN gösterir:
 * kullanıcı "yüklendi ama aranamıyor" durumunu aylar sonra değil O ANDA
 * öğrenmelidir.
 */
export const documentResultSchema = z.object({
  document: documentSchema,
  chunkCount: z.number().int().nonnegative(),
});

export type DocumentResult = z.infer<typeof documentResultSchema>;

/**
 * KISMİ metadata güncellemesi — DOSYA DEĞİŞMEZ.
 *
 * ⚠️ `null` = TEMİZLE, alan yok = DOKUNMA (ADR-0037 §10).
 *
 * ⚠️ Etiket değişimi sunucuda PARÇALARI YENİDEN ÜRETİR (etiket bağlam
 * başlığının parçasıdır — §8.1) ve oran sınırı payı öder. Bağlantı değişimi
 * ödemez. Arayüz bu farkı kullanıcıya söylemez ama beklemeyi hesaba katar.
 */
export const updateDocumentRequestSchema = z.object({
  label: z.string().max(MAX_DOCUMENT_LABEL_CHARS).nullable().optional(),
  contactId: z.uuid().nullable().optional(),
  projectId: z.uuid().nullable().optional(),
});

export type UpdateDocumentRequest = z.infer<typeof updateDocumentRequestSchema>;

export const reindexDocumentsResponseSchema = z.object({
  repaired: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export type ReindexDocumentsResponse = z.infer<typeof reindexDocumentsResponseSchema>;
