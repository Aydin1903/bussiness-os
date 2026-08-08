import { StageListScreen } from '@/components/crm/stage-list-screen';

/**
 * `/app/crm/pipeline/[stage]` — bir aşamanın tam listesi.
 *
 * Panonun "+N tümünü gör" bağlantısı buraya açılır. Doğrulama BURADA yapılmaz:
 * aşama adının beş aşamadan biri olup olmadığını ekran kontrol eder ve
 * geçersizse "böyle bir aşama yok" der — sunucuya gereksiz bir istek atılmaz.
 *
 * ⚠️ Next.js 15'te `params` bir Promise'tir ve `await` edilmeden okunamaz.
 */
export default async function PipelineStagePage({
  params,
}: {
  params: Promise<{ stage: string }>;
}) {
  const { stage } = await params;

  return <StageListScreen stage={stage} />;
}
