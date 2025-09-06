'use client';
import * as React from 'react';
import { useStats } from './StatsBar';

const VISION_API = process.env.NEXT_PUBLIC_VISION_API || '/api/vision';

export default function Vision() {
  const { beginWork } = useStats();
  const [url, setUrl] = React.useState('');
  const [instruction, setInstruction] = React.useState('Опиши изображение кратко и по делу.');
  const [output, setOutput] = React.useState('');
  const [status, setStatus] = React.useState<'idle' | 'streaming'>('idle');

  async function analyze() {
    if (!url.trim()) return;
    setOutput('');
    setStatus('streaming');
    const end = beginWork('vision');
    try {
      const res = await fetch(VISION_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: url.trim(), instruction: instruction.trim() })
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(()=>`HTTP ${res.status}`);
        setOutput(`Ошибка: ${txt}`);
        setStatus('idle'); end(); return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let got = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        if (chunk) got = true;
        setOutput(prev => prev + chunk);
      }
      try { reader.releaseLock(); } catch {}
      if (!got) setOutput('Пустой ответ от модели. Проверьте URL или переключите на /api/vision41 через .env.');
    } catch (e: any) {
      setOutput(`Ошибка сети: ${e?.message || e}`);
    } finally {
      setStatus('idle'); end();
    }
  }

  return (
    <div className="container">
      <div className="card mb-3">
        <h2 className="mb-2">Vision ({VISION_API})</h2>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" placeholder="https://…" value={url} onChange={e=>setUrl(e.target.value)} />
          <input className="input" placeholder="Инструкция…" value={instruction} onChange={e=>setInstruction(e.target.value)} />
          <button className="btn btn-primary" type="button" onClick={analyze} disabled={status==='streaming'}>
            {status==='streaming' ? '⏳ Анализ…' : 'Анализировать'}
          </button>
        </div>
      </div>
      <div className="card">
        <div className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{output}</div>
      </div>
    </div>
  );
}
