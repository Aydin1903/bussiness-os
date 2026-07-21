import type {
  DependencyHealth,
  DependencyStatus,
  HealthResponse,
  HealthStatus,
} from '@business-os/contracts';

import { fetchHealth } from '@/lib/api-client';

// Saglik durumu her istekte yeniden okunur; statik uretim anlamsiz olurdu.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const health = await loadHealth();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Business OS</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Faz 1 — altyapi dogrulamasi. Bu sayfa API sozlesmesinin ucdan uca tip guvenli calistigini
          kanitlar.
        </p>
      </header>

      {health === null ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          API&apos;ye ulasilamadi. <code>pnpm dev</code> ile API&apos;nin ayakta oldugunu dogrula.
        </p>
      ) : (
        <HealthCard health={health} />
      )}
    </main>
  );
}

/**
 * API kapaliyken sayfanin cokmesi yerine bilgilendirici bir durum gosterilir.
 * Gelistirme sirasinda "beyaz ekran" en pahali geri bildirimdir.
 */
async function loadHealth(): Promise<HealthResponse | null> {
  try {
    return await fetchHealth();
  } catch {
    return null;
  }
}

function HealthCard({ health }: { health: HealthResponse }) {
  return (
    <section className="rounded-lg border border-slate-200 p-5 dark:border-slate-800">
      <div className="flex items-center justify-between">
        <span className="font-medium">{health.service}</span>
        <StatusBadge status={health.status} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-slate-500 dark:text-slate-400">Surum</dt>
        <dd>{health.version}</dd>
        <dt className="text-slate-500 dark:text-slate-400">Ortam</dt>
        <dd>{health.environment}</dd>
        <dt className="text-slate-500 dark:text-slate-400">Calisma suresi</dt>
        <dd>{health.uptimeSeconds} sn</dd>
      </dl>

      <ul className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
        <DependencyRow name="Database" dependency={health.dependencies.database} />
        <DependencyRow name="Redis" dependency={health.dependencies.redis} />
      </ul>
    </section>
  );
}

function DependencyRow({ name, dependency }: { name: string; dependency: DependencyHealth }) {
  return (
    <li className="flex items-center justify-between gap-4">
      <span>{name}</span>
      <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        {dependency.latencyMs === undefined ? null : <span>{dependency.latencyMs} ms</span>}
        <StatusBadge status={dependency.status} />
      </span>
    </li>
  );
}

// Record'un anahtar kumesi sozlesmedeki birlesim tipiyle sinirli: yeni bir durum
// eklendiginde burasi DERLENMEZ. Fallback yazmak, o derleme hatasini gizlerdi.
const STATUS_STYLES: Record<HealthStatus | DependencyStatus, string> = {
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100',
  degraded: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
  down: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  not_configured: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

function StatusBadge({ status }: { status: HealthStatus | DependencyStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}
