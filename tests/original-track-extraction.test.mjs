import test from 'node:test';import assert from 'node:assert/strict';
import {planOriginalTrackExtraction,originalTrackExtractionCurrent,buildTrackExtractionCommand,auditExtractedOriginalTrack} from '../src/original-track-extraction.js';
const file={name:'movie.mkv',size:100,lastModified:1};
const audio={index:3,codec_type:'audio',codec_name:'flac',sample_rate:'48000',channels:2,tags:{title:'Original audio',language:'jpn'}};
test('single-track container copy maps exact raw stream and preserves source timeline without other objects',()=>{
 const p=planOriginalTrackExtraction(file,audio);const args=buildTrackExtractionCommand(p,'source.mkv','result.mka');
 assert.equal(args[args.indexOf('-map')+1],'0:3');assert.equal(args[args.indexOf('-c')+1],'copy');
 assert.ok(args.includes('-copyts'));assert.equal(args[args.indexOf('-avoid_negative_ts')+1],'disabled');
 assert.equal(args[args.indexOf('-map_chapters')+1],'-1');assert.ok(!args.includes('-attach'));
 assert.equal(p.extension,'.mka');assert.equal(p.timelinePreserved,true);
});
test('native formats are codec-derived and cannot request a conversion',()=>{
 const p=planOriginalTrackExtraction(file,audio,{format:'native'});assert.equal(p.extension,'.flac');assert.equal(p.timelinePreserved,false);
 assert.throws(()=>planOriginalTrackExtraction(file,{...audio,codec_name:'dvd_subtitle',codec_type:'subtitle'},{format:'native'}),/原生格式/);
 assert.equal(planOriginalTrackExtraction(file,{index:6,codec_type:'subtitle',codec_name:'dvd_subtitle'}).extension,'.mks');
 assert.throws(()=>planOriginalTrackExtraction(file,{...audio,codec_type:'video'}),/音频或字幕/);
});
test('extraction checks exact File, raw stream object and observed identity rather than filename or pending edits',()=>{
 const p=planOriginalTrackExtraction(file,audio);
 assert.equal(originalTrackExtractionCurrent(p,file,[audio]),true);
 assert.equal(originalTrackExtractionCurrent(p,{...file},[audio]),false);
 assert.equal(originalTrackExtractionCurrent(p,file,[{...audio}]),false);
 const stream={...audio,tags:{...audio.tags}};const q=planOriginalTrackExtraction(file,stream);stream.tags.title='changed observation';
 assert.equal(originalTrackExtractionCurrent(q,file,[stream]),false);
});
test('audit requires exactly one matching original codec/type and observed container metadata',()=>{
 const p=planOriginalTrackExtraction(file,audio);
 assert.equal(auditExtractedOriginalTrack(p,{streams:[{...audio,index:0}],chapters:[]}).ok,true);
 for(const streams of [[],[{...audio,codec_name:'aac'}],[audio,audio]])assert.equal(auditExtractedOriginalTrack(p,{streams,chapters:[]}).ok,false);
 assert.equal(auditExtractedOriginalTrack(p,{streams:[audio],chapters:[{}]}).ok,false);
});
test('export names do not use stream titles as paths and always differ from the source name',()=>{
 const p=planOriginalTrackExtraction({name:'../CON.mkv'}, {...audio,tags:{title:'../../bad',language:'eng'}});
 assert.ok(!/[\\/]/.test(p.outputName));assert.ok(p.outputName.startsWith('track-'));assert.ok(p.outputName.endsWith('.mka'));
});
