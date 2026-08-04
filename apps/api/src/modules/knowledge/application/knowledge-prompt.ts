/**
 * `/knowledge/ask` sistem promptu — IS KURALIDIR, saglayici ayrintisi DEGIL.
 *
 * ============================================================================
 * NEDEN ADAPTER'DA DEGIL, APPLICATION KATMANINDA
 * ============================================================================
 * `thinking: disabled` adapter'da kaldi cunku o DeepSeek'e OZGU bir
 * parametredir (ADR-0029 §3.1). Bu prompt ise urunun AI'a nasil davranacagini
 * tanimlar: uydurmasin, bos baglamda yonlendirsin, belirsiz soruda netlestirsin.
 * Saglayici degisse de bu kurallar AYNEN gecerlidir — dolayisiyla is
 * mantigina aittir.
 *
 * Sonucu somut: `LLMPort`'un baska bir adapter'a cozulmesi bu dosyaya
 * DOKUNMAZ; adapter'a koysaydik her yeni saglayicida kurallar yeniden
 * yazilirdi ve zamanla ayrisirlardi.
 * ============================================================================
 *
 * ============================================================================
 * KISA TUTULDU — bilincli
 * ============================================================================
 * Uzun bir talimat listesi modelin kendisini de bulandirir: kurallar birbiriyle
 * yarisir ve model hangisini onceleyecegini bilemez. Uc kural, her biri tek
 * cumle, ve tek satirlik bir dil talimati.
 *
 * TR/EN icin AYRI prompt YOKTUR (Product Owner karari): dil algilayicimiz yok
 * ve model soruyu zaten goruyor. Son satir isi yapar. Iki prompt tutmak, iki
 * metnin zamanla ayrismasi demekti.
 * ============================================================================
 */
export const KNOWLEDGE_SYSTEM_PROMPT = `Sen bir sirketin kurumsal hafizasina erisimi olan asistansin.

1. YALNIZCA sana verilen baglamdaki bilgiyi kullan. Baglamda olmayan hicbir seyi kendi genel bilginden EKLEME veya UYDURMA.
2. Baglamda soruyla ilgili hicbir bilgi yoksa duz "bilmiyorum" deme; sunu soyle: "Bu konuda henuz bir notunuz yok. Eklerseniz bir dahaki sefere bu soruyu cevaplayabilirim."
3. Soru belirsiz veya cok genelse (hangi donem, hangi urun, hangi ekip gibi netlestirilmesi gereken bir sey varsa) tahmin etme; netlestirici bir soru sor.

Kullanicinin sordugu dilde cevap ver.

Cevabini yazdiktan SONRA, ayri bir satirda ---SORULAR--- yaz ve altina
kullanicinin sorabilecegi 2-3 KISA takip sorusu ekle, her satira bir tane.
Sorular bu cevabin ICERIGINE OZEL olsun; genel gecer sorular yazma. Baglamda
hicbir bilgi yoksa bu bolumu HIC yazma.`;

/**
 * Cevap ile takip sorularini ayiran isaret.
 *
 * ============================================================================
 * NEDEN AYRAC, NEDEN JSON DEGIL
 * ============================================================================
 * JSON istemek daha "temiz" gorunur ama `response_format` kullanmadan
 * KIRILGANDIR: tek bir bozuk susulu parantez CEVABIN TAMAMINI kaybettirir.
 * Ayrac bozulursa en kotu ihtimalle cip cikmaz, cevap sag kalir — dusekren
 * guvenli olan bu.
 * ============================================================================
 */
export const FOLLOW_UP_MARKER = '---SORULAR---';
