// app/api/toto/route.ts
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

type Body = {
  series: number[];
  horizon?: number;
  metric?: 'chars_per_sec' | 'latency_ms';
};

function ema(series: number[], alpha = 0.35): number {
  if (!series.length) return 0;
  let s = series[0];
  for (let i = 1; i < series.length; i++) s = alpha * series[i] + (1 - alpha) * s;
  return s;
}
function mean(a: number[]) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

async function proxy(series: number[], horizon: number, metric: string) {
  const base = process.env.TOTO_PROXY_URL!;
  const key = process.env.TOTO_PROXY_KEY;
  const url = `${base.replace(/\/+$/, '')}/forecast`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ series, horizon, metric })
  });
  if (!r.ok) throw new Error(`proxy ${r.status}`);
  const j = await r.json().catch(() => ({}));
  if (!Array.isArray(j?.predictions)) throw new Error('bad response');
  return { predictions: j.predictions as number[], engine: String(j.engine || 'remote') };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const series = (Array.isArray(body?.series) ? body.series : []).map(Number).filter(Number.isFinite);
    const horizon = Math.max(1, Math.min(8, Number(body?.horizon || 3)));
    const metric = body?.metric === 'latency_ms' ? 'latency_ms' : 'chars_per_sec';

    if (series.length < 2) {
      return new Response(JSON.stringify({ engine: 'local', horizon, lastValue: series.at(-1) ?? 0, predictions: [] }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // сначала пытаемся к реальному сервису
    if (process.env.TOTO_PROXY_URL) {
      try {
        const { predictions, engine } = await proxy(series, horizon, metric);
        return new Response(JSON.stringify({
          engine: engine || 'remote',
          horizon,
          lastValue: series.at(-1),
          predictions
        }), { headers: { 'Content-Type': 'application/json' } });
      } catch { /* падаем на локальный */ }
    }

    // локальный прогноз (EMA + грубая оценка дрейфа)
    const base = ema(series);
    const half = Math.max(1, Math.floor(series.length / 2));
    const drift = ema(series.slice(half)) - ema(series.slice(0, half));
    const predictions = Array.from({ length: horizon }, (_, i) => +(base + drift * (i + 1)).toFixed(3));

    return new Response(JSON.stringify({
      engine: 'local', horizon, lastValue: series.at(-1), predictions
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'bad request' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }
}
