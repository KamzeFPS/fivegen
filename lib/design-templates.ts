import type {DesignDocument,DesignElement,DesignPage} from './design-document';

/** Original, editable starting points. No external artwork or flattened previews. */
export const designTemplates=[
  {id:'wedding-garden',name:'A garden celebration',description:'An intimate wedding invitation with hand-drawn botanical details.',kind:'invitation',pageCount:1},
  {id:'birthday-confetti',name:'A little more magic',description:'A colourful birthday invitation with playful, editable shapes.',kind:'invitation',pageCount:1},
  {id:'woodland-colouring',name:'Woodland wandering',description:'Three original pages of foxes, mushrooms and forest treasures.',kind:'colouring-book',pageCount:3},
  {id:'undersea-colouring',name:'Under the blue',description:'Two original underwater scenes with fish, shells and coral.',kind:'colouring-book',pageCount:2},
  {id:'botanical-colouring',name:'The quiet garden',description:'Two floral colouring pages made from individual vector outlines.',kind:'colouring-book',pageCount:2},
  {id:'event-poster',name:'Make something good',description:'A bold, warm poster for a creative workshop or community event.',kind:'poster',pageCount:1},
  {id:'reflection-worksheet',name:'A little space to think',description:'A printable reflection worksheet with generous writing space.',kind:'worksheet',pageCount:1},
  {id:'social-launch',name:'Something new is here',description:'A square announcement with expressive typography and graphic shapes.',kind:'social',pageCount:1},
  {id:'blank-a4',name:'A blank page',description:'A clean A4 canvas for your own idea.',kind:'blank',pageCount:1},
] as const;
export type DesignTemplateId=typeof designTemplates[number]['id'];

