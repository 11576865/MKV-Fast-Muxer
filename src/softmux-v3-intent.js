/*
 * V3 explicit target authority: a small, exact File-bound intent gate.
 * This is NOT another ContainerProject/track editor. The existing source
 * session and writer remain authoritative; this only records user's
 * explicit selection of which real source may serve as the target base.
 * Never retain or validate a base by name, size or lastModified alone.
 */
export function createV3TargetAuthority() {
  let intent = null;
  const entryMatches = (entries, key, file) =>
    Boolean(file && entries?.some(entry =>
      entry.kind === 'container' && entry.key === key && entry.file === file));
  const isCurrent = ({entries, activeFile}) =>
    Boolean(intent && intent.baseFile === activeFile &&
      entryMatches(entries, intent.baseKey, intent.baseFile));
  return Object.freeze({
    current(state) {
      if (!isCurrent(state)) intent = null;
      return intent;
    },
    confirm({baseKey, baseFile, entries, activeFile}) {
      if (typeof baseKey !== 'string' || !baseKey ||
          !entryMatches(entries, baseKey, baseFile) ||
          activeFile !== baseFile) {
        intent = null;
        return {accepted:false,reason:'TARGET_SOURCE_NOT_CURRENT'};
      }
      intent = Object.freeze({baseKey,baseFile});
      return {accepted:true,intent};
    },
    clear() { intent = null; },
  });
}
