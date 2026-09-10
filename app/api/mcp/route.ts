import {WebStandardStreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {authenticateMcp,jsonBody,mcpOrigin} from "@/lib/mcp-auth";
import {fivegenMcp} from "@/lib/mcp-server";
import {ApiError} from "@/lib/server";
export async function POST(req:Request){
  try{const connection=await authenticateMcp(req),body=await jsonBody(req,3000000),server=fivegenMcp(connection,mcpOrigin(req));
    const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    await server.connect(transport);
    try{const response=await transport.handleRequest(req,{parsedBody:body});const data=await response.text();return new Response(data||null,{status:response.status,headers:{...Object.fromEntries(response.headers),"Cache-Control":"no-store"}});}finally{await server.close();}
  }catch(e){const status=e instanceof ApiError?e.status:500;return Response.json({jsonrpc:"2.0",id:null,error:{code:-32000,message:e instanceof ApiError?e.message:"MCP request failed."}},{status,headers:{"Cache-Control":"no-store",...(status===401?{"WWW-Authenticate":`Bearer resource_metadata="${mcpOrigin(req)}/.well-known/oauth-protected-resource", error="invalid_token"`}:{})}});}
}
export function GET(){return new Response(null,{status:405,headers:{Allow:"POST","Cache-Control":"no-store"}});}
export const DELETE=GET;
export function OPTIONS(){return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Authorization, Content-Type, Accept, MCP-Protocol-Version","Access-Control-Max-Age":"600"}});}
