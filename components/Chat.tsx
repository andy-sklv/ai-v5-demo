'use client';
import * as React from 'react';
import { useStats } from './StatsBar';
import { SYSTEM_PROMPT as DEFAULT_PROMPT } from '@/lib/systemPrompt';
import TotoPanel from './TotoPanel';

const VISION_API = process.env.NEXT_PUBLIC_VISION_API || '/api/vision';
const TOTO_ENABLED = (process.env.NEXT_PUBLIC_TOTO_ENABLED ?? 'true') !== 'false';

type Msg = { id: string; role: 'user' | 'assistant'; content: string; ts: number };
const MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini'];

const VISION_EXAMPLE = 'https://s0.rbk.ru/v6_top_pics/media/img/1/64/756744922016641.jpg';

/* helpers */
function uuid() {
  // @ts-ignore
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; const v = c === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16);
  });
}
function readNumHeader(h: Headers, name: string): number | undefined {
  const v = h.get(name); if (v == null) return undefined; const n = Number(v); return Number.isFinite(n) ? n : undefined;
}
const mean = (a:number[]) => a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0;
const percentile = (a:number[], p:number) => {
  if (!a.length) return 0;
  const arr=[...a].sort((x,y)=>x-y);
  const idx=(p/100)*(arr.length-1);
  const lo=Math.floor(idx), hi=Math.ceil(idx);
  return lo===hi ? arr[lo] : arr[lo] + (arr[hi]-arr[lo])*(idx-lo);
};
const stddev = (a:number[]) => {
  if (a.length<2) return 0;
  const m=mean(a); const v=a.reduce((s,x)=>s+(x-m)*(x-m),0)/(a.length-1);
  return Math.sqrt(v);
};

