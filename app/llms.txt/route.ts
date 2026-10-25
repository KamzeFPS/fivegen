import {docsLlmsText} from '@/lib/docs';
export function GET(){return new Response(docsLlmsText(),{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=300'}});}
