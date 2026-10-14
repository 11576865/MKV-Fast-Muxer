/**
 * P1 bounded external-asset domain authority.
 *
 * External audio/subtitle editable metadata and the font handling policy
 * live in one immutable ContainerProject. Real browser File and subtitle
 * sidecar grants remain in the established executor projections.
 * Selected font files are source-bound inventory objects, NOT an asserted
 * byte-level font editor or a new Matroska writer.
 */
import {createContainerProject,applyContainerProjectEdit} from './container-project.js';

export const EXTERNAL_AUDIO_FIELDS=Object.freeze([
  'title','language','default','original','commentary','hearingImpaired',
]);
export const EXTERNAL_SUBTITLE_FIELDS=Object.freeze([
  'title','language','default','forced','original','commentary','hearingImpaired',
]);
export const EXTERNAL_FONT_MODES=Object.freeze(['preserve','force']);
const LIMIT=85;
const fieldsFor=kind=>kind==='audio' ? EXTERNAL_AUDIO_FIELDS : EXTERNAL_SUBTITLE_FIELDS;
const keyOf=(kind,index)=>kind+':'+index;
const stringFields=new Set(['title','language']);
const fieldsSnapshot=(kind,row)=>Object.fromEntries(fieldsFor(kind).map(f=>[f,row[f]]));

const cloneProject=project=>createContainerProject({
  documentId:project.documentId,
  sources:project.sources.map(({size,...src})=>size===null?src:{...src,size}),
  objects:project.objects,
});
function compact(project) {
  return project.history.length<LIMIT ? project : cloneProject(project);
}
function validateField(kind,field,value) {
  if(!fieldsFor(kind).includes(field))
    throw Error('EXTERNAL_DOMAIN_FIELD_UNSUPPORTED');
  if(stringFields.has(field)) {
    if(typeof value!=='string' || value.length>(field==='title'?160:35) ||
        /[\u0000-\u001f\u007f]/.test(value) ||
        field==='language' && !/^[A-Za-z0-9_-]{2,35}$/.test(value))
      throw Error('EXTERNAL_DOMAIN_TEXT_INVALID');
  } else if(typeof value!=='boolean')
    throw Error('EXTERNAL_DOMAIN_BOOLEAN_REQUIRED');
}
function enumerate(audioRows,subtitleRows) {
  if(!Array.isArray(audioRows)||!Array.isArray(subtitleRows))
    throw Error('EXTERNAL_DOMAIN_INVENTORY_INVALID');
  return [
    ...audioRows.map((row,index)=>({kind:'audio',index,row})),
    ...subtitleRows.map((row,index)=>({kind:'subtitle',index,row})),
  ];
}
function projectFields(session,rowInfo) {
  const obj=session.project.objects.find(x=>x.id===session.keys.get(keyOf(rowInfo.kind,rowInfo.index)));
  if(!obj || obj.kind!==rowInfo.kind || !obj.sourceId)
    throw Error('EXTERNAL_DOMAIN_OBJECT_DRIFT');
  return obj;
}
function verify(session,{audioRows,subtitleRows,fonts,mode}={}) {
  if(!session||!Array.isArray(fonts)||!EXTERNAL_FONT_MODES.includes(mode))
    throw Error('EXTERNAL_DOMAIN_SESSION_INVALID');
  const list=enumerate(audioRows,subtitleRows);
  if(list.length!==session.rows.length || fonts.length!==session.fonts.length ||
      fonts.some((f,i)=>f!==session.fonts[i]) || mode!==session.mode)
    throw Error('EXTERNAL_DOMAIN_INVENTORY_CHANGED');
  const seen=new Set();
  for(let i=0;i<list.length;i++) {
    const now=list[i], bound=session.rows[i], row=now.row;
    if(now.kind!==bound.kind || now.index!==bound.index ||
        row!==bound.row || row?.file!==bound.file ||
        row?.sidecarFile!==bound.sidecarFile ||
        row?.format!==bound.format ||
        row?.identity!==bound.identity ||
        !row.file || seen.has(keyOf(now.kind,now.index)))
      throw Error('EXTERNAL_DOMAIN_SOURCE_CHANGED');
    seen.add(keyOf(now.kind,now.index));
    const obj=projectFields(session,now);
    for(const field of fieldsFor(now.kind))
      if(row[field]!==obj.attributes[field])
        throw Error('EXTERNAL_DOMAIN_EXECUTOR_PROJECTION_DRIFT');
  }
  const fontObjects=session.project.objects.filter(o=>o.id.startsWith('external-font:'));
  if(fontObjects.length!==fonts.length ||
      fontObjects.some((obj,i)=>obj.attributes.name!==fonts[i]?.name ||
        obj.included!==true || !obj.sourceId))
    throw Error('EXTERNAL_DOMAIN_FONT_PROJECTION_DRIFT');
  const policy=session.project.objects.find(o=>o.id==='external-policy:font');
  if(!policy||policy.kind!=='metadata' || policy.attributes.value!==mode)
    throw Error('EXTERNAL_DOMAIN_FONT_MODE_DRIFT');
  return list;
}

