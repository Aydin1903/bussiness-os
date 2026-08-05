/**
 * Metni embedding'e uygun parcalara boler — SAF fonksiyon (ADR-0029 §2).
 *
 * ============================================================================
 * BU DOSYA I/O YAPMAZ
 * ============================================================================
 * Ne veritabani, ne ag, ne saat. Girdi metin, cikti parca dizisi.
 * `brute-force-policy.ts` ve `tenant-outbox-retry.policy.ts` ile ayni desen:
 * burada yalnizca KARAR verilir, uygulamak use case'in isidir.
 * ============================================================================
 *
 * ============================================================================
 * TOKEN SAYIMI TAHMINIDIR — ve bu bilincli
 * ============================================================================
 * ADR-0029 §2 "~500 token esigi" der. Projede tokenizer bagimliligi YOKTUR ve
 * eklenmedi (Product Owner karari): 500 burada bir DOGRULUK KISITI DEGIL, bir
 * SEZGIDIR. `text-embedding-3-small`'in gercek siniri 8191 token; 500'u 700
 * sanmak hicbir seyi bozmaz, yalnizca retrieval kalitesinde ince bir fark
 * yaratir.
 *
 * SAPMA ACIKCA: "4 karakter = 1 token" bir INGILIZCE kuralidir. Turkce
 * cl100k'da yaklasik 2-3 karakter/token'dir — sondan eklemeli yapi ve Turkce
 * karakterler daha cok token uretir. Bu yuzden burada MUHAFAZAKAR bir oran
 * kullanilir: 2.5 karakter/token. Yani ~500 token ~= 1250 karakter.
 *
 * Sonucu durustce: INGILIZCE metinde parcalar hedeften KUCUK olur (~310 token),
 * TURKCE metinde hedefe yakin. Kucuk parca "parcali baglam" riskidir ama
 * buyuk parcanin "gurultulu baglam" riskinden daha az zararlidir — ve chunk
 * sayisi arttikca retrieval'in secme sansi artar.
 *
 * Gercek tokenizer gerekirse (retrieval kalitesi olculup yetersiz bulunursa)
 * yalnizca `estimateTokens` degisir; bolme mantigi ayni kalir.
 * ============================================================================
 */

/** ADR-0029 §2'nin hedefi. */
export const TARGET_CHUNK_TOKENS = 500;

/** Muhafazakar Turkce tahmini — bkz. dosya yorumu. */
export const CHARS_PER_TOKEN = 2.5;

/** ~500 token'in karakter karsiligi: 1250. */
export const TARGET_CHUNK_CHARS = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN;

/** Metnin yaklasik token sayisi. Tahmindir; bkz. dosya yorumu. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Metni paragraf sinirina SAYGILI parcalara boler.
 *
 * ============================================================================
 * NEDEN PARAGRAF SINIRI
 * ============================================================================
 * Bir cumlenin ortasindan bolmek, iki parcayi da anlamsizlastirir: ilki yarim
 * biter, ikincisi baglamsiz baslar. Paragraf, yazarin kendi koydugu anlam
 * sinirdir ve bedava bir ipucudur.
 *
 * Algoritma:
 *   1. Metin bos satirlardan paragraflara ayrilir,
 *   2. Paragraflar esige kadar BIRIKTIRILIR (kucuk paragraflar birlesir),
 *   3. Tek basina esigi asan paragraf, once CUMLE sinirindan, o da yetmezse
 *      KARAKTER sinirindan bolunur (asagida).
 * ============================================================================
 */
export function chunkText(text: string): string[] {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    // Tek basina esigi asan paragraf: birlestirmeye calismak anlamsiz, once
    // biriktirileni kapat, sonra onu kendi icinde bol.
    if (paragraph.length > TARGET_CHUNK_CHARS) {
      if (current !== '') {
        chunks.push(current);
        current = '';
      }
      chunks.push(...splitOversizedParagraph(paragraph));
      continue;
    }

    const candidate = current === '' ? paragraph : `${current}\n\n${paragraph}`;
    if (candidate.length > TARGET_CHUNK_CHARS) {
      // Eklemek esigi asardi: mevcut parcayi kapat, yenisini bu paragrafla ac.
      chunks.push(current);
      current = paragraph;
      continue;
    }

    current = candidate;
  }

  if (current !== '') {
    chunks.push(current);
  }

  return chunks;
}

/** Bos satirlarla ayrilmis paragraflar; bos olanlar elenir. */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
}

/**
 * Esigi tek basina asan paragrafi boler.
 *
 * ONCE cumle sinirindan: paragraf sinirinin gerekcesi burada da gecerlidir,
 * yalnizca bir kademe daha ince. Bir cumle bile esigi asiyorsa (kod blogu,
 * bosluksuz uzun dize) KARAKTER sinirindan bolunur — o noktada anlamli bir
 * sinir kalmamistir ve parcalamamak, embedding'i tumuyle kaybetmek olurdu.
 */
function splitOversizedParagraph(paragraph: string): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const sentence of splitSentences(paragraph)) {
    if (sentence.length > TARGET_CHUNK_CHARS) {
      if (current !== '') {
        chunks.push(current);
        current = '';
      }
      chunks.push(...splitByLength(sentence));
      continue;
    }

    const candidate = current === '' ? sentence : `${current} ${sentence}`;
    if (candidate.length > TARGET_CHUNK_CHARS) {
      chunks.push(current);
      current = sentence;
      continue;
    }

    current = candidate;
  }

  if (current !== '') {
    chunks.push(current);
  }

  return chunks;
}

/**
 * Cumle sinirlari: `.`, `!`, `?` ve ardindan bosluk.
 *
 * Kusurlarini durustce: "Dr. Ahmet" veya "3.14" yanlis bolunur. Bu, retrieval
 * icin kabul edilebilir bir kusurdur — yanlis bolunen bir cumle yine de ayni
 * chunk'ta komsulariyla birlikte kalir. Kusursuz cumle ayrimi bir NLP isidir ve
 * buradaki kazanci haklı cikarmaz.
 */
function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '');
}

/** Son care: sabit uzunlukta bolme. Anlamli sinir kalmadiginda kullanilir. */
function splitByLength(text: string): string[] {
  const chunks: string[] = [];

  for (let offset = 0; offset < text.length; offset += TARGET_CHUNK_CHARS) {
    chunks.push(text.slice(offset, offset + TARGET_CHUNK_CHARS));
  }

  return chunks;
}