export default function Chat() {
  const { setStats, beginWork } = useStats();

  // модель и промпт из localStorage
  const [model, setModel] = React.useState<string>('gpt-4o-mini');
  const [systemPrompt, setSystemPrompt] = React.useState<string>(DEFAULT_PROMPT);
  React.useEffect(() => {
    setModel(localStorage.getItem('modelName') || 'gpt-4o-mini');
    setSystemPrompt(localStorage.getItem('systemPrompt') || DEFAULT_PROMPT);
    const onModel = () => setModel(localStorage.getItem('modelName') || 'gpt-4o-mini');
    const onSystem = () => setSystemPrompt(localStorage.getItem('systemPrompt') || DEFAULT_PROMPT);
    window.addEventListener('local-model-changed', onModel);
    window.addEventListener('local-system-changed', onSystem);
    return () => {
      window.removeEventListener('local-model-changed', onModel);
      window.removeEventListener('local-system-changed', onSystem);
    };
  }, []);

  const [input, setInput] = React.useState<string>('');
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [status, setStatus] = React.useState<'idle' | 'submitted' | 'streaming'>('idle');
  const abortRef = React.useRef<AbortController | null>(null);
  const startedAtRef = React.useRef<number | null>(null);

  // автоскролл к последнему сообщению
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const scrollToBottom = React.useCallback((smooth = true) => {
    const el = scrollRef.current; if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  React.useEffect(() => { scrollToBottom(false); }, [messages.length]);

  // палитра
  const [paletteOpen, setPaletteOpen] = React.useState<boolean>(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // мини-панель Vision
  const [showVision, setShowVision] = React.useState(false);
  const [visionUrl, setVisionUrl] = React.useState('');
  const [visionOut, setVisionOut] = React.useState('');
  const [visionFocused, setVisionFocused] = React.useState(false);
  const visionUrlRef = React.useRef<HTMLInputElement | null>(null);

  // мини-панель Shipping
  const [showShip, setShowShip] = React.useState(false);
  const [shipFrom, setShipFrom] = React.useState('');
  const [shipTo, setShipTo] = React.useState('');
  const [shipPrice, setShipPrice] = React.useState('100');
  const [shipWeight, setShipWeight] = React.useState('10');
  const shipFromRef = React.useRef<HTMLInputElement | null>(null);

  // модалки для выбора модели/промпта
  const [openModelModal, setOpenModelModal] = React.useState(false);
  const [openPromptModal, setOpenPromptModal] = React.useState(false);

  // Toto: локальный state и вычисления
  const [totoOpen, setTotoOpen] = React.useState<boolean>(false);
  const [charsPerSec, setCps] = React.useState<number[]>([]);
  const [latencyMs, setLatency] = React.useState<number[]>([]);
  const [totoForecast, setTotoForecast] = React.useState<{engine:string; predictions:number[]; horizon:number} | null>(null);
  const [totoLoading, setTotoLoading] = React.useState(false);

  function pushMetrics(sample: { totalChars: number; durationMs: number; endToEndMs: number }) {
    const cps = sample.durationMs > 0 ? (sample.totalChars / (sample.durationMs / 1000)) : 0;
    setCps(prev => [...prev.slice(-19), +cps.toFixed(3)]);
    setLatency(prev => [...prev.slice(-19), sample.endToEndMs]);
  }

  async function computeToto() {
    if (!TOTO_ENABLED) return;
    const series = charsPerSec.slice(-20);
    if (series.length < 2) return;
    setTotoLoading(true);
    try {
      const res = await fetch('/api/toto', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ series, horizon: 3, metric: 'chars_per_sec' })
      });
      const data = await res.json();
      if (Array.isArray(data?.predictions)) {
        const engine = String(data.engine || 'local');
        const preds = data.predictions as number[];
        setTotoForecast({ engine, predictions: preds, horizon: data.horizon ?? 3 });
        // обновим StatsBar прогнозом
        setStats(prev => ({ ...(prev||{}), forecastNext: preds[0], forecastEngine: engine }));
      }
    } catch {/* ignore */}
    finally { setTotoLoading(false); }
  }

  async function send(msgs: Msg[]) {
    const clean = msgs.filter((m) => !(m.role === 'assistant' && (!m.content || m.content.trim() === '')));

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    startedAtRef.current = Date.now();
    setStatus('submitted');

    const end = beginWork('chat');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: clean, model, system: systemPrompt }),
        signal: ac.signal
      });

      const serverPrepMs = readNumHeader(res.headers, 'X-AI-Server-PrepMs');
      const promptTokens = readNumHeader(res.headers, 'X-AI-Prompt-Tokens');
      const completionTokens = readNumHeader(res.headers, 'X-AI-Completion-Tokens');
      const totalTokens = readNumHeader(res.headers, 'X-AI-Total-Tokens');
      const modelFromHeader = res.headers.get('X-AI-Model') || model;
      setStats((prev) => ({ ...prev, model: modelFromHeader, serverPrepMs, promptTokens, completionTokens, totalTokens }));

      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => `HTTP ${res.status}`);
        setMessages((prev) => [...prev, { id: uuid(), role: 'assistant', content: `Ошибка: ${txt}`, ts: Date.now() }]);
        setStatus('idle'); end(); return;
      }

      const aiId = uuid();
      setMessages((prev) => [...prev, { id: aiId, role: 'assistant', content: '', ts: Date.now() }]);

      setStatus('streaming');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let producedChars = 0;
      const tStart = Date.now();

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          producedChars += chunk.length;
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, content: m.content + chunk } : m))
          );
        }
      } finally {
        try { reader.releaseLock(); } catch {}
        setStatus('idle');

        const started = startedAtRef.current;
        const endToEndMs = started ? (Date.now() - started) : 0;
        const streamDuration = Date.now() - tStart;

        // накопим ряды
        pushMetrics({ totalChars: producedChars, durationMs: streamDuration, endToEndMs });

        // === Новые вычисления для оверлея ===
        const cpsNow = streamDuration > 0 ? +(producedChars / (streamDuration/1000)).toFixed(2) : 0;
        const cpsAvg = +mean(charsPerSec.slice(-10)).toFixed(2);
        const trend: 'up'|'down'|'flat' =
          cpsNow > cpsAvg*1.05 ? 'up' : (cpsNow < cpsAvg*0.95 ? 'down' : 'flat');

        const latArr = latencyMs.slice(-20);
        const p50 = Math.round(percentile(latArr, 50));
        const p95 = Math.round(percentile(latArr, 95));

        const tps = (typeof completionTokens === 'number' && streamDuration>0)
          ? +(completionTokens / (streamDuration/1000)).toFixed(2)
          : undefined;

        let anomaly: 'spike'|'drop'|'normal' = 'normal';
        if (totoForecast?.predictions?.length) {
          const next = totoForecast.predictions[0];
          const sigma = stddev(charsPerSec.slice(-20));
          const resid = cpsNow - next;
          if (sigma > 0 && Math.abs(resid) > 2*sigma) anomaly = resid > 0 ? 'spike' : 'drop';
        }

        // при открытой панели обновляем прогноз
        if (totoOpen) computeToto();

        // обновим StatsBar
        setStats(prev => ({
          ...(prev || {}),
          endToEndMs,
          cpsNow, cpsAvg, cpsTrend: trend,
          latencyP50: p50, latencyP95: p95,
          tps, anomaly
        }));

        if (started) {
          startedAtRef.current = null;
        }
        end();
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setMessages((prev) => [...prev, { id: uuid(), role: 'assistant', content: `Ошибка сети: ${e?.message || e}`, ts: Date.now() }]);
      }
      setStatus('idle'); end();
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim(); if (!text) return;
    const userMsg: Msg = { id: uuid(), role: 'user', content: text, ts: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next); setInput('');
    await send(next);
  }

  function onStop() { abortRef.current?.abort(); setStatus('idle'); }

  function quickAsk(text: string) {
    const userMsg: Msg = { id: uuid(), role: 'user', content: text, ts: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next); setInput('');
    scrollToBottom(true);
    void send(next);
  }

  function openVisionPanel() {
    setShowVision(true);
    requestAnimationFrame(() => { scrollToBottom(true); });
    setTimeout(() => visionUrlRef.current?.focus(), 80);
  }
  function openShipPanel() {
    setShowShip(true);
    requestAnimationFrame(() => { scrollToBottom(true); });
    setTimeout(() => shipFromRef.current?.focus(), 80);
  }

  async function analyzeImage() {
    const url = visionUrl.trim(); if (!url) return;
    setVisionOut('');
    const end = beginWork('vision');
    try {
      const res = await fetch(VISION_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: url, instruction: 'Коротко опиши, что на изображении.' })
      });
      if (!res.body) {
        setVisionOut(`Ошибка: ${res.status} ${res.statusText}`); end(); return;
      }
      const reader = res.body.getReader(); const dec = new TextDecoder();
      let got = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        if (chunk) got = true;
        setVisionOut((prev) => prev + chunk);
      }
      try { reader.releaseLock(); } catch {}
      if (!got) setVisionOut('Пустой ответ от модели. Попробуйте другой URL или переключите виджет на /api/vision41 через .env.');
    } catch (e: any) {
      setVisionOut(`Ошибка: ${e?.message || e}`);
    } finally {
      end();
    }
  }

  function runShipping() {
    const from = shipFrom.trim(); const to = shipTo.trim();
    const price = Number(shipPrice); const weight = Number(shipWeight);
    if (!from || !to || !Number.isFinite(price) || !Number.isFinite(weight)) return;
    quickAsk(`Вызови инструмент shippingCost с параметрами: { "fromCity": "${from}", "toCity": "${to}", "basePrice": ${price}, "weightKg": ${weight} }`);
    setShowShip(false);
  }

  return (
    <div className="shell">
      <div className="shell-header">
        <div className="brand">BroMan <span className="ver">1.0</span></div>
        <div className="brand-sub">assistant for monitoring & automation</div>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && (<div className="empty-hint">Начни с вопроса или выбери команду в палитре ниже</div>)}

        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role === 'user' ? 'bubble-user right' : 'bubble-ai left'}`}>
            <div className="bubble-text">
              {m.content || (m.role === 'assistant' && status !== 'idle' ? '⏳ генерируем…' : '')}
            </div>
            <div className="bubble-time">
              {new Date(m.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
            </div>
          </div>
        ))}

        {/* Vision mini-panel */}
        {showVision && (
          <div className="panel">
            <div className="panel-title">Vision</div>

            {/* Пилюля «пример» — появляется при фокусе */}
            {visionFocused && (
              <div style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  onMouseDown={(e)=>e.preventDefault()}
                  onClick={() => { setVisionUrl(VISION_EXAMPLE); setTimeout(()=>visionUrlRef.current?.focus(), 0); }}
                  style={{
                    border: '1px solid var(--glass-border)',
                    background: 'var(--accMix)',
                    color: '#fff',
                    padding: '6px 10px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                    fontSize: 12.5,
                    fontWeight: 700
                  }}
                  title="Подставить пример изображения"
                >
                  Пример изображения
                </button>
              </div>
            )}

            <div className="row">
              <input
                ref={visionUrlRef}
                className="input"
                placeholder="https://…"
                value={visionUrl}
                onChange={(e)=>setVisionUrl(e.target.value)}
                onFocus={()=>setVisionFocused(true)}
                onBlur={()=>setTimeout(()=>setVisionFocused(false), 120)}
              />
              <button className="btn btn-primary" type="button" onClick={analyzeImage}>Анализ</button>
              <button className="btn" type="button" onClick={()=>setShowVision(false)}>Скрыть</button>
            </div>
            {visionOut && <div className="panel-out">{visionOut}</div>}
          </div>
        )}

        {/* Shipping mini-panel */}
        {showShip && (
          <div className="panel">
            <div className="panel-title">Оценка доставки</div>
            <div className="grid2">
              <input ref={shipFromRef} className="input" placeholder="Откуда (город)" value={shipFrom} onChange={(e)=>setShipFrom(e.target.value)} />
              <input className="input" placeholder="Куда (город)" value={shipTo} onChange={(e)=>setShipTo(e.target.value)} />
              <input className="input" placeholder="Базовая цена, USD/кг" value={shipPrice} onChange={(e)=>setShipPrice(e.target.value)} />
              <input className="input" placeholder="Вес, кг" value={shipWeight} onChange={(e)=>setShipWeight(e.target.value)} />
            </div>
            <div className="row mt-2">
              <button className="btn btn-primary" type="button" onClick={runShipping}>Рассчитать</button>
              <button className="btn" type="button" onClick={()=>setShowShip(false)}>Скрыть</button>
            </div>
          </div>
        )}

        {/* Toto panel */}
        {TOTO_ENABLED && (
          <TotoPanel
            open={totoOpen}
            onClose={() => setTotoOpen(false)}
            charsPerSec={charsPerSec}
            latencyMs={latencyMs}
            forecast={totoForecast}
            loading={totoLoading}
          />
        )}
      </div>

      <form onSubmit={onSubmit} className="prompt-wrap">
        <div className="prompt">
          <input
            ref={inputRef}
            className="prompt-input"
            placeholder="Напиши запрос…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setPaletteOpen(true)}
            onBlur={() => setTimeout(() => setPaletteOpen(false), 120)}
            disabled={status !== 'idle'}
          />
          {status === 'idle' ? (
            <button className="btn btn-primary" type="submit">Отправить</button>
          ) : (
            <button className="btn" type="button" onClick={() => { abortRef.current?.abort(); setStatus('idle'); }}>Стоп</button>
          )}
        </div>

        {/* палитра команд */}
        {paletteOpen && (
          <div className="palette" onMouseDown={(e)=>e.preventDefault()}>
            <div className="palette-title">Команды</div>
            <button className="palette-item" type="button" onClick={() => quickAsk('Вызови инструмент времени: Скажи текущее время в IANA "Europe/London".')}>Tool: time — «Скажи текущее время»</button>
            <button className="palette-item" type="button" onClick={() => quickAsk('Какая погода в Москве прямо сейчас?')}>Tool: weather — «Погода»</button>
            <button className="palette-item" type="button" onClick={() => quickAsk('Сколько будет 15*7 - (2+3)?')}>Tool: math — «Посчитать»</button>
            <button className="palette-item" type="button" onClick={openShipPanel}>Tool: shippingCost — «Оценка доставки»</button>
            <div className="palette-sep" />
            <button className="palette-item" type="button" onClick={() => quickAsk('у меня есть вопрос')}>Спросить у чата</button>
            <button className="palette-item" type="button" onClick={openVisionPanel}>Vision — «Описать изображение»</button>
            {TOTO_ENABLED && (
              <button className="palette-item" type="button" onClick={() => { setTotoOpen(true); requestAnimationFrame(() => scrollToBottom(true)); }}>
                📈 Toto — показать панель
              </button>
            )}
            <button className="palette-item" type="button" onClick={() => setOpenModelModal(true)}>Выбрать модель</button>
            <button className="palette-item" type="button" onClick={() => setOpenPromptModal(true)}>Задать промпт</button>
          </div>
        )}
      </form>

      {/* модалки внутри чата */}
      {openModelModal && (
        <div className="modal-inset" onMouseDown={(e)=>e.target===e.currentTarget && setOpenModelModal(false)}>
          <div className="modal-card">
            <h3 className="modal-title">Выбор модели</h3>
            <select className="input" value={model} onChange={(e)=>setModel(e.target.value)}>
              {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <div className="row mt-3">
              <button className="btn btn-primary" onClick={() => { localStorage.setItem('modelName', model); window.dispatchEvent(new Event('local-model-changed')); setOpenModelModal(false); }}>Сохранить</button>
              <button className="btn" onClick={()=>setOpenModelModal(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
      {openPromptModal && (
        <div className="modal-inset" onMouseDown={(e)=>e.target===e.currentTarget && setOpenPromptModal(false)}>
          <div className="modal-card">
            <h3 className="modal-title">System prompt</h3>
            <textarea className="input" rows={8} value={systemPrompt} onChange={(e)=>setSystemPrompt(e.target.value)} />
            <div className="row mt-3">
              <button className="btn btn-primary" onClick={() => { localStorage.setItem('systemPrompt', systemPrompt); window.dispatchEvent(new Event('local-system-changed')); setOpenPromptModal(false); }}>Сохранить</button>
              <button className="btn" onClick={()=>setOpenPromptModal(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
