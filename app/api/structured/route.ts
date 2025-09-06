import { NextRequest } from 'next/server';
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!process.env.OPENAI_API_KEY) {
      return new Response('OPENAI_API_KEY is missing', { status: 500 });
    }
    if (!query || typeof query !== 'string') {
      return new Response('`query` must be a non-empty string', { status: 400 });
    }

    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const schema = z.object({
      sentiment: z.enum(['positive', 'neutral', 'negative']),
      summary: z.string(),
      keywords: z.array(z.string()).max(10)
    });

    const result = await generateObject({
      model: openai('gpt-4o-mini'),
      schema,
      prompt:
        'Проанализируй текст и верни JSON по схеме (sentiment, summary, keywords). Текст:\n' +
        query
    });

    return Response.json(result.object, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (e: any) {
    return new Response(`Structured API error: ${e?.message || e}`, { status: 500 });
  }
}
