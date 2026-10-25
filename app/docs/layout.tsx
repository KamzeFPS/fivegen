import type {Metadata} from 'next';
import {publicPageMetadata} from '@/lib/seo';
import {DocsShell} from './docs-shell';
import './docs.css';
export const metadata:Metadata=publicPageMetadata({title:'FiveGen Docs — Build, launch and grow',description:'Practical guides for creating products, designing sales pages, selling, growing an audience and using the FiveGen MCP integration.',path:'/',docs:true});
export default function DocsLayout({children}:{children:React.ReactNode}){return <DocsShell>{children}</DocsShell>;}
