import {
  salesDocumentListResponseSchema,
  salesDocumentViewSchema,
  type CreateInvoiceRequest,
  type CreateQuoteRequest,
  type DecideQuoteRequest,
  type SalesDocumentKind,
  type SalesDocumentListResponse,
  type SalesDocumentStatus,
  type SalesDocumentView,
  type UpdateInvoiceRequest,
  type UpdateQuoteRequest,
} from '@business-os/contracts';

import { apiFetch, apiSend } from './client';
import { apiBaseUrl } from './config';
import { getAccessToken } from '../session/session-store';

/**
 * Teklif / Fatura uçları (ADR-0041 §9) — ON DÖRT uç.
 *
 * `suppliers.ts` / `inventory.ts` ile aynı desen: her yanıt şemayla DOĞRULANIR.
 *
 * ============================================================================
 * ⚠️ TÜR ROTADA TAŞINIR — ve bu bir tercih değil, sunucunun sözleşmesi
 * ============================================================================
 * Sunucuda `kind` SORGUNUN İÇİNDEDİR: `/quotes/:id` bir fatura id'si için
 * `null` döner ve 404'e çevrilir (§ `SalesDocumentNotFoundError`). Amaç bir
 * sızıntıyı kapatmak: `invoice:read` TAŞIMAYAN biri `/quotes/<fatura-id>` ile
 * bir faturanın VAR OLDUĞUNU yoklayabilirdi.
 *
 * Doğrudan sonucu arayüzdedir: bir belgeyi türünü bilmeden açamayız. "Önce
 * teklif dene, olmazsa fatura" YAZILMADI — o, her fatura açılışında kasıtlı
 * bir 404 üretmek ve sunucunun kapattığı ayrımı istemcide GERİ AÇMAK olurdu.
 *
 * ============================================================================
 * ⚠️ BU DOSYADA OLMAYAN ŞEYLER
 * ============================================================================
 *   1. `reindex` YOK — bu modül embedding üretmez (§5).
 *   2. Satır bazlı `updateLine`/`deleteLine` YOK (§2) — kalemler belgenin
 *      BÜTÜNÜ olarak yazılır; değiştirilebilirliğin tek kapısı BELGENİN
 *      DURUMUDUR.
 *   3. Toplamı hesaplayan hiçbir yardımcı YOK. Toplamlar sunucudan `totals`
 *      olarak gelir (§1.3) — istemcide ikinci bir aritmetik, satır bazında
 *      yuvarlama kuralının İKİNCİ uygulaması olurdu ve SESSİZCE ayrışırdı.
 */

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

/** `quote` → `quotes`, `invoice` → `invoices`. */
function segment(kind: SalesDocumentKind): string {
  return kind === 'quote' ? 'quotes' : 'invoices';
}

// ============================================================================
// Okuma
// ============================================================================

export function listDocuments(params: {
  kind: SalesDocumentKind;
  limit: number;
  offset: number;
  status?: SalesDocumentStatus;
}): Promise<SalesDocumentListResponse> {
  const search = query({
    limit: params.limit,
    offset: params.offset,
    status: params.status,
  });

  return apiFetch(`/invoicing/${segment(params.kind)}?${search}`, salesDocumentListResponseSchema);
}

export function getDocument(kind: SalesDocumentKind, id: string): Promise<SalesDocumentView> {
  return apiFetch(`/invoicing/${segment(kind)}/${id}`, salesDocumentViewSchema);
}

// ============================================================================
// Yazma — YALNIZCA TASLAK (§2)
// ============================================================================

export function createQuote(body: CreateQuoteRequest): Promise<SalesDocumentView> {
  return apiFetch('/invoicing/quotes', salesDocumentViewSchema, { method: 'POST', body });
}

export function createInvoice(body: CreateInvoiceRequest): Promise<SalesDocumentView> {
  return apiFetch('/invoicing/invoices', salesDocumentViewSchema, { method: 'POST', body });
}

/**
 * ⚠️ Gönderilmiş/kesilmiş belgede **409** döner (§2).
 *
 * Arayüz bu hataya ÇARPMAMALIDIR: düzenleme alanları o durumda hiç
 * açılmaz (`document-detail-screen.tsx`). Buradaki 409 bir SAVUNMA
 * KATMANIDIR — iki sekmede açık bir belgede biri gönderirse diğeri hâlâ
 * taslak sanır.
 */
export function updateQuote(id: string, body: UpdateQuoteRequest): Promise<SalesDocumentView> {
  return apiFetch(`/invoicing/quotes/${id}`, salesDocumentViewSchema, { method: 'PATCH', body });
}

