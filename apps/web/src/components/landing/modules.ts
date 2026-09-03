/**
 * ON İKİ ODA — landing'in modül tablosu (ADR-0054).
 *
 * ============================================================================
 * ⚠️ RENKLER BURADA İKİNCİ KEZ YAZILIYOR — VE BU BİR RİSKTİR, GİZLENMEZ
 * ============================================================================
 * On iki imza renginin SSOT'u `app/module-colors.css`tir (CLAUDE.md'nin
 * bağlayıcı kuralı, FRONTEND §4.8). Buradaki hex değerleri o dosyanın
 * `--mc-light` değerlerinin KOPYASIDIR.
 *
 * ⚠️ Neden okunamıyor: renkler bir CSS özel değişkeninde ve `[data-module='…']`
 * kapsamında yaşıyor. Bir Server Component CSS'i çözemez; landing kartları da
 * `data-module` kapsamına GİREMEZ — girselerdi ADR-0038'in mekanizması on iki
 * kez iç içe kurulur ve her kart `--accent`i ezerdi.
 *
 * ⚠️ Sapma SESSİZ olurdu: bir modülün rengi değişir, uygulama yeni rengi
 * gösterir, pazarlama sayfası eskisini gösterir ve hiçbir test kırmızı yanmaz.
 * Bu yüzden risk bir YORUMLA değil bir TESTLE kapatıldı: `landing.spec.tsx`
 * on iki değeri `module-colors.css`ten okuyup birebir karşılaştırır
 * (`brand-assets.spec`in `MARK_PATHS` için kurduğu aynı desen).
 *
 * ============================================================================
 * ⚠️ ANAHTAR İNGİLİZCE, ETİKET TÜRKÇE
 * ============================================================================
 * `key` alanı `module-colors.css`in seçicisiyle BİREBİR aynı olmak zorundadır
 * — test onun üzerinden eşleştirme yapar. `ad` ise kullanıcının gördüğü addır
 * ve rotayla aynı olmak zorunda DEĞİLDİR: uygulamada modül `hr`, koridorda
 * "Ekip"tir.
 *
 * ⚠️ SIRA ROADMAP §3.5'İN SIRASIDIR (modüllerin yazılma sırası), alfabetik
 * değil. Numaralar (`01`…`12`) o sıradan TÜRETİLİR, elle yazılmaz — elle
 * yazılsaydı bir modül araya girdiğinde on iki satırın hepsi güncellenmeliydi
 * ve biri unutulurdu.
 */
export interface LandingModule {
  /** `module-colors.css`teki `[data-module='…']` seçicisiyle birebir aynı. */
  readonly key: string;
  /** Kullanıcının gördüğü ad — rotayla aynı olmak zorunda değil. */
  readonly ad: string;
  /** `--mc-light` kopyası. Testle `module-colors.css`e bağlıdır. */
  readonly renk: string;
  /** Odanın kahraman satırı: modülün cevapladığı SORU. */
  readonly soru: string;
  /** Modülün ne tuttuğu — yalnızca `/moduller` listesinde görünür. */
  readonly icerik: string;
  /** CLAUDE.md'nin "modüller hafızadır" tablosundaki karşılığı. */
  readonly rol: string;
}

export const LANDING_MODULES: readonly LandingModule[] = [
  {
    key: 'crm',
    ad: 'Müşteriler',
    renk: '#3173af',
    soru: 'Kiminle ne konuşulmuştu?',
    icerik: 'Şirketler, kişiler, fırsatlar, görüşme notları.',
    rol: 'MÜŞTERİ HAFIZASI',
  },
  {
    key: 'projects',
    ad: 'Projeler',
    renk: '#717325',
    soru: 'Hangi iş nerede kaldı?',
    icerik: 'Projeler, görevler, ilerleme notları.',
    rol: 'YÜRÜTME HAFIZASI',
  },
  {
    key: 'finance',
    ad: 'Finans',
    renk: '#307d54',
    soru: 'Para nereden geldi, nereye gitti?',
    icerik: 'Gelir, gider, kategoriler, nakit akışı.',
    rol: 'FİNANSAL HAFIZA',
  },
  {
    key: 'appointments',
    ad: 'Randevular',
    renk: '#057a89',
    soru: 'Kim ne zaman gelecekti?',
    icerik: 'Takvim, servis notları, gelmeme oranı.',
    rol: 'TAKVİM HAFIZASI',
  },
  {
    key: 'documents',
    ad: 'Belgeler',
    renk: '#557380',
    soru: 'Sözleşmede ne yazıyordu?',
    icerik: 'PDF/DOCX yükleme, metin çıkarma, arama.',
    rol: 'SÖZLEŞME HAFIZASI',
  },
  {
    key: 'inventory',
    ad: 'Stok',
    renk: '#876b1c',
    soru: 'Elde ne kaldı?',
    icerik: 'Kalemler, hareketler, eşik uyarısı, sayım.',
    rol: 'ENVANTER HAFIZASI',
  },
  {
    key: 'suppliers',
    ad: 'Tedarikçiler',
    renk: '#5c6cab',
    soru: 'Kimden, hangi şartla alıyoruz?',
    icerik: 'Tedarikçiler, yetkililer, görüşme günlüğü.',
    rol: 'TEDARİK HAFIZASI',
  },
  {
    key: 'invoicing',
    ad: 'Teklif / Fatura',
    renk: '#257c6c',
    soru: 'Ne teklif ettik, ne kestik?',
    icerik: 'Teklif, fatura, PDF çıktı, durum takibi.',
    rol: 'SATIŞ BELGESİ HAFIZASI',
  },
  {
    key: 'hr',
    ad: 'Ekip',
    renk: '#896096',
    soru: 'Kim ne yapıyor, kim izinde?',
    icerik: 'Çalışanlar, izin takibi, onay kuyruğu.',
    rol: 'ORGANİZASYON HAFIZASI',
  },
  {
    key: 'feedback',
    ad: 'Geri bildirim',
    renk: '#56793e',
    soru: 'Müşteri ne dedi?',
    icerik: 'Puan, kanal, yorum — müşterinin kendi cümlesi.',
    rol: 'MÜŞTERİNİN SESİ',
  },
  {
    key: 'marketing',
    ad: 'Kampanyalar',
    renk: '#7665a6',
    soru: 'Ne denedik, ne işe yaradı?',
    icerik: 'Kampanyalar, hedef kitle, sonuç notu.',
    rol: 'PAZARLAMA HAFIZASI',
  },
  {
    key: 'loyalty',
    ad: 'Sadakat',
    renk: '#9a5a84',
    soru: 'Kim ne kadar bizimle?',
    icerik: 'Puan hesabı, değiştirilemez defter.',
    rol: 'BAĞLILIK HAFIZASI',
  },
];

/**
 * Sıra numarası — `01`…`12`, listedeki konumdan TÜRETİLİR.
 *
 * ⚠️ Kolonda tutulmaz: elle yazılsaydı araya bir modül girdiği gün on iki
 * satırın hepsi güncellenmek zorunda kalırdı ve biri unutulurdu — projede
 * defalarca verilen "türetilebilen şey saklanmaz" kararının aynısı.
 */
export function moduleNo(index: number): string {
  return String(index + 1).padStart(2, '0');
}
