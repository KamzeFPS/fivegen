import {mainRobotsText} from '@/lib/seo';

export function GET() {
  return new Response(mainRobotsText(), {headers: {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600'}});
}
