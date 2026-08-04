import { FOLLOW_UP_MARKER } from './knowledge-prompt';

export interface ParsedCompletion {
  readonly answer: string;
  /** Model onermediyse ya da bicim bozuksa BOS dizi. */
  readonly followUps: readonly string[];
}

/** En fazla bu kadar cip gosterilir; model daha fazla yazarsa fazlasi atilir. */
const MAX_FOLLOW_UPS = 3;

/** Cok uzun bir "soru" cip degil paragraftir; ekrani bozar. */
const MAX_FOLLOW_UP_LENGTH = 80;

/**
 * Model ciktisini cevap ve takip sorularina ayirir (ADR-0029 §4).
 *
 * ============================================================================
 * SAVUNMACI: BICIM BOZULURSA CEVAP KAYBOLMAZ
 * ============================================================================
 * Ayrac yoksa tum metin cevaptir ve `followUps` bostur. Bu bir hata yolu
 * DEGIL, beklenen bir durumdur: sistem promptu "baglamda bilgi yoksa bu bolumu
 * hic yazma" der, yani ayracsiz cevap NORMALDIR.
 *
 * JSON yerine ayrac secilmesinin sebebi de budur (bkz. `FOLLOW_UP_MARKER`):
 * bozuk bir ayrac yalnizca cipleri kaybettirir, bozuk bir JSON CEVABIN
 * TAMAMINI kaybettirirdi.
 *
 * Model bazen sorulari numaralandirir ("1. ...") ya da tire ile yazar
 * ("- ..."); bunlar temizlenir. Bos, asiri uzun ve fazladan oneriler atilir.
 * ============================================================================
 */
export function parseCompletion(raw: string): ParsedCompletion {
  const markerAt = raw.indexOf(FOLLOW_UP_MARKER);

  if (markerAt === -1) {
    return { answer: raw.trim(), followUps: [] };
  }

  const answer = raw.slice(0, markerAt).trim();

  // Ayrac VAR ama oncesi bossa, model cevabi hic yazmamis demektir. Ham metni
  // cevap saymak, kullaniciya bos bir balon gostermekten iyidir.
  if (answer === '') {
    return { answer: raw.trim(), followUps: [] };
  }

  const followUps = raw
    .slice(markerAt + FOLLOW_UP_MARKER.length)
    .split('\n')
    .map(toQuestion)
    .filter((line) => line.length > 0 && line.length <= MAX_FOLLOW_UP_LENGTH)
    .slice(0, MAX_FOLLOW_UPS);

  return { answer, followUps };
}

/** Numara, tire ve tirnak gibi liste susleri temizlenir. */
function toQuestion(line: string): string {
  return line
    .trim()
    .replace(/^[-*•]\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim();
}
