import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Execute the actual pure allowlist without importing a server or a schema
// dependency graph. This fixture supplies source-stripped simulation suites.
export function loadServicePresentation(){
 const path='lib/builder-publication-contract.ts',source=readFileSync(path,'utf8'),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true),names=['builderServicePresentation','builderDeliveredStudio'];
 const selected=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text)).map(node=>node.getText(ast)).join('\n'),module={};
 new Function('exports',ts.transpileModule(selected,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module);
 return module;
}
