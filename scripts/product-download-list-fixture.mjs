import {readFileSync} from 'node:fs';
import React from 'react';
import ts from 'typescript';
import {ArrowDownToLine,FileText} from 'lucide-react';

export function loadProductDownloadList(browser={}){
 function load(path,deps){const exports={},source=readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;new Function('exports',...Object.keys(deps),code)(exports,...Object.values(deps));return exports;}
 const presentation=load('app/customer/presentation.ts',{});
 return load('app/customer/product-download-list.tsx',{React,ArrowDownToLine,FileText,...presentation,...browser}).ProductDownloadList;
}
