// Synthetic provider output for the local guided-flow preview, never production.
export function workspaceGeneratedProductFixture(count=3){
 const chapters=[
  {title:'Write one clear project brief',objective:'Turn an unclear inquiry into a brief with a named outcome, deliverable and decision maker.',actionStep:'Write a four-part brief for one real inquiry. Check the outcome, deliverable, deadline and decision maker before asking the client to confirm it.',body:`## Start with the change the client wants

A useful brief describes what should be different after the project. Ask the client what their audience needs to understand or do, rather than starting with a list of design preferences. Write their answer in a sentence that both of you can check later. A clear outcome helps you decide whether a requested detail belongs in this project or in a later piece of work.

## Name the actual deliverable

Record what you will hand over, its intended use, and the limits that matter. A brochure brief might name the page count, print size, supplied text and image requirements. A small website brief might name the pages, required content and supported devices. Use the client’s actual requirements; these examples are starting points rather than a universal service specification.

## Worked example: an unclear brochure inquiry

Illustrative inquiry: “We need something professional for our new service.” A useful follow-up is: “Who will read it, what should they understand afterwards, and where will they see it?” An agreed answer could be: “A four-page PDF brochure that explains the new service to existing business customers and gives them one way to request a conversation.” Confirm who supplies the service text, which decision maker approves it, and when that approval is needed.

## Keep open questions visible

Do not quietly turn a missing answer into your own assumption. Put uncertain items under Open questions. For each item, name the person who can answer it and when the answer is needed. If the client has not supplied final copy, write that down. Explain which parts of your schedule depend on it. This creates a useful shared record without pretending that every detail is settled.

## Your first useful action

Use the included client-brief.csv with one genuine inquiry. Complete Outcome, Audience, Deliverable, Deadline and Decision maker. Read each answer aloud and remove vague words such as “better” when neither person could tell what success means. Send the draft back with one request: confirm the brief or correct the specific points that are wrong. Keep the confirmed version beside your project files.

## Check before moving on

A useful brief names a real audience, a concrete deliverable and one person who can make the final decision. A common mistake is treating a friendly call as a complete agreement. Keep the relationship friendly while making the working details visible. Move to the next chapter when you can explain the project in a few specific sentences and list the remaining questions honestly.`},
  {title:'Agree the working scope and review process',objective:'Make the included work, review process and dependencies visible before starting the project.',actionStep:'Complete the scope checklist, then ask the client to confirm the included work and one review process. Flag unanswered items rather than filling them with assumptions.',body:`## Make the boundary easy to understand

Scope describes the work you have agreed to do. Write the included deliverables in plain language and distinguish them from related work that has not been agreed. For example, preparing a brochure does not automatically include writing its source copy, commissioning photography or building a website. State the relevant boundary without adding a long list of hypothetical exclusions that do not matter to this project.

## Choose one place for feedback

Ask the client to collect feedback from their team before sending it to you. Agree one document or channel for that feedback and one person who resolves conflicting requests. A useful review message explains what you are showing, which decisions you need, and when the response is needed. This is more practical than asking whether the client “likes it” and receiving unrelated comments from several people.

## Worked example: the first direction review

Illustrative message: “Here is the proposed brochure direction based on the confirmed brief. Please check the information order and the way the service is explained. Collect your team’s comments in this document by the agreed review date. If two comments conflict, please mark the final choice before returning it.” Adapt the date and review scope to the actual agreement. Do not present this example as a binding contract or a substitute for your own professional terms.

## Check the dependencies before scheduling

List what you need from the client, such as approved text, brand files, access or image permissions. Give each item a clear owner. Explain which work can begin now and which work depends on a missing item. If a dependency changes, discuss the effect on the working plan before promising the same delivery date. A visible dependency list supports a calm conversation when circumstances change.

## Handle an additional request directly

When a new request arrives, compare it with the agreed scope. Acknowledge the request, explain what it adds, and agree how to proceed before beginning it. You can discuss a separate piece of work, a different sequence or a smaller original scope. Avoid either silently adding the work or rejecting it with an unexplained rule. Keep the decision and the revised expectation in the same project record.

## Use the scope checklist

Open scope-checklist.md and complete it against your brief. Replace the example entries with the actual project details. Check that the included work, client inputs, review owner and next decision are clear. The common mistake is writing a detailed scope once and never referring to it again. Keep it available during review, and update it when both parties deliberately change the working agreement.`},
  {title:'Send a calm first-week plan and handoff',objective:'Give the client one clear next action and a small, realistic sequence for the start of the project.',actionStep:'Draft a first-week message with the next action, responsible person and agreed review point. Check every date against the real project before sending it.',body:`## Turn the agreement into a short sequence

The first-week plan shows what happens next. Use a small number of meaningful stages rather than listing every task in your design process. Start with the confirmed brief and required inputs, then show the first piece of work the client will review. Name the review point and the decision you will need. A useful plan makes the client’s contribution visible as well as your own work.

## Worked example: a first-week message

Illustrative message: “Thank you for confirming the brief. Our next step is to check the source text and approved brand files. After those are available, I will prepare the first information structure for your review. At that review, we will confirm the service explanation and the order of the main sections before developing the final visual direction.” Replace these stages with the actual project sequence and agreed dates. Do not promise a fixed schedule while the inputs are still uncertain.

## End with one request

A message that asks for five unrelated things is difficult to act on. End with the next useful request and explain why it matters. For example: “Please confirm the decision maker and share the approved source text before we set the first review date.” If several files are needed, use a checklist in one place. Keep the request specific enough that the client can tell when it is complete.

## Organize the working files

Use a simple folder structure that matches the project. Separate client inputs, working files and approved delivery files. Give each approved version a clear name so that the client does not have to guess which file to use. Include a short readme when several formats have different purposes. Avoid sending a large folder of unexplained exports and expecting the client to know which version belongs in which context.

## Review the first handoff

Before sharing, compare the work with the confirmed brief. Check that the agreed deliverables are present, filenames are clear and the review question is visible. Ask a colleague or test reader to explain the next action after reading your message. If they cannot identify it, shorten the message and make that action more explicit. This is a clarity check, not a claim that the work will achieve a particular commercial result.

## Reflect and improve the process

After the first review, record what created uncertainty and what helped the client respond. Keep one small improvement for the next project, such as a clearer input checklist or a more focused review question. The common mistake is adding more process after every difficult conversation. Prefer a practical change that solves an observed problem. Your completion check is a client-facing plan with a named next action, owner and review point that matches the real agreement.`},
 ];
 return {sections:Array.from({length:count},(_,index)=>({...chapters[index%chapters.length],...(index>=chapters.length?{title:`Day ${index+1}: Apply the method to a new inquiry`,objective:`Apply the scope check to a new example on day ${index+1}.`,body:`Day ${index+1}: Work on a new inquiry and record what is different.\n\n${chapters[index%chapters.length].body}`}:{})})),benefits:['Write a clear brief before starting client work.','Make the scope and review process easier to follow.','Give the client one practical next action.'],files:[{name:'scope-checklist.md',description:'A practical scope and review checklist with an illustrative entry',content:'# Project scope checklist\n\n- [ ] Name the intended audience and useful outcome.\n- [ ] List the included deliverables.\n- [ ] Record the client inputs that are still needed.\n- [ ] Identify the final decision maker.\n- [ ] Agree where feedback will be collected.\n- [ ] Name the next review point and the decision it needs.\n\nIllustrative entry: a four-page PDF brochure, source text supplied by the client, feedback collected in one document by the project lead. Replace this example with the actual agreed work.'},{name:'client-brief.csv',description:'A reusable client brief with example rows and space for actual answers',content:'Question,Illustrative example,Your answer\nOutcome,Explain the new service clearly,\nAudience,Existing business customers,\nDeliverable,Four-page PDF brochure,\nClient input,Approved source text and brand files,\nDecision maker,Project lead,\nNext action,Confirm the brief and missing inputs,\nReview point,Agree the information structure,\n'}]};
}
