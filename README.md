AI SDK v5 (beta) — Next.js Edge демо: Chat + Tools + Vision

Небольшой, но «продовый» демо-проект на Vercel AI SDK v5 (beta) + Next.js 14 (App Router, Edge runtime).
Показываю реальный стриминг ответов, tool calling с типобезопасными схемами, интеграцию с внешним API погоды, fallback на сервере (чтобы никогда не получить пустой ответ) и простой Vision-пример.

Коротко что есть:
• потоковый чат streamText() на Edge
• инструменты time / weather / math через tool() + zod
• погода без ключей (Open-Meteo real API)
• guarded-stream fallback (если LLM «молчит»)
• Vision: image URL → описание
• глобальный индикатор загрузки + метрики (латентность, подготовка сервера, модель)

🧱 Стек

Next.js 14 (App Router) + Edge runtime для /api/*

Vercel AI SDK v5 (beta):
streamText() + tool() + zod (никаких старых API)

Провайдер: @ai-sdk/openai (выбор модели в UI)

Клиент: кастомный чтение потока через fetch / ReadableStream
(без «магических» хуков — полный контроль, проще дебажить)

Интеграции:
time — IANA-время через Intl.DateTimeFormat
weather — реальный Open-Meteo (геокодинг → текущая погода)
math — детерминированный калькулятор (строгое подмножество выражений)

Инфра: Docker multi-stage, Nginx c отключённой буферизацией

🔎 Что именно я сделал (и где в коде)

Потоковый чат + инструменты — app/api/chat/route.ts
streamText({ tools: { time, weather, math }, toolChoice: 'auto' })

защитная обёртка стрима: если байтов от модели не пришло, я делаю fallbackAnswer() и возвращаю честный текст.

Инструменты — там же: tool() + z.object(...), v5-подход
(LLM получает строгую схему аргументов, а я исполняю серверную логику).

Vision — app/api/vision/route.ts: { type: 'image', image: url } + { type: 'text', text: ... } → стрим ответа.

Клиент — components/Chat.tsx, components/Vision.tsx: ручной ридер, стоп/abort, дозапись чанков.

Глобальный индикатор загрузки — components/StatsBar.tsx (busyCount), виджеты метрик на странице.

System prompt — lib/systemPrompt.ts и я специально показываю его в UI, чтобы ты видел логику маршрутизации в инструменты.

🔄 Как это работает (сквозной флоу)
[Browser]
  | fetch('/api/chat') + ReadableStream
  v
[Edge API route (app/api/chat/route.ts)]
  - streamText({ tools, toolChoice: 'auto', system, messages })
  - tools: time | weather | math  (validate args via zod)
  - textStream → оборачиваю в свой ReadableStream
       └─ если ни одного чанка не пришло → fallbackAnswer() руками
  v
[Browser]
  - по чанкам записываю ответ в UI
  - считаю E2E латентность, показываю метрики

🆕 Что нового в Vercel AI SDK v5 (и почему именно он)

tool() first-class: описываю функции строго через zod → типобезопасные аргументы, понятные LLM и мне.

Единый streamText(): один API для чата/промптов, нормальный стрим + удобные хелперы (toTextStreamResponse).

Мультимодальность в messages[].content: массив блоков (text, image и т.д.).

Гибкость на клиенте: могу не зависеть от хуков — читать поток вручную и делать «прод»-фишки (guarded fallback, дебаг потоков).

🌐 Эндпоинты

GET /api/ping → pong (healthcheck)

GET /api/echo → стрим chunk 1..5 (проверка Nginx/стримов)

POST /api/chat → стрим текста (модель + инструменты)

POST /api/vision → стрим описания изображения по URL

Примеры curl (стрим тестировать с -N)
# health
curl -i http://localhost:3000/api/ping

# тест стрима сквозь nginx
curl -i -N http://localhost:3000/api/echo

# chat: время (инструмент time)
curl -i -N -X POST http://localhost:3000/api/chat \
  -H "content-type: application/json" \
  --data '{"messages":[{"id":"1","role":"user","content":"Вызови инструмент времени: Скажи текущее время в IANA \"Europe/London\"."}],"model":"gpt-4o-mini"}'

# chat: погода Париж (инструмент weather)
curl -i -N -X POST http://localhost:3000/api/chat \
  -H "content-type: application/json" \
  --data '{"messages":[{"id":"1","role":"user","content":"Какая погода в Paris прямо сейчас?"}]}'

# chat: математика (инструмент math или ответ модели)
curl -i -N -X POST http://localhost:3000/api/chat \
  -H "content-type: application/json" \
  --data '{"messages":[{"id":"1","role":"user","content":"Сколько будет 15*7 - (2+3)?"}]}'

# vision: описание картинки по URL
curl -i -N -X POST http://localhost:3000/api/vision \
  -H "content-type: application/json" \
  --data '{"imageUrl":"https://picsum.photos/seed/ai/600/400","prompt":"Опиши изображение кратко."}'

🧩 UI/UX (для демонстрации)

Селектор модели в шапке чата — я кладу выбранную модель в заголовок X-AI-Model.

Глобальная загрузка — индикатор «⏳ генерирую…» работает для всех разделов.

Панель метрик — модель, E2E латентность, время подготовки сервера, (опционально) токены.

System prompt — виден на странице (раздел System prompt (используется на сервере)).

⚙️ Конфигурация

.env (пример):

OPENAI_API_KEY=sk-XXXX...

# Модель по умолчанию в UI (можно менять в селекторе)
NEXT_PUBLIC_DEFAULT_MODEL=gpt-4o-mini

▶️ Локальный запуск (Node)
# Node 18.17+ / 20.x
npm i
npm run dev # http://localhost:3000

🐳 Docker (multi-stage)
# сборка
docker build --no-cache -t ai-v5-demo:latest .

# запуск (подставь свой .env)
docker rm -f ai-v5 2>/dev/null || true
docker run -d --name ai-v5 --env-file .env -p 3000:3000 ai-v5-demo:latest

# лог
docker logs -f ai-v5


Образ не тянет нативные зависимости — Edge-роуты работают «из коробки».

🧰 Nginx (reverse proxy, важно отключить буферизацию)
server {
  listen 80;
  server_name ai-v5-demo.example.com;

  gzip on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    # критично для стрима
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    sendfile off;
    proxy_set_header Connection "";
    add_header X-Accel-Buffering no;
  }
}

🗂️ Структура проекта
app/
  api/
    chat/route.ts      # streamText + tools + guarded-fallback
    vision/route.ts    # streamText (image+text)
    ping/route.ts      # health
    echo/route.ts      # test stream
  page.tsx             # разделы про стек/инфру/новое в v5, подсказки
  layout.tsx
components/
  Chat.tsx             # ручной ридер потока, stop/abort, UI
  Vision.tsx           # форма для URL изображения
  StatsBar.tsx         # метрики и глобальная загрузка
lib/
  systemPrompt.ts      # system prompt, показываю в UI
public/
Dockerfile
next.config.mjs (если есть)

🧪 Почему это прод-уровень (где «мясо»)

Типобезопасные инструменты (tool() + zod) и реальная интеграция погоды (Open-Meteo).

Контролируемый стрим на клиенте и guarded fallback на сервере — никогда не возвращаю пустой ответ.

Наблюдаемость: метрики латентности, времени подготовки, модель; заголовки ответа.

Vision по правилам v5: { type: 'image', image: url } + { type: 'text' }.

🧯 Troubleshooting

Пустой ответ после tool-call
Я уже добавил guarded fallback; если всё же видишь пустоту — проверь Nginx (буферизация), смотри X-Accel-Buffering: no.

crypto.randomUUID is not a function
В клиенте у меня есть фолбэк-UUID. Убедись, что билд без полифиллов браузера не ломает SSR.

TypeScript тянется в прод-билд
Если используешь мою Docker-схему, всё ок; Next сам докачивает devDeps в билдер-слое.

no space left on device при сборке
Чистка:

docker system prune -a --volumes -f
rm -rf ~/.npm/_cacache


Стрим «залипает»
Проверь Nginx: proxy_buffering off; sendfile off; + add_header X-Accel-Buffering no;
Инициируй curl -i -N /api/echo — должен идти «chunk 1..5».

🗺️ Roadmap (что докрутить быстро)
docker rm -f ai-v5 2>/dev/null || true

Structured output через zod и показ таблицей в UI.
Параллельные tool-calls (погода сразу по нескольким городам).
Кэширование погоды (TTL 60–120с), флаг в UI.
RAG (маленький индекс + инструмент searchDocs).
Usage-коллектор после стрима (сведу токены в метрики стабильно).

📜 Лицензия

MIT. Делай с этим кодом что хочешь, только оставь копирайт.

👨‍💻 Автор

Andrei Sokolov — собрал, написал, подкрутил Edge, инструменты, Vision и всё остальное.