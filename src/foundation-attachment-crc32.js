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
import {assertEbmlMasterCrc32} from './ebml-crc32-bounded.js';

const CRC_ID=0xbf;
const ATTACHMENTS_ID=0x1941a469,ATTACHED_FILE_ID=0x61a7;
const MAX_SINGLE_PROTECTED_BYTES=4*1024*1024;
const MAX_TOTAL_PROTECTED_BYTES=16*1024*1024;
const asId=node=>Number(BigInt(node.id));

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
        // Reuse Softmux's existing RFC-8794 bounded CRC verifier rather
        // than introducing a second CRC algorithm in the Foundation path.
        try {
          await assertEbmlMasterCrc32(file,{
            masterDataStart:Number(parentDataStart),
            masterEnd:Number(parentEnd),
            crcStart:Number(crcStart),
            crcEnd:Number(crcEnd),
            crcDataStart:Number(crcEnd-4n),
          });
        } catch(error){
          if(error?.message==='EBML_CRC32_VALUE_MISMATCH')
            throw Error('FOUNDATION_CRC32_MISMATCH');
          throw Error('FOUNDATION_CRC32_SCOPE_INVALID');
        }
        bytesRead+=Number(covered);
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
