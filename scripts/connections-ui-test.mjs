import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import ts from 'typescript';

// Run the actual client component with deterministic hooks and an in-memory
// fetch boundary. No browser credentials, live connection or server is used.
const source=readFileSync('app/connections-panel.tsx','utf8').replace(/^import[^\n]*\n/gm,'');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const connection={id:'synthetic-connection',name:'My Claude assistant',scopes:'products:read products:write',created_at:Date.now()-86400000,last_used_at:Date.now()-60000,refresh_expires:Date.now()+86400000};
const icon=()=>null,Dialog=()=>null;
function createPanel({failDelete=false}={}){
 const states=[{url:'https://example.test/api/mcp',connections:[connection],activity:[]},'Claude','','',false,null],calls=[],notices=[];let hook=0;
 const deps={React,useState:initial=>{const index=hook++;if(!(index in states))states[index]=initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},useEffect:()=>{},toast:{success:message=>notices.push(message),error:()=>{}},Dialog,DialogContent:icon,DialogHeader:icon,DialogTitle:icon,DialogDescription:icon,DialogFooter:icon,fetch:async(url,options={})=>{
  calls.push({url,...options});assert.equal(url,'/api/connections','The component can only reach the mocked connections endpoint');
  if(options.method==='DELETE'){if(failDelete)return Response.json({error:'Synthetic provider failure'},{status:503});return Response.json({revoked:true});}
  return Response.json({url:'https://example.test/api/mcp',connections:[],activity:[]});
 }};
 for(const name of ['ArrowUpRight','Check','Copy','Link2','Loader2','RefreshCw','ShieldCheck','Unplug','Zap'])deps[name]=icon;
 const exports={};new Function('exports',...Object.keys(deps),code)(exports,...Object.values(deps));
 function render(){hook=0;return exports.ConnectionsPanel({signedIn:true});}
 return {render,states,calls,notices};
}
function all(node,predicate,found=[]){if(Array.isArray(node)){for(const value of node)all(value,predicate,found);}else if(React.isValidElement(node)){if(predicate(node))found.push(node);all(node.props.children,predicate,found);}return found;}
function text(node){if(Array.isArray(node))return node.map(text).join('');if(React.isValidElement(node))return text(node.props.children);return typeof node==='string'||typeof node==='number'?String(node):'';}
function button(tree,label){const matches=all(tree,node=>node.type==='button'&&text(node.props.children)===label);assert.equal(matches.length,1,`Exactly one ${label} button exists`);return matches[0];}
function dialog(tree){const matches=all(tree,node=>node.type===Dialog);assert.equal(matches.length,1);return matches[0];}

const pending=createPanel();let tree=pending.render();assert.equal(dialog(tree).props.open,false);
button(tree,'Disconnect').props.onClick();assert.equal(pending.calls.length,0,'Opening a confirmation never revokes the connection');
tree=pending.render();assert.equal(dialog(tree).props.open,true);assert.ok(text(tree).includes('Disconnect My Claude assistant?'),'The user sees the exact assistant being disconnected');
button(tree,'Keep connected').props.onClick();assert.equal(pending.calls.length,0,'Canceling confirmation never calls DELETE');assert.equal(dialog(pending.render()).props.open,false);
button(pending.render(),'Disconnect').props.onClick();tree=pending.render();dialog(tree).props.onOpenChange(false);assert.equal(pending.calls.length,0,'Escape/overlay close has no revocation side effect');assert.equal(dialog(pending.render()).props.open,false);

button(pending.render(),'Disconnect').props.onClick();tree=pending.render();await button(tree,'Disconnect assistant').props.onClick();
const deletions=pending.calls.filter(call=>call.method==='DELETE');assert.equal(deletions.length,1,'Only explicit confirmation revokes one connection');assert.deepEqual(JSON.parse(deletions[0].body),{id:connection.id});assert.equal(pending.notices.length,1);assert.equal(dialog(pending.render()).props.open,false);assert.equal(pending.states[0].connections.length,0,'The list refreshes after confirmed revocation');

const busy=createPanel();busy.states[2]=connection.id;busy.states[5]=connection;tree=busy.render();assert.equal(button(tree,'Disconnect').props.disabled,true);assert.equal(button(tree,'Keep connected').props.disabled,true);assert.equal(button(tree,'Disconnecting…').props.disabled,true);dialog(tree).props.onOpenChange(false);assert.equal(busy.states[5],connection,'An in-progress confirmation cannot be dismissed as though it were canceled');assert.equal(busy.calls.length,0);

const failure=createPanel({failDelete:true});button(failure.render(),'Disconnect').props.onClick();await button(failure.render(),'Disconnect assistant').props.onClick();assert.equal(failure.calls.filter(call=>call.method==='DELETE').length,1);assert.equal(failure.notices.length,0,'A failed revocation never shows a success message');assert.equal(failure.states[0].connections.length,1,'A failed request preserves the existing connection in the list');assert.match(failure.states[3],/Could not disconnect/);assert.equal(failure.states[2],'','The user can retry after a failed request');assert.equal(dialog(failure.render()).props.open,true,'Failed revocation keeps the confirmation open for retry');
console.log('Connections UI: opening/canceling/Escape never revoke; explicit confirmation targets exactly one connection; busy and failure states preserve user control.');
