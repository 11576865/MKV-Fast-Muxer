import {inspectLiveSourceTrackSession} from './live-source-track-authority.js';

// Inactive, session-only source drafts. Exact File identity is the key, never
// display metadata or imported JSON. Values are the existing domain session
// and its validated executor projection, not a second editable model.
export function createSourceDraftShelf() {
 const drafts=new WeakMap();
 return Object.freeze({
  remember({source,trackState,session,appendMode=false,preserveAttachments=false,userTouched=false}) {
   inspectLiveSourceTrackSession(session,{source,trackState});
   drafts.set(source,Object.freeze({source,trackState,session,
    appendMode:Boolean(appendMode),preserveAttachments:Boolean(preserveAttachments),userTouched:Boolean(userTouched)}));
  },
  take(source) {
   const saved=source && drafts.get(source);
   if(!saved)return null;
   inspectLiveSourceTrackSession(saved.session,{source,trackState:saved.trackState});
   drafts.delete(source);
   return saved;
  },
  drop(source) {if(source)drafts.delete(source);},
 });
}
