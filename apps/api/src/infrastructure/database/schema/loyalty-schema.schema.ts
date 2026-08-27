import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * `loyalty` semasi — Faz 5'in ONIKINCI ve SON is modulu (ADR-0051 §1).
 *
 * `platform` disindaki ONUCUNCU sema. Mutlak Kural 5: her modul kendi semasina
 * sahiptir ve cross-schema FK yasaktir (tek istisna `platform.tenants`).
 *
 * ============================================================================
 * ⚠️ AD `loyalty` — sema · klasor · rota · `data-module` · palet AYNI KELIME
 * ============================================================================
 * ADR-0035'in `booking` -> `appointments` dersi, BESINCI kez okunuyor:
 * ayrisirsa `data-module` SESSIZCE tutmaz (ekran calisir, terracotta kalir,
 * lint yakalamaz). Kelime `module-colors.css`te ZATEN `loyalty` diye
 * secilmisti (`#9a5a84` / koyu `#d792be`) — yani `documents`, `feedback` ve
 * `marketing` gibi palet ILK GUNDEN dogru adla yazilmis.
 *
 * ⚠️ IZIN KAYNAKLARI ise `loyalty_account` ve `loyalty_point`; modul anahtari
 * ile izin kaynaginin ayrismasi bu projede KURALDIR.
 *
 * ⚠️ Adlar NITELENMIS ve gerekce ADR-0039'un `stock_item` karariyla ayni:
 * ONGORU. Ciplak `account`, ⚠️ **Faz 6 FATURALAMA'dir** (ROADMAP §4) ve "hesap"
 * orada KACINILMAZ bir kavramdir (abonelik/faturalama hesabi) — cakisirdi.
 */
export const loyaltySchema = pgSchema('loyalty');
