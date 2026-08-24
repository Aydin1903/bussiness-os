import { z } from 'zod';

/**
 * `GET /api/v1/audit` sorgu parametreleri (ADR-0043 §6.4).
 *
 * Liste HER ZAMAN sayfalidir (DEVELOPMENT_RULES 7.1). ⚠️ Bu ucta ust sinir
 * digerlerinden daha anlamlidir: `platform.audit_log` `messages`tan sonra en
 * hizli buyuyecek tablodur (§6.7) ve sinirsiz bir `limit`, tek istekte butun
 * denetim gecmisini cekmenin kapisi olurdu.
 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const listAuditSchema = z
  .object({
    /**
     * `<modul>.<kaynak>` — ornek: `hr.employee`.
     *
     * ⚠️ NUMARALANDIRILMAZ (enum degil): platform, modullerin kaynak sozlugunu
     * BILMEZ — tablonun kendi CHECK kisitiyla ayni karar. Bir enum, her yeni
     * modulde bu dosyayi degistirmeyi gerektirirdi.
     */
    resourceType: z.string().trim().min(1).max(64).optional(),
    resourceId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict()
  .refine((value) => value.resourceId === undefined || value.resourceType !== undefined, {
    // ==========================================================================
    // ⚠️ `resourceId` TEK BASINA VERILEMEZ
    // ==========================================================================
    // Kaynak turu bilinmeden bir uuid filtrelemek, _"bu id'ye ne oldu"_ demek
    // yerine _"bu id'yi kim tasiyorsa"_ demektir. Iki farkli modulde ayni id
    // teoride bulunabilir (id'ler modul basina uretilir, global bir kayit
    // defteri yoktur) ve iki kaydin gecmisi TEK LISTEDE karisirdi.
    //
    // Sessizce izin vermek yerine 422 doner: karisik bir denetim listesi,
    // okuyan kisinin fark edemeyecegi bir yanlistir.
    // ==========================================================================
    message: 'resourceId verildiginde resourceType da verilmelidir.',
    path: ['resourceType'],
  });

export type ListAuditQueryDto = z.infer<typeof listAuditSchema>;
