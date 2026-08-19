import { DocumentsListScreen } from '@/components/documents/documents-list-screen';

/**
 * `/app/documents` — arşivin tek listesi (ADR-0037 §11).
 *
 * ⚠️ İKİNCİ BİR ROTA YOK ve bu bilinçli: CRM · Projeler · Randevu birden çok
 * görünüm taşıyordu (pipeline, görevler, takvim/liste). Bir arşivin tek
 * sorusu vardır — "hangi belge nerede" — ve onu filtreler cevaplar.
 */
export default function DocumentsPage() {
  return <DocumentsListScreen />;
}
