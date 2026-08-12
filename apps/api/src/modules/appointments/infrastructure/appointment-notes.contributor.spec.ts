import { describe, expect, it, vi } from 'vitest';

import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type AppointmentRepository } from '../application/appointment.repository.port';
import { AppointmentNotesContributor } from './appointment-notes.contributor';

/**
 * `AppointmentNotesContributor` (ADR-0035 §6, §6.1).
 *
 * Dort onceki anlamsal katkiciyla SIMETRIK; buradaki testler bu modulun
 * GERCEKTEN KENDINE OZGU iki seyine odaklanir:
 *
 *   1. BASLIK OKUMA ANINDA yeniden kurulur (chunk tablosu yok — §3), yani
 *      gosterilen tarih DAIMA TAZEDIR,
 *   2. `source` etiketi YAPISAL katkicidan AYRIDIR — ikisi ayni tabloyu okuyor.
 */

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

const ID = '018f3a2b-7c4d-7e1f-9c4d-000000000001';

function build(
  notes: { id: string; scheduledAt: Date; serviceNote: string }[] = [
    {
      id: ID,
      scheduledAt: new Date('2026-08-20T14:30:00.000Z'),
      serviceNote: 'Dis temizligi + kontrol',
    },
  ],
) {
  const findSimilarNotes = vi
    .fn<AppointmentRepository['findSimilarNotes']>()
    .mockResolvedValue(notes);

  const contributor = new AppointmentNotesContributor(
    { findSimilarNotes } as unknown as AppointmentRepository,
    transactionManager,
  );

  return { contributor, findSimilarNotes };
}

describe('AppointmentNotesContributor', () => {
  it('sorunun vektorunu repository ye OLDUGU GIBI gecirir', async () => {
    const { contributor, findSimilarNotes } = build();
    const embedding = [0.1, 0.2, 0.3];

    await contributor.contribute({ question: 'dis temizligi', embedding, limit: 4 });

    expect(findSimilarNotes).toHaveBeenCalledWith({ embedding, limit: 4 });
  });

  it('⚠️ BASLIK OKUMA ANINDA kurulur — tarih DAIMA TAZE', async () => {
    // ⚠️ Chunk tablosu tasiyan dort modulde gomulen metin TABLODAN okunur ve
    // randevu ertelenirse GOSTERILEN tarih de bayatlardi. Burada baslik her
    // okumada `withAppointmentHeader` ile yeniden kurulur — Slice 3'te
    // gomerken kullanilan AYNI fonksiyon.
    const { contributor } = build();

    const [fragment] = await contributor.contribute({
      question: 'x',
      embedding: [],
      limit: 4,
    });

    expect(fragment?.content).toBe('[Randevu · 2026-08-20] Dis temizligi + kontrol');
  });

  it('⚠️ BASLIKTA KISI ADI YOK — vektorde VAR, metinde YOK', async () => {
    // ⚠️ BU TESTIN ISI BILINEN BIR SINIRI KAYDETMEKTIR, gizlemek degil.
    //
    // Ad `crm.contacts`tadir; okumanin tek mesru yolu `ContactDirectory`dir
    // (cross-schema JOIN yasak) ve o dizin cagiranin ROLUNU ister —
    // `ContributeInput` rol TASIMAZ. Adi kapisiz dondurmek `contact:read`
    // tasimayan bir kullaniciya CRM verisi sizdirirdi.
    //
    // Eslesme yine de calisir: Slice 3 adi VEKTORE koyuyor.
    const { contributor } = build();

    const [fragment] = await contributor.contribute({ question: 'x', embedding: [], limit: 4 });

    expect(fragment?.content).not.toMatch(/Ahmet/);
  });

  it('skor AZALAN — siralamayi korur', async () => {
    const { contributor } = build([
      { id: 'a', scheduledAt: new Date('2026-08-20T10:00:00.000Z'), serviceNote: 'ilk' },
      { id: 'b', scheduledAt: new Date('2026-08-21T10:00:00.000Z'), serviceNote: 'ikinci' },
    ]);

    const fragments = await contributor.contribute({ question: 'x', embedding: [], limit: 4 });

    // Repository skor DONDURMEZ, SIRALI liste verir; sentetik skor sirayi
    // korur (dort onceki anlamsal katkiciyla AYNI formul).
    expect(fragments[0]?.score).toBeGreaterThan(fragments[1]?.score ?? 1);
  });

  it('⚠️ kaynak etiketi YAPISAL katkicidan AYRIDIR', async () => {
    // Ikisi AYNI tabloyu okuyor (projede ilk kez). Etiketler ayni olsaydi biri
    // cokup digeri calistiginda `degradedSources` HANGISININ bozuldugunu
    // soyleyemezdi.
    const { contributor } = build();

    const [fragment] = await contributor.contribute({ question: 'x', embedding: [], limit: 4 });

    expect(fragment?.source).toBe('appointment-notes');
    expect(fragment?.reference).toEqual({ kind: 'appointment', id: ID });
  });

  it('sonuc yoksa BOS dizi doner', async () => {
    const { contributor } = build([]);

    await expect(
      contributor.contribute({ question: 'x', embedding: [], limit: 4 }),
    ).resolves.toEqual([]);
  });
});

describe('izin kapisi (ADR-0035 §6, §9)', () => {
  it('⚠️ katkici `appointment:read` DEKLARE eder — eleme PLATFORMUN isi', () => {
    // ============================================================================
    // ⚠️ BU IDDIA NEDEN BURADA, ENTEGRASYON TESTINDE DEGIL
    // ============================================================================
    // Kabul olcutu: "izni olmayan role icin katkici HIC CAGRILMAZ ve
    // `degradedSources`ta bile gorunmez". Bu davranis GERCEK BIR ROLLE
    // URETILEMEZ: `appointment:read` izni DORT ROLUN DORDUNDE DE var
    // (ADR-0035 §9 — bir randevu takvimi PAYLASILAN bir is gercegidir).
    //
    // Yani bu modul `POST /ask` izin filtresini TETIKLEMEZ; tetikci HALA
    // yalnizca Finans'tir (`cashflow:read` / `commentary:read` — `member`
    // tasimaz). Elemenin kendisi `context-contributors.integration.spec`te
    // Finans uzerinden ZATEN kanitli ve mekanizma PLATFORMUNDUR.
    //
    // Modulun sorumlulugu tek satirdir: DOGRU izni deklare etmek. Yanlis bir
    // izin yazilsaydi (ornegin `appointment:write`) hata SESSIZ olurdu —
    // okuma yapan bir kullanici kendi randevularini AI'a soramaz hale gelirdi
    // ve hicbir test kirmizi yanmazdi. Bu satir tam olarak onu kilitliyor.
    const { contributor } = build();

    expect(contributor.permission).toBe('appointment:read');
  });
});
