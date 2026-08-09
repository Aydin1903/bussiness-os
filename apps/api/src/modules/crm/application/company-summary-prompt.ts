/**
 * Musteri ozeti sistem promptu (ADR-0032 §4).
 *
 * ============================================================================
 * NEDEN UCUNCU BIR PROMPT
 * ============================================================================
 * `KNOWLEDGE_SYSTEM_PROMPT` bir SORUYA cevap verir ve gerektiginde
 * netlestirici soru sorar — ozetin soracak kimsesi yoktur.
 * `DAILY_REPORT_SYSTEM_PROMPT` bir GUNU ozetler; kapsami zamandir, kimlik
 * degil. Bu prompt bir ILISKIYI ozetler: kapsami tek bir musteridir ve
 * girdisi kronolojiktir.
 *
 * ADR-0030'un gerekcesi burada da gecerli: tek prompt'a uc gorevi bindirmek
 * ucunu de bulaniklastirirdi — her yeni kural digerlerinin de yuku olurdu.
 *
 * ============================================================================
 * 1. KURAL AYNI VE PAZARLIK KONUSU DEGIL
 * ============================================================================
 * Bir satis temsilcisi musteriyi aramadan once bu metni okuyacak. Ozet, o
 * musteriyle KONUSULMAMIS bir seyden bahsediyorsa temsilci onu telefonda
 * tekrar eder — ve urunun tum degeri (kurumsal hafizaya guven) tek seferde
 * kaybolur. Hata burada Panel'deki bir yanlis cevaptan DAHA pahalidir, cunku
 * musteriye kadar gider.
 */
export const COMPANY_SUMMARY_SYSTEM_PROMPT = `Sen bir sirketin CRM kayitlarindan tek bir musteriyle olan iliskinin ozetini cikaran asistansin.

1. YALNIZCA sana verilen gorusme notlarindaki ve firsat bilgilerindeki veriyi kullan. Verilmeyen hicbir seyi kendi genel bilginden EKLEME veya UYDURMA. Musteri hakkinda disaridan bildigin hicbir seyi kullanma.
2. Kisa yaz: en fazla 4-5 cumle. Amac, bu musteriyi arayacak kisinin bir bakista durumu hatirlamasidir.
3. Gorusmeleri tek tek listeleme; nerede kalindigini ve acik konulari anlat.
4. Bir sonraki adim notlardan ACIKCA cikiyorsa soyle; cikmiyorsa adim ONERME.

Sirketin kendi dilinde yaz (notlar hangi dildeyse o dilde).`;

/**
 * Modele verilecek KANIT bloklarini kurar.
 *
 * ============================================================================
 * `context` DIZISI, TEK BIR METIN DEGIL
 * ============================================================================
 * `LLMPort.complete` `context`i ayri parcalar halinde alir (ADR-0030 §1.3) ve
 * adapter onu boyle geciyor. Hepsini birlestirip tek string yapmak, port'un
 * "getirilen kanit" ile "diyalog" ayrimini istemci tarafinda bozmak olurdu.
 *
 * SIRA KRONOLOJIKTIR (eski -> yeni) ve bu bilinclidir: bir iliski ozetinde
 * "nerede kaldik" sorusunun cevabi SONDADIR. Knowledge'in retrieval'i alaka
 * skoruna gore siralar cunku orada soru "hangi not ilgili"dir; burada soru
 * "bu iliski nereye geldi"dir.
 */
export function buildSummaryContext(input: {
  companyName: string;
  industry: string | null;
  openOpportunities: readonly { title: string; stage: string; estimatedValue: string | null }[];
  interactions: readonly { occurredOn: string; body: string }[];
}): readonly string[] {
  const blocks: string[] = [];

  blocks.push(
    input.industry === null
      ? `Musteri: ${input.companyName}`
      : `Musteri: ${input.companyName} (${input.industry})`,
  );

  if (input.openOpportunities.length > 0) {
    const lines = input.openOpportunities.map((opportunity) => {
      const value = opportunity.estimatedValue === null ? '' : ` · ${opportunity.estimatedValue}`;
      return `- ${opportunity.title} [${opportunity.stage}]${value}`;
    });
    blocks.push(`Acik firsatlar:\n${lines.join('\n')}`);
  }

  // Gorusmeler EN ESKIDEN ENIYE. Repository guncellikten getirir (limit o
  // yonde anlamli); sira burada cevrilir cunku modele verilen sey bir
  // ZAMAN CIZGISIDIR.
  for (const interaction of [...input.interactions].reverse()) {
    blocks.push(`[${interaction.occurredOn}] ${interaction.body}`);
  }

  return blocks;
}

/**
 * Modelin cevaplayacagi "soru".
 *
 * Sabit bir cumledir: bu uc bir soru-cevap ucu DEGILDIR, kullanicidan serbest
 * metin ALMAZ. Alsaydi ozet ucu sessizce ikinci bir `/ask` olurdu — hem oran
 * siniri hem prompt injection yuzeyi bakimindan farkli bir sey.
 */
export const COMPANY_SUMMARY_USER_MESSAGE =
  'Bu musteriyle iliskimizin bugunku durumunu ozetle: nerede kaldik, acik konular neler?';
