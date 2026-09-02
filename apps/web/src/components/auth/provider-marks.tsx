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
 * ⚠️ YALNIZCA GOOGLE VAR — çünkü yalnızca Google yapılandırılmış durumda.
 *
 * Diğer üçü eklendiğinde buraya birer satır gelir; `social-sign-in.tsx`e
 * DOKUNULMAZ (sıra ve varlık sunucudan gelir). Sözlükte karşılığı olmayan bir
 * anahtar sessizce ÇİZİLMEZ — sunucu bizden önce güncellenirse ekran bozulmaz,
 * yalnızca o düğme görünmez.
 */
export const PROVIDER_MARKS: Readonly<Record<string, ProviderMark>> = {
  google: { label: 'Google ile giriş yap', Icon: GoogleMark },
};
