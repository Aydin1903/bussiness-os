import Link from 'next/link';

/**
 * LANDING ALT BİLGİSİ — ADR-0054.
 *
 * ============================================================================
 * ⚠️ YAZILMAMIŞ SAYFALAR BAĞLANTI DEĞİLDİR
 * ============================================================================
 * KVKK, Gizlilik ve Fiyatlandırma metinleri HENÜZ YOK: ilk ikisi ROADMAP
 * §8.2'nin (KVKK kontrol noktası) işi, üçüncüsü Faz 6'nın (Faturalama)
 * kararına bağlı. Prototipte üçü de `href="#"` taşıyordu.
 *
 * Üretimde bu kabul edilemez ve sebebi kozmetik değil: `href="#"` tıklandığında
 * sayfayı BAŞA ATAR. Kullanıcı bir metin bekler, sayfanın tepesine fırlar ve
 * bunu bir ARIZA olarak okur. "Yakında" demenin dürüst yolu, tıklanabilir bir
 * şey GÖSTERMEMEKTİR.
 *
 * ============================================================================
 * ⚠️ `[yazılacak]` → `Yakında` (Product Owner, 2026-09-09)
 * ============================================================================
 * ⚠️ ESKİ KARAR YANLIŞ DEĞİLDİ, MUHATABI YANLIŞTI. `[yazılacak]` bir
 * GELİŞTİRİCİ NOTUDUR: köşeli parantez, ekipteki birine "burası bitmedi"
 * der. Ama bu satır **canlı bir pazarlama sayfasında, müşterinin gözünde**
 * duruyor ve orada söylediği şey "bu ürün yarım" oluyor.
 *
 * ⚠️ DEĞİŞEN YALNIZCA TON — davranış aynen korunuyor: satırlar hâlâ
 * BAĞLANTI DEĞİL, çünkü `href="#"` tıklandığında sayfayı başa atar ve
 * kullanıcı bunu bir ARIZA olarak okur. "Yakında" demenin dürüst yolu
 * tıklanabilir bir şey göstermemektir.
 *
 * ⚠️ Ve içerik HÂLÂ YAZILMADI: KVKK/Gizlilik hukuki incelemeye, Fiyatlandırma
 * Faz 6'nın plan/kota kararına bağlı. Bu iş o üç metni yazmaz — yalnızca
 * eksikliğin nasıl söylendiğini düzeltir.
 */
const YAZILACAK: readonly string[] = ['KVKK', 'Gizlilik', 'Fiyatlandırma'];

export function SiteFooter() {
  return (
    <footer>
      <div className="kap foot">
        <div>
          {/* Alt bilgideki logo dekoratiftir — sayfanın tepesinde zaten bir tane var. */}
          <img src="/brand/wordmark.webp" alt="KobiWise" width={880} height={246} />
          <p className="kucuk ozet">
            Şirketler için yapay zekâ işletim sistemi. Modüller ürün değil, hafızadır.
          </p>
        </div>

        <div>
          <h4>ÜRÜN</h4>
          <Link href="/moduller">Modüller</Link>
          <Link href="/#nasil">Nasıl çalışır</Link>
          <Link href="/#cevap">Cevap</Link>
          <Link href="/sorular">Sorular</Link>
        </div>

        <div>
          <h4>ŞİRKET</h4>
          <Link href="/hakkinda">Hakkında</Link>
          <Link href="/blog">Blog</Link>
          <a href="mailto:merhaba@kobiwise.com">İletişim</a>
        </div>

        <div>
          <h4>YASAL</h4>
          {YAZILACAK.map((ad) => (
            <span className="yok" key={ad}>
              {ad} <span className="yz">Yakında</span>
            </span>
          ))}
        </div>
      </div>

      <div className="kap foot-alt">
        <span>© 2026 KOBIWISE</span>
        <span>ŞİRKETLER İÇİN YAPAY ZEKÂ İŞLETİM SİSTEMİ</span>
        <span className="sag">app.kobiwise.com</span>
      </div>
    </footer>
  );
}
