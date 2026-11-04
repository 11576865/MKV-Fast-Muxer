/**
 * An actual attachment-inventory backend using the Foundation libMatroska2
 * C/WASM element tree. No JS EBML element-header decoding is performed here.
 *
 * The official parser supplies element identity, parent depth, byte spans and
 * exact FileUID. Only bounded UTF-8 FileName/MIME/description bytes are read
 * with Blob.slice; FileData payload bytes are never read or copied.
 *
 * This is for explicit read-only inspection, not a write preflight.
 */
const utf8 = new TextDecoder('utf-8', {fatal:true});
const MAX_TEXT_BYTES=4096,MAX_ATTACHMENTS=1024;
const FIELD_IDS=Object.freeze({
  FileName:0x466e,FileMediaType:0x4660,FileDescription:0x467e,
  FileData:0x465c,FileUID:0x46ae,
});
const STRUCTURAL_IDS=Object.freeze({
  EBMLHead:0x1a45dfa3,DocType:0x4282,Segment:0x18538067,
  Attachments:0x1941a469,AttachedFile:0x61a7,
});
const numericId=node=>Number(BigInt(node.id));
const asNumber=(value,file)=>{
  const n=BigInt(value);
  if(n<0n||n>BigInt(file.size)||n>BigInt(Number.MAX_SAFE_INTEGER))
    throw Error('FOUNDATION_INVENTORY_RANGE_UNADDRESSABLE');
  return Number(n);
};
function payload(node,file,maxSize){
  const end=asNumber(node.endOffset,file);
  const length=asNumber(node.dataBytes,file);
  const start=end-length;
  const headerAt=asNumber(node.offset,file);
  if(start<=headerAt||start-headerAt>12||
     (maxSize!==undefined && length>maxSize))
    throw Error('FOUNDATION_INVENTORY_ELEMENT_SPAN_INVALID');
  return {start,length};
}
async function textField(file,node){
  const {start,length}=payload(node,file,MAX_TEXT_BYTES);
  try {
    return utf8.decode(await file.slice(start,start+length).arrayBuffer())
      .replace(/\u0000+$/,'');
  } catch {
    throw Error('FOUNDATION_INVENTORY_TEXT_NOT_UTF8');
  }
}

