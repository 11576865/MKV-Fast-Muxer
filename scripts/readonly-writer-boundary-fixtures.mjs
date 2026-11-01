import {createResearchFixture,pngBytes} from './r02-attachment-only-fixture.mjs';
// Test-only Matroska transforms. Neither fixture is a media size benchmark.
const vint=value=>{
 for(let width=1;width<=8;width++)if(BigInt(value)<(1n<<BigInt(7*width))-1n){
  let n=BigInt(value)|(1n<<BigInt(7*width));const bytes=Buffer.alloc(width);
  for(let i=width-1;i>=0;i--){bytes[i]=Number(n&255n);n>>=8n;}return bytes;
 }
 throw Error('FIXTURE_SIZE_TOO_LARGE');
};
const element=(hex,payload)=>Buffer.concat([Buffer.from(hex,'hex'),vint(payload.length),payload]);
export function readonlyWriterBoundaryFixtures({voidPayloadBytes=61*1024*1024}={}){
 const base=createResearchFixture(),at=base.indexOf(Buffer.from('18538067','hex'));
 if(at<0)throw Error('FIXTURE_SEGMENT_MISSING');
 let width=1;while(!(base[at+4]&(0x80>>(width-1))))width++;
 const header=base.subarray(0,at),body=base.subarray(at+4+width);
 const wrap=payload=>Buffer.concat([header,element('18538067',payload)]);
 const referencedPayload=Buffer.concat([pngBytes,Buffer.from('readonly-tagged-payload')]);
 const info=body.subarray(0,body.indexOf(Buffer.from('1941a469','hex')));
 const attached=element('61a7',Buffer.concat([element('466e',Buffer.from('tagged-pixel.png')),element('4660',Buffer.from('image/png')),element('465c',referencedPayload),element('46ae',Buffer.from([42]))]));
 const targets=element('63c0',element('63c6',Buffer.from([42])));
 const simple=element('67c8',Buffer.concat([element('45a3',Buffer.from('READONLY_FIXTURE')),element('4487',Buffer.from('attachment still linked'))]));
 return {
  overBudget:wrap(Buffer.concat([element('ec',Buffer.alloc(voidPayloadBytes)),body])),
  referenced:wrap(Buffer.concat([info,element('1941a469',attached),element('1254c367',element('7373',Buffer.concat([targets,simple])))])),
  replacement:Buffer.from(pngBytes),referencedPayload,targetFileUid:'42',
 };
}
