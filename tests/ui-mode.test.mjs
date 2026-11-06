import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSoftmuxUiMode} from '../src/ui-mode.js';

test('public root and V3 alias use the same default target-authority surface',()=>{
  for(const query of ['', '?', '?ui=v3', '?ui=unknown', '?unrelated=1',
    '?unrelated=1&ui=v3', '?ui=', '?ui=V3']){
    assert.equal(resolveSoftmuxUiMode(query),'v3',query);
  }
});
test('previous production workbench and original diagnostic view require explicit intent',()=>{
  assert.equal(resolveSoftmuxUiMode('?ui=workbench'),'workbench');
  assert.equal(resolveSoftmuxUiMode('?ui=legacy'),'legacy');
  assert.equal(resolveSoftmuxUiMode('?ui=workbench&test=1'),'workbench');
  assert.equal(resolveSoftmuxUiMode('?ui=legacy&test=1'),'legacy');
  assert.equal(resolveSoftmuxUiMode('?ui=v3&ui=legacy'),'v3',
    'first URLSearchParams value wins; no second-param fallback bypass');
});
