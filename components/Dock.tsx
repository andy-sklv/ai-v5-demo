'use client';
import * as React from 'react';
import { SYSTEM_PROMPT } from '@/lib/systemPrompt';

const MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4o-mini-translate', 'gpt-4.1-mini'];

export default function Dock() {
  const [openSettings, setOpenSettings] = React.useState(false);
  const [openAbout, setOpenAbout] = React.useState(false);

  return (
    <>
      <div className="dock">
        <button
          className="dock-btn"
          onClick={() => setOpenSettings(true)}
          title="Задай промт и выбери модель"
        >
          ⚙️ Настройки
        </button>
        <button
          className="dock-btn"
          onClick={() => setOpenAbout(true)}
          title="Стек, технологии, решения"
        >
          ℹ️ О проекте
        </button>
      </div>

      {openSettings && <SettingsModal onClose={() => setOpenSettings(false)} />}
      {openAbout && <AboutModal onClose={() => setOpenAbout(false)} />}
    </>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [model, setModel] = React.useState<string>(
    typeof window !== 'undefined'
      ? localStorage.getItem('modelName') || 'gpt-4o-mini'
      : 'gpt-4o-mini'
  );
  const [system, setSystem] = React.useState<string>(
    typeof window !== 'undefined'
      ? localStorage.getItem('systemPrompt') || SYSTEM_PROMPT
      : SYSTEM_PROMPT
  );

  function save() {
    localStorage.setItem('modelName', model);
    localStorage.setItem('systemPrompt', system);
    window.dispatchEvent(new Event('local-model-changed'));
    window.dispatchEvent(new Event('local-system-changed'));
    onClose();
  }

  return (
    <div className="modal" onMouseDown={(e)=>e.target===e.currentTarget && onClose()}>
      <div className="modal-card">
        <h3 className="modal-title">Настройки</h3>

        <label className="label">Модель</label>
        <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
          {MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <label className="label mt-2">System prompt</label>
        <textarea
          className="input"
          rows={8}
          value={system}
          onChange={(e) => setSystem(e.target.value)}
        />

        <div className="row mt-3">
          <button className="btn btn-primary" onClick={save}>
            Сохранить
          </button>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal" onMouseDown={(e)=>e.target===e.currentTarget && onClose()}>
      <div className="modal-card">
        <h3 className="modal-title">Проект: BroMan — AI SDK v5 (demo) + Datadog Toto</h3>

        <div className="about">
          <h4>Что демонстрирует</h4>
          <ul>
            <li>Стриминговые ответы (Edge) через <code>streamText()</code> + защищённый fallback.</li>
            <li>Tool calling с <code>zod</code> (time / weather / math / shippingCost).</li>
            <li>Vision API (переключаемый): <code>/api/vision</code> (gpt-4o) и <code>/api/vision41</code> (gpt-4.1-vision).</li>
            <li>Панель <strong>Datadog Toto (demo)</strong> — графики <em>Chars/sec</em>, <em>Latency</em> и прогноз.</li>
            <li>UI-улучшения: чат в «телеграм-стиле», мягкие анимации, мини-панели Vision/Shipping, модалки модели/промпта.</li>
          </ul>

          <h4>Toto — как подключено</h4>
          <ul>
            <li>Мини-сервер на FastAPI (<code>toto-server</code>) с эндпоинтами <code>GET /health</code>, <code>POST /forecast</code>.</li>
            <li>Сервис запущен под <code>systemd</code> (автозапуск, рестарт, логи в <code>journalctl</code>).</li>
            <li>Next.js прокси <code>/api/toto</code> ходит к Python-сервису по <code>TOTO_PROXY_URL</code>, есть локальный fallback (EMA).</li>
            <li>В статус-оверлее добавлены: <em>CPS now/avg + тренд</em>, <em>Latency p50/p95</em>, <em>Forecast next</em>, <em>TPS</em>, индикатор аномалий.</li>
          </ul>

          <h4>Инфраструктура</h4>
          <ul>
            <li>Next.js 14 (App Router, Edge runtime), Vercel AI SDK v5, <code>@ai-sdk/openai</code>.</li>
            <li>Docker multi-stage для фронта, <code>systemd</code> для Python-сервиса Toto.</li>
            <li>Конфиг через <code>.env</code>: <code>OPENAI_API_KEY</code>, <code>NEXT_PUBLIC_VISION_API</code>, <code>NEXT_PUBLIC_TOTO_ENABLED</code>, <code>TOTO_PROXY_URL</code>.</li>
          </ul>

          <h4>Где смотреть код</h4>
          <ul>
            <li>Чат API: <code>app/api/chat/route.ts</code></li>
            <li>Vision API: <code>app/api/vision/route.ts</code>, <code>app/api/vision41/route.ts</code></li>
            <li>Панель Toto: <code>components/TotoPanel.tsx</code>; прокси: <code>app/api/toto/route.ts</code></li>
            <li>UI: чат <code>components/Chat.tsx</code>, оверлей <code>components/StatsBar.tsx</code>, док <code>components/Dock.tsx</code></li>
            <li>Python-сервис: <code>toto-server/main.py</code> (+ unit <code>systemd</code>)</li>
          </ul>
        </div>

        <div className="row mt-3">
          <button className="btn btn-primary" onClick={onClose}>
            Ок
          </button>
        </div>
      </div>
    </div>
  );
}
