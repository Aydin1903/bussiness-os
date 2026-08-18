import { Injectable } from '@nestjs/common';

import {
  type ContextFragment,
  type ContributeInput,
  type RetrievalContributor,
} from '../../../platform/context/context.public';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type DocumentRepository } from '../application/document.repository.port';
import { DOCUMENT_READ } from '../documents.permissions';

/** Koken etiketi — kaynak atfi ve `degradedSources` bunu tasir. */
export const DOCUMENTS_SOURCE = 'documents';

/**
 * Belge'nin ANLAMSAL katkisi — ALTINCI anlamsal kaynak (ADR-0037 §8).
 *
 * ============================================================================
 * ⚠️ TEK KATKICI — YAPISAL OLAN BILINCLI OLARAK YOK
 * ============================================================================
 * Onceki DORT modulun DORDU DE ikinci bir YAPISAL katkici kaydetti, cunku her
 * birinin turetilebilir bir DURUMU vardi: takipte gecikmis firsat, durgun
 * proje, nakit akisi ozeti, yaklasan randevu.
 *
 * **Bir belgenin boyle bir durumu yoktur.** Bir sozlesme "gecikmis" ya da
 * "durgun" olmaz; yalnizca VARDIR. Zorlanabilecek her aday ya baska bir
 * modulun isi ya da kapsam disidir:
 *
 *   - "Suresi dolmak uzere olan sozlesmeler" -> bir BITIS TARIHI kolonu ve bir
 *     YENILEME kavrami ister; ikisi de v1 disinda (§12) ve dogru yapildiginda
 *     bir HATIRLATMA (Queue karari) sorusudur.
 *   - "En cok belge hangi projede"           -> bir SAYIM, bir hafiza degil.
 *     AI'a hicbir sey ogretmez.
 *
 * ⚠️ UYDURMA BIR YAPISAL KATKICI YAZMAK, ADR-0036'NIN TABAN KISITINDAN HAKSIZ
 * BIR YUVA CALMAK OLURDU. O karar yapisal kaynaklara GARANTILI yuva verdigi
 * icin "yapisal" etiketi artik bir IMTIYAZDIR; icerigi zayif bir ozeti yapisal
 * ilan etmek, o yuvayi gercekten alarm ureten bir kaynagin elinden alirdi.
 *
 * **Bir modulun katki VERMEMESI, kotu bir katki vermesinden iyidir.**
 *
 * ============================================================================
 * ⚠️ ADR-0036'NIN TABAN KISITI ILK GERCEK YUKUNU BURADA TASIYOR (§8.2)
 * ============================================================================
 * Bu katkici ALTINCI anlamsal kaynaktir. ADR-0036 §3 tam olarak bu gunu
 * ongorup su cumleyi yazmisti: _"ADR-0037 bu kararin USTUNE oturur ve onu
 * DEGISTIRMEZ. Taban yine 3 kalir; degisen tek sey, serbest bes yuvanin artik
 * ALTI anlamsal kaynak arasinda paylasilmasidir."_
 *
 * Bu modul YAPISAL kaynak EKLEMEDIGI icin taban aritmetigi degismiyor (4
 * yapisal kaynak, taban `ceil(8/3)` = 3). Degisen tek sey serbest bes yuvadaki
 * yarismanin siklasmasi — ve bu modul baskiyi Randevu'dan DAHA COK artiriyor:
 * Randevu kayit basina TEK vektor yaziyordu, Belge ONLARCA yaziyor.
 *
 * ⚠️ Bir anlamsal kaynagin sifir alabilmesi ADR-0036'nin YAZILI BEKLENTISIDIR,
 * bir kusur degil: _"anlamsal kaynaklar ayni olcegi paylasir, yani aralarindaki
 * eleme LIYAKATTIR."_ Canli dagilim olcumu kapanis denetiminin ZORUNLU
 * maddesidir.
 */
@Injectable()
export class DocumentsContributor implements RetrievalContributor {
  readonly source = DOCUMENTS_SOURCE;

  /**
   * ADR-0036: vektor benzerligiyle bulunan ANLATISAL icerik.
   *
   * ⚠️ ZORUNLU ALAN — unutulmasi bir DERLEME HATASIDIR. Bu satir, o kararin
   * ALTINCI modulde tuttugunun ilk kanitidir: `contributionKind` opsiyonel ve
   * varsayilanli olsaydi burada hicbir sey yazmazdik ve kimse fark etmezdi.
   */
  readonly contributionKind = 'semantic' as const;

  readonly permission = DOCUMENT_READ;

  constructor(
    private readonly repository: DocumentRepository,
    private readonly transactionManager: TransactionManager,
  ) {}

  /**
   * Kendi transaction'ini ACAR.
   *
   * Katkicilar PARALEL cagrilir; ortak bir transaction paylasmak onlari
   * birbirinin kilidine baglardi.
   */
  async contribute(input: ContributeInput): Promise<ContextFragment[]> {
    const chunks = await this.transactionManager.runInCurrentTenantTransaction(() =>
      this.repository.findSimilarChunks({ embedding: input.embedding, limit: input.limit }),
    );

    return chunks.map((chunk, index) => ({
      // ⚠️ `content` OLDUGU GIBI doner — baslik DAHIL, saklandigi haliyle. Dort
      // chunk tablolu modulle AYNI; `appointment-notes`tan fark (orada baslik
      // okuma aninda yeniden kuruluyordu cunku saklanacak kolon yoktu).
      //
      // Bedeli acikca: dosya adi degisirse (§7) saklanan baslik BAYATLAR ve
      // telafi `POST /documents/reindex`tir.
      content: chunk.content,
      // Repository skor DONDURMEZ; kosinus mesafesine gore SIRALI bir liste
      // verir. Siralamayi korumak icin sentetik ve AZALAN bir skor uretilir —
      // bes onceki anlamsal katkiciyla AYNI formul.
      //
      // ⚠️ Skor kaynaklar ARASI karsilastirma icin anlamli DEGILDIR (ADR-0031'in
      // "skorlar kalibre degil" bilinen siniri). ADR-0036 bunu bir KUSUR olarak
      // degil, telafi edilmis bir OLCEK UYUSMAZLIGI olarak kayda gecirdi.
      score: 1 - index / (chunks.length + 1),
      source: DOCUMENTS_SOURCE,
      reference: { kind: 'document', id: chunk.documentId },
    }));
  }
}
