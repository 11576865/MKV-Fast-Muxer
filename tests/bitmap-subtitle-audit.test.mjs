import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCopiedBitmapPackets} from '../scripts/audit-bitmap-subtitle-output.mjs';
const dvd=(hash='SHA256:payload',pts='1.000000')=>({streams:[{codec_name:'dvd_subtitle'}],packets:[{data_hash:hash,pts_time:pts}]});
test('graphic subtitle oracle rejects changed payload and timestamp shifts independently',()=>{
 assert.doesNotThrow(()=>assertCopiedBitmapPackets(dvd(),dvd(),'dvd'));
 assert.throws(()=>assertCopiedBitmapPackets(dvd(),dvd('SHA256:changed'),'dvd'),/payload differs/);
 assert.throws(()=>assertCopiedBitmapPackets(dvd(),dvd('SHA256:payload','0.021'),'dvd'),/shifted packet timestamp/);
 assert.throws(()=>assertCopiedBitmapPackets(dvd(),dvd('SHA256:payload','not-a-time'),'dvd'),/timestamp/);
});
test('graphic subtitle oracle cannot accept empty sources or missing tracks',()=>{
 assert.throws(()=>assertCopiedBitmapPackets({...dvd(),packets:[]},{...dvd(),packets:[]},'dvd'),/empty source/);
 assert.throws(()=>assertCopiedBitmapPackets(dvd(),{...dvd(),streams:[]},'dvd'),/stream missing/);
});
const pgs=packets=>({streams:[{codec_name:'hdmv_pgs_subtitle'}],packets});
const packet=(hex,pts='1.000000')=>({pts_time:pts,size:String(hex.length/2),data:'\n00000000: '+hex+'  synthetic\n'});
test('PGS segment repacketization preserves display-set bytes and PTS; mutated/absent bytes fail',()=>{
 const source=pgs([packet('160001ff'),packet('800000')]);
 assert.doesNotThrow(()=>assertCopiedBitmapPackets(source,pgs([packet('160001ff800000')]),'pgs'));
 assert.throws(()=>assertCopiedBitmapPackets(source,pgs([packet('16000100800000')]),'pgs'),/payload differs/);
 assert.throws(()=>assertCopiedBitmapPackets(source,pgs([packet('160001ff800000','2.000')]),'pgs'),/shifted packet timestamp/);
 assert.throws(()=>assertCopiedBitmapPackets(source,pgs([{pts_time:'1',size:'7'}]),'pgs'),/raw packet bytes missing/);
});