const id=()=>globalThis.crypto.randomUUID();
const base=(x:number,y:number,width:number,height:number)=>({id:id(),x,y,width,height,rotation:0,opacity:1,locked:false});
const text=(value:string,x:number,y:number,width:number,height:number,fontSize:number,fill='#262922',fontFamily:'sans'|'serif'|'mono'='sans',align:'left'|'center'|'right'='left',bold=false):DesignElement=>({...base(x,y,width,height),type:'text',text:value,fontFamily,fontSize,fontWeight:bold?'bold':'normal',align,fill});
const rect=(x:number,y:number,width:number,height:number,fill:string,stroke='none',strokeWidth=0,radius=0):DesignElement=>({...base(x,y,width,height),type:'rect',fill,stroke,strokeWidth,radius});
const ellipse=(x:number,y:number,width:number,height:number,fill='none',stroke='#252925',strokeWidth=2):DesignElement=>({...base(x,y,width,height),type:'ellipse',fill,stroke,strokeWidth});
const path=(d:string,x:number,y:number,width:number,height:number,stroke='#252925',strokeWidth=2.4,fill='none'):DesignElement=>({...base(x,y,width,height),type:'path',d,viewBoxWidth:width,viewBoxHeight:height,fill,stroke,strokeWidth});
const rotate=(element:DesignElement,rotation:number):DesignElement=>({...element,rotation});
const page=(name:string,elements:DesignElement[],background='#ffffff',width=794,height=1123):DesignPage=>({id:id(),name,width,height,background,elements});
const line=(x:number,y:number,width:number,stroke='#c3c4b8',strokeWidth=1.2)=>path(`M 0 0 L ${width} 0`,x,y,width,1,stroke,strokeWidth);
const leaf=(x:number,y:number,width=50,height=90,rotation=0,stroke='#6d7a56',fill='none')=>rotate(path(`M ${width/2} ${height} C ${-width*.25} ${height*.48} 0 ${height*.08} ${width/2} 0 C ${width} ${height*.12} ${width*1.2} ${height*.5} ${width/2} ${height} M ${width/2} ${height} L ${width/2} ${height*.16}`,x,y,width,height,stroke,1.8,fill),rotation);
const stem=(x:number,y:number,height:number,rotation=0,stroke='#6d7a56')=>rotate(path(`M 25 ${height} Q 3 ${height*.5} 25 0`,x,y,50,height,stroke,1.8),rotation);
function branch(x:number,y:number,rotation=0,ink='#718060'){
  return [rotate(path('M 55 240 Q 17 140 46 0 M 28 102 Q 0 89 4 47 Q 40 49 28 102 M 31 151 Q 72 132 68 96 Q 30 100 31 151 M 45 210 Q 3 196 4 158 Q 43 160 45 210 M 33 60 Q 72 49 66 13 Q 33 18 33 60',x,y,75,240,ink,1.8),rotation)];
}
function flower(x:number,y:number,size:number,ink='#252925',fill='none'){
  const center=size/2,r=size*.13,petals:DesignElement[]=[];
  for(let i=0;i<8;i++)petals.push(rotate(ellipse(x+center-size*.12,y+size*.01,size*.24,size*.44,fill,ink,2),i*45));
  // Every petal has its own editable bounds and rotates around the flower center.
  const placed=petals.map((petal,i)=>{const angle=i*Math.PI/4,cx=x+center+Math.sin(angle)*size*.24,cy=y+center-Math.cos(angle)*size*.24;return {...petal,x:cx-size*.12,y:cy-size*.22};});
  return [...placed,ellipse(x+center-r,y+center-r,r*2,r*2,fill,ink,2)];
}
function mushroom(x:number,y:number,width:number,height:number){
  return [path(`M ${width*.13} ${height*.54} C ${-width*.03} ${height*.54} 0 ${height*.05} ${width*.46} 0 C ${width*.85} ${-height*.04} ${width*1.05} ${height*.43} ${width*.9} ${height*.54} Z`,x,y,width,height,'#252925',2.4),path(`M ${width*.4} ${height*.54} L ${width*.34} ${height*.94} Q ${width*.5} ${height*1.05} ${width*.66} ${height*.94} L ${width*.6} ${height*.54}`,x,y,width,height,'#252925',2.4),ellipse(x+width*.25,y+height*.2,width*.12,height*.1),ellipse(x+width*.57,y+height*.14,width*.16,height*.13),ellipse(x+width*.65,y+height*.35,width*.1,height*.08)];
}
function fox(x:number,y:number,width:number,height:number){
  return [path(`M ${width*.17} ${height*.35} L 0 0 L ${width*.36} ${height*.15} Q ${width*.5} ${height*.09} ${width*.64} ${height*.15} L ${width} 0 L ${width*.83} ${height*.35} Q ${width*.85} ${height*.68} ${width*.5} ${height*.9} Q ${width*.14} ${height*.68} ${width*.17} ${height*.35} Z M ${width*.17} ${height*.35} Q ${width*.4} ${height*.31} ${width*.5} ${height*.69} Q ${width*.61} ${height*.31} ${width*.83} ${height*.35}`,x,y,width,height,'#252925',2.8),ellipse(x+width*.31,y+height*.4,width*.035,height*.035,'#252925'),ellipse(x+width*.65,y+height*.4,width*.035,height*.035,'#252925'),path(`M 0 0 Q ${width*.07} ${height*.07} ${width*.14} 0 Z`,x+width*.43,y+height*.64,width*.14,height*.07,'#252925',2,'#252925')];
}
function fish(x:number,y:number,width:number,height:number,rotation=0){
  return [rotate(path(`M ${width*.75} ${height*.5} Q ${width*.43} 0 0 ${height*.5} Q ${width*.43} ${height} ${width*.75} ${height*.5} L ${width} ${height*.1} L ${width} ${height*.9} Z M ${width*.44} ${height*.2} Q ${width*.31} ${height*.5} ${width*.44} ${height*.8}`,x,y,width,height,'#252925',2.5),rotation),rotate(ellipse(x+width*.19,y+height*.44,width*.035,width*.035,'#252925'),rotation)];
}
const colouringHeader=(title:string,subtitle:string)=>[text(title,60,52,674,52,34,'#252925','serif','center'),text(subtitle,60,111,674,26,12,'#555950','sans','center'),line(290,153,214,'#252925',1.2)];
const colouringFooter=(number:number)=>[text('A small pause. A world of colour.',60,1064,620,22,11,'#686b62','sans','center'),text(String(number).padStart(2,'0'),706,1060,28,24,12,'#686b62','sans','right')];

