// app/api/chat/route.ts
// @ts-nocheck
import { NextRequest } from 'next/server';
import { streamText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { SYSTEM_PROMPT } from '@/lib/systemPrompt';

export const runtime = 'edge';

/* ------- helper: опциональная трассировка @datadog/toto ------- */
async function runWithTrace<T>(_name: string, _meta: Record<string, any>, fn: () => Promise<T>): Promise<T> {
  return await fn();
}

/* ----- безопасная математика (шунтинг-ярд) ----- */
function evalExpr(expr: string): number {
  if (!expr || typeof expr !== 'string') throw new Error('empty expression');
  const s = expr.replace(/,/g, '.').replace(/\s+/g, '');
  const ops: Record<string, { p: number; fn: (a: number, b: number) => number }> = {
    '+': { p: 1, fn: (a, b) => a + b },
    '-': { p: 1, fn: (a, b) => a - b },
    '*': { p: 2, fn: (a, b) => a * b },
    '/': { p: 2, fn: (a, b) => a / b },
    '%': { p: 2, fn: (a, b) => a % b }
  };
  const tokens: string[] = [];
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (/\d|\./.test(c)) {
      let j = i + 1; while (j < s.length && /[\d.]/.test(s[j])) j++;
      tokens.push(s.slice(i, j)); i = j; continue;
    }
    if (c in ops || c === '(' || c === ')') { tokens.push(c); i++; continue; }
    throw new Error(`invalid char '${c}'`);
  }
  const out: string[] = [], st: string[] = [];
  for (const t of tokens) {
    if (/^\d+(\.\d+)?$/.test(t)) out.push(t);
    else if (t in ops) {
      while (st.length) {
        const top = st[st.length - 1];
        if (top in ops && ops[top].p >= ops[t].p) out.push(st.pop()!);
        else break;
      }
      st.push(t);
    } else if (t === '(') st.push(t);
    else if (t === ')') {
      while (st.length && st[st.length - 1] !== '(') out.push(st.pop()!);
      if (!st.length) throw new Error('unbalanced )'); st.pop();
    }
  }
  while (st.length) {
    const x = st.pop()!; if (x === '(') throw new Error('unbalanced ('); out.push(x);
  }
  const vs: number[] = [];
  for (const t of out) {
    if (/^\d+(\.\d+)?$/.test(t)) vs.push(parseFloat(t));
    else if (t in ops) {
      const b = vs.pop(); const a = vs.pop();
      if (a == null || b == null) throw new Error('bad expression');
      const v = ops[t].fn(a, b); if (!Number.isFinite(v)) throw new Error('non-finite'); vs.push(v);
    }
  }
  if (vs.length !== 1) throw new Error('bad expression');
  return vs[0];
}

/* ---------------- TOOLS ---------------- */

// time
const time = tool({
  description: 'Возвращает текущее время в IANA-часовом поясе (например, Europe/London).',
  inputSchema: z.object({ timezone: z.string().optional() }),
  async execute({ timezone }) {
    const tz = timezone || 'UTC';
    try {
      const fmt = new Intl.DateTimeFormat('ru-RU', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      } as any);
      return { now: fmt.format(new Date()), timezone: tz };
    } catch {
      return { now: new Date().toISOString(), timezone: tz };
    }
  }
});

