/**
 * Sosyal giriş sağlayıcılarının MARKA İŞARETLERİ (ADR-0053 §9).
 *
 * ============================================================================
 * ⚠️ BU DOSYA BİZİM TASARIM SİSTEMİMİZE AİT DEĞİLDİR
 * ============================================================================
 * ADR-0052 §6.2: _"Her sağlayıcının kendi marka kılavuzu; bizim tasarım
 * sistemimize uydurulmaz."_ Buradaki hiçbir renk ODA token'ı (`--accent`,
 * `--ai-accent`) DEĞİLDİR ve olmamalıdır — işaretler sağlayıcının kendi
 * kılavuzundaki sabit değerlerdir.
 *
 * ⚠️ Bu, ADR-0038'in dil sınırını DELMEZ: sınırın dışında bir bölgedir.
 * Terracotta hâlâ yalnızca AI'ın sesidir; modül renkleri hâlâ modüllerindir.
 *
 * ============================================================================
 * ⚠️ GOOGLE — "G" İŞARETİ DEĞİŞTİRİLEMEZ
 * ============================================================================
 * Google'ın marka kılavuzu üç şeyi açıkça yasaklar: (1) `G`nin boyut veya
 * RENGİNİ değiştirmek, (2) siyah-beyaz sürüm kullanmak, (3) standart renkli
 * `G`yi standart olmayan bir zemine koymak. Bu yüzden dört resmi renk
 * (#4285F4 · #34A853 · #FBBC05 · #EA4335) burada SABİTTİR ve tema
 * değiştiğinde bile değişmez — değişen yalnızca ETRAFINDAKİ düğmedir
 * (`social-sign-in.tsx`).
 *
 * ⚠️ Ayrıca kılavuz `G`yi **çerçevesiz ve metinsiz** kullanmayı yasaklar; bu
 * yüzden işaret her zaman bir düğme sınırının İÇİNDE çizilir — Google'ın
 * yayınladığı "icon mode" varlığının yaptığı şeyin aynısı.
 * ============================================================================
 */

/**
 * Google `G` — resmi dört renkli işaret.
 *
 * ⚠️ `viewBox` 48×48'dir ve yol verileri Google'ın yayınladığı varlığın
 * ölçüsüyle birebir aynıdır; ölçekleme `width`/`height` ile yapılır, yollar
 * DEĞİŞTİRİLMEZ (en-boy oranı korunur, kılavuzun koşulu).
 */
