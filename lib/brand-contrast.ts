function luminance(hex:string){const channels=hex.slice(1).match(/.{2}/g)?.map(value=>parseInt(value,16)/255)||[0,0,0];return channels.map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);}
export function contrastRatio(first:string,second:string){const a=luminance(first),b=luminance(second);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
/** Matches the page renderer's present button ink, so the preview check is honest. */
export function brandButtonContrast(accent:string){const rgb=accent.slice(1).match(/.{2}/g)?.map(value=>parseInt(value,16))||[255,128,74],ink=rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>145?'#17181b':'#ffffff',ratio=contrastRatio(accent,ink);return {ink,ratio,passes:ratio>=4.5};}
