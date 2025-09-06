'use client';

import './globals.css';
import Chat from '@/components/Chat';
import { StatsProvider, StatsBar } from '@/components/StatsBar';
import Dock from '@/components/Dock';

export default function Page() {
  return (
    <StatsProvider>
      {/* стеклянный статус-оверлей сверху */}
      <StatsBar />

      {/* центральная «капсула» чата */}
      <main className="hero">
        <Chat />
      </main>

      {/* плавающий виджет справа снизу */}
      <Dock />

      {/* подвал */}
      <footer className="footer">
        by <strong>&nbsp;Sokolov&nbsp;Dev</strong> for Monitoring Automation
        <span>&nbsp;•&nbsp;</span>
        <a
          href="https://github.com/andy-sklv/ai-v5-demo"
          target="_blank"
          rel="noopener noreferrer"
          className="footer-link"
        >
          GitHub — ai-v5-demo (UI)
        </a>
        <span>&nbsp;•&nbsp;</span>
        <a
          href="https://github.com/andy-sklv/toto-service"
          target="_blank"
          rel="noopener noreferrer"
          className="footer-link"
        >
          GitHub — toto-service (FastAPI)
        </a>
      </footer>
    </StatsProvider>
  );
}