export function GoogleMark({ size = 18 }: { readonly size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

/**
 * Microsoft — dört kareli logo.
 *
 * ⚠️ RESMİ RENKLER SABİTTİR ve temayla değişmez: #F25022 (kırmızı, sol üst) ·
 * #7FBA00 (yeşil, sağ üst) · #00A4EF (mavi, sol alt) · #FFB900 (sarı, sağ alt).
 * Sıra da sabittir; yer değiştirmek logoyu **yeniden çizmek** olurdu.
 *
 * ⚠️ BU İŞARET BİR SAPMA İÇİNDE KULLANILIYOR (ADR-0053 §9.2, PO Kalem D):
 * Microsoft'un kılavuzu logonun _"Sign in with Microsoft"_ **terimleriyle
 * birlikte** kullanılmasını şart koşar ve yayınlanan varlıkların hepsi
 * **dikdörtgendir** — ikon-modu varlık **yoktur**. Yuvarlak yalnızca-ikon
 * düğme bu şartı görsel olarak karşılamaz.
 *
 * ⚠️ Hafifletmeler (uyum DEĞİL): erişilebilir ad tam ifadeyi taşır
 * (`PROVIDER_MARKS.microsoft.label`), düğmelerin hemen üstünde _"veya şununla
 * devam et"_ eylem ifadesi durur, ve logo hiçbir şekilde değiştirilmez.
 * ⚠️ Geri dönüş yolu ADR'de yazılıdır: itiraz gelirse **satırın tamamı** resmi
 * dikdörtgen varlıklara geçer — tek bir düğme sıradan çıkarılmaz.
 */
export function MicrosoftMark({ size = 18 }: { readonly size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 23 23"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

/**
 * LinkedIn — `[in]` işareti.
 *
 * ============================================================================
 * ⚠️ BU, SETİN EN GENİŞ SAPMASIDIR — VE 2026-09-03'TE YENİDEN ÖLÇÜLDÜ
 * ============================================================================
 * ADR-0053 §9.1 LinkedIn için _"pratikte hayır"_ yazmıştı. Güncel kılavuz
 * ölçüldüğünde konum **biraz daha ağırlaştı** (ADR-0053 §9.1'e not düşüldü):
 *
 *   - brand.linkedin.com yalnızca **iki** varlık yayınlar: `[in]` logosu ve
 *     LinkedIn wordmark'ı. ⚠️ Bir **"Sign In with LinkedIn" düğme varlık seti
 *     YOKTUR**; güncel OIDC geliştirici dokümanında bir branding bölümü de yok
 *     (düğme paragrafı deprecated v1 sayfasında kalmış).
 *   - ⚠️ `[in]` logosunun **izin verilen kullanım listesinde sign-in ARTIK
 *     GEÇMEZ**: profil/şirket/grup bağlantısı, kartvizit, e-posta imzası,
 *     sosyal ikon serisi, API geliştiricileri için paylaş/takip widget'ı.
 *   - Açık yasaklar: _"Modify the color or the shape"_ · _"Combine … with any
 *     other symbol, logo, words, images, or designs"_ · ⚠️ _"Never attempt to
 *     recreate the logo — always use the artwork provided."_
 *
 * ⚠️ Yani sapma **iki katmanlıdır** ve ikisi de kayda geçirilmiştir:
 *   (1) resmi düğme varlığı kullanılmıyor (yuvarlak ikon düğme),
 *   (2) ⚠️ bu SVG **elle çizilmiştir** — _"recreate"_ yasağının tam hedefi.
 *
 * ⚠️ Yuvarlak **düğme** logonun şeklini değiştirmez (Google'ın kendi "icon
 * mode" savunması da budur) — ama yukarıdaki (2) bu savunmanın dışındadır.
 * Karar ve riski PO'ya aittir (Kalem D, onaylı); geri dönüş yolu ADR-0053
 * §9.2'dedir.
 *
 * ⚠️ Renk: kılavuzun tercih ettiği **beyaz zeminde mavi** (#0A66C2). Tema
 * değiştiğinde bile değişmez; değişen yalnızca ETRAFINDAKİ düğmedir.
 */
export function LinkedInMark({ size = 18 }: { readonly size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#0A66C2"
        d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z"
      />
    </svg>
  );
}

/**
 * Facebook — ⚠️ **DAİRESEL ROZETİN TAMAMI**, çıplak `f` DEĞİL.
 *
 * ⚠️ Meta'nın kılavuzu logonun _"eksiksiz ve değiştirilmemiş"_ kullanılmasını
 * şart koşar ve **çıplak `f` YASAKTIR**. Bu yüzden işaret her zaman mavi daire
 * (#1877F2) + beyaz `f` olarak, **tek parça** çizilir; düğmenin kendi kenarlığı
 * onun yerini tutmaz.
 *
 * ⚠️ Biçim açısından Facebook **tam uyumludur** (logo zaten daireseldir) —
 * Microsoft ve LinkedIn'in aksine burada bir sapma **yoktur**.
 *
 * ⚠️ Ama davranış açısından Facebook setin **en yavaş** düğmesidir: hükmü
 * HER ZAMAN `false`tur (Meta'da `email_verified` diye bir alan protokol
 * seviyesinde yoktur), yani **her ilk giriş** 6 haneli kod ekranına düşer
 * (ADR-0053 §6.1, PO Kalem C). Bu, arayüzde ayrıca söylenmez — kullanıcı zaten
 * kod ekranının kendi metnini okur.
 */
export function FacebookMark({ size = 18 }: { readonly size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path
        fill="#FFFFFF"
        d="M16.09 15.47 16.62 12h-3.33V9.75c0-.95.47-1.88 1.96-1.88h1.51V4.92s-1.37-.23-2.68-.23c-2.74 0-4.53 1.66-4.53 4.66V12H6.5v3.47h3.05v8.39a12.1 12.1 0 0 0 3.74 0v-8.39h2.8z"
      />
    </svg>
  );
}

/**
 * Bir sağlayıcının GÖRÜNÜR kimliği.
 *
 * ⚠️ `label` erişilebilir ada gider ve ADR-0053 §9.2'nin dört hafifletmesinden
 * BİRİDİR: Microsoft'un kılavuzu logonun _"Sign in with Microsoft"_ terimleriyle
 * BİRLİKTE kullanılmasını ister; yuvarlak ikon düğmede o terimler görsel olarak
 * yoktur ama erişilebilirlik ağacında ve ipucunda VARDIR.
 *
 * ⚠️ Bunun bir **hafifletme** olduğu, uyum OLMADIĞI ADR'de yazılıdır ve burada
 * tekrarlanır — bir gün biri bunu "uyumluyuz" diye okumasın.
 */
export interface ProviderMark {
  readonly label: string;
  readonly Icon: (props: { readonly size?: number }) => React.JSX.Element;
}

/**
 * ⚠️ DÖRDÜ DE BURADA — ama ekranda **sunucunun söylediği kadarı** çizilir.
 *
 * Bu sözlükte bulunmak bir düğme **garantisi değildir**: `social-sign-in.tsx`
 * listeyi `GET /auth/oauth/providers`ten okur ve sözlük yalnızca "bu anahtarı
 * nasıl çizerim" sorusunu cevaplar. Yapılandırılmamış bir sağlayıcı sunucunun
 * registry'sinde HİÇ YOKTUR, yani buraya eklenmiş olması onu ekrana getirmez.
 *
 * ⚠️ Bu ayrım sayesinde `social-sign-in.tsx`e **tek satır dokunulmadı**: dört
 * sağlayıcının düğmesi, konsol kurulumları yapıldıkça **kendiliğinden** çıkar.
 *
 * ⚠️ SIRA BURADAN GELMEZ — sunucudan gelir (ADR-0053 §9.3: Google · Microsoft ·
 * LinkedIn · Facebook). Buradaki yazım sırası yalnızca okunabilirlik içindir.
 *
 * ⚠️ Sözlükte karşılığı olmayan bir anahtar sessizce ÇİZİLMEZ — sunucu bizden
 * önce beşinci sağlayıcıyı (Apple) eklerse ekran bozulmaz, yalnızca o düğme
 * görünmez: **bozulma yerine daralma**.
 *
 * ⚠️ `label` erişilebilir ada gider ve dördü de **eylem ifadesi** taşır —
 * ADR-0053 §9.2'nin birinci hafifletmesi (Microsoft'un kılavuzunun istediği
 * terimler erişilebilirlik ağacında ve ipucunda vardır, görsel olarak yoktur).
 */
export const PROVIDER_MARKS: Readonly<Record<string, ProviderMark>> = {
  google: { label: 'Google ile giriş yap', Icon: GoogleMark },
  microsoft: { label: 'Microsoft ile giriş yap', Icon: MicrosoftMark },
  linkedin: { label: 'LinkedIn ile giriş yap', Icon: LinkedInMark },
  facebook: { label: 'Facebook ile giriş yap', Icon: FacebookMark },
};
