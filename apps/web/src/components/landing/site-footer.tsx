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
 * ⚠️ `[yazılacak]` işareti KORUNUR: kullanıcıya eksiği söyler, bize de bu
 * satırların bir gün gerçek rotaya bağlanacağını hatırlatır.
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
              {ad} <span className="yz">[yazılacak]</span>
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
