import type { ReactNode } from 'react';

import { KobiWiseWordmark } from '@/components/brand';

/**
 * Auth sayfaları için ortak düzen — ortalanmış tek kart (§3.1).
 *
 * `login` · `register` · `verify-email` · `forgot/reset-password` gibi kimliksiz
 * akışlar bu wrapper'ı paylaşır. Bunlar Client Component'tır (form state, doğrudan
 * API'ye POST); SSR faydası yoktur. İçerik F2'de gelir.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {/*
          YAZILI LOGO BURADA TAM HÂLİYLE DURUR (Product Owner, 2026-08-17).

          Giriş ekranı kullanıcının HENÜZ İÇERİDE OLMADIĞI yüzeydir; markanın
          kendini tam olarak tanıttığı tek yer burasıdır — bu yüzden "Business
          OS" alt satırı da yalnızca burada açılır.

          ⚠️ K işareti burada KULLANILMAZ: ad zaten yazılıyken yanına baş
          harfini koymak aynı şeyi iki kez söylemek olurdu.
        */}
        <div className="mb-8 flex justify-center">
          <KobiWiseWordmark size={34} descriptor />
        </div>
        <section className="rounded-card border border-border bg-surface p-8">{children}</section>
      </div>
    </main>
  );
}