export function createLiveExternalAssetSession({
  audioRows=[],subtitleRows=[],fonts=[],fontMode='preserve',
}={}) {
  if(!EXTERNAL_FONT_MODES.includes(fontMode)||!Array.isArray(fonts))
    throw Error('EXTERNAL_DOMAIN_MODE_INVALID');
  const entries=enumerate(audioRows,subtitleRows);
  if(entries.length+fonts.length>160)
    throw Error('EXTERNAL_DOMAIN_BUDGET_EXCEEDED');
  const sources=[],objects=[],keys=new Map();
  const rows=entries.map(({kind,index,row})=>{
    if(!row?.file)throw Error('EXTERNAL_DOMAIN_SOURCE_REQUIRED');
    const name='external-'+kind+':'+index,sourceId='external-input:'+kind+':'+index;
    const attrs=fieldsSnapshot(kind,row);
    for(const [field,value] of Object.entries(attrs))validateField(kind,field,value);
    sources.push({id:sourceId,name:row.file.name,
      identityEvidence:'session-exact-file-reference'});
    objects.push({id:name,kind,sourceId,included:true,attributes:attrs});
    keys.set(keyOf(kind,index),name);
    return {kind,index,row,file:row.file,sidecarFile:row.sidecarFile,
      format:row.format,identity:row.identity};
  });
  fonts.forEach((file,index)=>{
    if(!file)throw Error('EXTERNAL_DOMAIN_FONT_REQUIRED');
    const sourceId='external-font-input:'+index;
    sources.push({id:sourceId,name:file.name,
      identityEvidence:'session-exact-file-reference'});
    objects.push({id:'external-font:'+index,kind:'attachment',sourceId,
      included:true,attributes:{name:file.name}});
  });
  objects.push({id:'external-policy:font',kind:'metadata',
    attributes:{name:'fontMode',value:fontMode}});
  const session={
    project:createContainerProject({documentId:'external-resources-current-task',sources,objects}),
    rows,keys,fonts:[...fonts],mode:fontMode,generation:0,compactions:0,
  };
  verify(session,{audioRows,subtitleRows,fonts,fontMode:undefined,mode:fontMode});
  return session;
}

/** Validate all edits, then atomically generate executor-view fields. */
export function commitLiveExternalAssetChanges(session,{
  audioRows,subtitleRows,fonts,mode,changes=[],
}={}) {
  const rows=verify(session,{audioRows,subtitleRows,fonts,mode});
  if(!Array.isArray(changes)||!changes.length||changes.length>200)
    throw Error('EXTERNAL_DOMAIN_CHANGE_BUDGET');
  const staged=new Map();
  for(const edit of changes) {
    const kind=edit?.kind,index=edit?.index,field=edit?.field;
    if(!['audio','subtitle'].includes(kind)||!Number.isSafeInteger(index)||
        index<0||!rows.some(r=>r.kind===kind&&r.index===index))
      throw Error('EXTERNAL_DOMAIN_TARGET_NOT_FOUND');
    validateField(kind,field,edit.value);
    const key=keyOf(kind,index),row=rows.find(r=>keyOf(r.kind,r.index)===key);
    const values=staged.get(key)||{row,after:fieldsSnapshot(kind,row.row)};
    values.after[field]=edit.value;
    staged.set(key,values);
  }
  let next=session.project,count=0;
  for(const [key,item] of staged) {
    const id=session.keys.get(key);
    for(const field of fieldsFor(item.row.kind)) {
      const obj=next.objects.find(o=>o.id===id);
      if(!obj)throw Error('EXTERNAL_DOMAIN_OBJECT_DRIFT');
      if(obj.attributes[field]===item.after[field])continue;
      next=compact(next);
      next=applyContainerProjectEdit(next,{
        type:'set-attribute',objectId:id,field,value:item.after[field],
      });
      count++;
    }
  }
  if(!count)return Object.freeze({status:'no-change',generation:session.generation});
  for(const item of staged.values()) {
    const obj=next.objects.find(o=>o.id===session.keys.get(
      keyOf(item.row.kind,item.row.index)));
    for(const field of fieldsFor(item.row.kind))
      item.row.row[field]=obj.attributes[field];
  }
  session.project=next;
  session.generation++;
  return Object.freeze({status:'domain-and-executor-projection-committed',
    updatedObjects:staged.size,changedFields:count,generation:session.generation,
    fileWritten:false,muxStarted:false,writerAuthorized:false});
}

/** The mode is a domain policy, not a mutation of font bytes/UIDs. */
export function commitExternalFontMode(session,{
  audioRows,subtitleRows,fonts,previousMode,nextMode,
}={}) {
  verify(session,{audioRows,subtitleRows,fonts,mode:previousMode});
  if(!EXTERNAL_FONT_MODES.includes(nextMode))
    throw Error('EXTERNAL_DOMAIN_MODE_INVALID');
  if(previousMode===nextMode)return Object.freeze({status:'no-change'});
  const next=applyContainerProjectEdit(compact(session.project),{
    type:'set-attribute',objectId:'external-policy:font',
    field:'value',value:nextMode,
  });
  session.project=next;
  session.mode=nextMode;
  session.generation++;
  return Object.freeze({status:'font-mode-domain-committed',
    mode:nextMode,fileWritten:false,writerAuthorized:false});
}

export function inspectLiveExternalAssets(session,{audioRows,subtitleRows,fonts,mode}={}) {
  verify(session,{audioRows,subtitleRows,fonts,mode});
  return Object.freeze({
    generation:session.generation,project:session.project,
    sourceAudioCount:audioRows.length,
    sourceSubtitleCount:subtitleRows.length,
    fontInventoryCount:fonts.length,
    fontMode:mode,historyLength:session.project.history.length,
    allAssetFileReferencesSessionOnly:true,
    sourcesByteVerified:false,writerAuthorized:false,
    resourceOnlyWriting:false,
  });
}
