import { PipelineScreen } from '@/components/crm/pipeline-screen';

/**
 * `/app/crm/pipeline` — fırsat hattı.
 *
 * Rota `crm/[companyId]`in KARDEŞİDİR, çocuğu değil — ve bu bir tuzağı da
 * kapatıyor: `pipeline` statik bir segment olduğu için Next.js onu dinamik
 * `[companyId]` segmentinden ÖNCE eşleştirir. Yani `/app/crm/pipeline` asla
 * "id'si pipeline olan şirket" diye yorumlanmaz.
 */
export default function PipelinePage() {
  return <PipelineScreen />;
}
