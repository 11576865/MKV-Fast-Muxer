import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('V3.5 batch phase pilot reuses the real native owner and cannot invent a job or writer',async()=>{
  const file=await readFile(new URL('../src/v35-batch-workflow.js',import.meta.url),'utf8');
  const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  const host=await readFile(new URL('../src/softmux-v3-surface.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../src/softmux-v3.css',import.meta.url),'utf8');
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.match(host,/import \{ mountV35BatchWorkflow \} from '.\/v35-batch-workflow.js'/);
  assert.match(host,/mountV35BatchWorkflow\(doc,root\)/);
  assert.match(file,/root\?\.classList\.contains\('sfv35-nav'\)/);
  assert.match(file,/if\(native\(doc,'sfv35BatchFlow'\)\)return null/);
  const phases=['resources','pairing','job','fonts','recipe','run','results','inspection'];
  const targets=['sf14BatchSources','batchPlan','batchJobInspector',
    'batchFontSubsetEnabled','sf14BatchRecipe','batchRunConsole',
    'batchResults','batchInspectBtn'];
  for(let i=0;i<phases.length;i++){
    assert.match(file,new RegExp("\\['"+phases[i]+"','[^']+','"+targets[i]+"'\\]"));
    if(!['sf14BatchSources','sf14BatchRecipe'].includes(targets[i]))
      assert.ok(html.includes('id="'+targets[i]+'"'),targets[i]+' must be a real original DOM node');
  }
  assert.match(file,/const observer=new MutationObserver\(schedule\)/);
  assert.match(file,/const jobs=host\.querySelectorAll\('#batchPlan button\[data-batch-job-index\]'\)\.length/);
  assert.match(file,/const conflicts=host\.querySelectorAll\('#batchPlan select\[data-batch-tie-index\]'\)\.length/);
  assert.match(file,/const outputs=host\.querySelectorAll\('#batchResults a\.download'\)\.length/);
  assert.match(file,/original\?\.click\(\)/);
  assert.match(file,/const focus=key==='resources'/);
  assert.match(file,/pane\.scrollTop\+=delta/);
  assert.doesNotMatch(file,/\b(?:startBatch|executeCurrentMuxTask|runFrozenBatchQueue|setCurrentBatchTaskMetadata)\s*\(/,
    'visual navigation cannot call the batch writer or edit underlying job metadata');
  assert.match(main,/batchManualAssignments\.set\(ambiguous\.track\.file, video\)/);
  assert.match(main,/pairing\.ambiguousPairings\.length > 0/);
  assert.match(css,/#sf14Batch\[data-sfv35-batch-focus="job"\]/);
  assert.match(css,/\.sfv35-batch-flow\{/);
});
