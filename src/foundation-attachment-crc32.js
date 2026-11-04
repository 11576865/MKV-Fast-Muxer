/**
 * Narrow CRC-32 integrity gate for Foundation-backed attachment inventory.
 *
 * EBML RFC 8794: a CRC-32 is the first child of the protected Master,
 * covers that Master's remaining serialized payload and is little-endian.
 * All element boundaries come from libMatroska2's validated typed tree;
 * this is NOT another JavaScript EBML header decoder.
 *
 * Only Attachments/AttachedFile CRCs are checked. CRCs on other Matroska
 * masters are NOT certified by attachment inventory inspection.
 */
const CRC_ID=0xbf;
const ATTACHMENTS_ID=0x1941a469,ATTACHED_FILE_ID=0x61a7;
const MAX_SINGLE_PROTECTED_BYTES=4*1024*1024;
const MAX_TOTAL_PROTECTED_BYTES=16*1024*1024;
const CHUNK=128*1024;
const asId=node=>Number(BigInt(node.id));

function crc32Update(previous,bytes){
  let value=previous>>>0;
  for(const octet of bytes){
    value^=octet;
    for(let k=0;k<8;k++)
      value=(value&1)?((value>>>1)^0xedb88320):(value>>>1);
  }
  return value>>>0;
}

export async function verifyFoundationAttachmentCrc32({file,observation}={}){
  if(!file||!Number.isSafeInteger(file.size)||
     typeof file.slice!=='function'||
     observation?.state!=='inspected'||
     !Array.isArray(observation.nodes))
    throw Error('FOUNDATION_CRC_SOURCE_OR_TREE_INVALID');
  const parents=[];
  const firstChildren=new Set();
  let checked=0,bytesRead=0;
  for(const node of observation.nodes){
    while(parents.length>node.depth)parents.pop();
    if(parents.length!==node.depth)
      throw Error('FOUNDATION_CRC_PARENT_DEPTH_INVALID');
    const parent=parents.at(-1)||null;
    const id=asId(node);
    if(parent){
      const parentId=asId(parent);
      const scope=(parentId===ATTACHMENTS_ID||
        parentId===ATTACHED_FILE_ID);
      const first=!firstChildren.has(parent);
      firstChildren.add(parent);
      if(scope && id===CRC_ID){
        if(!first||node.master||checked>=1024)
          throw Error('FOUNDATION_CRC_MISPLACED_OR_REPEATED');
        const parentEnd=BigInt(parent.endOffset);
        const parentDataStart=parentEnd-BigInt(parent.dataBytes);
        const crcStart=BigInt(node.offset),crcEnd=BigInt(node.endOffset);
        if(crcStart!==parentDataStart||
           BigInt(node.dataBytes)!==4n ||
           crcEnd-crcStart<6n||
           crcEnd>parentEnd ||
           parentEnd>BigInt(file.size))
          throw Error('FOUNDATION_CRC_RANGE_INVALID');
        const covered=parentEnd-crcEnd;
        if(covered>BigInt(MAX_SINGLE_PROTECTED_BYTES)||
           covered+BigInt(bytesRead)>BigInt(MAX_TOTAL_PROTECTED_BYTES))
          throw Error('FOUNDATION_CRC_RESOURCE_LIMIT');
        const actualCRCBytes=new Uint8Array(
          await file.slice(Number(crcEnd-4n),Number(crcEnd)).arrayBuffer());
        if(actualCRCBytes.length!==4)
          throw Error('FOUNDATION_CRC_STORED_VALUE_TRUNCATED');
        const expected=(actualCRCBytes[0]|
          (actualCRCBytes[1]<<8)|
          (actualCRCBytes[2]<<16)|
          (actualCRCBytes[3]<<24))>>>0;
        let state=0xffffffff;
        for(let at=Number(crcEnd);at<Number(parentEnd);){
          const end=Math.min(Number(parentEnd),at+CHUNK);
          const chunk=new Uint8Array(
            await file.slice(at,end).arrayBuffer());
          if(chunk.byteLength!==end-at)
            throw Error('FOUNDATION_CRC_PROTECTED_DATA_TRUNCATED');
          state=crc32Update(state,chunk);
          bytesRead+=chunk.byteLength;
          at=end;
        }
        if(((state^0xffffffff)>>>0)!==expected)
          throw Error('FOUNDATION_CRC32_MISMATCH');
        checked++;
      }
    }
    if(node.master)parents.push(node);
  }
  return Object.freeze({
    schema:'foundation-attachment-crc-audit-v1',
    checked,bytesRead,
    coverage:'attachments-and-attached-file-only',
    fullContainerCRCVerified:false,
    writerAuthorization:false,
  });
}
