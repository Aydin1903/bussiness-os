import { type PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { type RetrievalSelectionRecord } from '../application/retrieval-selection-recorder.port';
import { LoggingRetrievalSelectionRecorder } from './logging-retrieval-selection-recorder';

/**
 * `LoggingRetrievalSelectionRecorder` (ADR-0046).
 *
 * ============================================================================
 * ⚠️ BU DOSYA IKI SEYI KORUR VE IKISI DE SESSIZCE BOZULABILIR
 * ============================================================================
 *   1. **OLAY ADI SABITTIR.** `retrieval.select` degisirse gecmis kayitlarla
 *      yeni kayitlar ayni sorguya DUSMEZ ve donem karsilastirmasi sessizce
 *      bozulur — ⚠️ ve hicbir test bunu YAKALAMAZ, cunku kod calismaya devam
 *      eder. Bu satir onu yakalar.
 *   2. **KAYIT TUTMAK, KAYDEDILEN ISI COKERTMEZ.** Logger firlatirsa `record`
 *      YUTAR: bir log satiri yazilamadi diye kullanicinin sorusu cevapsiz
 *      kalamaz.
 */

function build(overrides: { throws?: boolean } = {}) {
  const info = vi.fn<(payload: unknown, message?: string) => void>(() => {
    if (overrides.throws === true) {
      throw new Error('log altyapisi coktu');
    }
  });
  const logger = { info } as unknown as PinoLogger;

  return { recorder: new LoggingRetrievalSelectionRecorder(logger), info };
}

function record(overrides: Partial<RetrievalSelectionRecord> = {}): RetrievalSelectionRecord {
  return {
    limit: 8,
    structuralFloor: 3,
    selectedCount: 8,
    candidateCount: 23,
    sources: [
      {
        source: 'crm-pipeline',
        kind: 'structural',
        status: 'returned',
        rowCount: 2,
        selectedCount: 1,
        scores: [
          { score: 0.95, selected: true },
          { score: 0.75, selected: false },
        ],
      },
    ],
    ...overrides,
  };
}

describe('LoggingRetrievalSelectionRecorder (ADR-0046)', () => {
  it('⚠️ OLAY ADI `retrieval.select` — DEGISTIRILEMEZ', () => {
    // Sorgulanabilirligin tamami buna dayanir; degisirse gecmis ve yeni
    // kayitlar ayni `grep`e dusmez.
    const { recorder, info } = build();

    recorder.record(record());

    const call = info.mock.calls[0];
    expect(call).toBeDefined();
    expect((call?.[0] as { event: string } | undefined)?.event).toBe('retrieval.select');
    expect(call?.[1]).toBe('retrieval.select');
  });

  it('sayilari ve kaynak kayitlarini OLDUGU GIBI tasir', () => {
    const { recorder, info } = build();

    recorder.record(record());

    const payload = info.mock.calls[0]?.[0] as {
      retrieval: {
        limit: number;
        structuralFloor: number;
        selectedCount: number;
        candidateCount: number;
        sources: readonly { source: string; rowCount: number | null }[];
      };
    };

    expect(payload.retrieval.limit).toBe(8);
    expect(payload.retrieval.structuralFloor).toBe(3);
    expect(payload.retrieval.selectedCount).toBe(8);
    expect(payload.retrieval.candidateCount).toBe(23);
    expect(payload.retrieval.sources[0]?.source).toBe('crm-pipeline');
    expect(payload.retrieval.sources[0]?.rowCount).toBe(2);
  });

  it('⚠️ ICERIK VE `reference.id` SATIRA HIC ULASMAZ (§4.3)', () => {
    // ⚠️ Kural TIPTE zorlanir: `RetrievalSelectionRecord` soru metnini, parca
    // icerigini ve `reference.id`yi TASIMAZ. Bu test o garantinin SERILESMIS
    // ciktida da tuttugunu gosterir — bir gun `sources`a fazladan bir alan
    // eklenirse burada gorunur.
    const { recorder, info } = build();

    recorder.record(record());

    const serialized = JSON.stringify(info.mock.calls[0]?.[0]);

    expect(serialized).not.toContain('content');
    expect(serialized).not.toContain('reference');
    expect(serialized).not.toContain('question');
    // Kaynak kaydinin anahtar kumesi TAM OLARAK bu — sessizce buyurse test
    // kirmizi yanar.
    const source = (info.mock.calls[0]?.[0] as { retrieval: { sources: object[] } }).retrieval
      .sources[0];
    expect(Object.keys(source ?? {}).sort()).toEqual([
      'kind',
      'rowCount',
      'scores',
      'selectedCount',
      'source',
      'status',
    ]);
  });

  it('tenant context YOKKEN `null` yazar — UYDURMAZ', () => {
    // Arka plan islerinde context hic kurulmamis olabilir; `null` durust bir
    // cevaptir (`LoggingAiUsageRecorder`in ayni karari).
    const { recorder, info } = build();

    recorder.record(record());

    const payload = info.mock.calls[0]?.[0] as {
      tenantId: string | null;
      userId: string | null;
      correlationId: string | null;
    };

    expect(payload.tenantId).toBeNull();
    expect(payload.userId).toBeNull();
    expect(payload.correlationId).toBeNull();
  });

  it('⚠️ LOGGER COKERSE FIRLATMAZ — kaydedilen isi cokertmez', () => {
    // Bir log satiri yazilamadi diye kullanicinin sorusu cevapsiz kalamaz.
    const { recorder } = build({ throws: true });

    expect(() => {
      recorder.record(record());
    }).not.toThrow();
  });
});
