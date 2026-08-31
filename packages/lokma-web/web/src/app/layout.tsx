import type { Metadata } from 'next';
import './globals.css';

/**
 * Root layout — single layout for all routes (DRY).
 */

export const metadata: Metadata = {
  title: 'Lokma — harness',
  description: 'Innovative agentic coding harness — CLI + Web',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
