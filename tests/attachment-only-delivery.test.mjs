import test from 'node:test';
import assert from 'node:assert/strict';
import * as delivery from '../src/attachment-only-delivery.js';
import {createMatroskaAttachmentReader} from '../src/matroska-attachment-reader.js';
const entry=(name,bytes,mimeType='application/octet-stream')=>({
 kind:'attachment',key:name,file:Object.assign(new Blob([bytes]),{name,lastModified:1}),mimeType,
});
test('one selected generic attachment creates a verified zero-track container and preserves bytes',async()=>{
 assert.equal(typeof delivery.generateAttachmentOnlyOutput,'function');
 const rows=[entry('note.pdf','%PDF-1.7\nunique payload','application/pdf'),{...entry('excluded.png',[1,2]),include:false}];
 const result=await delivery.generateAttachmentOnlyOutput(rows);
 assert.equal(result.report.kind,'attachments-only');
 assert.equal(result.report.attachments.length,1);
 assert.equal(result.report.attachments[0].filename,'note.pdf');
 const reader=createMatroskaAttachmentReader(result.blob),inv=await reader.inspect();
 assert.equal(inv.structure.hasTracksElement,false);
 assert.equal(inv.structure.hasClusterElement,false);
 assert.equal(await reader.openAttachment(inv.attachments[0].id).data.text(),'%PDF-1.7\nunique payload');
});
test('all excluded, mixed resources, unsafe output names and unsafe attachment names reject before writing',async()=>{
 assert.equal(typeof delivery.generateAttachmentOnlyOutput,'function');
 await assert.rejects(delivery.generateAttachmentOnlyOutput([{...entry('a.pdf','x'),include:false}]),/EMPTY/);
 await assert.rejects(delivery.generateAttachmentOnlyOutput([entry('a.pdf','x'),{kind:'subtitle',file:{name:'a.ass'}}]),/MEDIA/);
 await assert.rejects(delivery.generateAttachmentOnlyOutput([entry('../a.pdf','x')]),/FILENAME_REVIEW_REQUIRED/);
});
test('membership or exact File replacement during asynchronous execution cannot publish a stale output',async()=>{
 assert.equal(typeof delivery.generateAttachmentOnlyOutput,'function');
 const rows=[entry('a.pdf','%PDF-1.7\ncontent','application/pdf')];
 let calls=0;
 await assert.rejects(delivery.generateAttachmentOnlyOutput(rows,{isCurrent:()=>{
  if(++calls===2)rows[0].file=Object.assign(new Blob(['changed']),{name:'a.pdf'});
  return true;
 }}),/SELECTION_CHANGED/);
});

test('generic-only route requires every actual media adapter to be empty',()=>{
 assert.equal(typeof delivery.attachmentOnlyRouteEligible,'function');
 const rows=[entry('cover.png',[1,2],'image/png')];
 assert.equal(delivery.attachmentOnlyRouteEligible(rows,[]),true);
 assert.equal(delivery.attachmentOnlyRouteEligible(rows,[{name:'chosen-video.mp4'}]),false);
 assert.equal(delivery.attachmentOnlyRouteEligible([...rows,{kind:'subtitle'}],[]),false);
});
test('attachment readiness exposes precise limits and unsafe-name refusal before Generate',()=>{
 assert.equal(typeof delivery.attachmentOnlyReadiness,'function');
 assert.equal(delivery.attachmentOnlyReadiness([entry('a.pdf','x')]).ready,true);
 const invalid=Array.from({length:9},(_,i)=>entry(i+'.pdf','x'));
 assert.equal(delivery.attachmentOnlyReadiness(invalid).ready,false);
 assert.match(delivery.attachmentOnlyReadiness(invalid).reason,/8/);
 assert.equal(delivery.attachmentOnlyReadiness([entry('../a.pdf','x')]).ready,false);
});
