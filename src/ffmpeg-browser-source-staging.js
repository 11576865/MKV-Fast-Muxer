/**
 * Operation-local source File staging for the ffmpeg.wasm execution worker.
 * A browser WORKERFS mount reads the actual File by offset rather than
 * eagerly copying every source byte into a JS Uint8Array and MEMFS.
 *
 * NOT a size/admission ceiling, not an output-streaming implementation.
 * The exact File object is mounted. A filename/size/mtime tuple is never
 * accepted as a different File's content identity.
 */
export const SOURCE_WORKERFS_MIN_BYTES=64*1024*1024;

export async function stageBrowserPrimarySource({
  ffmpeg, file, prefix, fallbackPath, workerFsType, loadBytes,
  minMountBytes=SOURCE_WORKERFS_MIN_BYTES,
}) {
  if(!ffmpeg||!file||!Number.isSafeInteger(file.size)||file.size<0)
    throw Error('PRIMARY_SOURCE_FILE_REQUIRED');
  if(!fallbackPath||!prefix||typeof loadBytes!=='function')
    throw Error('PRIMARY_SOURCE_STAGING_ARGUMENTS_INVALID');
  if(file.size<minMountBytes){
    const bytes=await loadBytes(file);
    await ffmpeg.writeFile(fallbackPath,bytes);
    return Object.freeze({
      path:fallbackPath,kind:'memfs',
      cleanup:async()=>{try{await ffmpeg.deleteFile(fallbackPath);}catch{}}
    });
  }
  // WORKERFS uses the original File.name verbatim as its mounted directory
  // entry. Do not create a cloned File or infer identity from file metadata.
  // Reject path-like names, rather than silently changing the mounted bytes.
  const name=String(file.name||'');
  if(!name||name==='.'||name==='..'||/[\\/\0]/.test(name))
    throw Error('PRIMARY_SOURCE_WORKERFS_NAME_UNSAFE');
  if(!workerFsType)throw Error('PRIMARY_SOURCE_WORKERFS_TYPE_REQUIRED');
  const mountPoint='/'+prefix+'-large-original';
  let mounted=false;
  await ffmpeg.createDir(mountPoint);
  try{
    await ffmpeg.mount(workerFsType,{files:[file]},mountPoint);
    mounted=true;
  }catch(error){
    try{await ffmpeg.deleteDir(mountPoint);}catch{}
    throw error;
  }
  return Object.freeze({
    path:mountPoint+'/'+name,kind:'workerfs',
    cleanup:async()=>{
      if(mounted){try{await ffmpeg.unmount(mountPoint);}catch{}}
      try{await ffmpeg.deleteDir(mountPoint);}catch{}
    }
  });
}