export function updateInvoice(id: string, body: UpdateInvoiceRequest): Promise<SalesDocumentView> {
  return apiFetch(`/invoicing/invoices/${id}`, salesDocumentViewSchema, {
    method: 'PATCH',
    body,
  });
}

/** ⚠️ Yalnızca TASLAK silinir; gönderilmişin karşılığı `rejected`/`cancelled`. */
export function deleteDocument(kind: SalesDocumentKind, id: string): Promise<void> {
  return apiSend(`/invoicing/${segment(kind)}/${id}`, { method: 'DELETE' });
}

// ============================================================================
// Durum geçişleri
// ============================================================================

/**
 * Teklifi GÖNDERİLDİ işaretler; numara SUNUCUDA üretilir (§1.6).
 *
 * ⚠️ SİSTEM E-POSTA ATMAZ: `sent`, kullanıcının BEYANIDIR — _"bu belgeyi
 * müşteriye ilettim"_. Arayüz bunu açıkça yazar; aksi halde kullanıcı
 * sistemin bir şey gönderdiğini sanırdı.
 */
export function sendQuote(id: string): Promise<SalesDocumentView> {
  return apiFetch(`/invoicing/quotes/${id}/send`, salesDocumentViewSchema, { method: 'POST' });
}

export function decideQuote(id: string, body: DecideQuoteRequest): Promise<SalesDocumentView> {
  return apiFetch(`/invoicing/quotes/${id}/decision`, salesDocumentViewSchema, {
    method: 'POST',
    body,
  });
}

/** Faturayı KESER: numara üretilir ve belge DONAR (§2). */
export function issueInvoice(id: string): Promise<SalesDocumentView> {
  return apiFetch(`/invoicing/invoices/${id}/issue`, salesDocumentViewSchema, { method: 'POST' });
}

/** ⚠️ SATIR DURUR, silinmez — numarası da durur (§1.6). */
export function cancelInvoice(id: string): Promise<SalesDocumentView> {
  return apiFetch(`/invoicing/invoices/${id}/cancel`, salesDocumentViewSchema, {
    method: 'POST',
  });
}

/**
 * Kabul edilen teklifi YENİ BİR FATURA TASLAĞINA dönüştürür (§3).
 *
 * ⚠️ TEKLİFE TEK KOLON YAZILMAZ. Dönen şey YENİ belgedir; çağıran ona
 * yönlendirir ve teklif sayfası olduğu gibi kalır.
 */
export function convertQuote(id: string): Promise<SalesDocumentView> {
  return apiFetch(`/invoicing/quotes/${id}/convert`, salesDocumentViewSchema, { method: 'POST' });
}

// ============================================================================
// PDF
// ============================================================================

/**
 * Belgeyi PDF olarak indirir.
 *
 * ============================================================================
 * ⚠️ NEDEN DÜZ BİR `<a href>` DEĞİL
 * ============================================================================
 * Uç `quote:read` / `invoice:read` ister ve yetki `Authorization: Bearer`
 * başlığıyla taşınır — bir `<a>` etiketi o başlığı GÖNDEREMEZ. `downloadDocument`
 * (Belge modülü) ile aynı gerekçe ve aynı çözüm: `fetch` → `blob:` → tetikleme.
 *
 * ⚠️ İmzalı URL bu sorunu çözerdi ve ADR-0037 §5.4'te BİLİNÇLİ olarak
 * reddedildi.
 *
 * ⚠️ `URL.revokeObjectURL` ÇAĞRILMAK ZORUNDA.
 *
 * ⚠️ PDF SUNUCUDA SAKLANMAZ (§6.3): her istek onu YENİDEN ÜRETİR. Bunun
 * arayüz tarafındaki tek sonucu, indirmenin bir dosya kopyalamaktan biraz
 * daha uzun sürebilmesidir.
 */
export async function downloadDocumentPdf(
  kind: SalesDocumentKind,
  id: string,
  filename: string,
): Promise<void> {
  const accessToken = getAccessToken();

  const response = await fetch(`${apiBaseUrl()}/invoicing/${segment(kind)}/${id}/pdf`, {
    headers: accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  });

  if (!response.ok) {
    // `toApiError` kullanılmıyor: gövde bir PDF olabilir ve onu JSON diye
    // okumak yanıltıcı bir hata üretirdi.
    throw new Error(`Belge indirilemedi (HTTP ${String(response.status)}).`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  try {
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    window.document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
