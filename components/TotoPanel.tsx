'use client';
import * as React from 'react';

type Forecast = { engine: string; predictions: number[]; horizon: number } | null;

export default function TotoPanel({
  open,
  onClose,
  charsPerSec,
  latencyMs,
  forecast,
  loading
}: {
  open: boolean;
  onClose: () => void;
  charsPerSec: number[];
  latencyMs: number[];
  forecast: Forecast;
  loading: boolean;
}) {
  if (!open) return null;

  const spark = (data: number[], w = 280, h = 48, pad = 6) => {
    if (!data.length) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = Math.max(1, max - min);
    const stepX = (w - pad * 2) / Math.max(1, data.length - 1);
    const d = data
      .map((v, i) => {
        const x = pad + i * stepX;
        const y = h - pad - ((v - min) / span) * (h - pad * 2);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return (
      <svg width={w} height={h} style={{ display: 'block' }}>
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  };

  return (
    <div className="panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div className="panel-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          Datadog Toto <span className="ver">demo</span>
        </div>

        {/* заполнитель, чтобы увести правые элементы вправо */}
        <div style={{ flex: 1 }} />

        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Engine:&nbsp;<strong>{forecast?.engine || '—'}</strong>
        </div>

        {/* СПРАВА — простая кнопка без градиента */}
        <button
          type="button"
          className="btn"
          onClick={onClose}
          title="Закрыть панель Toto"
          style={{ marginLeft: 6 }}
        >
          Скрыть
        </button>
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Chars/sec</div>
          <div style={{ color: 'var(--acc2)' }}>{spark(charsPerSec)}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Текущих точек: {charsPerSec.length || 0}
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Latency (ms)</div>
          <div style={{ color: 'var(--acc1)' }}>{spark(latencyMs)}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Текущих точек: {latencyMs.length || 0}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-title">Прогноз</div>
        {loading ? (
          <div className="panel-out">⏳ строим прогноз…</div>
        ) : forecast?.predictions?.length ? (
          <div className="panel-out">
            {forecast.predictions.map((p, i) => (
              <span key={i} style={{ display: 'inline-block', marginRight: 8 }}>
                {i > 0 ? '|' : ''} {p.toFixed(4)}{' '}
              </span>
            ))}
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--muted)' }}>
              Горизонт: {forecast.horizon}
            </div>
          </div>
        ) : (
          <div className="panel-out">Нет данных для прогноза.</div>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 13.5 }}>
        Toto — модель временных рядов для observability-метрик. Мы собираем скорость генерации (chars/sec) и полную латентность,
        строим спарклайны и прогнозируем следующие значения.
      </div>
    </div>
  );
}
