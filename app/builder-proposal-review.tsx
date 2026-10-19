import type {BuilderAgentSuggestion} from '@/lib/builder-assistant-contract';

export function BuilderProposedSections({sections,unit,plural}:{sections:NonNullable<BuilderAgentSuggestion['sections']>;unit:string;plural:string}){
 return <>
  <p>{sections.length} proposed {plural}. Review the full text below before adding or replacing content. Your current version is saved in revision history first.</p>
  {sections.map((part,index)=><section className="pb-proposed-section" key={index}>
   <small>{unit} {index+1}</small><h3>{part.title}</h3><p>{part.body||'No written content proposed.'}</p>
  </section>)}
 </>;
}
