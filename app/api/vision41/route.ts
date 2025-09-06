// app/api/vision41/route.ts
// Edge-вариант Vision, фиксированно на GPT-4.1
import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export const runtime = 'edge';

// ArrayBuffer → base64 (Edge-safe)
function abToBase64(buf: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  // @ts-ignore
  return btoa(binary);
}

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, instruction } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return new Response('OPENAI_API_KEY is missing', { status: 500 });
    }
    if (!imageUrl || typeof imageUrl !== 'string') {
      return new Response('`imageUrl` must be a non-empty string', { status: 400 });
    }

    // 1) Проксируем изображение (обход CORS) → data: URL
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return new Response(`Image fetch failed: ${imgRes.status}`, { status: 400 });
    const ctype = imgRes.headers.get('content-type') || 'application/octet-stream';
    if (!/^image\//i.test(ctype)) return new Response(`Unsupported content-type: ${ctype}`, { status: 415 });
    const buf = await imgRes.arrayBuffer();
    const dataUrl = `data:${ctype};base64,${abToBase64(buf)}`;

    // 2) Отправляем в GPT-4.1 (зафиксировано)
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await streamText({
      model: openai('gpt-4.1'),
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: instruction || 'Опиши изображение кратко и по делу.' },
          { type: 'image', image: dataUrl }
        ]
      }],
      temperature: 0.2,
      maxOutputTokens: 400
    });

    return result.toTextStreamResponse({
      headers: {
        'X-Accel-Buffering': 'no',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Content-Type': 'text/plain; charset=utf-8'
      }
    });
  } catch (e: any) {
    return new Response(`Vision 4.1 API error: ${e?.message || e}`, { status: 500 });
  }
}
