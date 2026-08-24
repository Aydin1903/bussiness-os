import { EmployeesListScreen } from '@/components/hr/employees-list-screen';

/**
 * `/app/hr` — İK odasının TEK çalışma yüzeyi (ADR-0043 §10).
 *
 * ⚠️ İkinci bir rota YOKTUR ve bu bilinçlidir: Tedarikçi'de iki yüzey vardı
 * (firmalar + görüşmeler) çünkü iki ayrı kayıt akışı vardı. Burada ücret
 * defteri AYRI BİR ODA DEĞİL, çalışanın DETAYININ bir bölümüdür — ve ayrı bir
 * rota olsaydı `compensation:read` taşımayan kullanıcı için "var ama
 * giremiyorum" diyen bir sekme kalırdı (§4.2'nin tersi).
 */
export default function HrPage() {
  return <EmployeesListScreen />;
}