function wedding(){return [page('Invitation',[
  rect(24,24,552,792,'none','#b9b99d',1),rect(37,37,526,766,'none','#d8d1b9',.6),
  ...branch(47,70,-13),...branch(480,510,167),leaf(480,63,26,62,48),leaf(72,688,24,62,220),
  text('TOGETHER WITH THEIR FAMILIES',90,181,420,24,11,'#697253','sans','center'),
  text('Amelia',80,240,440,76,62,'#3f513d','serif','center'),text('&',80,319,440,48,34,'#b28b68','serif','center'),text('Oliver',80,373,440,80,62,'#3f513d','serif','center'),
  text('invite you to celebrate their wedding',90,477,420,28,14,'#6b705c','serif','center'),line(249,538,102,'#a4aa8b',1),
  text('SATURDAY · 12 JUNE 2027',70,566,460,28,16,'#3f513d','sans','center'),text('AT FOUR IN THE AFTERNOON',70,608,460,24,11,'#697253','sans','center'),
  text('The Glasshouse Garden',70,658,460,32,22,'#3f513d','serif','center'),text('45 Willow Lane · Your City',70,699,460,24,12,'#697253','sans','center'),text('Dinner, dancing & a little garden magic',70,750,460,24,12,'#697253','serif','center'),
 ],'#f8f5e9',600,840)];}
