import {unzipSync} from 'fflate';

export class ProductDocumentError extends Error {
  constructor(message:string,public status=400){super(message);this.name='ProductDocumentError';}
}
export const documentLimits={input:20*1024*1024,expanded:64*1024*1024,entry:16*1024*1024,entries:1000,characters:540000,sections:30,sectionCharacters:18000};
const decoder=new TextDecoder('utf-8',{fatal:true});
const crcTable=Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
const crc=(bytes:Uint8Array)=>{let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0;};

/** Validate the central directory before allocating inflated file buffers. No
 * archive path is ever written to disk, and executable attachments are refused. */
export function readProductArchive(bytes:Uint8Array,kind:'zip'|'docx'|'epub'|'xlsx'='zip'){
  if(bytes.length>100*1024*1024||bytes.length<22)throw new ProductDocumentError('This archive is empty or too large.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let end=-1;
  for(let offset=bytes.length-22;offset>=Math.max(0,bytes.length-65557);offset--)if(view.getUint32(offset,true)===0x06054b50){end=offset;break;}
  if(end<0)throw new ProductDocumentError('This ZIP archive is incomplete or unsupported.');
  const count=view.getUint16(end+10,true),directorySize=view.getUint32(end+12,true),directoryOffset=view.getUint32(end+16,true);
  if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||count===65535||count>documentLimits.entries||directoryOffset+directorySize>end)throw new ProductDocumentError('Split, ZIP64, or unusually large archives are not supported.');
  const names=new Set<string>(),records=new Map<string,{size:number;checksum:number}>();let expanded=0,offset=directoryOffset;
  for(let entry=0;entry<count;entry++){
    if(offset+46>bytes.length||view.getUint32(offset,true)!==0x02014b50)throw new ProductDocumentError('This ZIP directory is damaged.');
    const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),compressed=view.getUint32(offset+20,true),size=view.getUint32(offset+24,true),nameLength=view.getUint16(offset+28,true),extraLength=view.getUint16(offset+30,true),commentLength=view.getUint16(offset+32,true),attributes=view.getUint32(offset+38,true),local=view.getUint32(offset+42,true);
    if(offset+46+nameLength+extraLength+commentLength>bytes.length)throw new ProductDocumentError('This ZIP directory is incomplete.');
    let name:string;try{name=decoder.decode(bytes.subarray(offset+46,offset+46+nameLength));}catch{throw new ProductDocumentError('Use an archive with UTF-8 filenames.');}
    if(!name||name.includes('\\')||name.startsWith('/')||name.includes('\0')||name.split('/').some(part=>part==='..'||part==='.')||/^[a-z]:/i.test(name)||names.has(name.toLowerCase()))throw new ProductDocumentError('The archive contains unsafe or duplicate paths.');
    names.add(name.toLowerCase());expanded+=size;
    records.set(name,{size,checksum:view.getUint32(offset+16,true)});
    if(flags&1||![0,8].includes(method)||((attributes>>>16)&0xf000)===0xa000)throw new ProductDocumentError('Encrypted files, links, and unsupported ZIP compression are not allowed.');
    if(size>documentLimits.entry||expanded>documentLimits.expanded||size>Math.max(1024*1024,compressed*200))throw new ProductDocumentError('The archive expands beyond the safe import limit. Split it into smaller files.');
    if(local+30>directoryOffset||view.getUint32(local,true)!==0x04034b50)throw new ProductDocumentError('The archive has an invalid local file record.');
    const localName=view.getUint16(local+26,true),localExtra=view.getUint16(local+28,true);
    if(local+30+localName+localExtra+compressed>directoryOffset)throw new ProductDocumentError('The archive file data is incomplete.');
    if(view.getUint16(local+8,true)!==method||view.getUint16(local+6,true)!==flags||decoder.decode(bytes.subarray(local+30,local+30+localName))!==name)throw new ProductDocumentError('The archive local paths or compression records do not match.');
    if(/\.(?:exe|dll|com|scr|msi|msp|bat|cmd|ps1|vbs|jar|lnk)$/i.test(name)||/(?:^|\/)(?:vbaProject\.bin|activeX|embeddings)(?:\/|$)/i.test(name))throw new ProductDocumentError('Executable or active document content is not supported.');
    offset+=46+nameLength+extraLength+commentLength;
  }
  let files:Record<string,Uint8Array>;try{files=unzipSync(bytes);}catch{throw new ProductDocumentError('The archive could not be decompressed.');}
  if(Object.keys(files).length>documentLimits.entries)throw new ProductDocumentError('The archive contains too many files.');
  for(const [name,content] of Object.entries(files)){
    const record=records.get(name);if(!names.has(name.toLowerCase())||!record||content.length!==record.size||crc(content)!==record.checksum||content.length>documentLimits.entry)throw new ProductDocumentError('The archive directory or integrity check does not match its contents.');
    if(['docx','xlsx'].includes(kind)&&name.endsWith('.rels')){
      const relations=new TextDecoder().decode(content);
      if(/TargetMode\s*=\s*['"]External['"]/i.test(relations))throw new ProductDocumentError('This DOCX links to external resources. Remove linked images or external relationships and save a self-contained DOCX before importing.');
    }
  }
  if(kind==='docx'&&!files['word/document.xml'])throw new ProductDocumentError('This file is not a valid DOCX document.');
  if(kind==='xlsx'&&!files['xl/workbook.xml'])throw new ProductDocumentError('This file is not a valid XLSX workbook.');
  if(kind==='epub'&&(!files['META-INF/container.xml']||new TextDecoder().decode(files.mimetype||new Uint8Array()).trim()!=='application/epub+zip'))throw new ProductDocumentError('This file is not a valid EPUB publication.');
  return files;
}
