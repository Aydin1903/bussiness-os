import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import importPlugin from 'eslint-plugin-import';

import { createBaseConfig } from './base.js';

/** Modulun ic yapisini olusturan katmanlar (ARCHITECTURE 4). */
const LAYERS = ['domain', 'application', 'infrastructure', 'presentation'];

/** Modul barindiran kok klasorler (ARCHITECTURE 6.2). */
const MODULE_ROOTS = ['modules', 'platform'];

/**
 * Katman bagimlilik yonunu zorlar: bagimlilik DAIMA iceri dogru akar.
 *
 * `import/no-restricted-paths`, import'u COZULMUS DOSYA YOLUNA cevirip
 * karsilastirir. Bu, specifier metnine bakan kurallardan farkli olarak relative
 * yol derinliginden etkilenmez — `../x` ile `../../../x` ayni sekilde denetlenir.
 */
function layerDirectionZones() {
  const forbidden = {
    domain: ['application', 'infrastructure', 'presentation'],
    application: ['infrastructure', 'presentation'],
  };

  return Object.entries(forbidden).flatMap(([target, sources]) =>
    sources.map((source) => ({
      target: `./src/**/${target}/**`,
      from: `./src/**/${source}/**`,
      message: `Bagimlilik yonu daima iceri dogrudur: ${target} katmani ${source} katmanini import edemez (ARCHITECTURE 4).`,
    })),
  );
}

/**
 * Her modulun ic kodunu diger modullere kapatir; yalnizca `<modul>.public.ts`
 * disa aciktir (ARCHITECTURE 6.1).
 *
 * Bolgeler dosya sisteminden URETILIR: yeni bir modul eklendiginde kural
 * kendiliginden genisler, kimsenin config'i guncellemesi gerekmez. Elle
 * bakilan bir liste, ucuncu modulde unutulur.
 */
function moduleIsolationZones(tsconfigRootDir) {
  const modules = [];

  for (const root of MODULE_ROOTS) {
    const rootDir = join(tsconfigRootDir, 'src', root);

    if (!existsSync(rootDir)) {
      continue;
    }

    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        modules.push({ root, name: entry.name });
      }
    }
  }

  return modules
    .map((module) => ({
      // Kendisi haric TUM moduller acikca listelenir — glob negasyonu
      // kullanilmaz, cunku eslestirme davranisi motora gore degisiyor.
      target: modules
        .filter((other) => !(other.root === module.root && other.name === module.name))
        .map((other) => `./src/${other.root}/${other.name}/**`),
      // Yalnizca KATMAN klasorleri kapatilir. `<modul>.public.ts` ve
      // `<modul>.module.ts` modul KOKUNDE durdugu icin dogal olarak bu kapsamin
      // disinda kalir — ayrica bir istisna (`except`) tanimlamaya gerek yok.
      // Istisna listesi kirilgan: glob tabani kural surumune gore degisiyor.
      from: LAYERS.map((layer) => `./src/${module.root}/${module.name}/${layer}/**`),
      message: `${module.name} modulunun internal kodu disaridan import edilemez. Yalnizca ${module.name}.public.ts veya domain event kullan (ARCHITECTURE 6.1).`,
    }))
    .filter((zone) => zone.target.length > 0);
}

/**
 * NestJS API'sine ozel ESLint kurallari.
 *
 * Buradaki kurallar ARCHITECTURE.md 4 (katman mimarisi) ve 6.1 (modul sinirlari)
 * maddelerini makine tarafindan zorlar.
 *
 * @param {{ tsconfigRootDir: string }} options
 */
export function createNestConfig({ tsconfigRootDir }) {
  return [
    ...createBaseConfig({ tsconfigRootDir }),

    // --- ARCHITECTURE 2.3 / DEVELOPMENT_RULES 8 — env erisimi tek noktadan ---
    {
      files: ['src/**/*.ts'],
      rules: {
        'no-restricted-properties': [
          'error',
          {
            object: 'process',
            property: 'env',
            message:
              'process.env yalnizca infrastructure/config icinde okunur. ' +
              'Dogrulanmis config nesnesini enjekte et (ARCHITECTURE 2.3).',
          },
        ],
      },
    },
    {
      files: ['src/infrastructure/config/**/*.ts'],
      rules: { 'no-restricted-properties': 'off' },
    },

    // --- ARCHITECTURE 4 — Domain katmani: framework'suz, I/O'suz ---
    {
      files: ['src/**/domain/**/*.ts'],
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@nestjs', '@nestjs/*'],
                message:
                  'Domain katmani framework import edemez. NestJS dahil hicbir framework giremez (ARCHITECTURE 4).',
              },
              {
                group: [
                  'drizzle-orm',
                  'drizzle-orm/*',
                  'pg',
                  'express',
                  'pino',
                  'pino-http',
                  'nestjs-pino',
                  'ioredis',
                  '@nestjs/swagger',
                ],
                message: 'Domain katmani I/O ve altyapi kutuphanesi bilmez (ARCHITECTURE 4).',
              },
              // Katmanlar arasi yol kisitlari burada DEGIL, import/no-restricted-paths
              // ile zorlanir: o kural cozulmus dosya yoluna bakar ve relative
              // derinlikten etkilenmez. Burasi yalnizca kutuphane yasaklari icindir.
            ],
          },
        ],
      },
    },

    // --- ARCHITECTURE 4 — Application katmani: port sahibi, adapter bilmez ---
    {
      files: ['src/**/application/**/*.ts'],
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['drizzle-orm', 'drizzle-orm/*', 'pg', 'express', 'ioredis'],
                message:
                  'Application katmani somut altyapiya bagimli olamaz. Port tanimla, adapter infrastructure yazsin (ARCHITECTURE 4).',
              },
              // Bkz. yukaridaki not: katman yonu import/no-restricted-paths ile zorlanir.
            ],
          },
        ],
      },
    },

    // --- ARCHITECTURE 4 ve 6.1 — Katman yonu ve modul sinirlari ---
    //
    // Bu kural, import specifier METNINE degil, cozulmus DOSYA YOLUNA bakar.
    // Onceki glob tabanli denemeler tam da bu yuzden basarisiz olmustu: metin
    // uzerinde `../../x` ile `../../../x` farkli desenlere denk geliyor ve
    // "kac seviye yukari cikildigi" mimari bir anlam tasimiyor.
    {
      files: ['src/**/*.ts'],
      plugins: { import: importPlugin },
      settings: {
        'import/resolver': {
          typescript: { project: join(tsconfigRootDir, 'tsconfig.json') },
        },
      },
      rules: {
        'import/no-restricted-paths': [
          'error',
          {
            basePath: tsconfigRootDir,
            zones: [...layerDirectionZones(), ...moduleIsolationZones(tsconfigRootDir)],
          },
        ],
      },
    },

    // NestJS modul siniflari tanim geregi bostur: tasidiklari bilgi @Module
    // decorator'undedir. no-extraneous-class burada framework'un mesru desenini
    // yakalar, gercek bir kod kokusunu degil.
    {
      files: ['src/**/*.module.ts'],
      rules: { '@typescript-eslint/no-extraneous-class': 'off' },
    },

    // Bootstrap ve migration script'leri: konsol cikti ve env erisimi mesru.
    {
      files: ['src/main.ts', 'scripts/**/*.{ts,mts}', 'drizzle.config.ts'],
      rules: {
        'no-console': 'off',
        'no-restricted-properties': 'off',
      },
    },
  ];
}
