import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Sisteme giren veriyi sinirda dogrular.
 *
 * DEVELOPMENT_RULES 2.3: dis veri HER ZAMAN Zod ile dogrulanir. TypeScript
 * tipleri runtime'da yoktur; `body: CreateInvoiceDto` yazmak istemcinin ne
 * gonderdigi konusunda hicbir guvence vermez.
 *
 * Dogrulama hatasi ZodError firlatir; ProblemDetailsFilter bunu alan bazli
 * detaylariyla 422 cevabina cevirir.
 *
 * Kullanim:
 *   @Body(new ZodValidationPipe(createInvoiceSchema)) body: CreateInvoice
 */
@Injectable()
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  public constructor(private readonly schema: ZodType<TOutput>) {}

  public transform(value: unknown): TOutput {
    return this.schema.parse(value);
  }
}
