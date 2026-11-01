import test from 'node:test';
import assert from 'node:assert/strict';
import {readonlyWriterBoundaryFixtures} from '../scripts/readonly-writer-boundary-fixtures.mjs';
import {createMatroskaAttachmentReader} from '../src/matroska-attachment-reader.js';
import {prepareRoutedAttachmentReplacement} from '../src/p2-existing-mkv-writer-router.js';

test('writer 60 MiB budget does not restrict seek-only attachment observations or grant write permission',async()=>{
 const fixture=readonlyWriterBoundaryFixtures();
 assert.ok(fixture.overBudget.length>60*1024*1024&&fixture.overBudget.length<64*1024*1024);
 const file=new File([fixture.overBudget],'over-writer-budget.mkv');let readBytes=0,maxRead=0;
 const observedSource={name:file.name,size:file.size,lastModified:file.lastModified,
  arrayBuffer(){throw Error('WHOLE_SOURCE_READ_FORBIDDEN');},
  slice(start,end,type){const length=(end??file.size)-(start??0);maxRead=Math.max(maxRead,length);readBytes+=length;
   assert.ok(length<=65536,'read-only inspector must seek over large Void');return file.slice(start,end,type);}};
 const reader=createMatroskaAttachmentReader(observedSource),inventory=await reader.inspect();
 assert.equal(inventory.state,'inspected');assert.equal(inventory.scanning.fileDataBytesRead,0);
 assert.ok(readBytes<65536);assert.ok(maxRead<=65536);
 const item=inventory.attachments[0];assert.equal(item.fileUid,'42');
 assert.deepEqual(new Uint8Array(await reader.openAttachment(item.id).data.arrayBuffer()),new Uint8Array(fixture.replacement));
 await assert.rejects(prepareRoutedAttachmentReplacement({source:file,replacement:new Blob([fixture.replacement]),targetFileUid:'42',approveSourceModification:true}),/P2_ROUTE_SOURCE_OR_DATA_BUDGET/);
 assert.equal((await reader.inspect()).state,'inspected','writer refusal cannot revoke read-only access');
});
test('targeted attachment UID permits inspection/extraction but remains denied for routed replacement',async()=>{
 const fixture=readonlyWriterBoundaryFixtures({voidPayloadBytes:0});
 const source=new File([fixture.referenced],'referenced-attachment.mkv');
 const reader=createMatroskaAttachmentReader(source),inventory=await reader.inspect();
 assert.equal(inventory.state,'inspected');
 const relations=await reader.inspectRelations(inventory);
 assert.ok(relations.edges.some(e=>e.targetKind==='attachment'&&e.targetUid==='42'));
 await assert.rejects(prepareRoutedAttachmentReplacement({source,replacement:new Blob([fixture.replacement]),targetFileUid:'42',approveSourceModification:true}),/P2_ROUTE_TAG_REFERENCED_UID/);
 assert.deepEqual(Buffer.from(await reader.openAttachment(inventory.attachments[0].id).data.arrayBuffer()),fixture.referencedPayload);
});
