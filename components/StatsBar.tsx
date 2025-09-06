'use client';
import * as React from 'react';

type Stats = {
  model?: string;
  serverPrepMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  endToEndMs?: number;

  // Toto/динамика
  cpsNow?: number;
  cpsAvg?: number;
  cpsTrend?: 'up' | 'down' | 'flat';
  latencyP50?: number;
  latencyP95?: number;
  forecastNext?: number;
  forecastEngine?: string;
  tps?: number;
  anomaly?: 'spike' | 'drop' | 'normal';
};

type Ctx = {
  stats: Stats | null;
  setStats: React.Dispatch<React.SetStateAction<Stats | null>>;
  busyCount: number;
  beginWork: (label?: string) => () => void; // возвращает end()
};

export const StatsContext = React.createContext<Ctx | null>(null);

export function StatsProvider({ children }: { children: React.ReactNode }) {
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [busyCount, setBusyCount] = React.useState(0);

  const beginWork = React.useCallback(() => {
    setBusyCount((c) => c + 1);
    let done = false;
    return () => {
      if (!done) {
        done = true;
        setBusyCount((c) => Math.max(0, c - 1));
      }
    };
  }, []);

  return (
    <StatsContext.Provider value={{ stats, setStats, busyCount, beginWork }}>
      {children}
    </StatsContext.Provider>
  );
}

export function useStats() {
  const ctx = React.useContext(StatsContext);
  if (!ctx) throw new Error('useStats must be used within StatsProvider');
  return ctx;
}

function Trend({ dir }: { dir?: 'up'|'down'|'flat' }) {
  if (dir === 'up') return <span title="trend up">▲</span>;
  if (dir === 'down') return <span title="trend down">▼</span>;
  return <span title="flat">→</span>;
}
function Anom({ a }: { a?: 'spike'|'drop'|'normal' }) {
  if (a === 'spike') return <span title="spike" style={{marginLeft:6}}>🔥</span>;
  if (a === 'drop') return <span title="drop" style={{marginLeft:6}}>🧊</span>;
  return null;
}

function TipPill({ children, tip, forceNowrap }: { children: React.ReactNode; tip: string; forceNowrap?: boolean }) {
  const [hover, setHover] = React.useState(false);
  return (
    <span
      className="pill"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        // для мобильного горизонтального скролла:
        flex: '0 0 auto',
        whiteSpace: forceNowrap ? 'nowrap' : undefined
      }}
    >
      {children}
      {hover && (
        <span
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#333333',
            color: '#ffffff',
            padding: '6px 8px',
            borderRadius: 8,
            fontSize: 12,
            whiteSpace: 'nowrap',
            boxShadow: '0 6px 16px rgba(0,0,0,0.15)',
            zIndex: 9999
          }}
        >
          {tip}
        </span>
      )}
    </span>
  );
}

export function StatsBar() {
  const { stats, busyCount } = useStats();

  // определяем мобильный режим (<= 640px)
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else mq.addListener(apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', apply);
      else mq.removeListener(apply);
    };
  }, []);

  // дополнительные стили контейнера для мобильной горизонтальной прокрутки
  const overlayStyle: React.CSSProperties = isMobile
    ? {
        left: 8,
        right: 8,
        transform: 'none',
        top: 8,
        gap: 8,
        justifyContent: 'flex-start',
        flexWrap: 'nowrap',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'thin' as any
      }
    : {};

  return (
    <div
      className="stats-overlay"
      style={overlayStyle}
      aria-label="Runtime stats"
      role="status"
    >
      <TipPill tip="Текущее состояние генерации" forceNowrap={isMobile}>
        <strong>Status</strong>&nbsp;{busyCount > 0 ? '⏳ генерируем…' : 'готов'}
      </TipPill>

      {stats?.model && (
        <TipPill tip="Активная LLM-модель" forceNowrap={isMobile}>
          <strong>Model</strong>&nbsp;{stats.model}
        </TipPill>
      )}

      {typeof stats?.endToEndMs === 'number' && (
        <TipPill tip="Полная задержка запроса, от отправки до последнего байта" forceNowrap={isMobile}>
          <strong>Latency</strong>&nbsp;{stats.endToEndMs} ms
        </TipPill>
      )}

      {typeof stats?.cpsNow === 'number' && (
        <TipPill tip="CPS — скорость печати символов/сек. avg — средняя за последние ответы" forceNowrap={isMobile}>
          <strong>CPS</strong>&nbsp;{stats.cpsNow?.toFixed(2)}
          {typeof stats?.cpsAvg === 'number' && (
            <span style={{color:'var(--muted)'}}> · avg {stats.cpsAvg.toFixed(2)}</span>
          )}
          &nbsp;<Trend dir={stats?.cpsTrend}/>
          <Anom a={stats?.anomaly}/>
        </TipPill>
      )}

      {(typeof stats?.latencyP50 === 'number' || typeof stats?.latencyP95 === 'number') && (
        <TipPill tip="p50/p95 — перцентили задержки по последним замерам" forceNowrap={isMobile}>
          <strong>p50/p95</strong>&nbsp;
          {stats?.latencyP50 ?? '—'} / {stats?.latencyP95 ?? '—'} ms
        </TipPill>
      )}

      {typeof stats?.forecastNext === 'number' && (
        <TipPill tip={`Прогноз следующего CPS от Toto (${stats?.forecastEngine || '—'})`} forceNowrap={isMobile}>
          <strong>Forecast</strong>&nbsp;≈ {stats.forecastNext.toFixed(2)} cps
          {stats?.forecastEngine && <span style={{color:'var(--muted)'}}> · {stats.forecastEngine}</span>}
        </TipPill>
      )}

      {typeof stats?.tps === 'number' && (
        <TipPill tip="TPS — завершённые токены/сек. по данным ответа модели" forceNowrap={isMobile}>
          <strong>TPS</strong>&nbsp;{stats.tps.toFixed(2)}
        </TipPill>
      )}

      {typeof stats?.serverPrepMs === 'number' && (
        <TipPill tip="Server — подготовка ответа на сервере (без стрима)" forceNowrap={isMobile}>
          <strong>Server</strong>&nbsp;{stats.serverPrepMs} ms
        </TipPill>
      )}
      {typeof stats?.promptTokens === 'number' && (
        <TipPill tip="Токены в системном и пользовательском сообщении" forceNowrap={isMobile}>
          <strong>Prompt</strong>&nbsp;{stats.promptTokens}
        </TipPill>
      )}
      {typeof stats?.completionTokens === 'number' && (
        <TipPill tip="Токены, сгенерированные моделью" forceNowrap={isMobile}>
          <strong>Completion</strong>&nbsp;{stats.completionTokens}
        </TipPill>
      )}
      {typeof stats?.totalTokens === 'number' && (
        <TipPill tip="Суммарные токены (prompt + completion)" forceNowrap={isMobile}>
          <strong>Total</strong>&nbsp;{stats.totalTokens}
        </TipPill>
      )}
    </div>
  );
}
