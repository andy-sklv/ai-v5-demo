export const runtime = 'edge';
export async function GET() {
  return new Response('pong', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
