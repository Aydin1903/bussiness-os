import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Modül kartı.
 *
 * `href` VERİLİRSE kart tıklanabilir olur ve "yakında" rozeti gösterilmez;
 * verilmezse placeholder'dır. Ayrım tek bir alanda: bir modülün gerçek olup
 * olmadığını iki ayrı yerden (rozet + link) yönetmek, ikisinin ayrışmasına
 * davet olurdu.
 *
 * İçindeki mini-grafik DEKORATİFTİR: statik, veri yok. Gerçek grafikler
 * (veriyle) `dataviz` tasarım sistemiyle, modül fazında gelir.
 */
export function ModuleCard({
  title,
  description,
  icon: Icon,
  href,
}: {
  title: string;
  description: string;
  icon: IconType;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-fg-muted">
            <Icon width={16} height={16} />
          </span>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {href === undefined ? (
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-fg-muted">
            yakında
          </span>
        ) : null}
      </div>

      <DecorativeChart />

      <p className="mt-3 text-sm text-fg-muted">{description}</p>
    </>
  );

  const shell = 'flex flex-col rounded-card border border-border bg-surface p-5';

  if (href === undefined) {
    return <section className={shell}>{body}</section>;
  }

  return (
    <Link
      href={href}
      className={`${shell} transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30`}
    >
      {body}
    </Link>
  );
}

/** Statik, veri taşımayan dekoratif mini-grafik (soluk). */
function DecorativeChart() {
  const bars = [40, 62, 48, 78, 56, 88, 70];
  return (
    <svg
      viewBox="0 0 140 48"
      className="mt-4 h-12 w-full text-fg-muted/25"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {bars.map((height, index) => (
        <rect
          key={index}
          x={index * 20 + 3}
          y={48 - (height / 100) * 44}
          width={12}
          height={(height / 100) * 44}
          rx={2}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
