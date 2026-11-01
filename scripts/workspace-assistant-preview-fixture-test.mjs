import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Read only the pure synthetic provider functions; never start its server,
// mutate environment settings, access credentials or call a provider.
const fixture=readFileSync('scripts/workspace-assistant-preview.mjs','utf8'),parsed=ts.createSourceFile('preview.mjs',fixture,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),functions=parsed.statements.filter(node=>ts.isFunctionDeclaration(node)&&['previewCreatorExpertise','modelFixture'].includes(node.name?.text)).map(node=>node.getText(parsed)).join('\n'),{modelFixture,previewCreatorExpertise}=new Function(functions+';return {modelFixture,previewCreatorExpertise};')();
const stepperSource=readFileSync('app/chat-question-stepper.tsx','utf8'),stepper=ts.createSourceFile('stepper.tsx',stepperSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),buttonResponses=[];
function visit(node){if(ts.isStringLiteral(node)&&/^I’m (?:not sure|skipping)/.test(node.text))buttonResponses.push(node.text);ts.forEachChild(node,visit);}visit(stepper);
assert.equal(buttonResponses.length,2,'Use the literal Skip and Not sure responses shipped by the stepper');
const questions=['Who is this for, and what should they be able to do after using it?','What unique method, examples or supporting files can you contribute? You can also say you have none yet.','Should buyers use it in the app, download a file, or both? For a download, choose PDF, EPUB, HTML, Markdown or ZIP.'];
const input=reply=>({message:questions[2]+'\nMy answer: Both, PDF.',initialRequest:'[fixture-questions]',intakeHistory:questions.map((question,index)=>({question,reply:index===1?reply:index===0?'New freelance designers.':'Both, PDF.',explicit:true})),conversation:{messages:[]}});
for(const reply of [...buttonResponses,"I'm not sure yet...",'Skip','Not sure','No sources','I have no files or examples.','I skipped this question.']){
 const result=modelFixture(input(reply)),action=result.plan.steps[0].action;assert.equal(action.creatorExpertise,'',reply);assert.match(action.instructions,/general guidance/);assert.match(result.plan.assumptions.join(' '),/No unique creator method/);assert.ok(!JSON.stringify(result).includes('My four-part scope check'));assert.ok(!result.answer.includes('your original approach'));assert.ok(!result.answer.includes('the approach you supplied'));
}
const method='I begin every handoff by listing the approved formats and next decision.';assert.equal(previewCreatorExpertise(input(method)),method,'An actual creator answer stays verbatim');
const initial='Create an onboarding Guide using both in-app and PDF delivery. My original four-part scope check covers outcome, deliverable, deadline and decision maker.';assert.equal(modelFixture({message:initial,initialRequest:initial}).plan.steps[0].action.creatorExpertise,'My original four-part scope check covers outcome, deliverable, deadline and decision maker.','The explicit method in --check remains supported');
assert.equal(modelFixture({message:'Create an onboarding guide as both PDF and in-app.',initialRequest:'Create an onboarding guide as both PDF and in-app.'}).plan.steps[0].action.creatorExpertise,'');
console.log('Preview fixture fidelity passed: literal shipped Skip/Not sure responses, smart quotes, uncertainty and skipped inflections stay general; actual supplied methods remain verbatim. No server or provider calls.');
