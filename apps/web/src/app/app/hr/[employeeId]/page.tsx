import { EmployeeDetailScreen } from '@/components/hr/employee-detail-screen';

/**
 * `/app/hr/<id>` — çalışan detayı.
 *
 * ⚠️ Detayın DUVARI YOKTUR (ADR-0038): özetlenecek bir durum değil, tek bir
 * kayıt var. Beş modülde de aynı karar.
 */
export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;

  return <EmployeeDetailScreen employeeId={employeeId} />;
}
