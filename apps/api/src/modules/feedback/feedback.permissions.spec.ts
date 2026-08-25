import { describe, expect, it } from 'vitest';

import {
  FEEDBACK_CREATE,
  FEEDBACK_DELETE,
  FEEDBACK_PERMISSIONS,
  FEEDBACK_READ,
} from './feedback.permissions';

/**
 * Geri bildirim permission katalogu (ADR-0025, ADR-0045 §5).
 *
 * ⚠️ BU DOSYANIN ASIL ISI, DEGISTIRILEMEZLIGIN BIRINCI KATMANINI KILITLEMEKTIR:
 * `feedback:write` DIYE BIR IZIN OLMAMALI. Katalogda olmayan bir izni guard
 * hicbir role vermez — yani bir `PATCH` ucu yazilsa bile 403 alir.
 */
describe('FEEDBACK_PERMISSIONS (ADR-0045 §5)', () => {
  const byPermission = new Map(FEEDBACK_PERMISSIONS.map((rule) => [rule.permission, rule.roles]));

  it('⚠️ KATMAN 1: `feedback:write` DIYE BIR IZIN YOKTUR', () => {
    // Projede iki ad ayri anlam tasir:
    //     `write`  -> olustur VE guncelle
    //     `create` -> YALNIZCA olustur
    // Kayit GUNCELLENMEZ (§2), dolayisiyla VAR OLMAYAN BIR FIILI deklare etmek
    // yanlis olurdu. ⚠️ "Var olmayan bir izin, unutulmus bir izin degildir."
    expect(byPermission.has('feedback:write')).toBe(false);
    expect(byPermission.has('feedback:update')).toBe(false);
  });

  it('katalog TAM OLARAK uc izin tasir', () => {
    // Sessizce buyuyen bir katalog, bu modulun en sessiz gerilemesidir.
    expect([...byPermission.keys()].sort()).toEqual([
      FEEDBACK_CREATE,
      FEEDBACK_DELETE,
      FEEDBACK_READ,
    ]);
  });

  it('⚠️ `feedback:read` GENIS — dort rol de tasir (§5)', () => {
    // ADR-0034 §7'nin olcutu: musteri memnuniyeti PAYLASILAN bir is gercegidir.
    // Bir musterinin sikayetini gormesi gereken kisi tam olarak `member`dir.
    expect(byPermission.get(FEEDBACK_READ)).toEqual(['owner', 'admin', 'member', 'viewer']);
  });

  it('`feedback:create` member`a kadar — viewer YAZAMAZ', () => {
    expect(byPermission.get(FEEDBACK_CREATE)).toEqual(['owner', 'admin', 'member']);
  });

  it('⚠️ `feedback:delete` DAR — member SILEMEZ (§2.2)', () => {
    // Iki gerekce: (a) silme AI HAFIZASINDAN DA siler (vektor ayni satirda),
    // (b) bir KVKK islemi ve bir TURETILMIS RAKAMI degistirir — yani bir
    // YONETIM islemidir, gunluk is degil.
    expect(byPermission.get(FEEDBACK_DELETE)).toEqual(['owner', 'admin']);
  });

  it('⚠️ AD NITELIKSIZ — cakisma yok, ongoruye de gerek yok', () => {
    // `feedback`, `rating`, `response`, `survey` — dorduyle de cakisma yok.
    // ADR-0039'un `item` -> `stock_item` ongorusu burada GEREKMIYOR: 11. modulun
    // kavrami `campaign`, 12. modulunki `loyalty_point`tir.
    for (const permission of byPermission.keys()) {
      expect(permission.startsWith('feedback:')).toBe(true);
    }
  });
});