function birthday(){
  const confetti:DesignElement[]=[],positions=[[32,35],[550,120],[46,296],[548,336],[40,548],[550,590],[52,756],[550,780],[140,70],[380,74],[450,100],[78,110],[548,460],[36,672],[560,690]];
  for(let i=0;i<positions.length;i++){const [x,y]=positions[i],colors=['#e97054','#e6ba43','#8376af','#5b8a80'];confetti.push(rotate(rect(x,y,10,24,colors[i%4], 'none',0,4),(i*37)%180));}
  return [page('Birthday invitation',[
    ...confetti,ellipse(97,145,406,406,'#efb858','none',0),ellipse(125,173,350,350,'#f4c978','none',0),
    text('A LITTLE MORE',95,213,410,30,16,'#6d4346','sans','center',true),text('magic',58,255,484,110,86,'#5a426b','serif','center'),text('is turning seven!',85,375,430,39,25,'#6d4346','serif','center'),
    text('MILA’S BIRTHDAY',70,578,460,40,26,'#5a426b','sans','center',true),text('SATURDAY, 17 JULY · 2–5 PM',70,639,460,26,15,'#6d536c','sans','center'),text('Sunshine Park · 12 Meadow Street',70,684,460,26,14,'#6d536c','sans','center'),text('Bring your favourite party spirit.',70,747,460,25,13,'#6d536c','serif','center'),
  ],'#eee8f2',600,840)];
}
function woodland(){
  const first:DesignElement[]=[...colouringHeader('Woodland wandering','A forest friend, a few tiny treasures, and room for your imagination.'),...fox(245,285,300,250),...mushroom(92,699,147,180),...mushroom(563,713,132,156),leaf(106,407,67,143,-20,'#252925'),leaf(622,404,64,141,23,'#252925'),stem(110,492,170,0,'#252925'),stem(611,492,170,0,'#252925'),path('M 0 56 Q 100 0 220 40 Q 350 75 464 24 Q 552 0 614 46',90,913,614,66,'#252925',2.2),...colouringFooter(1)];
  for(let i=0;i<8;i++)first.push(ellipse(148+(i*79)%490,585+(i*47)%120,14+(i%3)*5,14+(i%3)*5));
  const second:DesignElement[]=[...colouringHeader('Tiny forest treasures','Make every mushroom a different colour.'),...mushroom(102,249,235,305),...mushroom(438,345,228,300),...mushroom(221,662,300,260),leaf(83,628,72,158,-20,'#252925'),leaf(574,783,71,151,36,'#252925'),...colouringFooter(2)];
  const third:DesignElement[]=[...colouringHeader('A leaf for every season','Collect your favourite colours in this woodland pattern.'),...colouringFooter(3)];
  for(let row=0;row<3;row++)for(let col=0;col<3;col++)third.push(leaf(105+col*225,225+row*250,126,190,(row+col)%2?26:-24,'#252925'));
  return [page('The woodland fox',first),page('Mushroom meadow',second),page('A study of leaves',third)];
}
function undersea(){
  const first:DesignElement[]=[...colouringHeader('Under the blue','Let the quiet ocean become a whole world of colour.'),...fish(130,284,220,138),...fish(449,506,204,128),...fish(153,681,168,110),path('M 0 20 Q 89 0 173 21 Q 260 44 350 15 Q 435 0 528 24 Q 589 40 654 15',70,962,654,45,'#252925',2.4),...colouringFooter(1)];
  for(let i=0;i<8;i++)first.push(ellipse(105+(i*89)%580,220+(i*137)%620,17+(i%3)*9,17+(i%3)*9));
  for(let i=0;i<4;i++)first.push(path('M 27 174 Q 0 126 28 91 Q 60 52 24 0 M 28 122 Q 67 106 66 71 M 22 81 Q 0 72 0 43',72+i*190,795+(i%2)*18,70,174,'#252925',2.4));
  const second:DesignElement[]=[...colouringHeader('Ocean keepsakes','Shells, bubbles and small things found by the sea.'),...colouringFooter(2)];
  const shell=(x:number,y:number,w:number,h:number)=>path(`M ${w*.5} ${h} C 0 ${h*.75} 0 ${h*.1} ${w*.16} ${h*.15} Q ${w*.24} 0 ${w*.34} ${h*.1} Q ${w*.5} ${-h*.06} ${w*.66} ${h*.1} Q ${w*.77} 0 ${w*.85} ${h*.15} C ${w} ${h*.1} ${w} ${h*.75} ${w*.5} ${h} Z M ${w*.5} ${h} L ${w*.16} ${h*.15} M ${w*.5} ${h} L ${w*.34} ${h*.1} M ${w*.5} ${h} L ${w*.66} ${h*.1} M ${w*.5} ${h} L ${w*.85} ${h*.15}`,x,y,w,h,'#252925',2.5);
  for(let i=0;i<6;i++)second.push(rotate(shell(108+(i%2)*330,235+Math.floor(i/2)*260,230,180),i%2?12:-12));
  for(let i=0;i<6;i++)second.push(ellipse(345+(i%2)*50,285+i*105,18,18));
  return [page('The quiet ocean',first),page('A shell collection',second)];
}
function botanical(){
  const first:DesignElement[]=[...colouringHeader('The quiet garden','Slow down. Notice the petals. Make something beautiful.'),...colouringFooter(1)];
  for(const [x,y,size] of [[135,243,200],[450,297,183],[275,525,240],[90,795,157],[520,786,155]])first.push(...flower(x,y,size));
  first.push(leaf(113,565,73,148,-32,'#252925'),leaf(596,555,68,144,31,'#252925'),leaf(335,840,75,151,11,'#252925'));
  const second:DesignElement[]=[...colouringHeader('One beautiful stem','A little room to breathe, and a little room to bloom.'),...colouringFooter(2),path('M 120 700 Q 93 415 121 0',276,277,240,700,'#252925',2.8),...flower(277,220,240)];
  for(let i=0;i<6;i++)second.push(leaf(i%2?398:244,437+i*73,100,156,i%2?47:-43,'#252925'));
  return [page('Garden medley',first),page('One beautiful stem',second)];
}
function poster(){return [page('Workshop poster',[
  rect(0,0,794,20,'#22271f'),text('THE NEIGHBOURHOOD STUDIO',54,62,686,26,13,'#273126','sans','left',true),text('MAKE\nSOMETHING\nGOOD.',48,169,700,330,91,'#273126','sans','left',true),
  ellipse(510,548,210,210,'#e8653d','none',0),rotate(rect(591,583,48,140,'#f6edcf','none',0,23),43),rotate(rect(591,583,48,140,'#f6edcf','none',0,23),-43),
  text('A hands-on afternoon\nfor curious people.',54,568,400,100,30,'#273126','serif'),line(54,788,686,'#a1a386',1),text('SATURDAY 24 JULY',54,826,420,32,20,'#273126','sans','left',true),text('14:00–17:00  /  18 GREEN STREET',54,875,620,28,14,'#46513d','sans'),text('Come as you are. Leave with something you made.',54,977,670,46,17,'#46513d','serif'),text('RESERVE YOUR PLACE · YOURWEBSITE.COM',54,1050,686,24,11,'#46513d','sans','left',true),
 ],'#f1edda')];}
