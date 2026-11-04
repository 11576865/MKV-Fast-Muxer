/*
 * Test-only worker-side bridge: upstream libMatroska2's C parser reads a
 * browser File via Emscripten WORKERFS, not a whole-file MEMFS copy.
 *
 * No network access or remote uploads of source bytes. The only network
 * fetches are the same-origin, locally served Wasm/JS executable assets.
 * The worker is terminated after the single request.
 */
self.onmessage=async event=>{
  const started=performance.now();
  const stats={
    fileReaderSyncCalls:0,
    bytesRequested:0,
    largestSliceBytes:0,
  };
  let moduleInstance=null,mounted=false;
  const originalRead=self.FileReaderSync?.prototype?.readAsArrayBuffer;
  try {
    if(event.data?.type!=='probe'||!(event.data.file instanceof File))
      throw Error('WORKER_INPUT_MUST_BE_A_FILE');
    if(typeof self.FileReaderSync!=='function'||
       typeof originalRead!=='function')
      throw Error('WORKER_SYNC_BLOB_ACCESS_UNAVAILABLE');
    const file=event.data.file;
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\\.mkv$/i.test(file.name)||
       file.size<1)
      throw Error('WORKER_FILE_NAME_OR_SIZE_INVALID');

    // The platform-owned synchronous blob reader is used internally by
    // WORKERFS. Count its actual slices for empirical evidence.
    self.FileReaderSync.prototype.readAsArrayBuffer=function(slice){
      if(!(slice instanceof Blob))throw Error('NON_BLOB_WORKER_READ');
      stats.fileReaderSyncCalls++;
      stats.bytesRequested+=slice.size;
      stats.largestSliceBytes=Math.max(stats.largestSliceBytes,slice.size);
      return originalRead.call(this,slice);
    };
    importScripts('/foundation-json.js');
    if(typeof self.createFoundationJSON!=='function')
      throw Error('WORKER_WASM_FACTORY_NOT_FOUND');
    moduleInstance=await self.createFoundationJSON({
      locateFile:name=>new URL('/'+name,self.location.origin).href,
      noInitialRun:true,
    });
    if(!moduleInstance.FS||!moduleInstance.WORKERFS||
       typeof moduleInstance.ccall!=='function')
      throw Error('WORKERFS_NOT_LINKED_OR_EXPORTED');

    const FS=moduleInstance.FS;
    FS.mkdir('/source');
    FS.mount(moduleInstance.WORKERFS,{files:[file]},'/source');
    mounted=true;
    const sourcePath='/source/'+file.name;
    const stat=FS.stat(sourcePath);
    if(stat.size!==file.size)
      throw Error('WORKERFS_FILE_LENGTH_MISMATCH');

    // Do not use FS.writeFile, FS.readFile, arrayBuffer() or base64. Every
    // file read below originates in the official C parser via WORKERFS.
    const rc=moduleInstance.ccall(
      'foundation_probe','number',['string'],[sourcePath]);
    if(rc!==0)throw Error('WORKERFS_MATROSKA_PARSE_FAILED_'+rc);
    const json=moduleInstance.ccall('foundation_json','string',[],[]);
    const structured=JSON.parse(json);
    if(structured.schema!=='foundation-matroska-structured-tree-v0'||
       !Array.isArray(structured.nodes)||structured.nodes.length<3)
      throw Error('WORKERFS_STRUCTURED_RESULT_INVALID');
    if(stats.fileReaderSyncCalls<1)
      throw Error('WORKERFS_DID_NOT_READ_BLOB_SLICES');
    self.postMessage({
      ok:true,structured,
      workerStats:{
        fileBytes:file.size,
        fileReaderSyncCalls:stats.fileReaderSyncCalls,
        bytesRequested:stats.bytesRequested,
        largestSliceBytes:stats.largestSliceBytes,
        elapsedMs:Math.round(performance.now()-started),
        usedWorkerFS:true,
        stagedEntireFileInMemfs:false,
      },
    });
  } catch(error){
    self.postMessage({
      ok:false,error:String(error?.stack||error),
      workerStats:stats,
    });
  } finally {
    if(mounted){
      try{moduleInstance.FS.unmount('/source');}
      catch(e){/* the diagnostic result has already been delivered */ }
    }
    if(originalRead)self.FileReaderSync.prototype.readAsArrayBuffer=originalRead;
  }
};
