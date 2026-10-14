/**
 * Bounded EBML CRC-32 verifier for an existing, fully bounded Master element.
 * CRC-32 payload is a 4-byte LITTLE-ENDIAN ISO-HDLC/IEEE CRC-32 of the entire
 * Master DATA excluding the CRC-32 child element (including its ID/size).
 * Does not make any claim about CRC coverage outside the supplied Master.
 */
const TABLE=new Uint32Array(256);
for(let i=0;i<256;i++){
 let x=i;
 for(let j=0;j<8;j++)x=(x&1)?(0xedb88320^(x>>>1)):(x>>>1);
 TABLE[i]=x>>>0;
}
export function crc32IEEE(bytes){
 let value=0xffffffff;
 for(const byte of bytes)value=(TABLE[(value^byte)&255]^(value>>>8))>>>0;
 return (value^0xffffffff)>>>0;
}
function shape(blob,masterDataStart,masterEnd,crcStart,crcEnd,crcDataStart){
 const ints=[masterDataStart,masterEnd,crcStart,crcEnd,crcDataStart];
 if(!blob?.slice||!Number.isSafeInteger(blob.size)||
   ints.some(x=>!Number.isSafeInteger(x))||
   masterDataStart<0||masterEnd>blob.size||masterDataStart>=masterEnd||
   crcStart<masterDataStart||crcEnd>masterEnd||crcStart>=crcEnd||
   crcDataStart<=crcStart||crcEnd-crcDataStart!==4)
   throw Error('EBML_CRC32_COVERAGE_OR_FIELD_INVALID');
}
/** Chunked to avoid allocating a second contiguous buffer for 60 MiB masters. */
export async function calculateEbmlMasterCrc32(blob,{
 masterDataStart,masterEnd,crcStart,crcEnd,crcDataStart,
}={}){
 shape(blob,masterDataStart,masterEnd,crcStart,crcEnd,crcDataStart);
 let value=0xffffffff;
 for(const [begin,end] of [[masterDataStart,crcStart],[crcEnd,masterEnd]]){
  for(let at=begin;at<end;at+=256*1024){
   const data=new Uint8Array(await blob.slice(at,Math.min(end,at+256*1024)).arrayBuffer());
   for(const byte of data)value=(TABLE[(value^byte)&255]^(value>>>8))>>>0;
  }
 }
 return (value^0xffffffff)>>>0;
}
export function ebmlCrc32LE(value){
 if(!Number.isInteger(value)||value<0||value>0xffffffff)
  throw Error('EBML_CRC32_VALUE_INVALID');
 return Uint8Array.of(value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255);
}
export async function assertEbmlMasterCrc32(blob,scope){
 const computed=await calculateEbmlMasterCrc32(blob,scope);
 const bytes=new Uint8Array(await blob.slice(scope.crcDataStart,scope.crcEnd).arrayBuffer());
 const actual=(bytes[0]|bytes[1]<<8|bytes[2]<<16|bytes[3]<<24)>>>0;
 if(actual!==computed)throw Error('EBML_CRC32_VALUE_MISMATCH');
 return computed;
}