export async function buildFoundationAttachmentInventory({
  file,source,observation,
}={}){
  if(!file||typeof file.slice!=='function'||!source?.id||
     observation?.source!==source||
     observation.state!=='inspected'||
     !Array.isArray(observation.nodes)||
     observation.claims?.writerAuthorization!==false)
    throw Error('FOUNDATION_INVENTORY_TRUST_BOUNDARY_INVALID');

  const nodes=observation.nodes;
  const stack=[];
  const groups=[];
  const attachmentMasters=new Set();
  const topLevel=new Map();
  let ebml=null,segment=null,docTypeNode=null;
  let attachmentElements=0,hasTracks=false,hasCluster=false;
  for(const node of nodes){
    while(stack.length>node.depth)stack.pop();
    if(stack.length!==node.depth)
      throw Error('FOUNDATION_INVENTORY_PARENT_DEPTH_INVALID');
    const parent=stack.at(-1)||null;
    const id=numericId(node);

    if(node.depth===0 && id===STRUCTURAL_IDS.EBMLHead){
      if(ebml)throw Error('FOUNDATION_INVENTORY_DUPLICATE_EBML');
      ebml=node;
    }
    if(node.depth===0 && id===STRUCTURAL_IDS.Segment){
      if(segment)throw Error('FOUNDATION_INVENTORY_DUPLICATE_SEGMENT');
      segment=node;
    }
    if(parent===ebml && id===STRUCTURAL_IDS.DocType){
      if(node.name!=='EBMLDocType'||node.master)
        throw Error('FOUNDATION_INVENTORY_DOCTYPE_CLASS_INVALID');
      if(docTypeNode)throw Error('FOUNDATION_INVENTORY_DUPLICATE_DOCTYPE');
      docTypeNode=node;
    }
    if(segment && parent===segment){
      topLevel.set(id,(topLevel.get(id)||0)+1);
      if(id===0x1654ae6b)hasTracks=true;
      if(id===0x1f43b675)hasCluster=true;
      if(id===STRUCTURAL_IDS.Attachments){
        if(node.name!=='Attachments'||!node.master)
          throw Error('FOUNDATION_INVENTORY_ATTACHMENT_MASTER_INVALID');
        attachmentElements++;
        attachmentMasters.add(node);
      }
    }
    if(attachmentMasters.has(parent) &&
       id===STRUCTURAL_IDS.AttachedFile){
      if(node.name!=='AttachedFile'||!node.master)
        throw Error('FOUNDATION_INVENTORY_ATTACHED_FILE_CLASS_INVALID');
      if(groups.length>=MAX_ATTACHMENTS)
        throw Error('FOUNDATION_INVENTORY_ATTACHMENT_BUDGET');
      groups.push({element:node,fields:new Map()});
    }
    if(parent && numericId(parent)===STRUCTURAL_IDS.AttachedFile){
      const group=groups.find(group=>group.element===parent);
      if(!group)throw Error('FOUNDATION_INVENTORY_ATTACHMENT_PARENT_INVALID');
      const field=Object.entries(FIELD_IDS).find(([,value])=>value===id)?.[0];
      if(field){
        if(node.name!==field||node.master)
          throw Error('FOUNDATION_INVENTORY_FIELD_ID_CLASS_MISMATCH');
        if(group.fields.has(field))
          throw Error('FOUNDATION_INVENTORY_DUPLICATE_'+field.toUpperCase());
        group.fields.set(field,node);
      }
    }
    if(node.master)stack.push(node);
  }

  if(!ebml||!segment||!docTypeNode)
    throw Error('FOUNDATION_INVENTORY_REQUIRED_STRUCTURE_MISSING');
  const docType=await textField(file,docTypeNode);
  if(docType!=='matroska')
    throw Error('FOUNDATION_INVENTORY_DOCTYPE_NOT_MATROSKA');

  const attachments=[];
  for(const group of groups){
    const fields=group.fields;
    for(const required of ['FileName','FileMediaType','FileUID','FileData'])
      if(!fields.has(required))
        throw Error('FOUNDATION_INVENTORY_REQUIRED_FIELD_'+required);
    const fileUid=fields.get('FileUID').uintValue;
    if(typeof fileUid!=='string'||!/^(0|[1-9][0-9]*)$/.test(fileUid))
      throw Error('FOUNDATION_INVENTORY_EXACT_UID_MISSING');
    const filename=await textField(file,fields.get('FileName'));
    const mimeType=await textField(file,fields.get('FileMediaType'));
    const description=fields.has('FileDescription')?
      await textField(file,fields.get('FileDescription')):'';
    if(!filename||!mimeType)
      throw Error('FOUNDATION_INVENTORY_EMPTY_REQUIRED_TEXT');
    const data=payload(fields.get('FileData'),file);
    const ordinal=attachments.length;
    attachments.push({
      id:'attachment:'+ordinal+':uid:'+fileUid,
      ordinal,filename,mimeType,description,fileUid,
      byteLength:data.length,
      dataRange:{offset:data.start,length:data.length},
      evidence:'foundation-libmatroska-read-only-observed',
      hash:null,targetTagRelations:'unverified',
    });
  }
  const segmentFinite=segment.finite===true;
  return {
    schema:'matroska-attachment-inventory-v0',
    state:'inspected',source,docType,
    structure:{
      hasTracksElement:hasTracks,hasClusterElement:hasCluster,
      attachmentElements,nonPlayingStructure:!hasTracks&&!hasCluster,
      segmentFiniteExact:segmentFinite &&
        BigInt(segment.endOffset)===BigInt(file.size),
      segmentSizeKnown:segmentFinite,
      topLevelCount:Array.from(topLevel.values()).reduce((a,b)=>a+b,0),
      topLevelElements:Array.from(topLevel,([id,count])=>({id,count}))
        .sort((a,b)=>a.id-b.id),
    },
    attachments,
    scanning:{
      headerCount:0,fileDataBytesRead:0,
      dataMode:'seek-only-no-filedata-read',
      structureBackend:'foundation-libmatroska-c-wasm',
      metaBytesRead:'bounded-text-only',
    },
    claims:{
      wholeEbmlPreservation:'unverified',
      readerCompatibility:'not-proven-by-this-inspector',
      playable:'not-tested',
    },
  };
}
