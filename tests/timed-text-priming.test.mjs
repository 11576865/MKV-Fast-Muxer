import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectTimedTextAacPriming} from '../src/timed-text-priming.js';

const source = {streams:[
  {index:0,codec_type:'video',codec_name:'mpeg4'},
  {index:1,codec_type:'audio',codec_name:'aac'}, // generic probe omits sample_rate
]};
const packet = {streams:[{index:1,codec_name:'aac',sample_rate:'48000'}],packets:[{pts_time:'-0.021333',side_data_list:[
  {side_data_type:'Skip Samples',skip_samples:1024},
]}]};

test('actual ISO BMFF AAC priming packet proves -21 ms new timed-text correction',()=>{
  assert.deepEqual(inspectTimedTextAacPriming(source,packet,'iso-bmff'),{
    applied:true, correctionSeconds:-0.021,
    reason:'AAC_PRIMING_PACKET_PROVEN',
    observedNegativePtsSeconds:-0.021333,skipSamples:1024,sampleRate:48000,
  });
});
test('no guessed corrections from codec identity, missing bytes or out-of-range PTS',()=>{
  for(const sourceCopy of [
    null,{streams:[]},
    {streams:[...source.streams,{codec_type:'audio',codec_name:'aac'}]},
    {streams:[{codec_type:'audio',codec_name:'opus'}]},
  ]) assert.equal(inspectTimedTextAacPriming(sourceCopy,packet,'iso-bmff').applied,false);
  assert.equal(inspectTimedTextAacPriming(source,packet,'matroska').applied,false);
  for (const wrongStream of [
    null, {index:0,codec_name:'aac',sample_rate:'48000'},
    {index:1,codec_name:'opus',sample_rate:'48000'},
    {index:1,codec_name:'aac'}, {index:1,codec_name:'aac',sample_rate:'garbage'},
  ]) {
    const evidence = {...packet, streams:wrongStream ? [wrongStream] : []};
    assert.equal(inspectTimedTextAacPriming(source,evidence,'iso-bmff').applied,false,
      'mismatched or absent stream rate must never authorize a timing shift');
  }
  for(const copy of [
    null,{streams:packet.streams,packets:[]},
    {streams:packet.streams,packets:[{pts_time:'0.000'}]},
    {streams:packet.streams,packets:[{pts_time:'-0.021333'}]},
    {streams:packet.streams,packets:[{pts_time:'-0.021333',side_data_list:[{side_data_type:'Skip Samples',skip_samples:512}]}]},
    {streams:packet.streams,packets:[{pts_time:'-0.300',side_data_list:[{side_data_type:'Skip Samples',skip_samples:14400}]}]},
  ]) assert.equal(inspectTimedTextAacPriming(source,copy,'iso-bmff').applied,false);
});
