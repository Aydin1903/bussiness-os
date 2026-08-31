import { redirect } from 'next/navigation';

/**
 * `/` — GEÇİCİ olarak `/login`'e yönlendirir.
 *
 * ============================================================================
 * ⚠️ NEDEN DEĞİŞTİ: BURASI FAZ 1'İN SAĞLIK SAYFASIYDI VE BİLGİ SIZDIRIYORDU
 * ============================================================================
 * Bu rota Faz 1'den beri bir altyapı doğrulama kartı çiziyordu: servis adı,
 * sürüm, **ortam** (`production`), **uptime** ve **veritabanı gecikmesi**.
 *
 * ⚠️ Ve `middleware.ts`'in kapsamı DIŞINDADIR (`matcher: ['/app/:path*']`) —
 * yani kimliksiz herkese açıktı. Prod'da `SWAGGER_ENABLED=false` ile uç
 * sözleşmesi kasten kapatılmışken, kök rota aynı sistemin çalışma verilerini
 * yayınlıyordu. Bir kapıyı kapatıp yanındaki pencereyi açık bırakmak.
 *
 * ⚠️ Sağlık kontrolü KAYBOLMADI: `GET /api/v1/health` yerinde duruyor ve
 * dağıtım doğrulamasının tek kaynağı zaten odur. Kaldırılan şey ölçüm değil,
 * o ölçümün **kimliksiz bir HTML sayfası olarak yayınlanmasıdır**.
 *
 * ============================================================================
 * ⚠️ `redirect` — `permanentRedirect` DEĞİL, VE BU BİR KARARDIR
 * ============================================================================
 * `redirect()` **307** (geçici) döner; `permanentRedirect()` **308** dönerdi ve
 * 308'i tarayıcılar ile aradaki vekiller **kalıcı olarak önbelleğe alır**.
 *
 * ⚠️ Burası kalıcı bir yönlendirme DEĞİLDİR: `/` yakında **landing page**
 * olacak (ROADMAP §7 — kapı koşulu karşılandı ve iş Faz 6'nın önüne alındı).
 * 308 yazılsaydı, landing page yayına alındığı gün daha önce siteye girmiş
 * her tarayıcı **hâlâ `/login`'e gitmeye devam ederdi** ve hata SESSİZ olurdu:
 * sunucu doğru sayfayı sunar, istemci onu hiç istemez. Önbelleği temizlemek
 * kullanıcının elindedir, bizim değil.
 *
 * ⚠️ Bu dosya bir LANDING PAGE DEĞİLDİR ve öyle sunulmamalıdır — pazarlama
 * içeriği, SEO ve marka anlatısı ROADMAP §7'nin işidir. Buradaki tek iddia:
 * kök rota artık bilgi sızdırmıyor.
 *
 * ⚠️ Oturumu açık bir kullanıcı da `/login`'e düşer. Bilinçli: `bo_session_hint`
 * çerezine bakıp `/app`'e dallanmak MÜMKÜNDÜR ama o çerez bir GÜVENLİK SINIRI
 * DEĞİLDİR (FRONTEND §3.2) ve geçici bir yönlendirmeye ikinci bir dal koymak,
 * landing page geldiğinde silinecek bir mantık üretirdi.
 */
export default function RootPage(): never {
  redirect('/login');
}
