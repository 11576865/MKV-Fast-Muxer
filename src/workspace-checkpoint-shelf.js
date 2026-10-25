/**
 * S09 explicit, origin-scoped local checkpoint shelf.
 *
 * IndexedDB contains ONLY a previously validated *inert JSON string* and
 * simple display metadata. It cannot persist File handles, Blobs, generated
 * MKV, session authority or an approval. Storage can be cleared/evicted by
 * the browser: portable JSON export remains the durable user-owned path.
 */
import { parsePortableWorkspaceBundle,
  PORTABLE_WORKSPACE_BUNDLE_MAX_BYTES } from './portable-workspace-bundle.js';

export const WORKSPACE_SHELF_SCHEMA='softmux-metadata-shelf-entry-v1';
export const WORKSPACE_SHELF_MAX_ENTRIES=8;
const DB_NAME='softmux-workspace-metadata-checkpoints-v1';
const STORE_NAME='checkpoints';
const reject=code=>{throw Error('WORKSPACE_SHELF_'+code)};
const textOk=(s,max)=>typeof s==='string'&&s.length>0&&
  s.length<=max&&!/[\u0000-\u001f\u007f]/.test(s);
const matchId=s=>typeof s==='string'&&
  /^[0-9a-f]{8}-[0-9a-f-]{27,40}$/.test(s);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||
   Object.getPrototypeOf(x)===null);

export function prepareWorkspaceShelfEntry({
  json,sourceName,id,createdAt,
}={}){
  if(typeof json!=='string'||
      new TextEncoder().encode(json).length>PORTABLE_WORKSPACE_BUNDLE_MAX_BYTES)
    reject('OVERSIZE');
  const bundle=parsePortableWorkspaceBundle(json);
  if(!bundle.sourceDraft.sources?.[0]?.sha256 ||
      !/^[0-9a-f]{64}$/.test(bundle.sourceDraft.sources[0].sha256))
    reject('SOURCE_SHA256_REQUIRED');
  if(!textOk(sourceName,255)||!matchId(id)||
      !Number.isSafeInteger(createdAt)||createdAt<0)
    reject('ENTRY_METADATA_INVALID');
  return Object.freeze({
    schema:WORKSPACE_SHELF_SCHEMA,id,createdAt,sourceName,json,
    // Explicitly descriptive fields, not historical provenance or consent.
    hasExternalCheckpoint:bundle.externalCheckpoint!==null,
  });
}
export function validateWorkspaceShelfEntry(value){
  if(!plain(value)||Object.keys(value).length!==6||
      ['schema','id','createdAt','sourceName','json','hasExternalCheckpoint']
        .some(k=>!Object.hasOwn(value,k))||
      value.schema!==WORKSPACE_SHELF_SCHEMA||
      typeof value.hasExternalCheckpoint!=='boolean')
    reject('ENTRY_SCHEMA');
  const checked=prepareWorkspaceShelfEntry(value);
  if(checked.hasExternalCheckpoint!==value.hasExternalCheckpoint)
    reject('ENTRY_SCOPE_MISMATCH');
  return checked;
}
function openShelf(indexedDB){
  if(!indexedDB?.open)reject('INDEXEDDB_UNAVAILABLE');
  return new Promise((resolve,rejectOpen)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME,{keyPath:'id'});
    };
    request.onsuccess=()=>{
      const db=request.result;
      db.onversionchange=()=>db.close();
      resolve(db);
    };
    request.onerror=()=>rejectOpen(request.error||Error('INDEXEDDB_OPEN_FAILED'));
    request.onblocked=()=>rejectOpen(Error('INDEXEDDB_BLOCKED'));
  });
}
export function createWorkspaceCheckpointShelf({
  indexedDB=globalThis.indexedDB,
  clock=()=>Date.now(),
  uid=()=>globalThis.crypto.randomUUID(),
}={}){
  let pendingDb=null;
  const db=()=>pendingDb||(pendingDb=openShelf(indexedDB).catch(error=>{
    pendingDb=null;throw error;
  }));
  const transact=async (mode,operation)=>{
    const connection=await db();
    return await new Promise((resolve,rej)=>{
      let completed=false,value;
      const tx=connection.transaction(STORE_NAME,mode);
      const store=tx.objectStore(STORE_NAME);
      tx.oncomplete=()=>{completed=true;resolve(value);};
      tx.onabort=()=>{if(!completed)rej(tx.error||Error('WORKSPACE_SHELF_TRANSACTION_ABORTED'));};
      tx.onerror=()=>{if(!completed)rej(tx.error||Error('WORKSPACE_SHELF_TRANSACTION_FAILED'));};
      try{operation(store,tx,v=>{value=v;});}
      catch(error){try{tx.abort();}catch{}rej(error);}
    });
  };
  return Object.freeze({
    async save({json,sourceName}={}){
      // No DB mutation begins until every nested checkpoint is valid.
      const entry=prepareWorkspaceShelfEntry({
        json,sourceName,id:uid(),createdAt:clock(),
      });
      return await transact('readwrite',(store,tx,set)=>{
        const read=store.getAll();
        read.onsuccess=()=>{
          try{
            if(read.result.length>=WORKSPACE_SHELF_MAX_ENTRIES)
              reject('FULL_DELETE_AN_OLD_CHECKPOINT');
            store.put(entry);
            set(Object.freeze({id:entry.id,createdAt:entry.createdAt,
              sourceName:entry.sourceName}));
          }catch(error){tx.abort();set(error);}
        };
      }).then(result=>{
        if(result instanceof Error)throw result;
        return result;
      });
    },
    async list(){
      const all=await transact('readonly',(store,tx,set)=>{
        const req=store.getAll();req.onsuccess=()=>set(req.result);
      });
      return Object.freeze(all.map(validateWorkspaceShelfEntry)
        .sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id))
        .map(({id,createdAt,sourceName,hasExternalCheckpoint})=>
          Object.freeze({id,createdAt,sourceName,hasExternalCheckpoint})));
    },
    async load(id){
      if(!matchId(id))reject('INVALID_ID');
      const found=await transact('readonly',(store,tx,set)=>{
        const req=store.get(id);req.onsuccess=()=>set(req.result??null);
      });
      if(!found)reject('NOT_FOUND');
      const item=validateWorkspaceShelfEntry(found);
      return Object.freeze({
        id:item.id,sourceName:item.sourceName,
        bundle:parsePortableWorkspaceBundle(item.json),
      });
    },
    async remove(id){
      if(!matchId(id))reject('INVALID_ID');
      return await transact('readwrite',(store,tx,set)=>{
        store.delete(id);set(true);
      });
    },
  });
}
