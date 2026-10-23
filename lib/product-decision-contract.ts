import {z} from 'zod';

const identifier=z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),label=z.string().trim().min(1).max(300);
export const draftDecisionGraphSchema=z.object({startId:z.string().max(64),nodes:z.array(z.object({id:identifier,label:z.string().max(300),kind:z.enum(['decision','action','end']),choices:z.array(z.object({label:z.string().max(150),to:z.string().max(64)})).max(4)})).max(24)});
export const decisionGraphSchema=z.object({startId:identifier,nodes:z.array(z.object({id:identifier,label,kind:z.enum(['decision','action','end']),choices:z.array(z.object({label:label.max(150),to:identifier})).max(4)})).min(1).max(24)}).superRefine((graph,context)=>{
 const nodes=new Map(graph.nodes.map(node=>[node.id,node]));
 const issue=(message:string)=>context.addIssue({code:z.ZodIssueCode.custom,message});
 if(nodes.size!==graph.nodes.length)issue('Every step needs a unique identifier.');
 if(!nodes.has(graph.startId))issue('Choose an existing starting step.');
 for(const node of graph.nodes){
  if(node.kind==='decision'&&node.choices.length<2)issue(`“${node.label}” needs at least two branches.`);
  if(node.kind==='end'&&node.choices.length)issue(`The outcome “${node.label}” cannot have a next step.`);
  if(node.kind==='action'&&node.choices.length!==1)issue(`The action “${node.label}” needs exactly one next step.`);
  if(new Set(node.choices.map(choice=>choice.label.toLowerCase())).size!==node.choices.length)issue(`Use distinct branch labels for “${node.label}”.`);
  for(const choice of node.choices)if(!nodes.has(choice.to))issue(`Choose an existing destination for “${choice.label}”.`);
 }
 const visited=new Set<string>(),stack=new Set<string>();let cycle=false;
 function walk(id:string){if(stack.has(id)){cycle=true;return;}if(visited.has(id))return;visited.add(id);stack.add(id);for(const choice of nodes.get(id)?.choices||[])walk(choice.to);stack.delete(id);}
 walk(graph.startId);if(cycle)issue('A decision flow must reach an outcome without looping back.');
 if(graph.nodes.some(node=>!visited.has(node.id)))issue('Connect every step to the starting step.');
 if(!graph.nodes.some(node=>node.kind==='end'))issue('Add at least one final outcome.');
});
export type ProductDecisionGraph=z.infer<typeof decisionGraphSchema>;
export type DecisionGraph=ProductDecisionGraph;
export function decisionGraphText(value:unknown){
 const result=decisionGraphSchema.safeParse(value);if(!result.success)return '';
 const graph=result.data,index=new Map(graph.nodes.map((node,i)=>[node.id,i+1]));
 return `Start at step ${index.get(graph.startId)}.\n\n`+graph.nodes.map((node,i)=>`${i+1}. ${node.label}${node.kind==='end'?' (Outcome)':''}\n${node.choices.map(choice=>`   - ${choice.label}: go to step ${index.get(choice.to)} (${graph.nodes.find(item=>item.id===choice.to)?.label}).`).join('\n')}`).join('\n\n');
}
export function decisionGraphLayout(graph:ProductDecisionGraph){
 const depths=new Map<string,number>([[graph.startId,0]]),pending=[graph.startId];
 while(pending.length){const id=pending.shift()!,depth=depths.get(id)||0;for(const choice of graph.nodes.find(node=>node.id===id)?.choices||[])if((depths.get(choice.to)??-1)<depth+1){depths.set(choice.to,depth+1);pending.push(choice.to);}}
 const counts=new Map<number,number>();return graph.nodes.map(node=>{const column=depths.get(node.id)||0,row=counts.get(column)||0;counts.set(column,row+1);return {...node,x:column*430+20,y:row*125+20};});
}
