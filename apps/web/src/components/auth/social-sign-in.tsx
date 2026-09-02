'use client';

import { useEffect, useState } from 'react';

import { listOAuthProviders, oauthStartUrl } from '@/lib/api/oauth';

import { PROVIDER_MARKS } from './provider-marks';

/**
 * Sosyal giriş düğmeleri — ADR-0053 §9.
 *
 * ============================================================================
 * ⚠️ YALNIZCA `login` VE `register` EKRANLARINDA (ADR-0053 §11)
 * ============================================================================
 * Diğer beş auth ekranında ÇAĞRILMAZ ve bu bir eksiklik değil bir karardır:
 * `verify-email`/`forgot`/`reset` parola akışının ONARIM ekranlarıdır (federe
 * kullanıcı oraya hiç gelmemelidir), `create-tenant`/`select-tenant` ise
 * kullanıcının ZATEN kimlik doğrulamış olduğu yerlerdir — orada bir "giriş yap"
 * düğmesi anlamsızdır.
 *
 * ============================================================================
 * ⚠️ LİSTE SUNUCUDAN GELİR, SABİT KODLANMAZ (§9.4)
 * ============================================================================
 * Bugün yalnızca Google yapılandırılı; `GET /auth/oauth/providers`
 * `{"providers":["google"]}` döner. Microsoft/LinkedIn/Facebook yapılandırıldığı
 * gün ⚠️ **BU DOSYAYA DOKUNULMAZ** — sunucu listeye ekler, düğme kendiliğinden
 * çıkar. Sıra da sunucudan gelir (§9.3: yaygın kullanım sırası) ve burada
 * yeniden SIRALANMAZ.
 *
 * Sabit kodlansaydı, yapılandırılmamış bir sağlayıcının düğmesi ekranda durur
 * ve tıklanınca **404** verirdi — ADR-0052 §6.1'in açıkça reddettiği şey.
 *
 * ============================================================================
 * ⚠️ HİÇBİR ŞEY YOKSA HİÇBİR ŞEY ÇİZİLMEZ
 * ============================================================================
 * Liste boşsa (hiçbir sağlayıcı yapılandırılmamış) ne ayraç ne düğme ne de bir
 * YER TUTUCU render edilir — bileşen `null` döner. ADR-0052 §6.1'in kuralı:
 * _"yer de AYRILMAZ; boş bir alan bırakıp 'buraya gelecek' demek aynı şeyin
 * daha sessiz hâlidir."_ Aynı disiplin yükleme ve hata durumları için de
 * geçerlidir: istek bitene kadar da, başarısız olursa da **hiçbir şey yoktur**.
 *
 * ⚠️ Bu, ADR-0043'ün ücret bölümü dersiyle aynı sınıftır: _"görünmüyor" değil,
 * "hiç yok"_ — bileşen koşullu MOUNT edilir, içinde bir "gizle" dalı yoktur.
 * ============================================================================
 */
export function SocialSignIn({ next }: { readonly next?: string | undefined }) {
  const [providers, setProviders] = useState<readonly string[]>([]);

  useEffect(() => {
    let cancelled = false;

    listOAuthProviders()
      .then((response) => {
        if (!cancelled) {
          setProviders(response.providers);
        }
      })
      .catch(() => {
        /*
         * ⚠️ SESSİZCE BOŞ KALIR — ve bu bilinçlidir. Bu istek giriş ekranının
         * ÇEKİRDEK işlevi değildir; başarısızlığında kullanıcıya bir hata
         * göstermek, e-posta+parola ile girmek üzere gelmiş birini olmayan bir
         * sorunla meşgul ederdi. Birincil yol çalışmaya devam eder.
         */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ⚠️ Sözlükte karşılığı olmayan anahtar ÇİZİLMEZ: sunucu bizden önce yeni bir
  // sağlayıcı eklerse ekran bozulmaz, yalnızca o düğme görünmez (daralma).
  const drawable = providers.filter((key) => PROVIDER_MARKS[key] !== undefined);

  if (drawable.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      {/*
        ⚠️ AYRAÇ BİR SÜS DEĞİL, ADR-0053 §9.2'NİN HAFİFLETMELERİNDEN BİRİ:
        Microsoft'un kılavuzu logonun bir EYLEM İFADESİYLE birlikte
        kullanılmasını ister. Yuvarlak ikon düğmede o ifade görsel olarak yoktur;
        bu satır onu düğmelerin HEMEN ÜSTÜNDE ekrana koyar.
      */}
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-fg-muted">veya şununla devam et</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/*
        ⚠️ TEK SIRA, ORTALANMIŞ (ADR-0053 §9.3). Düğmeler 44 px'tir — mobil
        dokunma hedefi alt sınırı; ADR "40 px, mobilde 44" diyordu, tek bir
        ölçüye çekmek iki ayrı boyut tanımının ayrışma riskini kaldırır ve
        erişilebilirlik tarafında GÜVENLİ olan yönü seçer.
      */}
      <ul className="flex list-none justify-center gap-3 p-0">
        {drawable.map((key) => {
          // Yukarıdaki `filter` tanımlı olduğunu garanti eder; okuyucuya da
          // burada söylenir.
          const mark = PROVIDER_MARKS[key];
          if (mark === undefined) {
            return null;
          }

          return (
            <li key={key}>
              {/*
                ⚠️ `<a>` — `<button>` DEĞİL. Bu bir TAM SAYFA NAVİGASYONUDUR
                (`lib/api/oauth.ts`): `fetch` ile gidilseydi 302 şeffafça
                izlenir, CORS duvarına toslar ve `state` çerezi doğru bağlama
                yazılmazdı. Bağlantı olması ayrıca orta tuşla yeni sekmede
                açmayı ve durum çubuğunda hedefi görmeyi mümkün kılar.
              */}
              <a
                href={oauthStartUrl(key, next)}
                aria-label={mark.label}
                title={mark.label}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-border-strong bg-bg transition-colors hover:bg-fill focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
              >
                <mark.Icon size={20} />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
