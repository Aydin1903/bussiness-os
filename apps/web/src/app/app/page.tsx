import { CustomersIcon, FinanceIcon, KnowledgeIcon, ProjectsIcon } from '@/components/icons';
import { AiWelcomeCard } from '@/components/dashboard/ai-welcome-card';
import { DailyReportCard } from '@/components/dashboard/daily-report-card';
import { ModuleCard } from '@/components/dashboard/module-card';
import { OnboardingGate } from '@/components/dashboard/onboarding-gate';

/**
 * `/app` — Genel Bakış (dashboard).
 *
 * AI-öncelikli düzen: önce karşılama/asistan kartı (placeholder), sonra modül
 * kartları (hepsi "yakında"). Henüz tenant-scoped GERÇEK veri yoktur; içerik
 * tamamen statiktir (bkz. AiWelcomeCard / ModuleCard yorumları).
 *
 * `OnboardingGate` sarmalayıcıdır: tenant'ın hiç notu yoksa kullanıcı buraya
 * değil `/app/onboarding`'e gider (ADR-0030 §3). Sayfa Server Component kalır;
 * kontrol client tarafındadır çünkü oturum token'ı memory'dedir (§2).
 */
const MODULES = [
  {
    title: 'Müşteriler',
    description: 'Müşteri kayıtları ve ilişki geçmişi — AI için müşteri hafızası.',
    icon: CustomersIcon,
  },
  {
    title: 'Finans',
    description: 'Gelir, gider ve nakit akışı — AI için finansal hafıza.',
    icon: FinanceIcon,
  },
  {
    title: 'Projeler',
    description: 'İşler, teslimatlar ve zaman — AI için yürütme hafızası.',
    icon: ProjectsIcon,
  },
  {
    title: 'Bilgi Bankası',
    description: 'Belgeler, kararlar ve politikalar — AI için kurumsal hafıza.',
    icon: KnowledgeIcon,
  },
] as const;

export default function DashboardPage() {
  return (
    <OnboardingGate>
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Genel Bakış</h1>
          <p className="text-sm text-fg-muted">Şirketinin durumuna tek bakışta bak.</p>
        </header>

        <AiWelcomeCard />

        <DailyReportCard />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {MODULES.map((module) => (
            <ModuleCard
              key={module.title}
              title={module.title}
              description={module.description}
              icon={module.icon}
            />
          ))}
        </div>
      </div>
    </OnboardingGate>
  );
}
