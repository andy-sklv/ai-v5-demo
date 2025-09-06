'use client';

import * as React from 'react';

export default function Showcase() {
  // Structured
  const [text, setText] = React.useState('');
  const [jsonOut, setJsonOut] = React.useState<any | null>(null);
  const [structuring, setStructuring] = React.useState(false);

  async function analyze() {
    if (!text.trim()) return;
    setStructuring(true);
    setJsonOut(null);
    try {
      const res = await fetch('/api/structured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text })
      });
      const data = await res.json();
      setJsonOut(data);
    } catch (e: any) {
      setJsonOut({ error: e?.message || String(e) });
    } finally {
      setStructuring(false);
    }
  }

  // Vision
  const [imageUrl, setImageUrl] = React.useState('');
  const [visionOut, setVisionOut] = React.useState('');
  const [visioning, setVisioning] = React.useState(false);

  async function describeImage() {
    const url = imageUrl.trim();
    if (!url) return;
    setVisionOut('');
    setVisioning(true);
    try {
      const res = await fetch('/api/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: url, instruction: 'Коротко опиши, что на изображении.' })
      });
      if (!res.body) {
        setVisionOut(`Ошибка: ${res.status} ${res.statusText}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        setVisionOut(prev => prev + decoder.decode(value, { stream: true }));
      }
      try { reader.releaseLock(); } catch {}
    } catch (e: any) {
      setVisionOut(`Ошибка: ${e?.message || e}`);
    } finally {
      setVisioning(false);
    }
  }

  // Echo stream
  const [echoOut, setEchoOut] = React.useState('');
  const [echoing, setEchoing] = React.useState(false);

  async function runEcho() {
    setEchoOut('');
    setEchoing(true);
    try {
      const res = await fetch('/api/echo', { method: 'GET' });
      if (!res.body) {
        setEchoOut(`Ошибка: ${res.status} ${res.statusText}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        setEchoOut(prev => prev + decoder.decode(value, { stream: true }));
      }
      try { reader.releaseLock(); } catch {}
    } catch (e: any) {
      setEchoOut(`Ошибка: ${e?.message || e}`);
    } finally {
      setEchoing(false);
    }
  }

  return (
    <div className="container">
      {/* Structured Output */}
      <div className="card mb-4">
        <h2 className="mb-2">Structured Output (generateObject + zod)</h2>
        <p className="text-sm">
          Введите произвольный текст — SDK вернёт валидированный JSON (sentiment, summary, keywords).
        </p>
        <textarea
          className="input"
          rows={4}
          placeholder="Текст для анализа…"
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <div className="row mt-2">
          <button className="btn btn-primary" onClick={analyze} disabled={structuring}>Анализировать</button>
        </div>
        {jsonOut && (
          <pre className="mt-2" style={{ whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(jsonOut, null, 2)}
          </pre>
        )}
      </div>

      {/* Vision */}
      <div className="card mb-4">
        <h2 className="mb-2">Vision (image URL → описание)</h2>
        <p className="text-sm">
          Вставьте URL изображения — модель опишет содержимое (стриминг).
        </p>
        <input
          className="input"
          placeholder="https://example.com/cat.jpg"
          value={imageUrl}
          onChange={e => setImageUrl(e.target.value)}
        />
        <div className="row mt-2">
          <button className="btn btn-primary" onClick={describeImage} disabled={visioning}>
            Описать изображение
          </button>
        </div>
        {visionOut && (
          <div className="card mt-2">
            <div className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{visionOut}</div>
          </div>
        )}
      </div>

      {/* Echo */}
      <div className="card mb-4">
        <h2 className="mb-2">Echo Stream (сырой chunked стрим)</h2>
        <p className="text-sm">
          Тест низкоуровневого стриминга без AI — полезно для диагностики прокси/Nginx.
        </p>
        <div className="row mt-2">
          <button className="btn btn-primary" onClick={runEcho} disabled={echoing}>
            Запустить
          </button>
        </div>
        {echoOut && (
          <pre className="mt-2" style={{ whiteSpace: 'pre-wrap' }}>{echoOut}</pre>
        )}
      </div>
    </div>
  );
}
