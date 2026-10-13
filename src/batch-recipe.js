/**
 * BatchRecipe v1: portable non-executable rules, NOT file permissions or a
 * resumable media Blob. The importer never restores File handles or starts mux.
 */
export const BATCH_RECIPE_SCHEMA = 'batch-recipe-v1';
export const BATCH_RECIPE_MAX_BYTES = 32 * 1024;
const POLICY_KEYS = ['preserveAttachments','subsetEnabled','subsetScope'];
const plain = o => o !== null && typeof o === 'object' &&
  (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);
const freeze = o => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.values(o).forEach(freeze);
    Object.freeze(o);
  }
  return o;
};
function checkedPolicy(policy) {
  if (!plain(policy) || Object.keys(policy).some(k => !POLICY_KEYS.includes(k)))
    throw Error('INVALID_RECIPE_POLICY');
  if (typeof policy.preserveAttachments !== 'boolean' ||
      typeof policy.subsetEnabled !== 'boolean' ||
      !['job','group'].includes(policy.subsetScope)) {
    throw Error('INVALID_RECIPE_VALUES');
  }
  return {
    preserveAttachments: policy.preserveAttachments,
    subsetEnabled: policy.subsetEnabled,
    subsetScope: policy.subsetScope,
  };
}
export function buildBatchRecipe({
  policy, title = '字幕随集配对', note = '',
} = {}) {
  if (typeof title !== 'string' || title.trim().length > 120 ||
      typeof note !== 'string' || note.length > 600) throw Error('INVALID_RECIPE_TEXT');
  return freeze({
    schema: BATCH_RECIPE_SCHEMA, title: title.trim(),
    recipeKind: 'episode-subtitle-pairing',
    policy: checkedPolicy(policy),
    sourceBindings: 'must-reselect-and-review',
    outputDirectoryPermission: 'not-exported',
    reviewRequired: true,
    savedArtifacts: 'not-included',
    note,
  });
}
export function stringifyBatchRecipe(recipe) {
  const normalized = parseBatchRecipe(JSON.stringify(recipe));
  return JSON.stringify(normalized, null, 2) + '\n';
}
export function parseBatchRecipe(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > BATCH_RECIPE_MAX_BYTES)
    throw Error('RECIPE_TOO_LARGE');
  let value;
  try { value = JSON.parse(text); } catch { throw Error('RECIPE_JSON_INVALID'); }
  if (!plain(value) || value.schema !== BATCH_RECIPE_SCHEMA ||
      value.recipeKind !== 'episode-subtitle-pairing' ||
      value.sourceBindings !== 'must-reselect-and-review' ||
      value.outputDirectoryPermission !== 'not-exported' ||
      value.reviewRequired !== true || value.savedArtifacts !== 'not-included' ||
      Object.keys(value).some(k => ![
        'schema','title','recipeKind','policy','sourceBindings',
        'outputDirectoryPermission','reviewRequired','savedArtifacts','note',
      ].includes(k))) throw Error('RECIPE_SCHEMA_UNSUPPORTED');
  return buildBatchRecipe({
    title: value.title, note: value.note,
    policy: value.policy,
  });
}
export function recipeApplyPreview(recipe, { hasSelectedSources = false } = {}) {
  const valid = parseBatchRecipe(JSON.stringify(recipe));
  return freeze({
    policy: valid.policy,
    mustRebuildPairing: true,
    mustRevalidateSourceIdentity: true,
    mustRecheckOutputConflicts: true,
    mustReauthorizeDirectory: true,
    executionAuthorized: false,
    notice: hasSelectedSources
      ? '已加载配方规则。现有素材须重新配对和预检；未恢复历史目录权限与输出。'
      : '已加载配方规则。请重新选择媒体、字幕和字体，并审核拟输出任务。',
  });
}
