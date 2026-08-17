'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { applyThemeChoice, readThemeChoice, writeThemeChoice, type ThemeChoice } from './theme';

interface ThemeContextValue {
  readonly choice: ThemeChoice;
  readonly setChoice: (next: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Tema sağlayıcı — seçim + kalıcılık + belgeye uygulama.
 *
 * ============================================================================
 * ⚠️ BAŞLANGIÇ DEĞERİ NEDEN `'system'` VE SONRA DÜZELTİLİYOR
 * ============================================================================
 * `useState(readThemeChoice)` yazmak doğru görünür ama SUNUCUDA `'system'`,
 * istemcide `'dark'` üretir — React bunu hidrasyon uyuşmazlığı olarak bildirir
 * ve geliştirme konsolunu kirletir.
 *
 * Bunun GÖRSEL bir bedeli yoktur, çünkü belgenin `data-theme`i zaten inline
 * script tarafından ilk boyamadan önce yazılmıştır (`THEME_NO_FLASH_SCRIPT`).
 * Yani ekran doğru temada açılır; burada geç okunan şey yalnızca menüde hangi
 * seçeneğin işaretli görüneceğidir.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>('system');

  useEffect(() => {
    setChoiceState(readThemeChoice());
  }, []);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    writeThemeChoice(next);
    applyThemeChoice(next);
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ choice, setChoice }), [choice, setChoice]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * ⚠️ Sağlayıcı yoksa FIRLATIR, sessizce `'system'` dönmez.
 *
 * Sessiz geri dönüş, ağaca eklenmeyi unutulmuş bir sağlayıcıyı çalışır gibi
 * gösterirdi: tema düğmesi tıklanır, hiçbir şey olmaz ve sebebi görünmez.
 */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error('useTheme, ThemeProvider içinde kullanılmalı.');
  }
  return value;
}