/* -------- русские города: нормализация предложного падежа -------- */
const RU_LOCATIVE_MAP: Record<string, string> = {
  'москве': 'Москва',
  'санкт-петербурге': 'Санкт-Петербург',
  'ростове-на-дону': 'Ростов-на-Дону',
  'нижнем новгороде': 'Нижний Новгород',
  'екатеринбурге': 'Екатеринбург',
  'новосибирске': 'Новосибирск',
  'краснодаре': 'Краснодар',
  'воронеже': 'Воронеж',
  'самаре': 'Самара',
  'тюмени': 'Тюмень',
  'перми': 'Пермь',
  'казани': 'Казань',
  'уфе': 'Уфа',
  'твери': 'Тверь',
  'ярославле': 'Ярославль',
  'сочи': 'Сочи',
  'париже': 'Париж'
};
function normalizeRuLocative(city: string) {
  const key = city.toLowerCase().trim();
  if (RU_LOCATIVE_MAP[key]) return RU_LOCATIVE_MAP[key];
  // общее правило: слова типа "…е" часто → "…а" (Москва/Москве, Самара/Самаре)
  if (/^[А-ЯЁ][а-яё\- ]+е$/.test(city) && !/\sгород/i.test(city)) {
    const base = city.slice(0, -1) + 'а';
    return base;
  }
  // убрать служебные слова/кавычки и лишние хвосты
  return city
    .replace(/[«»"“”]/g, '')
    .replace(/^(г\.|город)\s+/iu, '')
    .replace(/\s+(?:прямо\s+сейчас|сейчас|сегодня)\s*$/iu, '')
    .replace(/[.,!?;:]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// weather
const weather = tool({
  description: 'Реальная погода через Open-Meteo.',
  inputSchema: z.object({ city: z.string(), units: z.enum(['auto','celsius','fahrenheit']).optional() }),
  async execute({ city, units }) {
    const q = normalizeRuLocative(city);
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=ru&format=json`;
    const g = await fetch(geoUrl); if (!g.ok) return { city: q, error: `geocoding failed: ${g.status}` };
    const gj = await g.json(); const first = gj?.results?.[0]; if (!first) return { city: q, error: 'city_not_found' };
    const lat = first.latitude, lon = first.longitude;
    const tempUnit = units === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    const windUnit = units === 'fahrenheit' ? 'mph' : 'kmh';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&timezone=auto`;
    const w = await fetch(url); if (!w.ok) return { city: first.name, error: `weather failed: ${w.status}` };
    const wj = await w.json(); const cur = wj?.current; if (!cur) return { city: first.name, error: 'no_current_weather' };
    const map: Record<number, string> = {
      0:'☀️ Ясно',1:'🌤 В осн. ясно',2:'⛅ Облачно',3:'☁️ Пасмурно',
      45:'🌫 Туман',48:'🌫 Иней',51:'🌦 Моросящий (слабый)',53:'🌦 Моросящий',
      55:'🌦 Моросящий (сильный)',61:'🌧 Дождь (слабый)',63:'🌧 Дождь',65:'🌧 Дождь (сильный)',
      71:'❄️ Снег (слабый)',73:'❄️ Снег',75:'❄️ Снег (сильный)',80:'🌦 Ливень (слабый)',
      81:'🌦 Ливень',82:'🌧 Ливень (сильный)',95:'⛈ Гроза',96:'⛈ Гроза (град)',99:'⛈ Сильная гроза (град)'
    };
    return {
      city: first.name, latitude: lat, longitude: lon,
      temperature: cur.temperature_2m, wind_speed: cur.wind_speed_10m,
      unit_temperature: tempUnit === 'fahrenheit' ? '°F' : '°C', unit_wind: windUnit,
      summary: map[cur.weather_code] || `Код погоды: ${cur.weather_code}`, provider: 'open-meteo'
    };
  }
});

// math
const math = tool({
  description: 'Вычисляет арифметическое выражение (+ - * / % ( )).',
  inputSchema: z.object({ expr: z.string() }),
  async execute({ expr }) {
    const ok = /^[\d\s+\-*/()%.,]+$/.test(expr || '');
    if (!ok) return { expr, error: 'Разрешены только цифры и знаки +-*/()%.,' };
    try { return { expr, result: evalExpr(expr) }; } catch (e:any) { return { expr, error: String(e?.message || e) }; }
  }
});

/* ---------- shippingCost: фикс. формула (USD=basePrice×weight; EUR — по курсу) ---------- */
const EUR_RATE = Number(process.env.EUR_RATE || '0.92'); // 1 USD = 0.92 EUR по умолчанию

const shippingCost = tool({
  description: 'Фиксированный расчёт доставки: USD = basePrice × weightKg; EUR по фиксированному курсу.',
  inputSchema: z.object({
    fromCity: z.string(),
    toCity: z.string(),
    basePrice: z.number(),   // USD за кг
    weightKg: z.number().min(0)
  }),
  async execute({ fromCity, toCity, basePrice, weightKg }) {
    const totalUSD = +(basePrice * weightKg).toFixed(2);
    const totalEUR = +(totalUSD * EUR_RATE).toFixed(2);
    return {
      fromCity, toCity, basePrice, weightKg,
      totalUSD, totalEUR, eurRate: EUR_RATE
    };
  }
});

/* -------------- fallback если LLM «молчит» -------------- */
function lastUserText(messages: any[]): string {
  const u = [...messages].reverse().find((m) => m?.role === 'user');
  return String(u?.content || '');
}
function pickExpr(text:string){ const parts=(text||'').match(/[\d+\-*/()%.,\s]+/g)||[]; const c=parts.map(s=>s.trim()).filter(s=>s&&/[+\-*/()%]/.test(s)&&/\d/.test(s)); return c.sort((a,b)=>b.length-a.length)[0]; }
function pickTimezone(t:string){ const m=t.match(/([A-Za-z]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)/); return m?.[1]; }

/* — извлечение города для fallback-погоды */
function pickCityFromWeatherQuestion(t: string) {
  const m1 = t.match(/погод[аы]?(?:\s+\S+){0,3}?\s+(?:в|во|на)\s+([^?!.:,]+?)(?:\s+(?:прямо\s+сейчас|сейчас|сегодня))?[\s?!.:,]*$/iu);
  if (m1?.[1]) return normalizeRuLocative(m1[1]);
  const m2 = t.match(/\b(?:в|во|на)\s+([A-Za-z\u0400-\u052FЁё][A-Za-z\u0400-\u052F0-9Ёё\- ]{1,50})/u);
  if (m2?.[1]) return normalizeRuLocative(m2[1]);
  return undefined;
}

function parseShippingFromText(text: string) {
  // 1) JSON блок
  const jsonMatch = text.match(/\{[\s\S]+\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      const fromCity = String(obj.fromCity ?? obj.from ?? '').trim();
      const toCity = String(obj.toCity ?? obj.to ?? '').trim();
      const basePrice = Number(String(obj.basePrice ?? obj.price ?? '').replace(',', '.'));
      const weightKg = Number(String(obj.weightKg ?? obj.weight ?? '').replace(',', '.'));
      if (fromCity && toCity && Number.isFinite(basePrice) && Number.isFinite(weightKg)) {
        return { fromCity, toCity, basePrice, weightKg };
      }
    } catch {}
  }
  // 2) форматы a=b
  const fromCity = text.match(/откуда\s*=\s*"?([^",]+)"?/i)?.[1]?.trim();
  const toCity = text.match(/куда\s*=\s*"?([^",]+)"?/i)?.[1]?.trim();
  const basePrice = Number(text.match(/basePrice\s*[:=]\s*([0-9]+(?:[.,][0-9]+)?)/i)?.[1]?.replace(',','.'));
  const weightKg = Number(text.match(/weightKg\s*[:=]\s*([0-9]+(?:[.,][0-9]+)?)/i)?.[1]?.replace(',','.'));
  if (fromCity && toCity && Number.isFinite(basePrice) && Number.isFinite(weightKg)) {
    return { fromCity, toCity, basePrice, weightKg };
  }
  return null;
}

async function fallbackAnswer(messages:any[]){
  const text=lastUserText(messages);

  const expr = pickExpr(text);
  if (expr){
    try { return `Результат: ${evalExpr(expr)}`; } catch(e:any){ return `Выражение: ${expr}\nОшибка: ${e?.message||e}`; }
  }

  // Простой offline-расчёт доставки (если модель не ответила)
  if (/доставк|shipment|shipping/i.test(text)){
    const p = parseShippingFromText(text);
    if (p) {
      const totalUSD = +(p.basePrice * p.weightKg).toFixed(2);
      const totalEUR = +(totalUSD * EUR_RATE).toFixed(2);
      return `Доставка ${p.fromCity} → ${p.toCity}\nИтог: ${totalUSD} USD • ${totalEUR} EUR (курс ${EUR_RATE})`;
    }
    return 'Укажи параметры: откуда, куда, basePrice и weightKg.';
  }

  if (/погод|weather/i.test(text)){
    const city=pickCityFromWeatherQuestion(text);
    if (!city) return 'Укажи город для запроса погоды (например: «Какая погода в Ростове-на-Дону?»).';
    const w:any=await weather.execute({ city });
    if (w?.error) return `Не удалось получить погоду для "${city}": ${w.error}`;
    return `Погода в ${w.city}: ${w.summary}, ${w.temperature}${w.unit_temperature}, ветер ${w.wind_speed} ${w.unit_wind} (open-meteo)`;
  }

  const tz = pickTimezone(text)||'UTC';
  const t:any = await time.execute({ timezone: tz });
  return `Сейчас в ${t.timezone}: ${t.now}\n(Ответ через fallback)`;
}

/* ---------------- handler ---------------- */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const messagesIn = Array.isArray(body?.messages) ? body.messages : [];
    const systemOverride = typeof body?.system === 'string' ? String(body.system).slice(0, 4000) : undefined;
    const modelName = typeof body?.model === 'string' && body.model.trim()
      ? body.model.trim()
      : (process.env.NEXT_PUBLIC_DEFAULT_MODEL || 'gpt-4o-mini');

    if (!process.env.OPENAI_API_KEY) return new Response('OPENAI_API_KEY is missing', { status: 500 });

    const messages = messagesIn.filter((m:any)=>!(m?.role==='assistant' && (!m?.content || String(m?.content).trim()==='')));

    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await streamText({
      model: openai(modelName),
      system: systemOverride || SYSTEM_PROMPT,
      messages,
      tools: { time, weather, math, shippingCost },
      toolChoice: 'auto',
      maxOutputTokens: 400
    });

    // guard: если ни байта — ответим fallback'ом
    const enc = new TextEncoder(); let wrote = false;
    const guarded = new ReadableStream({
      start(controller) {
        const reader = result.textStream.getReader();
        (async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) { wrote = true; controller.enqueue(enc.encode(value)); }
            }
          } catch (e:any) {
            controller.enqueue(enc.encode(`\n[Ошибка потока: ${e?.message || e}]`));
          } finally {
            if (!wrote) {
              fallbackAnswer(messages).then((line)=>{ controller.enqueue(enc.encode(line)); controller.close(); })
              .catch(()=>{ controller.enqueue(enc.encode('Не удалось получить ответ.')); controller.close(); });
            } else controller.close();
          }
        })();
      }
    });

    const headers = new Headers();
    headers.set('X-AI-Server-PrepMs', String(Date.now() - t0));
    headers.set('X-AI-Model', modelName);
    headers.set('X-Accel-Buffering', 'no');
    headers.set('Cache-Control', 'no-cache');
    headers.set('Connection', 'keep-alive');
    headers.set('Content-Type', 'text/plain; charset=utf-8');

    return new Response(guarded, { headers });
  } catch (err:any) {
    return new Response(`API error: ${err?.message || 'Unhandled error'}`, { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
