import {
  feedbackListResponseSchema,
  feedbackResponseSchema,
  feedbackSummarySchema,
  reindexFeedbackResponseSchema,
  type CreateFeedbackRequest,
  type FeedbackListResponse,
  type FeedbackResponse,
  type FeedbackSummary,
  type ReindexFeedbackResponse,
} from '@business-os/contracts';

import { apiFetch, apiSend } from './client';

/**
 * Müşteri Geri Bildirimi uçları (ADR-0045 §5) — BEŞ uç.
 *
 * `suppliers.ts` / `inventory.ts` ile aynı desen: her yanıt şemayla DOĞRULANIR
 * ve `undefined` parametreler sorgu dizesinden düşer.
 *
 * ============================================================================
 * ⚠️ BU DOSYADA OLMAYAN ŞEY — VE BU BİR KARAR
 * ============================================================================
 * **`updateFeedback` YOK.** Kayıt GÜNCELLENMEZ (§2): bir geri bildirim BİZİM
 * SÖZÜMÜZ DEĞİL, bir ÜÇÜNCÜ KİŞİNİN beyanıdır. Sunucuda uç yok, izin yok
 * (`create`, `write` DEĞİL), entity'de metot yok, veritabanında yetki yok
 * (`UPDATE` yalnızca `embedding` kolonunda); burada da fonksiyon yok.
 * ⚠️ Olmayan bir fonksiyon yanlışlıkla çağrılamaz.
 *
 * ⚠️ AMA `deleteFeedback` VAR ve `suppliers.ts`ten AYRILDIĞIMIZ TEK NOKTA
 * budur: gerekçe kolaylık değil KVKK'dır (§2.2) — yorum kişisel veri
 * içerebilir ve veri sahibinin silme talebi hakkı vardır.
 *
 * ============================================================================
 * ⚠️ ROTA SIRASI BURADA DA GÖRÜNÜR
 * ============================================================================
 * `/feedback/summary` ve `/feedback/reindex` SABİT yollardır; `/feedback/:id`
 * parametrelidir. Sunucu tarafında sabit yollar `:id`den ÖNCE tanımlıdır (tek
 * controller). Bozulsaydı `summary` bir UUID sanılır ve **422** dönerdi —
 * duvar boş kalır, hiçbir test kırmızı yanmazdı. Bir entegrasyon testi bunu
 * kilitliyor.
 */

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

export function listFeedback(params: {
  limit: number;
  offset: number;
  /**
   * Puan bandı filtresi — ekranın "düşük / orta / yüksek" şeridi.
   *
   * ⚠️ ANLAMSAL ARAMA DEĞİL (ADR-0011, onuncu kez): bu bir LİSTE FİLTRESİDİR.
   * Yorum metni üzerinde arama YOKTUR — ne anlamsal ne klasik. Anlamsal arama
   * `POST /ask`in işidir.
   */
  minRating?: number;
  maxRating?: number;
}): Promise<FeedbackListResponse> {
  return apiFetch(`/feedback?${query(params)}`, feedbackListResponseSchema);
}

/**
 * Duvarın özeti (§9).
 *
 * ⚠️ `average` `null` DÖNEBİLİR ve bu bir hata DEĞİLDİR: `count = 0` iken
 * ortalama YOKTUR (§9.1). Çağıran bunu `0` sanıp basmamalıdır — tip zaten
 * buna izin vermiyor.
 *
 * ⚠️ AYRI BİR İSTEKTİR ve bu, `SuppliersWall`ın "veriyi çağırandan al"
 * kararından BİLİNÇLİ SAPMADIR: oradaki uydular yalnızca GÖRÜNEN SAYFAYI
 * sayıyordu ("bu sayfada"). Burada ortalama SAYFAYA BAĞLI OLAMAZ — kullanıcı
 * 20 kayıtlık sayfayı görür, ortalama 200 kaydın değil o 20'nin ortalaması
 * olurdu ve hata SESSİZ kalırdı.
 */
export function getFeedbackSummary(): Promise<FeedbackSummary> {
  return apiFetch('/feedback/summary', feedbackSummarySchema);
}

export function getFeedback(id: string): Promise<FeedbackResponse> {
  return apiFetch(`/feedback/${id}`, feedbackResponseSchema);
}

export function createFeedback(body: CreateFeedbackRequest): Promise<FeedbackResponse> {
  return apiFetch('/feedback', feedbackResponseSchema, { body });
}

/**
 * Kaydı SİLER — `owner`/`admin` (§5).
 *
 * ⚠️ GERÇEK bir `DELETE`, "soft-delete" DEĞİL: silinmesi İSTENEN kişisel veri
 * tabloda kalmaz. ⚠️ Vektör de gider (`embedding` aynı satırda yaşar), yani
 * kayıt AI'ın hafızasından da silinir.
 */
export function deleteFeedback(id: string): Promise<void> {
  return apiSend(`/feedback/${id}`, { method: 'DELETE' });
}

/**
 * Vektörleri onarır.
 *
 * ⚠️ Gövde BOŞTUR ve bir hedef parametresi TAŞIMAZ: bu modülde BAYATLAMA
 * PENCERESİ YOKTUR (§4) — başlığın üç bileşeni de (tarih · puan · kanal)
 * değiştirilemez. Tedarikçi'nin `supplierId` parametresi burada GEREKMİYOR.
 */
export function reindexFeedback(): Promise<ReindexFeedbackResponse> {
  return apiFetch('/feedback/reindex', reindexFeedbackResponseSchema, { body: {} });
}
