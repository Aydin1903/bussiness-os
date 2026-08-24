import { EmployeesListScreen } from '@/components/hr/employees-list-screen';

/**
 * `/app/hr` — İK odasının BİRİNCİ çalışma yüzeyi (ADR-0043 §10).
 *
 * ⚠️ **Bu yorum ADR-0044 ile GÜNCELLENDİ.** v1'de "ikinci bir rota YOKTUR"
 * yazıyordu ve gerekçesi ÜCRETE ÖZGÜYDÜ: ücret defteri ayrı bir rota olsaydı
 * `compensation:read` taşımayan kullanıcı için "var ama giremiyorum" diyen bir
 * sekme kalırdı (§4.2'nin tersi). ⚠️ **O gerekçe hâlâ geçerlidir ve ücret
 * defteri hâlâ çalışanın DETAYININ bir bölümüdür.**
 *
 * İkinci rota (`/app/hr/leave`) BAŞKA bir gerekçeyle açıldı: `leave:read`
 * DÖRT ROLE de açıktır (kapalı kapı yok) ve İK'cının günlük sorusu — _"onay
 * bekleyen izin var mı"_ — çalışan listesinden CEVAPLANAMAZ.
 */
export default function HrPage() {
  return <EmployeesListScreen />;
}
