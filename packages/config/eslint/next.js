import globals from 'globals';

import { createBaseConfig } from './base.js';

/**
 * Next.js web uygulamasina ozel ESLint kurallari.
 *
 * @param {{ tsconfigRootDir: string }} options
 */
export function createNextConfig({ tsconfigRootDir }) {
  return [
    ...createBaseConfig({ tsconfigRootDir }),
    {
      // Next.js tarafindan URETILEN dosyalar. Elle duzenlenmezler ve her build'de
      // yeniden yazilirlar; lint etmek anlamsiz gurultu uretir.
      ignores: ['next-env.d.ts', '.next/**'],
    },
    {
      files: ['src/**/*.{ts,tsx}'],
      languageOptions: {
        globals: {
          ...globals.browser,
          ...globals.node,
        },
      },
      rules: {
        // API sozlesmeleri tek kaynaktan gelir; web kendi tipini uydurmaz.
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@business-os/contracts/dist/*', '@business-os/contracts/src/*'],
                message: 'contracts paketi yalnizca public entry uzerinden import edilir.',
              },
            ],
          },
        ],
        // React bilesenleri JSX dondurur; her export'a acik tip yazmak deger uretmez.
        '@typescript-eslint/explicit-module-boundary-types': 'off',
      },
    },
  ];
}
