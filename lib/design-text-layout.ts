import type {DesignElement} from './design-document';

export type DesignTextElement=Extract<DesignElement,{type:'text'}>;
export const designFontStacks={sans:'"Noto Sans", Arial, sans-serif',serif:'"Noto Serif", Georgia, serif',mono:'"Noto Sans", "Courier New", monospace'} as const;
export const designTextLineHeight=1.2;
export const designTextBaseline=.84;

/** A deterministic browser/server measure keeps saved text wrapping consistent. */
export function measureDesignText(value:string,fontSize:number,family:DesignTextElement['fontFamily']='sans',weight:DesignTextElement['fontWeight']='normal'){
  if(family==='mono')return [...value].length*fontSize*.62;
  let units=0;
  for(const character of value){
    if(/[\s]/.test(character))units+=.28;
    else if(/[ilIjtfr.,:;!'|]/.test(character))units+=.32;
    else if(/[mwMW@%&]/.test(character))units+=.88;
    else if(/[A-Z0-9]/.test(character))units+=.65;
    else if((character.codePointAt(0)||0)>0x2e7f)units+=1;
    else units+=.56;
  }
  return units*fontSize*(family==='serif'?1.02:1)*(weight==='bold'?1.035:1);
}

/** Explicit newlines are preserved; long words wrap without discarding text. */
export function layoutDesignText(element:DesignTextElement){
  const lines:string[]=[];
  const measure=(value:string)=>measureDesignText(value,element.fontSize,element.fontFamily,element.fontWeight);
  for(const paragraph of element.text.replace(/\r\n?/g,'\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').split('\n')){
    let line='';
    for(const word of paragraph.split(/\s+/).filter(Boolean)){
      const candidate=line?line+' '+word:word;
      if(measure(candidate)<=element.width){line=candidate;continue;}
      if(line){lines.push(line);line='';}
      for(const character of word){if(line&&measure(line+character)>element.width){lines.push(line);line='';}line+=character;}
    }
    lines.push(line);
  }
  return lines.map((text,index)=>({text,x:element.align==='center'?element.width/2:element.align==='right'?element.width:0,y:element.fontSize*designTextBaseline+index*element.fontSize*designTextLineHeight}));
}

export function designElementTransform(element:DesignElement){return `translate(${element.x} ${element.y}) rotate(${element.rotation} ${element.width/2} ${element.height/2})`;}
