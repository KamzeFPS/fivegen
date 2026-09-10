import {mcpOrigin,mcpScopes,oauthJson} from "@/lib/mcp-auth";
export function GET(req:Request){const origin=mcpOrigin(req);return oauthJson({resource:`${origin}/api/mcp`,authorization_servers:[origin],scopes_supported:Object.keys(mcpScopes),bearer_methods_supported:["header"],resource_name:"FiveGen",resource_documentation:`${origin}/?connect=mcp`});}
