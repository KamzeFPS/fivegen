/** Preferences contain product IDs only; they never grant access to a product. */
export function visibleProductPins(input:unknown,availableIds:string[]):string[]{
 const allowed=new Set(availableIds);
 return Array.isArray(input)?[...new Set(input.filter((id):id is string=>typeof id==='string'&&allowed.has(id)))].slice(0,20):[];
}
export function searchProductNavigation<T extends {id:string;title:string;format:string;archivedAt?:number|null}>(products:T[],query:string,pins:string[]=[]):T[]{
 const term=query.trim().toLocaleLowerCase();
 return products.filter(product=>!product.archivedAt&&(!term||`${product.title} ${product.format}`.toLocaleLowerCase().includes(term))).sort((a,b)=>Number(pins.includes(b.id))-Number(pins.includes(a.id))||a.title.localeCompare(b.title));
}
