'use client';

import {
  DOCUMENT_TYPE_LABELS,
  MAX_DOCUMENT_BYTES,
  type DocumentMimeType,
} from '@business-os/contracts';

/**
 * Belge modülünün KENDİNE ÖZGÜ kabuk parçaları.
 *
 * Oda, tezgah, kart, boş durum ve sayfalayıcı `room` ve `module-kit`ten gelir
 * — hiçbiri kopyalanmadı. Burada yalnızca bu modülün SÖZLÜĞÜ var.
 *
 * ⚠️ SEKME ŞERİDİ YOK. CRM · Projeler · Randevu birden çok rotaya sahipti ve
 * bir şerit taşıyordu; Belge'nin tek liste rotası + detay sayfaları var. Tek
 * sekmeli bir şerit, hiyerarşi hakkında yalan söyleyen boş bir süs olurdu.
 */

/**
 * İstemci ön kontrolü — YÜKLEME ve DEĞİŞTİRME akışlarının ORTAK kuralı.
 *
 * ============================================================================
 * ⚠️ BU BİR DOĞRULAMA DEĞİL, BİR KOLAYLIKTIR
 * ============================================================================
 * Tür tespiti sunucuda İÇERİKTEN yapılır (ADR-0037 §6.1) ve son sözü o söyler:
 * `sozlesme.pdf` adlı bir dosya PDF olmak zorunda değildir. Buradaki kontrol
 * yalnızca kullanıcıyı BEKLEMEKTEN kurtarır — 20 MB'lik bir dosyayı yükleyip
 * **413** almak, dakikalarca süren bir yüklemeyi çöpe atmaktır.
 *
 * ⚠️ TEK YERDE durur çünkü İKİ akış kullanıyor (yükleme + dosya değiştirme).
 * İki yere kopyalansaydı biri değiştiğinde diğeri sessizce ayrışırdı ve
 * kullanıcı iki ekranda İKİ FARKLI sınır görürdü.
 *
 * @returns hata mesajı, ya da dosya kabul edilebiliyorsa `null`.
 */
export function validateDocumentFile(file: File): string | null {
  const name = file.name.toLocaleLowerCase('tr');
  if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
    return DOCUMENT_STATUS_MESSAGES[415] ?? null;
  }

  if (file.size > MAX_DOCUMENT_BYTES) {
    return DOCUMENT_STATUS_MESSAGES[413] ?? null;
  }

  return null;
}

/**
 * Sunucunun ürettiği mesaj gelmezse kullanılacak yedekler (ADR-0037 §9).
 *
 * ⚠️ Bunlar İKİNCİ SIRADADIR: backend 413/415/422'de zaten anlaşılır bir metin
 * üretiyor ve arayüz onu EZMEZ (`errorMessage` önce gövdeyi okur). Bu sözlük
 * yalnızca gövdesiz bir cevap geldiğinde devreye girer.
 *
 * ⚠️ Aynı zamanda `validateDocumentFile`in kaynağıdır: istemcinin önden
 * gösterdiği mesaj ile sunucunun döndürdüğü mesaj AYNI cümle olsun diye. İki
 * ayrı metin, aynı kuralı iki farklı şekilde anlatırdı.
 */
export const DOCUMENT_STATUS_MESSAGES: Readonly<Record<number, string>> = {
  413: `Dosya çok büyük. En fazla ${formatBytes(MAX_DOCUMENT_BYTES)} olabilir.`,
  415: 'Yalnızca PDF ve Word (.docx) dosyaları yüklenebilir.',
  422: 'Belge çok uzun; arama için parçalanamadı. Belgeyi bölerek yükleyin.',
  429: 'Saatlik yükleme hakkınız doldu. Bir süre sonra tekrar deneyin.',
};

/** Bayt → insan okunur boyut. Para değil, dolayısıyla `number` MEŞRUDUR. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(0)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** Tür rozeti — PDF / Word. */
export function TypePill({ mimeType }: { mimeType: DocumentMimeType }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border-strong bg-fill px-2 py-[2px] text-[10.5px] font-semibold tracking-[0.01em] text-fg-2">
      {DOCUMENT_TYPE_LABELS[mimeType]}
    </span>
  );
}

/**
 * ARAMA DURUMU rozeti — ADR-0037 §6.3'ün EKRANDAKİ KARŞILIĞI.
 *
 * ============================================================================
 * ⚠️ BU BİLEŞEN BİR SÜSLEME DEĞİL, ADR'NİN AÇIK BİR YÜKÜMLÜLÜĞÜDÜR
 * ============================================================================
 * ADR-0037 §6.3: _"Sessiz olmamasını sağlayan şey `chunkCount: 0`ın açıkça
 * dönmesidir ve arayüz bunu GÖRÜNÜR KILMAK ZORUNDADIR. O cümle yazılmazsa
 * karar sessiz başarısızlığa döner: kullanıcı sözleşmesini yüklediğini sanır,
 * aylar sonra aradığında bulamaz ve sebebini asla öğrenemez."_
 *
 * Yani `chunkCount: 0` bir hata DEĞİLDİR (taranmış PDF'te metin gerçekten
 * yoktur) ama SÖYLENMESİ gereken bir durumdur.
 *
 * ⚠️ RENK TEK BİLGİ TAŞIYICISI DEĞİL (FRONTEND §4.8 — renk körlüğü): rozet
 * ayrıca METNİ yazar ("Aranamıyor" / "N parça").
 */
export function IndexPill({ chunkCount }: { chunkCount: number }) {
  if (chunkCount === 0) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-danger/30 bg-danger/10 px-2 py-[2px] text-[10.5px] font-semibold tracking-[0.01em] text-danger"
        title="Belgenin metni okunamadı; içeriği aramalarda bulunamaz."
      >
        Aranamıyor
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-accent/30 bg-tint px-2 py-[2px] text-[10.5px] font-semibold tracking-[0.01em] text-ink">
      {chunkCount} parça
    </span>
  );
}

/**
 * "Metni okunamadı" açıklaması — rozetin yanına DEĞİL, kaydın altına.
 *
 * Rozet durumu SÖYLER; bu satır NE YAPILACAĞINI söyler. İkisini ayırmak
 * bilinçli: listede yer kaplamadan uyarmak, detayda ise tam açıklamayı vermek
 * gerekiyor.
 */
export function UnsearchableNote({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`text-[11.5px] leading-[1.6] text-fg-3 ${compact ? '' : 'mt-1'}`}>
      Bu belgenin metni okunamadı — taranmış (yalnızca görüntü içeren) bir dosya olabilir. Belge
      saklandı ve indirilebilir, ancak <strong>içeriği aramalarda bulunamaz</strong>.
    </p>
  );
}
