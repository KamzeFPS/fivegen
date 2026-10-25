import type {Metadata} from 'next';
import {DocsShell} from './docs-shell';
import './docs.css';
export const metadata:Metadata={title:{default:'FiveGen Docs — Build, launch and grow',template:'%s · FiveGen Docs'},description:'Practical guides for creating products, designing sales pages, selling, growing an audience and using the FiveGen MCP integration.',alternates:{canonical:'https://docs.fivegen.ai'}};
export default function DocsLayout({children}:{children:React.ReactNode}){return <DocsShell>{children}</DocsShell>;}
