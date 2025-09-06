// app/layout.tsx
import './globals.css';

export const metadata = {
  title: 'BroMan 1.0 — Demo',
  description: 'Next.js + Vercel AI SDK v5 (beta)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
