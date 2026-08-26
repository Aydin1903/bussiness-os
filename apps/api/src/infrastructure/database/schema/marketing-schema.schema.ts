import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * `marketing` semasi — Faz 5'in ONBIRINCI is modulu (ADR-0047 §1).
 *
 * `platform` disindaki ONIKINCI sema. Mutlak Kural 5: her modul kendi semasina
 * sahiptir ve cross-schema FK yasaktir (tek istisna `platform.tenants`).
 *
 * ============================================================================
 * ⚠️ AD `marketing`, `campaign` DEGIL (ADR-0047 §1.1)
 * ============================================================================
 * ADR-0035'in `booking` -> `appointments` dersi: sema · modul klasoru · rota ·
 * `data-module` · `module-colors.css` blogu AYNI KELIME olmalidir; ayrisirsa
 * `data-module` SESSIZCE tutmaz. Kelime `module-colors.css`te ZATEN
 * `marketing` diye secilmisti — yani bu sefer yeniden adlandirma isi HIC
 * DOGMADI (`documents` ve `feedback` gibi).
 *
 * ⚠️ IZIN KAYNAGI ise `campaign` ve bu bir tutarsizlik DEGILDIR: modul
 * anahtari ile izin kaynaginin ayrismasi bu projede KURALDIR (`invoicing` ->
 * `quote`/`invoice`, `inventory` -> `stock_item`/`stock_movement`, `crm` ->
 * `company`/`contact`/...). Modul bir HAFIZA ALANIDIR, izin bir KAYNAK
 * uzerindedir.
 */
export const marketingSchema = pgSchema('marketing');
