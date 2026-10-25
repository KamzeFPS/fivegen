import {docsManifest} from '@/lib/docs';
export function GET(){return Response.json(docsManifest(),{headers:{'Cache-Control':'public, max-age=300'}});}
