import {
  documentListResponseSchema,
  documentResultSchema,
  documentRowSchema,
  reindexDocumentsResponseSchema,
  type DocumentListResponse,
  type DocumentResult,
  type DocumentRow,
  type ReindexDocumentsResponse,
  type UpdateDocumentRequest,
} from '@business-os/contracts';

import { apiFetch, apiSend } from './client';
import { apiBaseUrl } from './config';
import { getAccessToken } from '../session/session-store';

/**
 * Belge uçları (ADR-0037 §10) — SEKİZ uç.
 *
 * `appointments.ts` / `finance.ts` ile aynı desen: her yanıt şemayla
 * DOĞRULANIR, sorgu dizesi tek bir yardımcıdan üretilir ve `undefined`
 * parametreler düşer.
 *
 * ⚠️ İKİ UÇ BU DESENDEN AYRILIR ve ikisi de bu modülle geldi:
 *   - yükleme/dosya değişimi `FormData` gönderir (JSON değil),
 *   - indirme bir GÖVDE değil bir DOSYA döndürür (şema doğrulaması yok).
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

export function listDocuments(params: {
  limit: number;
  offset: number;
  label?: string;
  contactId?: string;
  projectId?: string;
}): Promise<DocumentListResponse> {
  return apiFetch(`/documents?${query(params)}`, documentListResponseSchema);
}

export function getDocument(id: string): Promise<DocumentRow> {
  return apiFetch(`/documents/${id}`, documentRowSchema);
}

/**
 * Belge yükler — `multipart/form-data`.
 *
 * ⚠️ ALANLAR YALNIZCA DOLU İSE EKLENİR. `FormData`da her değer bir DİZEDİR;
 * boş bir `contactId` göndermek sunucuda `''` olarak görünürdü ve DTO onu
 * "verilmedi"ye çeviriyor olsa bile (`optionalFormText`), niyetimizi gövdede
 * açıkça yazmak daha az varsayım taşır.
 *
 * ⚠️ `content-type` ELLE YAZILMAZ — gerekçe `client.ts`te.
 */
export function uploadDocument(input: {
  file: File;
  label?: string;
  contactId?: string;
  projectId?: string;
}): Promise<DocumentResult> {
  const body = new FormData();
  body.set('file', input.file);
  if (input.label !== undefined && input.label !== '') {
    body.set('label', input.label);
  }
  if (input.contactId !== undefined && input.contactId !== '') {
    body.set('contactId', input.contactId);
  }
  if (input.projectId !== undefined && input.projectId !== '') {
    body.set('projectId', input.projectId);
  }

  return apiFetch('/documents', documentResultSchema, { body });
}

/**
 * Dosyayı DEĞİŞTİRİR — versiyon açmaz (ADR-0037 §7).
 *
 * ⚠️ Eski dosya GERİ GETİRİLEMEZ: eski nesne silinir ve parçalar tümüyle
 * yeniden üretilir. Arayüz bu yüzden onay ister.
 */
export function replaceDocumentFile(id: string, file: File): Promise<DocumentResult> {
  const body = new FormData();
  body.set('file', file);

  return apiFetch(`/documents/${id}/file`, documentResultSchema, { method: 'PUT', body });
}

/** ⚠️ Gövdede `null` = TEMİZLE, alan yok = DOKUNMA (ADR-0037 §10). */
export function updateDocument(id: string, body: UpdateDocumentRequest): Promise<DocumentResult> {
  return apiFetch(`/documents/${id}`, documentResultSchema, { method: 'PATCH', body });
}

export function deleteDocument(id: string): Promise<void> {
  return apiSend(`/documents/${id}`, { method: 'DELETE' });
}

/** Parçasız belgeleri onarır — oran sınırı yazma yoluyla ORTAK. */
export function reindexDocuments(): Promise<ReindexDocumentsResponse> {
  return apiFetch('/documents/reindex', reindexDocumentsResponseSchema, { body: {} });
}

/**
 * Dosyayı indirir.
 *
 * ============================================================================
 * ⚠️ NEDEN DÜZ BİR `<a href>` DEĞİL
 * ============================================================================
 * İndirme ucu `document:read` ister ve yetki `Authorization: Bearer`
 * başlığıyla taşınır — bir `<a>` etiketi o başlığı GÖNDEREMEZ. Tarayıcının
 * doğrudan gideceği bir bağlantı 401 alırdı.
 *
 * İmzalı (presigned) URL bu sorunu çözerdi ve ADR-0037 §5.4'te BİLİNÇLİ
 * OLARAK reddedildi: erişim kararını policy engine'den çıkarıp paylaşılabilir
 * bir dizeye devrederdi. Dolayısıyla dosya `fetch` ile alınır, bir `blob:`
 * URL'ine çevrilir ve indirme oradan tetiklenir.
 *
 * ⚠️ `URL.revokeObjectURL` ÇAĞRILMAK ZORUNDA: çağrılmazsa blob sekme
 * kapanana kadar bellekte kalır ve 20 MB'lik dosyalarda bu görünür bir
 * sızıntıdır.
 *
 * ⚠️ Bu fonksiyon şema DOĞRULAMAZ — dönen şey JSON değil, dosyanın kendisidir.
 * `apiFetch` kullanılamamasının sebebi budur.
 */
export async function downloadDocument(id: string, filename: string): Promise<void> {
  const accessToken = getAccessToken();

  const response = await fetch(`${apiBaseUrl()}/documents/${id}/content`, {
    headers: accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  });

  if (!response.ok) {
    // `toApiError` burada kullanılmıyor: gövde bir dosya olabilir ve onu JSON
    // diye okumak yanıltıcı bir hata üretirdi. Çağıran tarafta `errorMessage`
    // genel metni gösterir.
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
