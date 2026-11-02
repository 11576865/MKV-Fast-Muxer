import assert from 'node:assert/strict';import test from 'node:test';import {createHash} from 'node:crypto';
import * as media from '../src/media-attachment-delivery.js';
import * as intake from '../src/asset-intake.js';
import {prepareMultiAttachmentOnlyPlan} from '../src/multi-attachment-only-job-plan.js';
import {executeMultiAttachmentOnlyCandidate} from '../src/multi-attachment-only-candidate-writer.js';
const entry=(name,bytes='payload',mimeType='application/octet-stream')=>({kind:'attachment',mimeType,file:Object.assign(new Blob([bytes]),{name,lastModified:1})});
const hash=async f=>createHash('sha256').update(Buffer.from(await f.arrayBuffer())).digest('hex');
test('ordinary attachment planning binds actual files and allocates a shared collision namespace',()=>{
 assert.equal(typeof media.planMediaAttachments,'function');const rows=[entry('cover.png'),entry('cover.png','other'),{...entry('excluded.pdf'),include:false}];
 const plan=media.planMediaAttachments(rows,['cover.png','cover (2).png']);assert.equal(plan.length,2);
 assert.deepEqual(plan.map(p=>p.filename),['cover (3).png','cover (4).png']);assert.equal(plan[0].file,rows[0].file);assert.equal(plan[0].mimeType,'application/octet-stream');
 assert.deepEqual(media.planMediaAttachments([{...rows[0],include:false}]),[]);
});
test('ordinary planner rejects unsafe names, invalid MIME, empty/oversize/count/total budgets',()=>{
 assert.equal(typeof media.planMediaAttachments,'function');
 for(const rows of [[entry('../note.json')],[entry('a.json','')],[entry('a.json','x','bad\nmime')],Array.from({length:9},(_,i)=>entry(i+'.json')),[{...entry('huge.bin'),file:{name:'huge.bin',size:16*1024*1024+1,slice(){}}}],Array.from({length:3},(_,i)=>({...entry(i+'.bin'),file:{name:i+'.bin',size:12*1024*1024,slice(){}}}))])assert.throws(()=>media.planMediaAttachments(rows));
});
test('opaque attachment assignment requires explicit eligible unknown bytes and never bypasses conflicts',()=>{
 assert.equal(typeof intake.assignOpaqueAttachmentRole,'function');const raw={...entry('note.json','{"a":1}'),kind:'unknown',evidence:'no-known-content-signature'};
 const assigned=intake.assignOpaqueAttachmentRole(raw);assert.equal(assigned.kind,'attachment');assert.equal(assigned.file,raw.file);assert.equal(assigned.mimeType,'application/octet-stream');assert.equal(assigned.evidence,'user-assigned-opaque-attachment');assert.equal(raw.kind,'unknown');
 for(const row of [{...raw,evidence:'metadata-identity-collision'},{...raw,evidence:'file-read-error'},{...raw,kind:'container'},{...raw,file:null}])assert.throws(()=>intake.assignOpaqueAttachmentRole(row));
});
test('actual ordinary attachment payload verification rejects wrong SHA/MIME/missing payload',async()=>{
 assert.equal(typeof media.verifyMediaAttachments,'function');const row=entry('proof.json','{"real":"bytes"}');
 const output=(await executeMultiAttachmentOnlyCandidate(prepareMultiAttachmentOnlyPlan({minimumCount:1,attachments:[{file:row.file,mimeType:row.mimeType}]}))).output;
 const claim={filename:row.file.name,mimeType:row.mimeType,sizeBytes:row.file.size,sha256:await hash(row.file)};
 const result=await media.verifyMediaAttachments(output,[claim]);assert.equal(result.status,'pass');assert.equal(result.verified,1);
 for(const bad of [{...claim,sha256:'0'.repeat(64)},{...claim,mimeType:'image/png'},{...claim,filename:'missing.json'}])await assert.rejects(media.verifyMediaAttachments(output,[bad]),/普通附件/);
 assert.equal((await media.verifyMediaAttachments(output,[])).status,'not-requested');
});

test('Matroska attached-picture observations are attachment objects, not movie tracks; ISO BMFF stays untouched',()=>{
 assert.equal(typeof media.normalizeMatroskaAttachmentPictures,'function');
 const picture={index:2,codec_type:'video',codec_name:'png',disposition:{attached_pic:1},tags:{filename:'cover.png',mimetype:'image/png'}};
 const actual=media.normalizeMatroskaAttachmentPictures({format:{format_name:'matroska,webm'},streams:[{index:0,codec_type:'video'},picture]});
 assert.equal(actual.streams[1].codec_type,'attachment');assert.equal(actual.streams[1].matroskaImageAttachment,true);assert.equal(picture.codec_type,'video');
 assert.equal(media.normalizeMatroskaAttachmentPictures({format:{format_name:'mov,mp4'},streams:[picture]}).streams[0],picture);
});
test('source picture FileData is read by exact original name/MIME with authored destination metadata',async()=>{
 assert.equal(typeof media.readSourceImageAttachments,'function');
 const row=entry('cover.png','exact image bytes','image/png');const output=(await executeMultiAttachmentOnlyCandidate(prepareMultiAttachmentOnlyPlan({minimumCount:1,attachments:[{file:row.file,mimeType:row.mimeType}]}))).output;
 const selected={index:2,filename:'renamed.png',mimetype:'image/png',stream:{tags:{filename:'cover.png',mimetype:'image/png'}}};
 const found=await media.readSourceImageAttachments(output,[selected]);assert.equal(found.length,1);assert.equal(found[0].filename,'renamed.png');assert.equal(await found[0].file.text(),'exact image bytes');
 await assert.rejects(media.readSourceImageAttachments(output,[{...selected,stream:{tags:{filename:'missing.png',mimetype:'image/png'}}}]),/普通附件/);
});
test('source picture streams are removed from native stream mapping before FileData reattachment',async()=>{
 const {buildMuxCommand}=await import('../src/mux-command.js');
 const cmd=buildMuxCommand({mainInputPath:'source.mkv',outputPath:'out.mkv',preserveAllSourceStreams:true,
  excludedSourceStreamIndices:[2],originalAttachmentCount:1,fontAttachments:[{path:'cover.data',filename:'cover.png',mimeType:'image/png'}]});
 assert.ok(cmd.includes('-0:2'));assert.ok(cmd.indexOf('-0:2')>cmd.indexOf('0'));assert.ok(cmd.includes('-metadata:s:t:1'));
});
