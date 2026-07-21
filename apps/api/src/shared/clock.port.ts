/**
 * Zaman okuma port'u.
 *
 * DEVELOPMENT_RULES 3.2: domain katmani `Date.now()` cagirmaz — zaman bir dis
 * dunya okumasidir ve dogrudan cagrildiginda kodu test edilemez kilar. "Ay sonu
 * ise su davranis degisir" gibi bir kurali dogrulamak icin sistemi saatini
 * degistirmek zorunda kalirsiniz.
 *
 * Bu port sayesinde zaman bir GIRDI olur: testler sabit bir tarih verir,
 * production gercek saati okur.
 *
 * `shared/` altinda yasar cunku tenant'a ozgu degildir — Identity, Audit ve
 * her is modulu ayni sozlesmeye ihtiyac duyar. Bir modul icinde tanimlansaydi,
 * diger moduller ya kopyalamak ya da o modulun internal kodunu import etmek
 * zorunda kalirdi; ikincisi ARCHITECTURE 6.1 geregi yasaktir.
 *
 * CLAUDE.md: `shared/` framework'suzdur. Bu dosya bir INTERFACE'tir; NestJS
 * `@Injectable()` isaretlemesi adapter tarafinda, infrastructure'da yapilir.
 */
/** DI token'i. Symbol kullanildi: string token'lar sessizce cakisabilir. */
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  /** Su anki zamani UTC olarak dondurur. */
  now(): Date;
}
