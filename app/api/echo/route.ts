export const runtime = 'edge';
export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let i = 0;
      const id = setInterval(() => {
        controller.enqueue(encoder.encode(`chunk ${++i}\n`));
        if (i >= 5) { clearInterval(id); controller.close(); }
      }, 400);
    }
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}
