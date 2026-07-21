import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PROBLEM_TYPE_BASE, type ProblemDetails } from '@business-os/contracts';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import { getCorrelationId } from '../logging/request-context';

const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/** ProblemDetails.status duz bir sayidir; enum ile karsilastirma yapilmaz. */
const SERVER_ERROR_THRESHOLD = 500;

/**
 * 5xx maskesinden MUAF tutulmak isteyen hatalarin tasidigi isaret.
 *
 * VARSAYILAN DEGISMEDI: sunucu hatalarinin govdesi hala gizlenir. Bu isaret
 * yalnizca govdesi ELLE YAZILMIS, ic detay icermeyen 5xx'ler icindir —
 * ornegin "bu ozellik henuz devrede degil" gibi bilincli bir bildirim.
 *
 * Neden gerekli: maskeleme olmadan `new InternalServerErrorException(err.message)`
 * baglanti dizesini cevaba tasir. Ama maskeleme MUTLAK olursa, kasitli ve
 * guvenli bir 503 bildirimi de anlamsiz bir "Beklenmeyen bir hata olustu"
 * cevabina doner ve istemci ne yapacagini bilemez.
 *
 * Isaret ACIKCA konur; hicbir hata bunu kazara kazanmaz.
 */
export interface DisclosableProblem {
  readonly disclosable: true;
}

function isDisclosable(exception: HttpException): boolean {
  return 'disclosable' in exception && exception.disclosable === true;
}

/** ProblemDetails'in her varyantinda tekrar eden baglam alanlari. */
interface ProblemContext {
  readonly instance: string;
  readonly traceId?: string;
}

/**
 * Sistemdeki TEK hata cikisi.
 *
 * DEVELOPMENT_RULES 7.2: her hata RFC 7807 bicimindedir ve ic detay SIZDIRMAZ —
 * stack trace, SQL, dosya yolu yoktur. Beklenmeyen hatalarin detayi log'a yazilir,
 * istemciye yalnizca traceId verilir; destek talebinde bu deger istenir.
 *
 * Bu filtre Faz 1'de kuruldu ki Faz 2'de yazilacak ilk hata da bu bicimde ciksin.
 * Sonradan eklemek, o gune kadar yazilmis her endpoint'e dokunmayi gerektirirdi.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    const problem = this.toProblemDetails(exception, request);

    if (problem.status >= SERVER_ERROR_THRESHOLD) {
      // Beklenmeyen hata: tam detay YALNIZCA log'a.
      this.logger.error({ err: exception }, 'Islenmemis hata');
    }

    response.status(problem.status).type(PROBLEM_CONTENT_TYPE).json(problem);
  }

  private toProblemDetails(exception: unknown, request: Request): ProblemDetails {
    const correlationId = getCorrelationId();
    const context: ProblemContext = {
      instance: request.originalUrl,
      ...(correlationId === undefined ? {} : { traceId: correlationId }),
    };

    if (exception instanceof ZodError) {
      return validationProblem(exception, context);
    }

    if (exception instanceof HttpException) {
      return httpProblem(exception, context);
    }

    return unexpectedProblem(context);
  }
}

function validationProblem(exception: ZodError, context: ProblemContext): ProblemDetails {
  return {
    type: `${PROBLEM_TYPE_BASE}/validation-failed`,
    title: 'Validation failed',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    detail: 'Istek govdesi veya parametreleri gecerli degil.',
    errors: exception.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
    ...context,
  };
}

function httpProblem(exception: HttpException, context: ProblemContext): ProblemDetails {
  const status = exception.getStatus();

  // Sunucu tarafi hatalarinin metni ISTEMCIYE GITMEZ.
  //
  // HttpException olmasi mesajin guvenli oldugu anlamina gelmez:
  // `new InternalServerErrorException(err.message)` gibi bir cagri, baglanti
  // dizesini, host adini veya sema detayini oldugu gibi cevaba tasir. Istemci
  // acisindan 5xx'in tek anlamli bilgisi "bizde bir sey bozuldu" ve traceId'dir.
  if (status >= SERVER_ERROR_THRESHOLD && !isDisclosable(exception)) {
    return serverErrorProblem(status, context);
  }

  return {
    type: `${PROBLEM_TYPE_BASE}/${slugify(exception.constructor.name)}`,
    title: exception.message,
    status,
    ...describeHttpException(exception),
    ...context,
  };
}

/**
 * Tum sunucu hatalari icin tek, detaysiz gosterim.
 *
 * Detay yalnizca log'a yazilir (bkz. ProblemDetailsFilter.catch) ve istemci
 * destek talebinde traceId ile eslestirilir.
 */
function serverErrorProblem(status: number, context: ProblemContext): ProblemDetails {
  return {
    type: `${PROBLEM_TYPE_BASE}/internal-server-error`,
    title: 'Internal server error',
    status,
    detail: 'Beklenmeyen bir hata olustu.',
    ...context,
  };
}

function unexpectedProblem(context: ProblemContext): ProblemDetails {
  return serverErrorProblem(HttpStatus.INTERNAL_SERVER_ERROR, context);
}

/** HttpException govdesi string veya nesne olabilir; yalnizca guvenli alani alir. */
function describeHttpException(exception: HttpException): { detail?: string } {
  const body: unknown = exception.getResponse();

  if (typeof body === 'string') {
    return { detail: body };
  }

  if (typeof body === 'object' && body !== null && 'message' in body) {
    const { message } = body;
    if (typeof message === 'string') {
      return { detail: message };
    }
    if (Array.isArray(message)) {
      return { detail: message.filter((item) => typeof item === 'string').join(', ') };
    }
  }

  return {};
}

function slugify(value: string): string {
  return value
    .replace(/Exception$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}