function worksheet(){
  const elements:DesignElement[]=[rect(0,0,794,15,'#87947a'),text('A LITTLE SPACE',57,62,680,30,13,'#78846d','sans','left',true),text('to think.',53,102,680,100,70,'#354731','serif'),text('A gentle check-in for a clearer, kinder week.',57,222,680,32,17,'#747a68','sans'),text('NAME',57,294,51,20,10,'#747a68','sans','left',true),line(118,313,280),text('DATE',460,294,45,20,10,'#747a68','sans','left',true),line(518,313,219),
    text('01',57,370,48,35,23,'#a1ad8c','serif'),text('What feels good right now?',118,370,620,32,23,'#354731','serif'),text('02',57,568,48,35,23,'#a1ad8c','serif'),text('What could use a little more care?',118,568,620,32,23,'#354731','serif'),rect(57,802,680,194,'#e8ecdf','none',0,12),text('ONE SMALL THING',82,826,620,24,11,'#78846d','sans','left',true),text('This week, I will make space for…',82,867,620,34,24,'#354731','serif'),line(82,952,630,'#b3bda5'),text('Small steps still move you forward.',57,1055,680,25,13,'#747a68','serif','center')];
  for(const y of [438,484,530,636,682,728])elements.push(line(118,y,620));
  return [page('Weekly reflection',elements,'#fbfaf4')];
}
function social(){return [page('Launch announcement',[
  ellipse(588,-144,650,650,'#c5d0a1','none',0),ellipse(-168,662,550,550,'#ed9c7a','none',0),rect(62,65,174,43,'#272b29','none',0,21),text('FRESHLY MADE',80,78,140,22,12,'#f8f2e8','sans','center',true),
  text('Something\nnew is\nhere.',75,222,920,456,126,'#272b29','serif'),rotate(path('M 95 0 L 115 70 L 190 95 L 115 117 L 95 190 L 74 117 L 0 95 L 74 70 Z',794,702,190,190,'#272b29',2,'#eab94c'),12),
  text('Made with care. Ready for you.',83,780,740,48,27,'#4d5446','sans'),line(83,912,914,'#a3a68f'),text('EXPLORE THE COLLECTION',83,956,740,36,20,'#272b29','sans','left',true),text('YOURWEBSITE.COM',83,1006,740,26,14,'#4d5446','sans'),
 ],'#eee9db',1080,1080)];}

/** Returns a fresh document: edits and IDs are never shared between projects. */
export function createDesignFromTemplate(templateId:string):DesignDocument{
  const selected=designTemplates.find(template=>template.id===templateId);
  if(!selected)throw new Error('Choose an available design template.');
  const builders:Record<DesignTemplateId,()=>DesignPage[]>={'wedding-garden':wedding,'birthday-confetti':birthday,'woodland-colouring':woodland,'undersea-colouring':undersea,'botanical-colouring':botanical,'event-poster':poster,'reflection-worksheet':worksheet,'social-launch':social,'blank-a4':()=>[page('Page 1',[])]};
  return {schemaVersion:1,title:selected.name,kind:selected.kind,pages:builders[selected.id]()};
}

export const getDesignTemplate=(templateId:string)=>designTemplates.find(template=>template.id===templateId);
