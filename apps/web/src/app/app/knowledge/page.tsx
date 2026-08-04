import { KnowledgeScreen } from './knowledge-screen';

/**
 * `/app/knowledge` — Bilgi Bankası.
 *
 * Sayfa Server Component kalır ve yalnızca sarar; ekranın tamamı bir Client
 * Component'tir (oturum token'ı memory'dedir, veri istemciden çekilir).
 * `/app/onboarding` ve `/app/change-password` ile aynı desen.
 */
export default function KnowledgePage() {
  return <KnowledgeScreen />;
}
