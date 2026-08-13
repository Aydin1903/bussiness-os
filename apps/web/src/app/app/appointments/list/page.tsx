import { AppointmentsListScreen } from '@/components/appointments/appointments-list-screen';

/**
 * `/app/appointments/list` — liste + filtreler (tarih aralığı · durum · kişi).
 *
 * Takvim "bu hafta ne var" sorusuna cevap verir; liste "şunu ne zaman
 * yapmıştık / kim gelmedi" sorusuna. İkisi AYNI veriyi farklı soruyla okur —
 * `projects/tasks`'ın ("Yapılacaklar") proje listesinden ayrılmasıyla aynı
 * ayrım.
 */
export default function AppointmentsListPage() {
  return <AppointmentsListScreen />;
}
