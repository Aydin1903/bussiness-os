import type { CSSProperties } from 'react';

/**
 * `--c` (odanın imza rengi) için TİP ONAYSIZ `style` nesnesi.
 *
 * ⚠️ `CSSProperties`in index imzası YOKTUR, yani `{'--c': '#3173af'}` doğrudan
 * atanamaz. Tip onayı (`as CSSProperties`) bu projede YASAKTIR
 * (`consistent-type-assertions: never`, `packages/config/eslint/base.js`).
 *
 * Arayüzü genişletmek aynı işi yapar ve TİP GÜVENLİDİR: anahtar adı yanlış
 * yazılırsa derleme hatası olur — sessizce etkisiz bir stil değil.
 * `auth-screen.tsx`in `SloganStyle` deseninin birebir aynısı.
 */
export interface AccentStyle extends CSSProperties {
  readonly '--c': string;
}

/** Odanın imza rengini bir `style` nesnesine çevirir. */
export function accentStyle(renk: string): AccentStyle {
  return { '--c': renk };
}
