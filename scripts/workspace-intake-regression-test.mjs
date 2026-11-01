import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Execute the production pure intake helpers. No copied implementation, stored
// conversations, network transports, provider calls or credit operations.
const path='lib/workspace-assistant.ts',source=readFileSync(path,'utf8'),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
const functionNames=['assistantActiveBriefMessages','assistantIntakeHistory','newAssistantQuestions'];
const nodes=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&functionNames.includes(node.name?.text)||ts.isVariableStatement(node)&&node.declarationList.declarations.some(item=>item.name.getText(ast)==='normalizedQuestion'));
for(const name of functionNames)assert.ok(nodes.some(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name),'Load the actual production '+name);
const exports={};
new Function('exports',ts.transpileModule(nodes.map(node=>node.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(exports);
const {assistantActiveBriefMessages,assistantIntakeHistory,newAssistantQuestions}=exports;
let sequence=0;
const user=content=>({id:'user-'+(++sequence),role:'user',content});
const assistant=(questions,content='A few useful decisions will shape the product.')=>({id:'assistant-'+(++sequence),role:'assistant',content,questions});
const answer=(question,value)=>question+'\nMy answer: '+value;
const audience='Who is this for?',files='Do you have supporting files?',delivery='How should customers receive it?';

// Asking what a question means is not an answer, even in a one-question turn.
const detour=[assistant([audience]),user('What do you mean by audience? Could you give me an example?')];
const detourBefore=structuredClone(detour),detourHistory=assistantIntakeHistory(detour,'I need help deciding.');
assert.equal(detourHistory.length,1);
assert.equal(detourHistory[0].explicit,false);
assert.equal(detourHistory[0].reply,detour[1].content,'The actual clarification remains available as context');
assert.deepEqual(newAssistantQuestions([audience],detourHistory),[audience],'An unanswered necessary question can still be asked');
assert.deepEqual(detour,detourBefore,'Reading intake does not mutate the conversation');

const exact=assistantIntakeHistory([assistant([audience]),user(answer(audience,'Freelance illustrators.'))],'Continue.');
assert.equal(exact[0].explicit,true);
assert.equal(exact[0].reply,'Freelance illustrators.');
assert.deepEqual(newAssistantQuestions(['WHO IS THIS FOR?!','Who is this for',files,files],exact),[files],'Question dedupe normalizes case/punctuation but does not remove a new decision');
const unmarked=assistantIntakeHistory([assistant([audience]),user('Probably freelance illustrators, but explain the options first.')],'Help me decide.');
assert.equal(unmarked[0].explicit,false,'Freeform discussion is not silently promoted to a confirmed answer');

// A later explicit correction must win across the recent-context boundary.
const corrected=[assistant([audience]),user(answer(audience,'Freelance illustrators.')),assistant([],'Thanks, I have that.'),user(answer(audience,'Correction: independent teachers, replacing the earlier audience.'))];
for(let index=0;index<42;index++)corrected.push(user('An unrelated planning note '+index+': '+('Keep the supplied facts separate from assumptions. '.repeat(90))));
const correctedBefore=structuredClone(corrected),correctionHistory=assistantIntakeHistory(corrected,'Continue with the corrected audience.');
assert.equal(correctionHistory[0].reply,'Correction: independent teachers, replacing the earlier audience.','Latest exact correction survives long intervening context');
assert.equal(correctionHistory[0].explicit,true);
assert.deepEqual(newAssistantQuestions([audience,delivery],correctionHistory),[delivery]);
assert.deepEqual(corrected,correctedBefore);
const currentCorrection=assistantIntakeHistory(corrected,answer(audience,'Final correction: first-time independent tutors.'));
assert.equal(currentCorrection[0].reply,'Final correction: first-time independent tutors.','The current unsaved turn can carry the latest explicit correction');

// Each marker is scoped to its own question; a correction of one leaves the
// other supplied answers intact, with no neighboring text copied into it.
const multi=[assistant([audience,files,delivery]),user([answer(audience,'Independent teachers.'),answer(files,'I have my own lesson notes.'),answer(delivery,'Both the in-app version and an exportable PDF.')].join('\n\n')),user(answer(audience,'Independent language tutors.'))];
const multiHistory=assistantIntakeHistory(multi,'Continue.');
assert.deepEqual(multiHistory.map(item=>[item.question,item.reply,item.explicit]),[[audience,'Independent language tutors.',true],[files,'I have my own lesson notes.',true],[delivery,'Both the in-app version and an exportable PDF.',true]]);
assert.deepEqual(newAssistantQuestions([delivery,audience,files],multiHistory),[],'All explicitly supplied decisions are retained without a repeated interview');

const uncertainty='I’m not sure yet. Recommend a sensible starting point using what I have already shared.';
const skipped='I’m skipping this question for now. Continue with what I have already shared and state any necessary assumptions.';
for(const reply of [uncertainty,skipped]){
 const history=assistantIntakeHistory([assistant([files]),user(answer(files,reply))],'Continue.');
 assert.equal(history[0].explicit,true,'A deliberate uncertainty/skip control is an explicit response');
 assert.equal(history[0].reply,reply,'Keep the user’s uncertainty rather than inventing supporting files or expertise');
 assert.deepEqual(newAssistantQuestions([files],history),[],'A deliberate skip does not trap the user in the same question');
}

// A genuinely new product gets a fresh brief. Explicit reuse keeps the prior
// decisions, and adding a community resource does not reset the product.
const previous=[user('Create a guide for me.'),assistant([audience]),user(answer(audience,'Freelance illustrators.'))];
assert.equal(assistantIntakeHistory(previous,'Create another book for a different project.').length,0);
assert.deepEqual(newAssistantQuestions([audience],assistantIntakeHistory(previous,'Create another book for a different project.')),[audience]);
assert.equal(assistantIntakeHistory(previous,'Create another book and reuse my previous answers.')[0].reply,'Freelance illustrators.');
assert.equal(assistantIntakeHistory(previous,'Create another community resource for this product.')[0].reply,'Freelance illustrators.');
assert.equal(assistantActiveBriefMessages(previous,'Continue with this product.').length,previous.length+1);

console.log('Workspace intake regression passed: clarification detours stay unconfirmed, exact latest corrections survive long context, multi-question answers stay separate, optional responses remain truthful, normalized question dedupe and new-product/reuse scoping. No provider calls or data mutations.');
