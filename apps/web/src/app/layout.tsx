import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Business OS',
  description: 'AI destekli, cok kiracili SaaS Business Operating System',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-bg text-fg antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
