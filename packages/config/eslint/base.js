import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Tum paketlerin paylastigi ESLint temeli.
 *
 * Buradaki kurallarin buyuk bolumu DEVELOPMENT_RULES.md 2.3 ve 2.5'in
 * makine tarafindan zorlanan karsiligidir. Insan disiplinine birakilan
 * mimari kural ucuncu ayda ihlal edilir.
 *
 * @param {{ tsconfigRootDir: string }} options
 */
export function createBaseConfig({ tsconfigRootDir }) {
  return tseslint.config(
    {
      ignores: [
        'dist/**',
        '.next/**',
        'coverage/**',
        'node_modules/**',
        '*.config.js',
        '*.config.mjs',
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
        globals: {
          ...globals.node,
        },
      },
      rules: {
        // --- DEVELOPMENT_RULES 2.3 — Yasaklar ---
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@typescript-eslint/ban-ts-comment': [
          'error',
          {
            'ts-ignore': true,
            'ts-nocheck': true,
            'ts-expect-error': 'allow-with-description',
            minimumDescriptionLength: 10,
          },
        ],
        // "as" ile tip zorlama dogrulamanin yerine gecemez. Zod kullanilir.
        // as const bu kuraldan muaftir (const assertion tip zorlamasi degildir).
        '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],

        // --- DEVELOPMENT_RULES 2.3 — Zorunluluklar ---
        '@typescript-eslint/explicit-module-boundary-types': 'error',
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],

        // --- DEVELOPMENT_RULES 2.5 — Sinirlar "koku"dur, bu yuzden warn ---
        complexity: ['warn', 10],
        'max-depth': ['warn', 3],
        'max-params': ['warn', 3],
        'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
        'max-lines-per-function': ['warn', { max: 30, skipBlankLines: true, skipComments: true }],

        // --- Genel ---
        // Log her zaman yapilandirilmis logger uzerinden (ARCHITECTURE 8).
        'no-console': 'error',
        eqeqeq: ['error', 'always', { null: 'ignore' }],
        'no-param-reassign': 'error',
        'prefer-const': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
      },
    },
    // Test dosyalari: uzunluk sinirlari ve bazi tip katiliklari gevsetilir.
    //
    // consistent-type-assertions burada kapatildi: test double'lari kismi bir
    // nesneyi framework arayuzune (Request, Response) daraltmak zorundadir ve
    // bunun tip-guvenli bir alternatifi yoktur. Yasagin hedefi, URUN kodunda
    // "as" ile dogrulamayi atlamaktir — sahte nesne kurmak degil.
    {
      files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/test/**/*.ts'],
      rules: {
        'max-lines-per-function': 'off',
        'max-lines': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/consistent-type-assertions': 'off',
      },
    },
    prettier,
  );
}
