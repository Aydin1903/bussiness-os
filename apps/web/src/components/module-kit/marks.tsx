import type { ReactNode } from 'react';

/**
 * Kart işaretleri — BEDAVA akıllılık.
 *
 * `crm/signals.tsx` içinde doğdular; modüle özgü OLMAYAN iki tanesi buraya
 * taşındı. `LastContactMark` ("son temas") ve `StageAgeMark` ("aynı aşamada
 * kaç gün") CRM'in sözlüğünü taşıdıkları için ORADA KALDI — modül kitine
 * girmenin sınavı "iki modül de aynı şekilde kullanabilir mi"dir.
 *
 * ============================================================================
 * HİÇBİRİ AI ÇAĞIRMAZ
 * ============================================================================
 * Zaten elde olan veriden türerler: sayaçlar, tarihler, durumlar. Bir model
 * çağrısı yok, bir kuruş maliyet yok, gecikme yok — ama kullanıcının "neye
 * bakmalıyım" sorusunun cevabı büyük ölçüde bunlarda.
 *
 * ============================================================================
 * TEK GÖRSEL DİL: mono · küçük punto · nokta
 * ============================================================================
 * Her işaret `Mark` üzerinden çizilir. Ayrı ayrı biçimlendirilseydi kartta
 * birkaç farklı "küçük yazı" belirir ve hiçbiri diğerinden daha önemli
 * görünmezdi. Ortak biçim, farkı YALNIZCA renge indirger:
 *
 *   sessiz (`fg-3`)  → bilgi. "3 gün önce görüşülmüş."
 *   uyanık (`ink`)   → dikkat. "34 gündür bekliyor."
 *
 * `--danger` HİÇBİRİNDE kullanılmaz: geciken bir takip ya da uzun süredir
 * beklemiş bir iş HATA değildir, yapılacak iştir. Sistemde dikkat çeken renk
 * zaten modülün imza rengidir (`--ink`) — CRM'de çivit mavisi, Projeler'de
 * zeytin. Terracotta yalnızca AI'ın sesidir (`--ai-ink`).
 */
export function Mark({ children, quiet = false }: { children: ReactNode; quiet?: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 font-mono text-[9.5px] font-medium tracking-[0.09em] uppercase tabular',
        quiet ? 'text-fg-3' : 'text-ink',
      ].join(' ')}
    >
      {quiet ? null : (
        <span aria-hidden className="h-[3px] w-[3px] shrink-0 rounded-full bg-accent" />
      )}
      {children}
    </span>
  );
}

/**
 * "2 YETKİLİ" · "3 AÇIK GÖREV" — kartın envanter satırı.
 *
 * ============================================================================
 * SIFIR DA YAZILIR — ve bu bilinçli
 * ============================================================================
 * Sıfır sayacı gizlemek kartı "temiz" tutardı ama bilgi kaybettirirdi:
 * "0 açık görev" tam olarak bakılması gereken durumdur (proje var, iş yok).
 * Gizlenseydi o kayıt, sayaçları olanlardan görsel olarak ayırt edilemezdi.
 *
 * SESSİZ kalır (`quiet`): bir envanter sayısı uyarı değildir. Uyarı rengini
 * yalnızca eylem gerektiren sinyaller taşır — aksi halde kartta üç renkli
 * satır olur ve hiçbiri dikkat çekmez.
 *
 * Türkçe çoğul eki YOK: "2 yetkili" doğru, "2 yetkililer" yanlış. Sayı zaten
 * çokluğu taşıyor.
 */
export function CountMark({ count, singular }: { count: number; singular: string }) {
  return (
    <Mark quiet>
      {count} {singular}
    </Mark>
  );
}
