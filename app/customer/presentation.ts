export type BuyerFamily='document'|'course'|'templates'|'challenge'|'service'|'community'|'custom';
export function buyerPresentation(content:{format:string;builderType?:string;deliveryFamily?:string;service?:boolean}){
 const format=content.format.toLowerCase(),type=content.builderType||({'book':'book','book / ebook':'book','guide':'guide','playbook':'playbook','mini course':'mini-course','video course':'video-course','template kit':'template-kit','challenge':'challenge','coaching session':'coaching','consulting / mentorship':'consulting','community':'community'} as Record<string,string>)[format]||'custom';
 const inferred:BuyerFamily=content.service?'service':type==='mini-course'||type==='video-course'?'course':type==='template-kit'?'templates':type==='challenge'?'challenge':type==='coaching'||type==='consulting'?'service':type==='community'?'community':'document';
 const family:BuyerFamily=['document','course','templates','challenge','service','community','custom'].includes(content.deliveryFamily||'')?content.deliveryFamily as BuyerFamily:inferred;
 const labels:Record<string,{label:string;unit:string;plural:string;reading:string;intro:string}>={
  book:{label:'Book',unit:'Chapter',plural:'chapters',reading:'Read your book',intro:'Your next chapter starts here.'},
  guide:{label:'Guide',unit:'Section',plural:'sections',reading:'Start your guide',intro:'A clear path to your next step.'},
  playbook:{label:'Playbook',unit:'Step',plural:'steps',reading:'Explore the playbook',intro:'A practical process, ready to use.'},
  'mini-course':{label:'Mini course',unit:'Lesson',plural:'lessons',reading:'Start learning',intro:'Make a little room for something new.'},
  'video-course':{label:'Video course',unit:'Lesson',plural:'lessons',reading:'Start learning',intro:'Learn at your own pace.'},
  'template-kit':{label:'Template kit',unit:'Template',plural:'templates',reading:'Get your templates',intro:'Less setup. More time for your work.'},
  challenge:{label:'Challenge',unit:'Day',plural:'days',reading:'Start the challenge',intro:'One small step, one day at a time.'},
  consulting:{label:'Mentorship',unit:'Resource',plural:'resources',reading:'Choose a time',intro:'Make space for your next breakthrough.'},
  coaching:{label:'Coaching session',unit:'Resource',plural:'resources',reading:'Choose a time',intro:'Your time to move forward.'},
  community:{label:'Community',unit:'Resource',plural:'resources',reading:'Join your community',intro:'You belong in the conversation.'},
  custom:{label:'Digital product',unit:'Section',plural:'sections',reading:'Explore your product',intro:'Everything you need to get started.'},
 };
 const info=labels[type]||labels.custom;
 return {...info,type,family,...(type==='custom'?family==='course'?{unit:'Lesson',plural:'lessons',reading:'Start learning'}:family==='service'?{reading:'Choose a time'}:family==='community'?{reading:'Join your community'}:family==='templates'?{reading:'Get your files'}:{}:{})};
}
export function buyerFileSize(size?:number){if(!size||size<0)return '';return size>=1048576?`${(size/1048576).toFixed(1)} MB`:`${Math.max(1,Math.ceil(size/1024))} KB`;}
export function buyerFileType(name:string){const ext=name.split('.').at(-1)?.toUpperCase();return ext&&ext.length<=8?ext:'FILE';}
