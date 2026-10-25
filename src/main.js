import './style.css';
import './workbench.css';
import './softmux-10.14.css';
import './softmux-figma-tablet.css';
import {
  mountSoftmux1014Workbench,
  updateSoftmux1014SourceSections,
} from './softmux-10.14-workbench.js';
import { buildSourceObjectSections } from './source-object-sections.js';
import { captureSourceAttachmentUndo, sealSourceAttachmentUndo, planSourceAttachmentUndo } from './source-attachment-undo.js';
import { PRODUCT_PACKAGE_VERSION } from './product-version.js';
import { setupWorkbenchNavigation } from './workbench-navigation.js';
import { focusUpdatedInventoryItem } from './inventory-focus.js';
import { setupObjectEditor } from './object-editor.js';
import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { stageBrowserPrimarySource } from './ffmpeg-browser-source-staging.js';
import { auditMuxProbe, chapterAuditExpectation } from './mux-audit.js';
import { auditProducedFontAttachments } from './output-font-payload-audit.js';
import { auditProducedAssEvents } from './ass-event-output-audit.js';
import { auditProducedAssStyles } from './ass-style-output-audit.js';
import { auditProducedSubripCues } from './subrip-output-audit.js';
import { auditPreservedOriginalAttachmentData } from './original-attachment-payload-audit.js';
import { auditSourceAttachmentDelivery } from './source-attachment-delivery-evidence.js';
import { buildProbeArgs, requireObservedSourceStreams } from './probe-policy.js';
import {
  audioIdentityFromProbe,
  identityMismatchMessage,
  isMatroskaIdentity,
  isSupportedVideoIdentity,
  sniffFileContainer,
  sniffedVideoIdentity,
  sourceVirtualSuffix,
  videoIdentityFromProbe,
} from './media-identity.js';
import {
  COMPATIBILITY_STATE,
  compatibilityPlanMessages,
  resolveMuxCompatibility,
  summarizeCompatibility,
} from './compatibility.js';
import { buildMuxCommand, dispositionValue, normalizeTrackLanguage } from './mux-command.js';
import { inspectMatroskaPreservation, preservationBlockMessage } from './preservation-preflight.js';
import { preservationReadiness } from './preservation-readiness.js';
import { resolveContainerCapabilities, summarizeContainerCapability } from './container-capabilities.js';
import { buildBatchRecipe, stringifyBatchRecipe, parseBatchRecipe, recipeApplyPreview, BATCH_RECIPE_MAX_BYTES } from './batch-recipe.js';
import {
  buildBatchRecipeV2,stringifyBatchRecipeV2,parseBatchRecipeV2,
  previewBatchRecipeV2,captureBatchRecipeV2Binding,
  verifyBatchRecipeV2Binding,applyBatchRecipeV2ToPairing,
  setCurrentBatchTaskMetadata,projectCurrentBatchTaskMetadata,
  BATCH_RECIPE_V2_MAX_BYTES,
} from './batch-recipe-v2.js';
import { assignUniqueAttachmentNames, dedupeFilesBySha256, sha256Hex } from './file-dedupe.js';
import { createMuxReport, reportFilename, serializeMuxReport } from './mux-report.js';
import { findExistingBatchOutputs, writeNewBatchArtifactPair } from './batch-output.js';
import { createBatchResultUrlRegistry } from './batch-result-urls.js';
import { createBatchSaveRetryRegistry } from './batch-save-retry.js';
import { createSingleOutputDirectorySaveSession } from './single-output-directory-save.js';
import { runFrozenBatchQueue } from './batch-runner.js';
import { createFrozenBatchMuxContext } from './batch-mux-context.js';
import { formatBatchTerminalStatus, combineBatchRetryTerminal } from './batch-status.js';
import { freezeBatchJobPlan, createBatchJobLedger, BATCH_JOB_STATES } from './batch-job-plan.js';
import { identifyImportedAsset, assetIntakeKey, planIncomingAssetIntake, resolveImportedRoles, resolveBatchImportedAssets, ASSET_STATUS } from './asset-intake.js';
import { buildContainerTreeModel } from './container-tree.js';
import { outputCompositionFileKey } from './output-composition.js';
import { buildContainerDocument, reconcileContainerSelection } from './container-document.js';
import { createContainerProjectFromProjection, createEditedContainerProjectFromProjection, serializeContainerProject } from './container-project.js';
import { parseContainerProjectDraft, compareContainerProjectDraft, PROJECT_IMPORT_MAX_BYTES } from './container-project-import.js';
import { auditDetachedContainerProjectIntentChain } from './container-project-intent-audit.js';
import { previewDetachedProjectIntentConflicts } from './container-project-conflict-preview.js';
import { prepareVerifiedTrackReplay, applyPreparedTrackReplay, revertPreparedTrackReplay } from './container-project-restore.js';
import { createLiveSourceTrackSession } from './live-source-track-authority.js';
import {
  createLiveExternalAssetSession, commitLiveExternalAssetChanges,
  inspectLiveExternalAssets, rebindLiveExternalFontInventory,
} from './live-external-asset-authority.js';
import {
  createLiveWorkspaceAuthority, commitLiveWorkspaceChange,
  inspectLiveWorkspaceAuthority,
} from './live-container-workspace-authority.js';
import {
  exportExternalMetadataCheckpoint, parseExternalMetadataCheckpoint,
  prepareExternalMetadataRecovery, applyPreparedExternalRecovery,
  undoAppliedExternalRecovery,
} from './portable-external-project-recovery.js';
import { PROJECT_SOURCE_HASH_MAX_BYTES, hashBoundedProjectSource, attachContainerProjectSourceDigest, verifyContainerProjectSourceDigest } from './container-project-source-proof.js';
import { projectSourceStructureEvidence, projectActualOutputEvidence } from './container-workbench-evidence.js';
import { serializePortableWorkspaceBundle, parsePortableWorkspaceBundle, PORTABLE_WORKSPACE_BUNDLE_MAX_BYTES } from './portable-workspace-bundle.js';
import { auditS12WorkbenchStructure, formatS12WorkbenchStructure } from './s12-workbench-structure-audit.js';
import { setupAttachmentExtractionUI } from './attachment-extraction-ui.js';
import { setupExistingAttachmentImpactUI } from './existing-attachment-impact-ui.js';
import { setupExistingMkvLimitedAppendUI } from './existing-mkv-limited-append-ui.js';
import { setupExistingMkvSameSizeAttachmentReplaceUI } from './existing-mkv-same-size-attachment-replace-ui.js';
import { setupReservedVoidFileDataUI } from './existing-mkv-reserved-void-filedata-ui.js';
import { setupTailAttachmentResizeUI } from './existing-mkv-tail-attachment-ui.js';
import { setupNonterminalAttachmentRelayUI } from './existing-mkv-nonterminal-attachment-ui.js';
import { setupExistingMkvRoutedEditorUI } from './p2-existing-mkv-writer-router-ui.js';
import { setupMatroskaInlineMetadataUI } from './p2-matroska-inline-metadata-ui.js';
import { setupPngOnlyExperimentUI } from './png-only-experiment-ui.js';
import { setupMultiAttachmentExperimentUI } from './multi-attachment-experiment-ui.js';
import { captureSubtitleExecutionWitness, validateSubtitleExecutionWitness, verifyStagedSubtitleCommandParity } from './subtitle-execution-gate.js';
import { classifyBrowserWorkload, classifyMuxSourceSize, MUX_SOURCE_MEMORY_WARNING, formatBytes, sumFileSizes } from './workload.js';
import { formatOperationError } from './error-feedback.js';
import {
  collectSubtitleInputs,
  identifySubtitleInputs,
  inferredSubtitleMetadata,
  isAssLikeSubtitle,
   isSupportedSubtitleFile,
  isTextSubtitle,
  subtitleFormatInfo,
  subtitleTrackKey,
  visibleTextForPlainSubtitle,
} from './subtitle-format.js';
import { subsetFontItems } from './font-subset.js';
import {
  fontIdentityMismatchMessage,
  fontMimeType,
  fontVirtualSuffix,
  identifyFontFile,
  isSupportedFontIdentity,
  normalizedFontAttachmentName,
} from './font-identity.js';
import {
  batchSubtitleSummary,
  buildBatchJobs,
  buildBatchJobsFromCollected,
  identifyBatchFonts,
  identifyBatchVideos,
  fileIdentity,
  mergeFileSelections,
} from './batch.js';
import {
  analyzeAssFontUsage,
  checkFontCharacters,
  forceAssFontFamily,
  preferredAssFontFamily,
  readFontDescriptors,
  scoreFontFaceMatch,
} from './ass-font-rewrite.js';

const $ = (id) => document.getElementById(id);
// Independent read-only tool: no mutation of the video-rooted FFmpeg inputs.
setupAttachmentExtractionUI({
  input: $('attachmentInspectInput'),
  list: $('attachmentInspectList'),
  status: $('attachmentInspectStatus'),
});
setupExistingAttachmentImpactUI({
  input: $('existingImpactInput'),
  inventory: $('existingImpactInventory'),
  status: $('existingImpactStatus'),
  summary: $('existingImpactSummary'),
});
setupMatroskaInlineMetadataUI({
  sourceInput: $('p2MetadataSource'),
  fieldSelect: $('p2MetadataField'),
  newText: $('p2MetadataNewText'),
  review: $('p2MetadataReview'),
  inspectStatus: $('p2MetadataStatus'),
  prepare: $('p2MetadataPrepare'),
  save: $('p2MetadataSave'),
  evidence: $('p2MetadataEvidence'),
});
setupExistingMkvRoutedEditorUI({
  sourceInput: $('existingMkvRoutedSource'),
  replacementInput: $('existingMkvRoutedReplacement'),
  targetSelect: $('existingMkvRoutedTarget'),
  review: $('existingMkvRoutedReview'),
  prepareButton: $('existingMkvRoutedPrepare'),
  saveButton: $('existingMkvRoutedSave'),
  inventory: $('existingMkvRoutedInventory'),
  status: $('existingMkvRoutedStatus'),
  evidence: $('existingMkvRoutedEvidence'),
});
setupNonterminalAttachmentRelayUI({
  sourceInput: $('existingMkvRelaySource'),
  replacementInput: $('existingMkvRelayReplacement'),
  targetSelect: $('existingMkvRelayTarget'),
  review: $('existingMkvRelayReview'),
  prepareButton: $('existingMkvRelayPrepare'),
  saveButton: $('existingMkvRelaySave'),
  status: $('existingMkvRelayStatus'),
  inventory: $('existingMkvRelayInventory'),
  evidence: $('existingMkvRelayEvidence'),
});
setupTailAttachmentResizeUI({
  sourceInput: $('existingMkvTailSource'),
  replacementInput: $('existingMkvTailReplacement'),
  targetSelect: $('existingMkvTailTarget'),
  review: $('existingMkvTailReview'),
  prepareButton: $('existingMkvTailPrepare'),
  saveButton: $('existingMkvTailSave'),
  status: $('existingMkvTailStatus'),
  evidence: $('existingMkvTailEvidence'),
  inventory: $('existingMkvTailInventory'),
});
setupReservedVoidFileDataUI({
  sourceInput: $('existingMkvReservedVoidSource'),
  targetSelect: $('existingMkvReservedVoidTarget'),
  replacementInput: $('existingMkvReservedVoidReplacement'),
  review: $('existingMkvReservedVoidReview'),
  prepareButton: $('existingMkvReservedVoidPrepare'),
  saveButton: $('existingMkvReservedVoidSave'),
  inventory: $('existingMkvReservedVoidInventory'),
  status: $('existingMkvReservedVoidStatus'),
  evidence: $('existingMkvReservedVoidEvidence'),
});
setupExistingMkvSameSizeAttachmentReplaceUI({
  sourceInput: $('existingMkvSameSizeSource'),
  replacementInput: $('existingMkvSameSizeReplacement'),
  targetSelect: $('existingMkvSameSizeTarget'),
  review: $('existingMkvSameSizeReview'),
  prepareButton: $('existingMkvSameSizePrepare'),
  saveButton: $('existingMkvSameSizeSave'),
  status: $('existingMkvSameSizeStatus'),
  evidence: $('existingMkvSameSizeEvidence'),
  inventory: $('existingMkvSameSizeInventory'),
});
setupExistingMkvLimitedAppendUI({
  sourceInput: $('existingMkvLimitedSource'),
  attachmentInput: $('existingMkvLimitedAttachment'),
  filenameInput: $('existingMkvLimitedFilename'),
  mimeInput: $('existingMkvLimitedMime'),
  review: $('existingMkvLimitedReview'),
  prepareButton: $('existingMkvLimitedPrepare'),
  saveButton: $('existingMkvLimitedSave'),
  status: $('existingMkvLimitedStatus'),
  evidence: $('existingMkvLimitedEvidence'),
  inventory: $('existingMkvLimitedInventory'),
});
setupPngOnlyExperimentUI({
  input: $('pngOnlyCreateInput'),
  prepare: $('pngOnlyPrepareButton'),
  save: $('pngOnlySaveButton'),
  status: $('pngOnlyExperimentStatus'),
});
setupMultiAttachmentExperimentUI({
  input: $('multiAttachmentCreateInput'),
  inventory: $('multiAttachmentCreateInventory'),
  review: $('multiAttachmentReview'),
  prepare: $('multiAttachmentPrepareButton'),
  save: $('multiAttachmentSaveButton'),
  status: $('multiAttachmentExperimentStatus'),
});
setupObjectEditor(document.querySelector('.editor-grid'));
setupWorkbenchNavigation(document.querySelector('.workbench-jump-nav'));

const videoInput = $('videoInput');
const videoIdentityLabel = $('videoIdentity');
const audioInput = $('audioInput');
const subInput = $('subInput');
const fontInput = $('fontInput');
const unifiedAssetInput = $('unifiedAssetInput');
const unifiedFolderInput = $('unifiedFolderInput');
const assetDropzone = $('assetDropzone');
const assetInventory = $('assetInventory');
const assetInspectorHost = $('assetInspectorHost');
const assetImportStatus = $('assetImportStatus');
const outputCompositionPanel = $('outputCompositionPanel');
const compositionTracks = $('compositionTracks');
const compositionCount = $('compositionCount');
const compositionChanges = $('compositionChanges');
const compositionIssues = $('compositionIssues');
const preservationReadinessEl = $('preservationReadiness');
const containerCapabilitySummary = $('containerCapabilitySummary');
const containerCapabilityDetailsList = $('containerCapabilityDetailsList');
const preservationReadinessTitle = $('preservationReadinessTitle');
const preservationReadinessDescription = $('preservationReadinessDescription');
const compositionSourceEvidence = $('compositionSourceEvidence');
const compositionSourceSummary = $('compositionSourceSummary');
const compositionSourceEvidenceList = $('compositionSourceEvidenceList');
const outputEvidencePanel = $('outputEvidencePanel');
const singleDirectoryActions = $('singleDirectoryActions');
const singleChooseDirectoryBtn = $('singleChooseDirectoryBtn');
const singleRetryDirectoryBtn = $('singleRetryDirectoryBtn');
const singleDirectorySaveStatus = $('singleDirectorySaveStatus');
const outputEvidenceTitle = $('outputEvidenceTitle');
const outputEvidenceScopeState = $('outputEvidenceScopeState');
const outputEvidenceName = $('outputEvidenceName');
const outputEvidenceFacts = $('outputEvidenceFacts');
const outputEvidenceIssues = $('outputEvidenceIssues');
const outputEvidenceRevision = $('outputEvidenceRevision');
const outputIndexInspectBtn = $('outputIndexInspectBtn');
const outputIndexResult = $('outputIndexResult');
const sourceFilesDetails = $('sourceFilesDetails');
const compositionMuxBtn = $('compositionMuxBtn');
const containerProjectExportBtn = $('containerProjectExportBtn');
const workspaceBundleExportBtn = $('workspaceBundleExportBtn');
const workspaceBundleImportInput = $('workspaceBundleImportInput');
const workspaceBundleStatus = $('workspaceBundleStatus');
const containerProjectImportInput = $('containerProjectImportInput');
const containerProjectImportReview = $('containerProjectImportReview');
const containerProjectIntentReview = $('containerProjectIntentReview');
const containerProjectIntentSummary = $('containerProjectIntentSummary');
const containerProjectIntentList = $('containerProjectIntentList');
const containerProjectConflictReview = $('containerProjectConflictReview');
const containerProjectConflictSummary = $('containerProjectConflictSummary');
const containerProjectConflictList = $('containerProjectConflictList');
const containerProjectVerifySourceBtn = $('containerProjectVerifySourceBtn');
const containerProjectHashActions = $('containerProjectHashActions');
const containerProjectHashProgress = $('containerProjectHashProgress');
const containerProjectHashCancelBtn = $('containerProjectHashCancelBtn');
const containerProjectRestorePanel = $('containerProjectRestorePanel');
const containerProjectRestoreConfirm = $('containerProjectRestoreConfirm');
const containerProjectRestoreBtn = $('containerProjectRestoreBtn');
const containerProjectRestoreUndoBtn = $('containerProjectRestoreUndoBtn');
const containerProjectRestoreStatus = $('containerProjectRestoreStatus');
const editorMuxBtn = $('editorMuxBtn');
const objectEditorBack = $('objectEditorBack');
const objectSelectionHint = $('objectSelectionHint');
const fontMode = $('fontMode');
const fontModeHint = $('fontModeHint');
const fontSubsetEnabled = $('fontSubsetEnabled');
const batchUnifiedInput = $('batchUnifiedInput');
const batchUnifiedFolderInput = $('batchUnifiedFolderInput');
const batchAssetDropzone = $('batchAssetDropzone');
const batchAssetInventory = $('batchAssetInventory');
const batchAssetStatus = $('batchAssetStatus');
const batchVideoInput = $('batchVideoInput');
const batchVideoFolderInput = $('batchVideoFolderInput');
const batchSubtitleInput = $('batchSubtitleInput');
const batchSubtitleFolderInput = $('batchSubtitleFolderInput');
const batchFontInput = $('batchFontInput');
const batchFontFolderInput = $('batchFontFolderInput');
const batchVideoName = $('batchVideoName');
const batchVideoFolderName = $('batchVideoFolderName');
const batchSubtitleName = $('batchSubtitleName');
const batchSubtitleFolderName = $('batchSubtitleFolderName');
const batchFontName = $('batchFontName');
const batchFontFolderName = $('batchFontFolderName');
const batchPlan = $('batchPlan');
const batchReviewSummary = $('batchReviewSummary');
const batchJobInspector = $('batchJobInspector');
const batchStartBtn = $('batchStartBtn');
const batchCancelBtn = $('batchCancelBtn');
const batchPreserveAttachments = $('batchPreserveAttachments');
const batchFontSubsetEnabled = $('batchFontSubsetEnabled');
const batchSubsetScope = $('batchSubsetScope');
const batchRecipeExportBtn = $('batchRecipeExportBtn');
const batchRecipeImportInput = $('batchRecipeImportInput');
const batchRecipeNotice = $('batchRecipeNotice');
const batchRecipeV2ExportBtn=$('batchRecipeV2ExportBtn');
const batchRecipeV2ImportInput=$('batchRecipeV2ImportInput');
const batchRecipeV2ConfirmBtn=$('batchRecipeV2ConfirmBtn');
const batchRecipeV2Notice=$('batchRecipeV2Notice');
const batchRecipeV2Review=$('batchRecipeV2Review');
const batchRecipeV2ReviewItems=$('batchRecipeV2ReviewItems');
const batchOutputDirBtn = $('batchOutputDirBtn');
const batchOutputDirStatus = $('batchOutputDirStatus');
const batchStatus = $('batchStatus');
const batchResults = $('batchResults');
const newAudioList = $('newAudioList');
const newSubtitleList = $('newSubtitleList');
const preserveAttachments = $('preserveAttachments');
const appendPreserveAll = $('appendPreserveAll');
const attachmentList = $('attachmentList');
const scanTracksBtn = $('scanTracksBtn');
const trackList = $('trackList');
const containerChangeSummary = $('containerChangeSummary');
const refreshPlanBtn = $('refreshPlanBtn');
const muxPlan = $('muxPlan');
const planWarnings = $('planWarnings');
const muxBtn = $('muxBtn');
const cancelBtn = $('cancelBtn');
const status = $('status');
const logEl = $('log');
const bar = $('bar');
const downloadLink = $('downloadLink');
const reportLink = $('reportLink');
const auditResult = $('auditResult');
const workloadNotice = $('workloadNotice');
const trackBulkTools = $('trackBulkTools');
const bulkLanguage = $('bulkLanguage');
const applyAudioLanguage = $('applyAudioLanguage');
const applySubtitleLanguage = $('applySubtitleLanguage');
const firstAudioDefault = $('firstAudioDefault');
const firstSubtitleDefault = $('firstSubtitleDefault');
const clearAllDefaults = $('clearAllDefaults');
const keepAllAudio = $('keepAllAudio');
const dropAllAudio = $('dropAllAudio');
const keepAllSubtitles = $('keepAllSubtitles');
const dropAllSubtitles = $('dropAllSubtitles');
const resetAudioMetadata = $('resetAudioMetadata');
const resetSubtitleMetadata = $('resetSubtitleMetadata');
const attachmentBulkTools = $('attachmentBulkTools');
const keepAllAttachments = $('keepAllAttachments');
const dropAllAttachments = $('dropAllAttachments');
const resetAttachmentMetadata = $('resetAttachmentMetadata');
const previewImage = $('previewImage');
const previewEmpty = $('previewEmpty');
const previewStatus = $('previewStatus');
const previewSubtitleSelect = $('previewSubtitleSelect');
const previewRefreshBtn = $('previewRefreshBtn');
const previewTimeInput = $('previewTimeInput');
const previewPrevCueBtn = $('previewPrevCueBtn');
const previewNextCueBtn = $('previewNextCueBtn');
const previewDialog = $('previewDialog');
const previewDialogImage = $('previewDialogImage');
const previewDialogClose = $('previewDialogClose');
const mobilePreviewToggle = $('mobilePreviewToggle');
const mobilePlanToggle = $('mobilePlanToggle');
const previewCard = document.querySelector('.subtitle-preview-card');
const planPanel = document.querySelector('.output-section.plan-panel');
const fullMuxPlanDetails = $('fullMuxPlanDetails');

document.documentElement.dataset.theme = 'dark';
document.documentElement.dataset.themePreference = 'dark';

const phoneLayoutQuery = window.matchMedia('(max-width: 600px)');
const tabletLayoutQuery = window.matchMedia('(min-width: 601px) and (max-width: 1359px) and (hover: none) and (pointer: coarse)');

function applyResponsiveDisclosureState() {
  if (!previewCard || !planPanel) return;

  const isPhone = phoneLayoutQuery.matches;
  const isTablet = tabletLayoutQuery.matches;
  const previewUsesDisclosure = isPhone || isTablet;

  if (previewUsesDisclosure) {
    if (!previewCard.dataset.mobileDisclosureInitialized) {
      previewCard.dataset.mobileCollapsed = 'true';
      previewCard.dataset.mobileDisclosureInitialized = 'true';
    }
  } else {
    delete previewCard.dataset.mobileCollapsed;
    delete previewCard.dataset.mobileDisclosureInitialized;
  }

  if (isPhone) {
    if (!planPanel.dataset.mobileDisclosureInitialized) {
      planPanel.dataset.mobileCollapsed = 'true';
      planPanel.dataset.mobileDisclosureInitialized = 'true';
    }
  } else {
    delete planPanel.dataset.mobileCollapsed;
    delete planPanel.dataset.mobileDisclosureInitialized;
  }

  const previewCollapsed = previewUsesDisclosure && previewCard.dataset.mobileCollapsed === 'true';
  const planCollapsed = isPhone && planPanel.dataset.mobileCollapsed === 'true';

  mobilePreviewToggle?.setAttribute('aria-expanded', String(!previewCollapsed));
  mobilePlanToggle?.setAttribute('aria-expanded', String(!planCollapsed));
  if (mobilePreviewToggle) mobilePreviewToggle.textContent = previewCollapsed ? '展开' : '收起';
  if (mobilePlanToggle) mobilePlanToggle.textContent = planCollapsed ? '展开' : '收起';
}

mobilePreviewToggle?.addEventListener('click', () => {
  previewCard.dataset.mobileCollapsed = previewCard.dataset.mobileCollapsed === 'true' ? 'false' : 'true';
  applyResponsiveDisclosureState();
});

mobilePlanToggle?.addEventListener('click', () => {
  planPanel.dataset.mobileCollapsed = planPanel.dataset.mobileCollapsed === 'true' ? 'false' : 'true';
  if (fullMuxPlanDetails) fullMuxPlanDetails.open = planPanel.dataset.mobileCollapsed === 'false';
  applyResponsiveDisclosureState();
});
fullMuxPlanDetails?.addEventListener('toggle', () => {
  if (phoneLayoutQuery.matches) {
    planPanel.dataset.mobileCollapsed = fullMuxPlanDetails.open ? 'false' : 'true';
    applyResponsiveDisclosureState();
  }
});

phoneLayoutQuery.addEventListener?.('change', applyResponsiveDisclosureState);
tabletLayoutQuery.addEventListener?.('change', applyResponsiveDisclosureState);
applyResponsiveDisclosureState();


const languageTitles = {
  und: 'ASS 字幕',
  zho: '简体中文 ASS',
  eng: 'English ASS',
  jpn: '日本語 ASS',
  kor: '한국어 ASS',
  mul: '多语言 ASS',
};

const trackLanguageChoices = [
  ['und', '未指定'],
  ['zho', '中文'],
  ['zh-Hans', '简体中文 · BCP 47'],
  ['zh-Hant', '繁体中文 · BCP 47'],
  ['eng', 'English'],
  ['jpn', '日本語'],
  ['kor', '한국어'],
  ['rus', 'Русский'],
  ['deu', 'Deutsch'],
  ['fra', 'Français'],
  ['spa', 'Español'],
  ['por', 'Português'],
  ['ita', 'Italiano'],
  ['ara', 'العربية'],
  ['hin', 'हिन्दी'],
  ['mul', '多语言'],
];

function languageSelectOptions(current = 'und') {
  const value = String(current || 'und');
  const known = new Set(trackLanguageChoices.map(([code]) => code));
  const choices = known.has(value)
    ? trackLanguageChoices
    : [[value, `${value} · 自定义`], ...trackLanguageChoices];
  return choices.map(([code, label]) =>
    `<option value="${escapeHtml(code)}" ${code === value ? 'selected' : ''}>${escapeHtml(label)}</option>`
  ).join('');
}

const ffmpeg = new FFmpeg();
let loaded = false;
let running = false;
let scanning = false;
let containerScanGeneration = 0;
let containerAutoScanSuppressedKey = '';
let containerScanPromise = Promise.resolve();
let cancelRequested = false;
let outputURL = null;
let reportURL = null;
let trackState = null;
let scannedSourceFile = null;
let liveSourceTrackSession = null;
let externalAudioState = [];
let newSubtitleState = [];
let liveExternalAssetSession = null;
let liveWorkspaceAuthority = null;
// One undo receipt, never another editable trackState / project authority.
let recentSourceAttachmentUndo = null;
let externalAssetAuthorityEpoch = 0;
let externalAssetPendingTaskRebind = false;
let previewImageURL = null;
let previewGeneration = 0;
let previewing = false;
let batchImportEntries = [];
let batchImportInProgress = false;
let batchUnifiedMode = false;
let batchInternalAdapterUpdate = false;
let batchRunning = false;
let batchStartPending = false;
let batchStartCancelled = false;
let batchCancelRequested = false;
let batchOutputDirectoryHandle = null;
const batchResultUrls = createBatchResultUrlRegistry();
const batchSaveRetries = createBatchSaveRetryRegistry();
let batchSaveRetryBusy = false;
let retainedBatchResults = [];
let retainedBatchLedger = null;
let retainedBatchExecution = null;
let retainedBatchTerminal = { cancelled: false, fatalError: '' };
let pendingBatchRecipeV2=null;
let approvedBatchRecipeV2=null;
let currentBatchTaskMetadata=new Map();
let batchPlanGeneration = 0;
let batchPlanPromise = Promise.resolve(null);
let latestBatchPairing = null;
let activeBatchJobLedger = null;
const batchManualAssignments = new Map();
let selectedBatchVideoFile = null;
const batchVideoIdentityCache = new Map();
const batchFontIdentityCache = new Map();
let fontInspectGeneration = 0;
let fontInspectPromise = Promise.resolve();
let fontInspectState = {
  status: 'idle',
  selectionKey: '',
  recognition: { recognized: [], ignored: [] },
};
let previewCueTimes = [];
let previewCueIndex = -1;
let videoSniffGeneration = 0;
let videoSniffPromise = Promise.resolve();
let preservationPreviewGeneration = 0;
let preservationPreview = { source: null, state: 'idle', inspection: null };
let importedAssetEntries = [];
const containerTreeExpansion = new Map();
const containerTreeAdvancedExpansion = new Map();
const containerTreeSelectedItem = new Map();
let showAdvancedSourceTools = false;
let sourceInspectorMarkup = '';
let chosenImportSourceKey = '';
let focusedImportedAssetKey = '';
let selectedCompositionId = '';
let lastActualOutput = null;
// The only save authority is the exact currently retained generated pair.
const singleDirectorySession=createSingleOutputDirectorySaveSession();
let singleDirectoryHandle=null;
let singleDirectorySaveBusy=false;
let singleDirectoryStatusMessage='';
let lastOutputIndexAudit = null;
let outputIndexAuditPending = false;
let outputIndexAuditSequence = 0;
let lastCompositionSourceKey = '';
let currentProjectSourceProjection = null;
let currentProjectSourceFile = null;
let importedProjectForReview = null;
let detachedSourceProof = null;
let lastProjectRestore = null;
let sourceDigestCheckInProgress = false;
let projectDigestExportInProgress = false;
let workspaceBundleBusy = false;
let activeProjectHash = null;
let importInProgress = false;
let importPendingCount = 0;
let videoSniffState = {
  status: 'idle',
  fileKey: '',
  identity: null,
};
let subtitleInspectGeneration = 0;
let subtitleInspectPromise = Promise.resolve();
let subtitleInspectState = {
  status: 'idle',
  selectionKey: '',
  collected: null,
};
const batchSubtitleIdentityCache = new Map();

ffmpeg.on('log', ({ message }) => {
  logEl.textContent += message + '\n';
  logEl.scrollTop = logEl.scrollHeight;
});

ffmpeg.on('progress', ({ progress }) => {
  if ((running || scanning) && Number.isFinite(progress) && progress >= 0) {
    bar.style.width = `${Math.min(95, Math.max(8, progress * 95))}%`;
  }
});

function ext(name) {
  const m = String(name || '').toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : '';
}

function safeOutputName(videoName) {
  return videoName.replace(/\.[^.]+$/, '') + '.mkv';
}

// A selected FileList is the explicit identity boundary. Browsers may hand
// out new File wrappers on repeated reads even though selection did not
// change. Pin each exact File grant to its FileList generation and invalidate
// it on an actual picker change, never by matching display metadata.
const liveFileListPins = new WeakMap();
function exactSelectionFiles(input) {
  const selection=input.files;
  if(!selection)return [];
  let pinned=liveFileListPins.get(input);
  if(!pinned || pinned.list!==selection) {
    pinned={list:selection,files:Array.from(selection)};
    liveFileListPins.set(input,pinned);
  }
  return pinned.files.slice();
}
function invalidateExactSelectionFiles(input) {
  liveFileListPins.delete(input);
}
function selectedFonts() {
  return exactSelectionFiles(fontInput);
}

function fontSelectionKey(files = selectedFonts()) {
  return Array.from(files || [])
    .map((file) => fileKey(file))
    .sort()
    .join('\n');
}

function selectedFontRecognition() {
  const files = selectedFonts();
  if (!files.length) return { recognized: [], ignored: [] };
  const key = fontSelectionKey(files);
  if (
    fontInspectState.status === 'ready' &&
    fontInspectState.selectionKey === key &&
    fontInspectState.recognition
  ) {
    return fontInspectState.recognition;
  }
  return { recognized: [], ignored: [] };
}

function fontIdentityPending() {
  const files = selectedFonts();
  if (!files.length) return false;
  return (
    fontInspectState.status === 'pending' &&
    fontInspectState.selectionKey === fontSelectionKey(files)
  );
}

async function inspectSelectedFonts() {
  const files = selectedFonts();
  const selectionKey = fontSelectionKey(files);
  const generation = ++fontInspectGeneration;

  if (!files.length) {
    fontInspectState = {
      status: 'idle',
      selectionKey: '',
      recognition: { recognized: [], ignored: [] },
    };
    updateUI();
    return fontInspectState.recognition;
  }

  fontInspectState = {
    status: 'pending',
    selectionKey,
    recognition: null,
  };
  updateUI();

  const recognition = await identifyBatchFonts(files, {
    cache: batchFontIdentityCache,
    concurrency: 4,
  });
  if (
    generation !== fontInspectGeneration ||
    fontSelectionKey(selectedFonts()) !== selectionKey
  ) {
    return null;
  }

  fontInspectState = {
    status: 'ready',
    selectionKey,
    recognition,
  };
  updateUI();
  return recognition;
}

function selectedExternalAudioFiles() {
  return exactSelectionFiles(audioInput);
}

function selectedSubtitleRawFiles() {
  return exactSelectionFiles(subInput);
}

function subtitleSelectionKey(files = selectedSubtitleRawFiles()) {
  return Array.from(files || [])
    .map((file) => fileKey(file))
    .sort()
    .join('\n');
}

function selectedSubtitleTrackInputs() {
  const files = selectedSubtitleRawFiles();
  const key = subtitleSelectionKey(files);
  if (
    subtitleInspectState.status === 'ready' &&
    subtitleInspectState.selectionKey === key &&
    subtitleInspectState.collected
  ) {
    return subtitleInspectState.collected;
  }
  if (!files.length) return collectSubtitleInputs([]);
  return {
    tracks: [],
    orphanSidecars: [],
    invalid: [],
    identities: [],
    mismatches: [],
  };
}

function subtitleIdentityPending() {
  const files = selectedSubtitleRawFiles();
  if (!files.length) return false;
  return (
    subtitleInspectState.status === 'pending' &&
    subtitleInspectState.selectionKey === subtitleSelectionKey(files)
  );
}

async function inspectSelectedSubtitles() {
  const files = selectedSubtitleRawFiles();
  const selectionKey = subtitleSelectionKey(files);
  const generation = ++subtitleInspectGeneration;

  if (!files.length) {
    subtitleInspectState = {
      status: 'idle',
      selectionKey: '',
      collected: collectSubtitleInputs([]),
    };
    syncNewTrackState();
    updateUI();
    return subtitleInspectState.collected;
  }

  subtitleInspectState = {
    status: 'pending',
    selectionKey,
    collected: null,
  };
  // A newly selected FileList invalidates the old editor immediately,
  // before asynchronous subtitle inspection can finish. Otherwise a rapid
  // second-task edit may target an obsolete DOM row and lose the user's title.
  syncNewTrackState();
  updateUI();

  const collected = await identifySubtitleInputs(files, { concurrency: 8 });
  if (
    generation !== subtitleInspectGeneration ||
    subtitleSelectionKey(selectedSubtitleRawFiles()) !== selectionKey
  ) {
    return null;
  }

  subtitleInspectState = {
    status: 'ready',
    selectionKey,
    collected,
  };
  syncNewTrackState();
  updateUI();
  return collected;
}

function selectedSubtitleTracks() {
  return selectedSubtitleTrackInputs().tracks;
}

function selectedSubtitleFiles() {
  return selectedSubtitleTracks().map((track) => track.file);
}

function stripExtension(name) {
  return String(name || '').replace(/\.[^.]+$/, '');
}

function syncNewTrackState() {
  const oldAudio = new Map(externalAudioState.map((item) => [fileKey(item.file), item]));
  externalAudioState = selectedExternalAudioFiles().map((file) => {
    const old = oldAudio.get(fileKey(file));
    return old?.file === file ? old : {
      file,
      language: 'und',
      title: stripExtension(file.name),
      default: false,
      original: false,
      commentary: false,
      hearingImpaired: false,
    };
  });

  const oldSubs = new Map(newSubtitleState.map((item) => [subtitleTrackKey(item), item]));
  const collected = selectedSubtitleTrackInputs();
  newSubtitleState = collected.tracks.map((trackInput, index) => {
    const key = subtitleTrackKey(trackInput);
    const old = oldSubs.get(key);
    if (old && old.file === trackInput.file &&
        old.sidecarFile === (trackInput.sidecarFile || null)) {
      old.file = trackInput.file;
      old.sidecarFile = trackInput.sidecarFile || null;
      old.format = trackInput.format;
      old.identity = trackInput.identity || null;
      old.identityMismatch = trackInput.identityMismatch || '';
      old.displayName = trackInput.displayName || trackInput.file.name;
      return old;
    }
    const format = trackInput.format || subtitleFormatInfo(trackInput.file.name);
    const inferred = inferredSubtitleMetadata(trackInput.file, format);
    return {
      file: trackInput.file,
      sidecarFile: trackInput.sidecarFile || null,
      displayName: trackInput.displayName || trackInput.file.name,
      format,
      identity: trackInput.identity || null,
      identityMismatch: trackInput.identityMismatch || '',
      language: inferred.language,
      title: inferred.title || stripExtension(trackInput.file.name) || languageTitles.und,
      default: index === 0,
      forced: false,
      original: false,
      commentary: false,
      hearingImpaired: false,
    };
  });
  // Selection changes are a new authority generation. Keep the already
  // inspected File objects in legacy executor rows; never serialize grants.
  refreshExternalAssetAuthority();
}

function reconcileLiveWorkspaceAuthority() {
  liveWorkspaceAuthority = createLiveWorkspaceAuthority({
    sourceSession: liveSourceTrackSession,
    externalSession: liveExternalAssetSession,
  });
  return liveWorkspaceAuthority;
}
function liveWorkspaceContext(mode = fontMode.value) {
  return {
    source: videoInput.files?.[0] || null,
    trackState,
    audioRows: externalAudioState, subtitleRows: newSubtitleState,
    fonts: selectedFonts(), mode,
  };
}
function refreshExternalAssetAuthority() {
  liveExternalAssetSession = createLiveExternalAssetSession({
    audioRows:externalAudioState,
    subtitleRows:newSubtitleState,
    fonts:selectedFonts(),
    fontMode:fontMode.value,
  });
  externalAssetAuthorityEpoch++;
  reconcileLiveWorkspaceAuthority();
  return liveExternalAssetSession;
}
function changeExternalAssetFields(changes) {
  try {
    if(!liveExternalAssetSession)refreshExternalAssetAuthority();
    const context={
      audioRows:externalAudioState,subtitleRows:newSubtitleState,
      fonts:selectedFonts(),mode:fontMode.value,
    };
    let owner=liveExternalAssetSession;
    try{
      commitLiveWorkspaceChange(liveWorkspaceAuthority,{
        ...liveWorkspaceContext(),kind:'external-tracks',changes,
      });
    }catch(error){
      if(error?.message!=='EXTERNAL_DOMAIN_INVENTORY_CHANGED')throw error;
      // A browser font picker may replace a same-looking File object without
      // invalidating the subtitle editor. Rebind ONLY the font inventory when
      // every source track File, sidecar, format, identity and canonical field
      // is still exact. Never reconstruct subtitle metadata from filenames.
      const rebound=rebindLiveExternalFontInventory(owner,context);
      commitLiveExternalAssetChanges(rebound,{...context,changes});
      owner=rebound;
    }
    liveExternalAssetSession=owner;
    if(liveWorkspaceAuthority?.externalSession!==owner)
      reconcileLiveWorkspaceAuthority();
    // The immutable owner changed only its font inventory, not its editor
    // rows. Keep the current DOM selection epoch for in-flight field input.
    return true;
  } catch(error) {
    status.textContent='外部轨道领域修改未执行：'+
      (error?.message||String(error))+'。未提交部分变更。';
    return false;
  }
}

// Background readiness refreshes are NOT editor-selection changes. Avoid
// unmounting a current, coherent input mid-keystroke: DOM replacement between
// Playwright/user input and its dispatch can silently restore inferred titles.
// Exact File reference and authority-epoch checks still force a fresh editor
// whenever the source selection actually changes.
function renderedExternalTrackFieldsMatch(container, kind, rows, fields) {
  if (container.dataset.externalDomainEpoch !== String(externalAssetAuthorityEpoch))
    return false;
  const selector = kind === 'audio' ? 'data-new-audio-field' : 'data-new-sub-field';
  if (container.querySelectorAll('[' + selector + ']').length !== rows.length * fields.length)
    return false;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    for (const field of fields) {
      const control = container.querySelector(
        '[' + selector + '="' + field + '"][data-index="' + index + '"]',
      );
      if (!control || (control.type === 'checkbox' ? control.checked : control.value) !== row[field])
        return false;
    }
  }
  return true;
}

function canRetainExternalTrackEditorMarkup() {
  const audio = selectedExternalAudioFiles();
  const subtitles = selectedSubtitleTrackInputs().tracks;
  if (audio.length !== externalAudioState.length ||
      subtitles.length !== newSubtitleState.length ||
      audio.some((file, i) => file !== externalAudioState[i]?.file) ||
      subtitles.some((track, i) =>
        track.file !== newSubtitleState[i]?.file ||
        (track.sidecarFile || null) !== (newSubtitleState[i]?.sidecarFile || null)))
    return false;
  return renderedExternalTrackFieldsMatch(
    newAudioList, 'audio', externalAudioState,
    ['title', 'language', 'default', 'original', 'commentary', 'hearingImpaired'],
  ) && renderedExternalTrackFieldsMatch(
    newSubtitleList, 'subtitle', newSubtitleState,
    ['title', 'language', 'default', 'forced', 'original', 'commentary', 'hearingImpaired'],
  );
}

function renderNewTrackLists() {
  if (canRetainExternalTrackEditorMarkup()) return;
  // Mark the DOM with the exact selection-generation it actually depicts.
  // When a picker replaced File objects, stale form fields from the prior
  // selection must never be copied onto same-named new files.
  newAudioList.dataset.externalDomainEpoch = String(externalAssetAuthorityEpoch);
  newSubtitleList.dataset.externalDomainEpoch = String(externalAssetAuthorityEpoch);
  newAudioList.innerHTML = externalAudioState.length
    ? externalAudioState.map((item, index) => `
      <div class="new-track-row is-audio">
        <div class="new-track-main">
          <strong class="new-track-name">${escapeHtml(item.file.name)}</strong>
          <div class="new-track-fields">
            <select data-new-audio-field="language" data-index="${index}" aria-label="外部音频语言" title="语言代码：${escapeHtml(item.language)}">${languageSelectOptions(item.language)}</select>
            <input data-new-audio-field="title" data-index="${index}" value="${escapeHtml(item.title)}" maxlength="160" aria-label="外部音频标题">
          </div>
        </div>
        <div class="new-track-flags">
          <label><input type="checkbox" data-new-audio-field="default" data-index="${index}" ${item.default ? 'checked' : ''}> Default</label>
          <details class="track-advanced">
            <summary>高级属性</summary>
            <label><input type="checkbox" data-new-audio-field="original" data-index="${index}" ${item.original ? 'checked' : ''}> Original</label>
            <label><input type="checkbox" data-new-audio-field="commentary" data-index="${index}" ${item.commentary ? 'checked' : ''}> Commentary</label>
            <label><input type="checkbox" data-new-audio-field="hearingImpaired" data-index="${index}" ${item.hearingImpaired ? 'checked' : ''}> Hearing impaired</label>
          </details>
        </div>
      </div>`).join('')
    : '<div class="track-empty">未选择外部音频。</div>';

  newSubtitleList.innerHTML = newSubtitleState.length
    ? newSubtitleState.map((item, index) => `
      <div class="new-track-row is-subtitle">
        <div class="new-track-main">
          <strong class="new-track-name">${escapeHtml(item.displayName || item.file.name)} <span class="track-meta">· ${escapeHtml(item.format?.label || subtitleFormatInfo(item.file.name)?.label || 'SUB')}</span></strong>
          ${item.identityMismatch ? `<small class="track-warning">${escapeHtml(item.identityMismatch)} · 已按实际内容识别</small>` : ''}
          <div class="new-track-fields">
            <select data-new-sub-field="language" data-index="${index}" aria-label="字幕语言" title="语言代码：${escapeHtml(item.language)}">${languageSelectOptions(item.language)}</select>
            <input data-new-sub-field="title" data-index="${index}" value="${escapeHtml(item.title)}" maxlength="160" aria-label="字幕标题">
          </div>
        </div>
        <div class="new-track-flags">
          <label><input type="checkbox" data-new-sub-field="default" data-index="${index}" ${item.default ? 'checked' : ''}> Default</label>
          <label><input type="checkbox" data-new-sub-field="forced" data-index="${index}" ${item.forced ? 'checked' : ''}> Forced</label>
          <details class="track-advanced">
            <summary>高级属性</summary>
            <label><input type="checkbox" data-new-sub-field="original" data-index="${index}" ${item.original ? 'checked' : ''}> Original</label>
            <label><input type="checkbox" data-new-sub-field="commentary" data-index="${index}" ${item.commentary ? 'checked' : ''}> Commentary</label>
            <label><input type="checkbox" data-new-sub-field="hearingImpaired" data-index="${index}" ${item.hearingImpaired ? 'checked' : ''}> Hearing impaired</label>
          </details>
        </div>
      </div>`).join('')
    : '<div class="track-empty">未选择字幕。</div>';
}

function fileKey(file) {
  return file ? `${file.name}|${file.size}|${file.lastModified}` : '';
}

function currentPreservationReadiness() {
  return preservationReadiness({
    source: videoInput.files?.[0] || null,
    inspectionSource: preservationPreview.source,
    state: preservationPreview.state,
    inspection: preservationPreview.inspection,
  });
}

function renderPreservationReadiness() {
  if (!preservationReadinessEl) return;
  const model = currentPreservationReadiness();
  preservationReadinessEl.dataset.status = model.status;
  preservationReadinessEl.hidden = model.status === 'idle' || model.status === 'not-applicable';
  preservationReadinessTitle.textContent = model.title;
  preservationReadinessDescription.textContent = model.description;
}

/** Advisory preview only; the executor re-runs inspectMatroskaPreservation. */
function beginPreservationPreview() {
  const source = videoInput.files?.[0] || null;
  const generation = ++preservationPreviewGeneration;
  // The already-authorized batch runner stages through old hidden File inputs.
  // Its own independent frozen-plan preflight remains authoritative; avoid
  // starting a competing asynchronous preview that can mutate that adapter UI.
  if (batchRunning) {
    preservationPreview = { source, state: 'not-applicable', inspection: null };
    renderPreservationReadiness();
    return;
  }
  preservationPreview = { source, state: source ? 'checking' : 'idle', inspection: null };
  renderPreservationReadiness();
  if (!source) return;
  void Promise.resolve(videoSniffPromise).then(async () => {
    if (generation !== preservationPreviewGeneration || videoInput.files?.[0] !== source) return;
    // Re-sniff this exact File, not only the name/size-keyed shared header
    // cache: native pickers can replace the FileList without a change event.
    const identity = await sniffFileContainer(source);
    if (generation !== preservationPreviewGeneration || videoInput.files?.[0] !== source) return;
    // Only a positively identified non-Matroska container may skip EBML
    // structural inspection. "unknown" is NOT evidence of non-Matroska.
    if (['iso-bmff', 'mov', 'webm'].includes(identity.container)) {
      preservationPreview = { source, state: 'not-applicable', inspection: null };
    } else {
      const inspection = await inspectMatroskaPreservation(source);
      if (generation !== preservationPreviewGeneration || videoInput.files?.[0] !== source) return;
      preservationPreview = { source, state: 'ready', inspection };
    }
    updateUI();
  }).catch((error) => {
    if (generation !== preservationPreviewGeneration || videoInput.files?.[0] !== source) return;
    preservationPreview = {
      source, state: 'ready',
      inspection: { state: 'BLOCKED_UNKNOWN', reasons: [error?.message || String(error)] },
    };
    updateUI();
  });
}

function selectedVideoHeaderIdentity(video = videoInput.files[0]) {
  if (!video) return null;
  if (videoSniffState.fileKey !== fileKey(video)) return null;
  return videoSniffState.identity;
}

function currentVideoIsMatroska(video = videoInput.files[0]) {
  if (!video) return false;
  const sameFile = videoSniffState.fileKey === fileKey(video);
  if (sameFile && videoSniffState.status === 'ready') {
    return isMatroskaIdentity(videoSniffState.identity);
  }
  if (sameFile && videoSniffState.status === 'pending') {
    return ext(video.name) === '.mkv';
  }
  return ext(video.name) === '.mkv';
}

function renderVideoIdentityNotice() {
  if (!videoIdentityLabel) return;
  const video = videoInput.files[0];

  if (!video) {
    videoIdentityLabel.textContent = '实际内容：等待选择';
    videoIdentityLabel.dataset.state = 'idle';
    return;
  }

  const sameFile = videoSniffState.fileKey === fileKey(video);
  if (sameFile && videoSniffState.status === 'pending') {
    videoIdentityLabel.textContent = '实际内容：正在读取文件头…';
    videoIdentityLabel.dataset.state = 'pending';
    return;
  }

  const identity = selectedVideoHeaderIdentity(video);
  if (!identity || identity.container === 'unknown') {
    videoIdentityLabel.textContent = '实际内容：文件头未确认；封装时将由 ffprobe 验证';
    videoIdentityLabel.dataset.state = 'unknown';
    return;
  }

  const mismatch = identityMismatchMessage(identity);
  videoIdentityLabel.textContent = mismatch
    ? `实际内容：${identity.containerLabel} · ${mismatch}`
    : `实际内容：${identity.containerLabel}`;
  videoIdentityLabel.dataset.state = mismatch ? 'warning' : 'verified';
}

async function inspectSelectedVideoHeader() {
  const video = videoInput.files[0];
  const generation = ++videoSniffGeneration;

  if (!video) {
    videoSniffState = { status: 'idle', fileKey: '', identity: null };
    updateUI();
    return;
  }

  const key = fileKey(video);
  videoSniffState = { status: 'pending', fileKey: key, identity: null };
  updateUI();

  let detectedMkv = false;
  try {
    const sniffed = await sniffFileContainer(video);
    if (generation !== videoSniffGeneration || fileKey(videoInput.files[0]) !== key) return;

    const identity = sniffedVideoIdentity(video, sniffed);
    videoSniffState = { status: 'ready', fileKey: key, identity };

    detectedMkv = isMatroskaIdentity(identity);
    if (appendPreserveAll && appendPreserveAll.dataset.userTouched !== '1') {
      appendPreserveAll.checked = detectedMkv;
    }
    preserveAttachments.checked = detectedMkv;
  } catch (error) {
    if (generation !== videoSniffGeneration || fileKey(videoInput.files[0]) !== key) return;
    videoSniffState = {
      status: 'ready',
      fileKey: key,
      identity: sniffedVideoIdentity(video, { container: 'unknown', evidence: 'read-error' }),
    };
    logEl.textContent += `WARNING: 无法读取视频文件头，将在执行时交给 ffprobe 验证：${error?.message || error}\n`;
  }

  updateUI();

  // Container discovery is observational: detecting the source must not
  // silently switch the user out of preserve-all mode.
  if (
    detectedMkv &&
    fileKey(videoInput.files[0]) === key &&
    containerAutoScanSuppressedKey !== key &&
    (!trackState || trackState.fileKey !== key) &&
    !isBusy() &&
    !batchRunning
  ) {
    containerScanPromise = scanSourceContainer({ automatic: true });
  }
}
function formatFontSelection(files) {
  if (!files.length) return '未选择';
  if (files.length === 1) return files[0].name;
  const head = files.slice(0, 3).map((file) => file.name).join('、');
  return files.length > 3 ? `${files.length} 个字体：${head}…` : `${files.length} 个字体：${head}`;
}

function selectedInputFiles() {
  return [
    ...Array.from(videoInput.files || []),
    ...selectedExternalAudioFiles(),
    ...selectedSubtitleRawFiles(),
    ...selectedFonts(),
  ];
}

// Read-only warning. The independent FFmpeg admission and data-preservation
// gates remain authoritative; this must not disable the mux action.
function sourceSizeAdvisoryMarkup(file) {
  if (!classifyMuxSourceSize(file).warning) return '';
  return `<details class="mux-source-size-advisory" data-source-size-warning="true">
    <summary title="${escapeHtml(MUX_SOURCE_MEMORY_WARNING)}" aria-label="文件超过 1 GB：查看非阻断内存风险提示">
      <span aria-hidden="true">⚠</span> <span>超过 1 GB</span>
    </summary>
    <span class="mux-source-size-advisory-help">${escapeHtml(MUX_SOURCE_MEMORY_WARNING)}</span>
  </details>`;
}
function renderWorkloadNotice() {
  // 1.0's default composition-first UI can hide the source pane to maximize
  // output space. Keep the *same* source-specific warning accessible from its
  // visible header; don't require opening hidden legacy workload notices.
  const modernWarning = $('sf14SourceSizeWarning');
  if (modernWarning) {
    const advisory = sourceSizeAdvisoryMarkup(videoInput.files?.[0]);
    modernWarning.innerHTML = advisory;
    modernWarning.hidden = !advisory;
  }
  if (!workloadNotice) return;
  const files = selectedInputFiles();
  if (!files.length) {
    workloadNotice.dataset.level = 'normal';
    workloadNotice.innerHTML = '<strong>等待素材</strong>';
    return;
  }

  const totalBytes = sumFileSizes(files);
  const workload = classifyBrowserWorkload(totalBytes);
  workloadNotice.dataset.level = workload.level;
  workloadNotice.innerHTML = `<strong>输入：${escapeHtml(formatBytes(totalBytes))}</strong>${workload.level === 'normal' ? '' : `<span>${escapeHtml(workload.message)}</span>`}${sourceSizeAdvisoryMarkup(videoInput.files?.[0])}`;
}

function setBulkToolsDisabled(disabled) {
  if (!trackBulkTools) return;
  trackBulkTools.querySelectorAll('input, button').forEach((control) => {
    control.disabled = disabled;
  });
}

function isBusy() {
  return running || scanning || previewing || batchSaveRetryBusy || singleDirectorySaveBusy;
}

function setInputsDisabled(disabled) {
  // A background MKV inventory scan may be expensive, but it should not block
  // selection of the remaining inputs. Mux/preview still lock source changes.
  const sourceLocked = running || previewing || batchStartPending || batchRunning || batchSaveRetryBusy || singleDirectorySaveBusy;
  videoInput.disabled = sourceLocked;
  audioInput.disabled = sourceLocked;
  subInput.disabled = sourceLocked;
  fontInput.disabled = sourceLocked;
  const intakeLocked = disabled || batchRunning || batchStartPending || batchStartPending || importInProgress;
  if (unifiedAssetInput) unifiedAssetInput.disabled = intakeLocked;
  if (unifiedFolderInput) unifiedFolderInput.disabled = intakeLocked;
  if (assetDropzone) assetDropzone.setAttribute('aria-disabled', String(intakeLocked));
  fontMode.disabled = sourceLocked;
  if (fontSubsetEnabled) fontSubsetEnabled.disabled = sourceLocked;
  preserveAttachments.disabled = disabled || !currentVideoIsMatroska();
  newAudioList.querySelectorAll('input').forEach((input) => { input.disabled = sourceLocked; });
  newSubtitleList.querySelectorAll('input').forEach((input) => { input.disabled = sourceLocked; });
  attachmentList.querySelectorAll('input').forEach((input) => { input.disabled = disabled; });
  setBulkToolsDisabled(disabled || !trackState);
  attachmentBulkTools?.querySelectorAll('button').forEach((button) => {
    button.disabled = disabled || !trackState;
  });
  if (appendPreserveAll) appendPreserveAll.disabled = sourceLocked || !currentVideoIsMatroska();
  if (previewTimeInput) previewTimeInput.disabled = disabled || !selectedSubtitleTracks().some((track) => track.format?.previewable);
  if (previewPrevCueBtn) previewPrevCueBtn.disabled = disabled || !previewCueTimes.length;
  if (previewNextCueBtn) previewNextCueBtn.disabled = disabled || !previewCueTimes.length;
  if (batchUnifiedInput) batchUnifiedInput.disabled = sourceLocked || batchRunning || batchStartPending || batchImportInProgress;
  if (batchUnifiedFolderInput) batchUnifiedFolderInput.disabled = sourceLocked || batchRunning || batchStartPending || batchImportInProgress;
  if (batchAssetDropzone) batchAssetDropzone.setAttribute('aria-disabled', String(sourceLocked || batchRunning || batchStartPending || batchImportInProgress));
  if (batchVideoInput) batchVideoInput.disabled = sourceLocked || batchRunning || batchStartPending || batchImportInProgress;
  if (batchVideoFolderInput) batchVideoFolderInput.disabled = sourceLocked || batchRunning || batchStartPending || batchImportInProgress;
  if (batchSubtitleInput) batchSubtitleInput.disabled = sourceLocked || batchRunning || batchStartPending || batchImportInProgress;
  if (batchSubtitleFolderInput) batchSubtitleFolderInput.disabled = sourceLocked || batchRunning || batchStartPending || batchImportInProgress;
  if (batchFontInput) batchFontInput.disabled = sourceLocked || batchRunning || batchStartPending || batchImportInProgress;
  if (batchFontFolderInput) batchFontFolderInput.disabled = sourceLocked || batchRunning || batchStartPending || batchImportInProgress;
  if (batchPreserveAttachments) batchPreserveAttachments.disabled = sourceLocked || batchRunning || batchStartPending;
  if (batchFontSubsetEnabled) batchFontSubsetEnabled.disabled = sourceLocked || batchRunning || batchStartPending;
  if (batchSubsetScope) batchSubsetScope.disabled = sourceLocked || batchRunning || batchStartPending || !batchFontSubsetEnabled?.checked;
  if (batchOutputDirBtn) batchOutputDirBtn.disabled = sourceLocked || batchRunning || batchStartPending;
}
/**
 * P1 source-track authoring boundary. The immutable ContainerProject owns
 * scanned source audio/subtitle fields, order and attachment include/name/MIME.
 * Legacy trackState is an exact FFmpeg-facing projection. Source UID relation
 * and complex Matroska structure writer safety remains independently gated.
 */
function refreshLiveSourceTrackAuthority() {
  const source = videoInput.files?.[0] || null;
  const scanned = source && scannedSourceFile === source &&
    trackState?.fileKey === fileKey(source) ? trackState : null;
  if (!scanned) {
    liveSourceTrackSession = null;
    reconcileLiveWorkspaceAuthority();
    return null;
  }
  const projection = buildContainerDocument({
    video: source, trackState: scanned, appendMode: false,
  });
  liveSourceTrackSession = createLiveSourceTrackSession({
    source, trackState: scanned, projection,
  });
  reconcileLiveWorkspaceAuthority();
  return liveSourceTrackSession;
}

function changeSourceTracks(changes) {
  const source = videoInput.files?.[0] || null;
  if (!source || scannedSourceFile !== source ||
      !trackState || trackState.fileKey !== fileKey(source)) {
    status.textContent = '来源轨道已变化，请重新扫描后编辑。';
    return false;
  }
  try {
    if (!liveSourceTrackSession ||
        liveSourceTrackSession.source !== source ||
        liveSourceTrackSession.trackState !== trackState)
      refreshLiveSourceTrackAuthority();
    commitLiveWorkspaceChange(liveWorkspaceAuthority, {
      ...liveWorkspaceContext(), kind:'source-tracks',
      source, trackState, changes,
      appendMode: Boolean(appendPreserveAll?.checked && currentVideoIsMatroska()),
    });
    return true;
  } catch (error) {
    status.textContent = '来源轨道领域修改未执行：' +
      (error?.message || String(error)) + '。未提交部分变更。';
    return false;
  }
}

function changeSourceAttachments(changes) {
  const source = videoInput.files?.[0] || null;
  if (!source || scannedSourceFile !== source ||
      !trackState || trackState.fileKey !== fileKey(source)) {
    status.textContent = '来源附件已变化，请重新扫描后编辑。';
    return false;
  }
  try {
    if (!liveSourceTrackSession ||
        liveSourceTrackSession.source !== source ||
        liveSourceTrackSession.trackState !== trackState)
      refreshLiveSourceTrackAuthority();
    const before = captureSourceAttachmentUndo({source,trackState,changes});
    const result = commitLiveWorkspaceChange(liveWorkspaceAuthority, {
      ...liveWorkspaceContext(), kind:'source-attachments',
      source, trackState, changes,
      appendMode: Boolean(appendPreserveAll?.checked && currentVideoIsMatroska()),
    });
    if (result.status !== 'no-change') {
      recentSourceAttachmentUndo = sealSourceAttachmentUndo(
        before, liveWorkspaceAuthority.project.revision, liveWorkspaceAuthority.project);
      // Planning evidence belongs to this edited document, not a previously
      // generated MKV. Existing output audit will label it as an old plan.
      status.textContent = '附件修改已写入当前工程草稿；未写入原文件，需重新封装及审计。';
    }
    return true;
  } catch (error) {
    status.textContent = '来源附件领域修改未执行：' +
      (error?.message || String(error)) + '。未提交部分变更。';
    return false;
  }
}

function currentSourceAttachmentUndoPlan() {
  return planSourceAttachmentUndo(recentSourceAttachmentUndo, {
    source:videoInput.files?.[0] || null,trackState,
    revision:liveWorkspaceAuthority?.project?.revision,
    project:liveWorkspaceAuthority?.project,
    appendMode:Boolean(appendPreserveAll?.checked && currentVideoIsMatroska()),
  });
}
function withSourceAttachmentUndoIndicator(sections) {
  const plan=currentSourceAttachmentUndoPlan();
  const source=videoInput.files?.[0] || null;
  const evidence=lastActualOutput && lastActualOutput.sourceFile === source &&
    projectActualOutputEvidence(lastActualOutput.report,{
      currentSourceKey:outputCompositionFileKey(source),
      sourceKeyAtExecution:lastActualOutput.sourceKey,
      sourceReferenceCurrent:lastActualOutput.sourceFile === source,
      currentPlan:buildMuxPlan(),
    });
  // Both actual File identity and exact displayed plan must match before
  // presenting old output evidence next to a currently editable object.
  const deliveryEvidence=evidence?.current ? evidence.sourceAttachmentDelivery?.entries || [] : [];
  // A previous artifact may still be downloadable, but is not evidence for
  // a changed source File or changed current edit plan.
  const deliveryStale=Boolean(lastActualOutput && !evidence?.current);
  return { ...sections, undoIndex:plan?.[0]?.index ?? null,
    deliveryEvidence, deliveryStale };
}
function undoRecentSourceAttachmentChange() {
  const changes=currentSourceAttachmentUndoPlan();
  if (!changes?.length) {
    status.textContent='无法撤销：来源、工程修订或附件属性已变化。';
    return false;
  }
  if (!changeSourceAttachments(changes)) return false;
  recentSourceAttachmentUndo=null;
  renderAttachmentList();
  renderImportedAssetInventory();
  renderMuxPlan();
  status.textContent='最近一次附件修改已通过同一领域事务撤销；未改动原文件。';
  return true;
}

function resetTrackState() {
  recentSourceAttachmentUndo = null;
  trackState = null;
  scannedSourceFile = null;
  liveSourceTrackSession = null;
  reconcileLiveWorkspaceAuthority();
  trackList.innerHTML = '<div class="track-empty">选择 MKV 后自动读取容器内容。</div>';
  attachmentList.innerHTML = '';
  trackBulkTools?.classList.add('hidden');
  attachmentBulkTools?.classList.add('hidden');
  renderContainerChangeSummary();
  renderMuxPlan();
  if (!batchRunning) syncBatchPlan?.();
}
function captureNewTrackEditorState() {
  // Background inspector/probe refresh may replace form markup while the
  // user is typing. Reconcile from the controls through the domain, never
  // secretly bypass it by writing straight into the executor arrays.
  if(newAudioList.dataset.externalDomainEpoch !== String(externalAssetAuthorityEpoch) ||
      newSubtitleList.dataset.externalDomainEpoch !== String(externalAssetAuthorityEpoch))
    return;
  const changes=[];
  for(const [list,kind,attribute] of [
    [newAudioList,'audio','newAudioField'],
    [newSubtitleList,'subtitle','newSubField'],
  ]) {
    for(const control of list.querySelectorAll('[data-'+
      (kind==='audio'?'new-audio':'new-sub')+'-field]')) {
      const index=Number(control.dataset.index);
      const item=(kind==='audio'?externalAudioState:newSubtitleState)[index];
      if(!item)continue;
      const field=control.dataset[attribute];
      const value=control.type==='checkbox'?control.checked:control.value;
      if(item[field]!==value)changes.push({kind,index,field,value});
    }
  }
  if(changes.length && !changeExternalAssetFields(changes)) {
    // No silently displayed but unapplied field: restore the last
    // authoritative executor projection if validation was rejected.
    renderNewTrackLists();
  }
}

// Last rendered source owner, not a name/size-based approximation. A font or
// subtitle readiness refresh may update the rest of the UI while a focused
// source-track field is being edited; never unmount that exact field mid-input.
let renderedSourceTrackEditor = null;

function updateUI() {
  // Async container/font/subtitle probes may complete while the user is editing
  // track metadata. Snapshot live editor values before replacing list markup so
  // background readiness updates cannot restore inferred defaults over user input.
  captureNewTrackEditorState();
  const video = videoInput.files[0];
  // Some picker paths can replace the File object while preserving the same
  // filename and without delivering a new change event. Keep fail-closed now
  // and queue a fresh source-scoped inspection instead of sticking forever.
  if (!batchRunning && video && preservationPreview.source !== video) {
    queueMicrotask(() => {
      if (videoInput.files?.[0] === video && preservationPreview.source !== video) {
        beginPreservationPreview();
      }
    });
  }
  const collectedSubs = selectedSubtitleTrackInputs();
  const subs = collectedSubs.tracks.map((track) => track.file);
  const subtitlePending = subtitleIdentityPending();
  const fonts = selectedFonts();
  const fontRecognition = selectedFontRecognition();
  const fontPending = fontIdentityPending();
  const inputIsMkv = currentVideoIsMatroska(video);
  const identityPending = Boolean(
    video &&
    videoSniffState.fileKey === fileKey(video) &&
    videoSniffState.status === 'pending'
  );
  const mode = fontMode.value || 'preserve';
  const busy = isBusy() || batchStartPending || batchRunning;
  if(workspaceBundleExportBtn){
    workspaceBundleExportBtn.disabled=busy||workspaceBundleBusy||
      projectDigestExportInProgress||externalCheckpointBusy||
      !video||currentProjectSourceFile!==video||
      !currentProjectSourceProjection;
  }
  if(workspaceBundleImportInput){
    workspaceBundleImportInput.disabled=busy||workspaceBundleBusy;
  }
  const importRoles = resolveImportedRoles(importedAssetEntries, chosenImportSourceKey);

  const videoLabel = video?.name ?? '未选择';
  const audioFiles = selectedExternalAudioFiles();
  const audioLabel = formatFontSelection(audioFiles).replace(/字体/g, '音频');
  const subtitleLabel = subtitlePending
    ? '正在识别实际字幕格式…'
    : subs.length
      ? (subs.length === 1 ? (collectedSubs.tracks[0].displayName || subs[0].name) : `${subs.length} 条字幕`)
      : (collectedSubs.invalid.length ? '字幕内容无法识别或配对不完整' : '未选择');
  const fontLabel = fontPending
    ? '正在识别实际字体结构…'
    : fontRecognition.ignored.length
      ? `${fontRecognition.ignored.length} 个字体内容无法识别`
      : formatFontSelection(fonts);
  const outputLabel = video ? safeOutputName(video.name) : '—';

  $('videoName').textContent = videoLabel;
  $('videoName').title = video?.name || '';
  $('audioName').textContent = audioLabel;
  $('audioName').title = audioFiles.map((file) => file.name).join('\n');
  $('subName').textContent = subtitleLabel;
  $('subName').title = collectedSubs.tracks.map((track) => track.displayName || track.file.name).join('\n');
  $('fontName').textContent = fontLabel;
  $('fontName').title = fontRecognition.recognized.length
    ? fontRecognition.recognized.map((entry) => {
        const suffix = entry.mismatch ? ` · ${entry.mismatch}` : '';
        return `${entry.file.name} · ${entry.identity?.label || 'Font'}${suffix}`;
      }).join('\n')
    : fonts.map((file) => file.name).join('\n');
  $('fontSummary').textContent = fontPending
    ? 'checking…'
    : fonts.length
      ? `${fontRecognition.recognized.length}/${fonts.length} verified${fontSubsetEnabled?.checked ? ' · subset' : ''}`
      : '—';
  $('outputName').textContent = outputLabel;
  $('outputName').title = outputLabel === '—' ? '' : outputLabel;
  renderVideoIdentityNotice();
  renderWorkloadNotice();
  syncPreviewControls();

  fontModeHint.textContent = !fonts.length
    ? '未附加字体；ASS / SSA 预览使用可用替代字体。'
    : fontPending
      ? '正在解析字体内部结构与 face…'
      : fontRecognition.ignored.length
        ? '存在无法解析的字体文件；请移除或更换后再封装。'
        : mode === 'force'
          ? '使用第一个已验证字体，统一 ASS / SSA 字体名（含内联指定）。'
          : '按已验证的字体内部 Family / face 匹配原字幕字体，并检查字符覆盖。';

  if (!inputIsMkv) {
    preserveAttachments.checked = false;
    if (appendPreserveAll) appendPreserveAll.checked = false;
    if (trackState) resetTrackState();
  } else if (appendPreserveAll && appendPreserveAll.dataset.userTouched !== '1') {
    appendPreserveAll.checked = true;
  }

  const appendMode = Boolean(inputIsMkv && appendPreserveAll?.checked);
  preserveAttachments.checked = appendMode ? true : preserveAttachments.checked;
  preserveAttachments.disabled = busy || !inputIsMkv || appendMode;
  scanTracksBtn.disabled = busy || identityPending || !inputIsMkv || !video;
  muxBtn.disabled =
    busy ||
    identityPending ||
    subtitlePending ||
    fontPending ||
    !video ||
    importInProgress ||
    (importedAssetEntries.length > 0 && (importRoles.needsSourceChoice || importRoles.unknown.length > 0)) ||
    collectedSubs.invalid.length > 0 ||
    fontRecognition.ignored.length > 0 ||
    currentPreservationReadiness().blocking;
  cancelBtn.disabled = !(running || scanning || previewing);
  trackBulkTools?.classList.toggle('hidden', !trackState || appendMode);
  attachmentBulkTools?.classList.toggle('hidden', !trackState || appendMode || !trackState.attachments.length);
  renderNewTrackLists();
  if (trackState) {
    const focused = document.activeElement;
    // Rebuilding the active field can discard an input event that is about to
    // commit, even if the global refresh concerns only an unrelated font probe.
    // Retain only for the exact already-scanned File + model + edit mode;
    // source replacement, busy transitions and mode switches still redraw.
    const keepFocusedSourceEditor = !busy &&
      scannedSourceFile === video &&
      renderedSourceTrackEditor?.source === video &&
      renderedSourceTrackEditor?.state === trackState &&
      renderedSourceTrackEditor?.appendMode === appendMode &&
      focused && trackList.contains(focused) &&
      focused.matches('input[data-track-field]') && !focused.disabled;
    if (!keepFocusedSourceEditor) renderTrackList();
    renderAttachmentList();
  } else {
    renderContainerChangeSummary();
  }
  setInputsDisabled(busy);
  refreshPlanBtn.disabled = busy;
  renderMuxPlan();
  renderImportedAssetInventory();
  if (!batchRunning) requestBatchPlanSync();
  // FFmpeg completion clears running in a later finally block; refresh this
  // action after every state change rather than leaving it disabled forever.
  renderActualOutputEvidence();
}

function bindNewTrackEditor(container, selector, getState, kind) {
  const update = event => {
    const input=event.target.closest(selector);
    if(!input)return;
    const index=Number(input.dataset.index);
    const row=getState()[index];
    if(!row || container.dataset.externalDomainEpoch !==
        String(externalAssetAuthorityEpoch))return;
    const field=input.dataset.newAudioField||input.dataset.newSubField;
    const value=input.type==='checkbox'?input.checked:input.value;
    if(!changeExternalAssetFields([{kind,index,field,value}])) {
      // Restore only this control; do not remount an actively edited form.
      if(input.type==='checkbox')input.checked=row[field];
      else input.value=row[field];
      return;
    }
    renderMuxPlan();
  };
  container.addEventListener('input',update);
  container.addEventListener('change',update);
}

// Content-first intake adapter. This module keeps the existing audited
// single-task mux/preview inputs as implementation details, not upload gates.
// Imported assets always remain visible, including unsupported/unknown ones.
function setAdapterFiles(input, files) {
  if (!input) return;
  // A same-metadata File can contain different bytes. The actual legacy
  // executor input must be rebound to the exact selected browser File, not
  // incorrectly retained merely because path/size/mtime look unchanged.
  const oldFiles = Array.from(input.files || []);
  if (oldFiles.length === files.length &&
      oldFiles.every((file, index) => file === files[index])) return;
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function applyImportedAssetRoles() {
  const roles = resolveImportedRoles(importedAssetEntries, chosenImportSourceKey);
  setAdapterFiles(videoInput, roles.video ? [roles.video] : []);
  setAdapterFiles(subInput, roles.subtitles);
  setAdapterFiles(audioInput, roles.audio);
  setAdapterFiles(fontInput, roles.fonts);
  updateUI();
}

function renderSourceContainerTree(entry, selected, sourceScanned) {
  if (entry.kind !== 'container' || !selected) return '';
  if (!sourceScanned) {
    const isMkv = currentVideoIsMatroska(entry.file);
    return `<div class="asset-container-pending">${isMkv
      ? (scanning ? '正在解析 MKV 内部轨道、附件和章节…' : '内部轨道未完成验证；请使用容器扫描后检查。')
      : '已识别容器头；此容器的内部轨道将在封装时核验，尚无可编辑的轨道树。'}</div>`;
  }

  const appendMode = Boolean(appendPreserveAll?.checked);
  const model = buildContainerTreeModel(trackState, {
    appendMode,
    metadataTags: preservableFormatTags(trackState.format?.tags || {}),
  });
  if (!model) return '';
  const locked = isBusy() || batchRunning;
  const disabled = locked || appendMode;
  const open = containerTreeExpansion.get(entry.key) ?? true;
  const badge = (status) => containerStatusBadge(status);
  // The resource list is a navigable index; only ONE object's full editor is
  // rendered. Selection is stable by scanned stream index, never row position.
  const allItems = model.groups.flatMap((group) => group.items);
  const preferred = allItems.find((item) => item.kind === 'audio')
    || allItems.find((item) => item.kind === 'subtitle')
    || allItems.find((item) => item.kind === 'attachment')
    || allItems[0];
  const identity = (item) => `${item.kind}:${item.index}`;
  const stored = containerTreeSelectedItem.get(entry.key);
  const current = allItems.find((item) => identity(item) === stored) || preferred;
  if (current) containerTreeSelectedItem.set(entry.key, identity(current));
  const listRow = (item) => {
    const isActive = current && identity(item) === identity(current);
    const title = item.kind === 'chapter' ? (item.chapter.tags?.title || `Chapter #${item.index + 1}`)
      : item.kind === 'metadata' ? '全局元数据'
      : item.attachment ? (item.attachment.filename || `附件 #${item.index}`)
      : item.track?.title || containerStreamTitle(item.stream);
    const meta = item.kind === 'chapter'
      ? `${item.chapter.start_time ?? item.chapter.start ?? ''} → ${item.chapter.end_time ?? item.chapter.end ?? ''}`
      : item.kind === 'metadata' ? `${item.tags.length} 个字段`
      : item.attachment ? item.attachment.mimetype
      : containerStreamMeta(item.stream);
    return `<div class="asset-tree-row asset-tree-index-row" data-tree-stream-index="${item.index}" data-change="${item.status}">
      <button type="button" class="asset-tree-select" data-tree-select="${escapeHtml(identity(item))}"
        aria-pressed="${Boolean(isActive)}" aria-label="查看 ${escapeHtml(title)} 的属性">
        <span class="asset-tree-index-name">${escapeHtml(title)}</span>
        <small>${escapeHtml(String(meta || ''))}</small>
      </button>
      ${badge(item.status)}
    </div>`;
  };
  const row = (item) => {
    if (item.kind === 'chapter') {
      const ch = item.chapter;
      const name = ch.tags?.title || `Chapter #${item.index + 1}`;
      return `<div class="asset-tree-row" data-change="keep"><strong>${escapeHtml(name)}</strong>
        <small>${escapeHtml(String(ch.start_time ?? ch.start ?? ''))} → ${escapeHtml(String(ch.end_time ?? ch.end ?? ''))}</small>${badge('keep')}</div>`;
    }
    if (item.kind === 'metadata') {
      return `<div class="asset-tree-row asset-tree-metadata" data-change="keep">
        <strong>${item.tags.length} 个全局元数据字段</strong>
        <div class="asset-tree-metadata-fields">${item.tags.map(([key, value]) =>
          `<span><b>${escapeHtml(key)}</b> ${escapeHtml(value)}</span>`).join('') || '无可保留的全局字段'}</div>
        ${badge('keep')}</div>`;
    }
    const { stream, track, attachment } = item;
    const title = attachment ? (attachment.filename || `Attachment #${item.index}`)
      : track?.title || containerStreamTitle(stream);
    const meta = attachment
      ? `source #${item.index} · ${attachment.mimetype || stream.codec_name || 'attachment'}`
      : containerStreamMeta(stream);
    let actions = '';
    if (track) {
      const inputDisabled = disabled || !track.include ? 'disabled' : '';
      const moveUpDisabled = inputDisabled || !item.canMoveUp ? 'disabled' : '';
      const moveDownDisabled = inputDisabled || !item.canMoveDown ? 'disabled' : '';
      const advancedKey = `${entry.key}:${item.index}`;
      const advancedOpen = containerTreeAdvancedExpansion.get(advancedKey) ?? false;
      actions = `<div class="asset-tree-controls">
        <span class="asset-tree-order-controls" role="group" aria-label="轨道顺序">
          <button type="button" data-tree-track-move="-1" data-tree-track-index="${item.index}" ${moveUpDisabled} aria-label="上移 ${escapeHtml(title)}" title="上移">↑</button>
          <button type="button" data-tree-track-move="1" data-tree-track-index="${item.index}" ${moveDownDisabled} aria-label="下移 ${escapeHtml(title)}" title="下移">↓</button>
        </span>
        <label><input type="checkbox" data-tree-track-include="${item.index}" ${track.include ? 'checked' : ''} ${disabled ? 'disabled' : ''}> 保留</label>
        <label>语言 <input type="text" data-tree-track-field="language" data-tree-track-index="${item.index}" value="${escapeHtml(track.language)}" maxlength="35" list="languageSuggestions" ${inputDisabled}></label>
        <label>标题 <input type="text" data-tree-track-field="title" data-tree-track-index="${item.index}" value="${escapeHtml(track.title)}" maxlength="160" ${inputDisabled}></label>
        <label><input type="checkbox" data-tree-track-flag="default" data-tree-track-index="${item.index}" ${track.default ? 'checked' : ''} ${inputDisabled}> Default</label>
        ${track.type === 'subtitle' ? `<label><input type="checkbox" data-tree-track-flag="forced" data-tree-track-index="${item.index}" ${track.forced ? 'checked' : ''} ${inputDisabled}> Forced</label>` : ''}
        <details class="asset-tree-advanced" data-tree-advanced="${escapeHtml(advancedKey)}" ${advancedOpen ? 'open' : ''}>
          <summary>高级标记</summary>
          <div class="asset-tree-advanced-fields">
            <label><input type="checkbox" data-tree-track-flag="original" data-tree-track-index="${item.index}" ${track.original ? 'checked' : ''} ${inputDisabled}> Original</label>
            <label><input type="checkbox" data-tree-track-flag="commentary" data-tree-track-index="${item.index}" ${track.commentary ? 'checked' : ''} ${inputDisabled}> Commentary</label>
            <label><input type="checkbox" data-tree-track-flag="hearingImpaired" data-tree-track-index="${item.index}" ${track.hearingImpaired ? 'checked' : ''} ${inputDisabled}> Hearing impaired</label>
          </div>
        </details>
      </div>`;
    } else if (attachment) {
      const inputDisabled = disabled || !attachment.include ? 'disabled' : '';
      actions = `<div class="asset-tree-controls">
        <label><input type="checkbox" data-tree-attachment-include="${item.index}" ${attachment.include ? 'checked' : ''} ${disabled ? 'disabled' : ''}> 保留</label>
        <label>名称 <input type="text" data-tree-attachment-field="filename" data-tree-attachment-index="${item.index}" value="${escapeHtml(attachment.filename)}" maxlength="240" ${inputDisabled}></label>
        <label>MIME <input type="text" data-tree-attachment-field="mimetype" data-tree-attachment-index="${item.index}" value="${escapeHtml(attachment.mimetype)}" maxlength="120" ${inputDisabled}></label>
      </div>`;
    }
    return `<div class="asset-tree-row" data-change="${item.status}" data-tree-stream-index="${item.index}">
      <div class="asset-tree-item-info"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(meta)}</small></div>
      ${actions}${badge(item.status)}</div>`;
  };

  sourceInspectorMarkup = `<section class="asset-tree-inspector" aria-label="当前资源的属性编辑器">
          <div class="asset-tree-inspector-head">
            <strong>当前对象</strong>
            <span>${current ? escapeHtml(({video:'视频',audio:'音频',subtitle:'字幕',attachment:'附件',data:'数据',chapter:'章节',metadata:'元数据',other:'其他'})[current.kind] || '资源') : '无'}</span>
          </div>
          ${current ? row(current) : '<div class="track-empty">从左侧选择一项查看属性。</div>'}
        </section>`;

  return `<details class="asset-container-tree" data-source-tree="${escapeHtml(entry.key)}" ${open ? 'open' : ''}>
    <summary>容器内容 · ${model.streamCount} 个流 · ${model.attachmentCount} 个附件 · ${model.chapterCount} 个章节</summary>
    <div class="asset-tree-body">
      <label class="asset-tree-mode"><input type="checkbox" data-tree-preserve-all ${appendMode ? 'checked' : ''} ${locked ? 'disabled' : ''}>
        保留全部原内容，仅追加新素材
      </label>
      ${appendMode ? '<p class="asset-tree-tip">当前为保留全部模式。取消上方勾选后，可调整音频、字幕和附件。</p>' : ''}
      <div class="asset-tree-workspace">
        <div class="asset-tree-list" aria-label="源容器轨道索引">
          ${model.groups.map((group) => `<section class="asset-tree-group" data-tree-group="${group.key}">
            <h4>${group.label} <span>${group.items.length}</span></h4>
            ${group.items.map(listRow).join('')}
          </section>`).join('')}
        </div>

      </div>
      <button type="button" class="asset-tree-more-tools" data-tree-advanced-tools aria-expanded="${showAdvancedSourceTools}">
        ${showAdvancedSourceTools ? '收起' : '展开'}高级轨道工具
      </button>
    </div>
  </details>`;
}

const compositionKindNames = {
  video: '视频', audio: '音频', subtitle: '字幕',
  attachment: '附件', font: '字体', source: '来源',
};

function renderSingleDirectorySave() {
  if (!singleDirectoryActions) return;
  const active=lastActualOutput && singleDirectorySession.has(lastActualOutput);
  singleDirectoryActions.hidden=!active;
  if (!active) return;
  const available=typeof window.showDirectoryPicker==='function';
  const busy=isBusy() || batchRunning || batchStartPending;
  singleChooseDirectoryBtn.disabled=!available || busy;
  singleRetryDirectoryBtn.hidden=!singleDirectoryHandle ||
    singleDirectorySession.receipt?.savedToDirectory === true;
  singleRetryDirectoryBtn.disabled=busy || !singleDirectoryHandle;
  singleDirectorySaveStatus.textContent=singleDirectorySaveBusy
    ? '正在保存现有 MKV 与报告并回读全部字节（不重新封装）…'
    : singleDirectoryStatusMessage ||
      (available
        ? '尚未证明成品保存到目录；可以选择新目录。浏览器下载链接始终可用。'
        : '当前浏览器没有目录保存 API；请使用现有 MKV 与报告下载链接。');
}

async function saveSingleCompletedOutput(chooseNewDirectory) {
  const owner=lastActualOutput;
  if (!owner || !singleDirectorySession.has(owner) ||
      isBusy() || batchRunning || batchStartPending) return;
  if (chooseNewDirectory && typeof window.showDirectoryPicker!=='function') return;
  const statusBeforeAttempt=singleDirectoryStatusMessage;
  singleDirectorySaveBusy=true;
  singleDirectoryStatusMessage='';
  updateUI();
  try {
    let directory=singleDirectoryHandle;
    if (chooseNewDirectory || !directory) {
      // Must be initiated by a genuine user click for File System Access.
      directory=await window.showDirectoryPicker({mode:'readwrite'});
      const permission=await directory.requestPermission?.({mode:'readwrite'});
      if (permission && permission!=='granted')
        throw Error('浏览器未授予目标目录写入权限');
    }
    if (lastActualOutput!==owner || !singleDirectorySession.has(owner))
      throw Error('生成成品已更换；旧目录选择不再授权任何写入');
    singleDirectoryHandle=directory;
    // Registry verifies every persisted byte after close(), and checks
    // previously saved members again before a save-only partial retry.
    const receipt=await singleDirectorySession.save(owner,directory);
    singleDirectoryStatusMessage=receipt.savedToDirectory
      ? '目录“'+receipt.destinationName+'”：MKV 与 JSON 报告均已逐字节回读一致（不等于断电持久性）。'
      : receipt.mkvSavedToDirectory
        ? 'MKV 已完成目录回读，但报告未保存：'+
          (receipt.reportSaveError || receipt.directorySaveError) +
          '；可仅重试保存报告或使用浏览器下载。'
        : '目录保存未完成：'+(receipt.directorySaveError || 'MKV 写入或回读未通过')+
          '；生成的 MKV 与报告仍可通过原链接下载。';
  } catch (error) {
    if (error?.name==='AbortError') {
      // Cancelling another picker is not a failed write; keep any already
      // verified receipt visible instead of falsely saying it was never saved.
      singleDirectoryStatusMessage=statusBeforeAttempt;
    } else {
      singleDirectoryStatusMessage='目录保存未确认：'+
        (error?.message||String(error))+
        '；不会覆盖或删除既有文件。可重新选择目录或下载生成的成品。';
    }
  } finally {
    singleDirectorySaveBusy=false;
    updateUI();
  }
}
singleChooseDirectoryBtn?.addEventListener('click', () => {
  void saveSingleCompletedOutput(true);
});
singleRetryDirectoryBtn?.addEventListener('click', () => {
  void saveSingleCompletedOutput(false);
});

function renderActualOutputEvidence() {
  renderSingleDirectorySave();
  if (!outputEvidencePanel) return;
  const model = lastActualOutput && projectActualOutputEvidence(lastActualOutput.report, {
    currentSourceKey: outputCompositionFileKey(videoInput.files?.[0] || null),
    sourceKeyAtExecution: lastActualOutput.sourceKey,
    sourceReferenceCurrent: lastActualOutput.sourceFile === (videoInput.files?.[0] || null),
    currentPlan: buildMuxPlan(),
  });
  outputEvidencePanel.hidden = !model;
  if (!model) return;
  // The actual Blob belongs to this generation of the completed mux, and
  // the exact File reference/plan must still match before an inspection can
  // be started. No scanner result is ever promoted to a writer permission.
  if (outputIndexInspectBtn) {
    outputIndexInspectBtn.disabled = !model.current ||
      !lastActualOutput?.outputBlob || running || batchRunning ||
      outputIndexAuditPending;
    outputIndexInspectBtn.textContent = outputIndexAuditPending
      ? '正在独立检查来源与成品…' : '独立检查来源与成品索引';
  }
  if (outputIndexResult) {
    const hasMatchingReceipt = lastOutputIndexAudit?.owner === lastActualOutput;
    outputIndexResult.dataset.status = !model.current ? 'stale'
      : outputIndexAuditPending ? 'running'
      : hasMatchingReceipt ? lastOutputIndexAudit.status : 'not-run';
    outputIndexResult.textContent = !model.current
      ? '来源或拟输出计划已变化；旧成品的索引结果不得用于当前任务。'
      : outputIndexAuditPending ? '正在只读扫描两个真实文件；不会修改任何来源或成品。'
      : hasMatchingReceipt ? lastOutputIndexAudit.text
      : '可主动核查当前来源与生成的 MKV；此项不会授权重封装或证明保存成功。';
  }
  outputEvidencePanel.dataset.audit = model.status;
  outputEvidencePanel.dataset.current = String(model.current);
  outputEvidenceTitle.textContent = model.title;
  outputEvidenceScopeState.textContent = model.current ? '当前计划' : '旧计划';
  outputEvidenceName.textContent = model.name;
  const counts = model.counts;
  outputEvidenceFacts.textContent = [
    counts ? `实际轨道：${['video','audio','subtitle','attachment','chapter']
      .map(kind => `${kind} ${Number(counts[kind] || 0)}`).join(' · ')}` : '轨道统计：未提供',
    `SHA-256：${model.sha256}`,
    model.subripCue?.status === 'pass'
      ? `新增 SRT/WebVTT 成品回读：${model.subripCue.verified}/${model.subripCue.total} 条轨的纯文本与毫秒时间一致（不含排版/播放器）`
      : model.subripCue?.status === 'warning'
        ? '新增 SRT/WebVTT 成品回读：存在差异'
        : model.subripCue?.status === 'unavailable'
          ? '新增 SRT/WebVTT 成品回读：未验证（带标记格式、解析或资源限制）'
          : '新增 SRT/WebVTT 成品回读：未请求此范围',
    model.assEvent?.status === 'pass'
      ? `新增 ASS 事件成品回读：${model.assEvent.verified}/${model.assEvent.total} 条轨一致（不含 Style/字体渲染）`
      : model.assEvent?.status === 'warning'
        ? `新增 ASS 事件成品回读：存在差异（${model.assEvent.verified}/${model.assEvent.total}）`
        : model.assEvent?.status === 'unavailable'
          ? '新增 ASS 事件成品回读：未验证（预算、解析或执行限制）'
          : '新增 ASS 事件成品回读：未请求此范围',
    model.assStyle?.status === 'pass'
      ? `新增 ASS 样式成品回读：${model.assStyle.verified}/${model.assStyle.total} 条轨，${model.assStyle.styleRecords} 项 Style（不含字体渲染）`
      : model.assStyle?.status === 'warning'
        ? `新增 ASS 样式成品回读：字段存在差异（${model.assStyle.verified}/${model.assStyle.total}）`
        : model.assStyle?.status === 'unavailable'
          ? '新增 ASS 样式成品回读：未验证（不支持的格式或资源限制）'
          : '新增 ASS 样式成品回读：未请求此范围',
    model.fontPayload?.status === 'pass'
      ? `新字体附件字节验证：${model.fontPayload.verified}/${model.fontPayload.total} · SHA-256 一致`
      : model.fontPayload && model.fontPayload.status !== 'not-requested'
        ? `新字体附件字节验证：待复核（${model.fontPayload.verified}/${model.fontPayload.total}）`
        : '新字体附件字节验证：无新增字体',
    model.originalAttachmentPayload?.status === 'pass'
      ? model.originalAttachmentPayload.evidence === 'source-vs-final-mkv-ebml-filedata-byte-compare-v2'
        ? `原附件字节验证：${model.originalAttachmentPayload.verified}/${model.originalAttachmentPayload.total} · SHA-256 或完整分块逐字节比较一致（部分附件无 SHA-256；不含 UID 关联）`
        : `原附件字节验证：${model.originalAttachmentPayload.verified}/${model.originalAttachmentPayload.total} · SHA-256 一致（不含 UID 关联）`
      : model.originalAttachmentPayload && model.originalAttachmentPayload.status !== 'not-requested'
        ? `原附件字节验证：待复核（${model.originalAttachmentPayload.verified}/${model.originalAttachmentPayload.total}）`
        : '原附件字节验证：未请求保留原附件',
  ].join(' | ');
  outputEvidenceIssues.textContent = model.issues.length
    ? `审计问题（${model.issues.length}）：${model.issues.join('；')}`
    : model.status === 'pass' ? '在现有 ffprobe 检查范围内未发现差异' : '审计证据不足';
  outputEvidenceRevision.textContent = model.revisionNotice;
  const delivery = model.sourceAttachmentDelivery;
  if (delivery?.entries?.length) {
    const byteCompared = delivery.entries.filter(item =>
      item.status === 'filedata-verified' &&
      item.proofMethod === 'exact-byte-compare').length;
    const hashed = delivery.verifiedFileData - byteCompared;
    const proofLabel = byteCompared
      ? hashed + ' 项 FileData SHA-256 通过、' +
        byteCompared + ' 项 FileData 完整逐字节比较通过'
      : delivery.verifiedFileData + ' 项 FileData SHA-256 通过';
    const addition = '逐附件审计：' + proofLabel + ' · ' + delivery.observedAbsent +
      ' 项 ffprobe 清单未出现 · ' + delivery.unresolved +
      ' 项未确认（均不含 UID/保存证据）';
    outputEvidenceFacts.textContent += ' | ' + addition;
  }
  // Refresh the selected attachment Inspector once the finished MKV evidence
  // exists. Reuse the source scan; never persist evidence as editable rows.
  const source=videoInput.files?.[0] || null;
  const scanned=source && scannedSourceFile===source &&
    trackState?.fileKey===fileKey(source) ? trackState : null;
  updateSoftmux1014SourceSections(document,withSourceAttachmentUndoIndicator(
    buildSourceObjectSections(scanned,{
      appendMode:Boolean(appendPreserveAll?.checked && currentVideoIsMatroska()),
      sourceFile:scanned ? source : null,
    })));
}

outputIndexInspectBtn?.addEventListener('click', async () => {
  const owner = lastActualOutput;
  // Freshly evaluate the File reference and the current authored plan; a
  // stale rendered button (or programmatic click) is never enough authority.
  if (!owner?.sourceFile || !owner.outputBlob ||
      owner.sourceFile !== (videoInput.files?.[0] || null) ||
      JSON.stringify(buildMuxPlan()) !== JSON.stringify(owner.report?.plan) ||
      running || batchRunning || outputIndexAuditPending) {
    renderActualOutputEvidence();
    return;
  }
  const inspectionSequence = ++outputIndexAuditSequence;
  outputIndexAuditPending = true;
  lastOutputIndexAudit = null;
  renderActualOutputEvidence();
  let inspected;
  try {
    inspected = await auditS12WorkbenchStructure({
      source:owner.sourceFile,finished:owner.outputBlob,
    });
  } catch (error) {
    inspected = {
      status:'STRUCTURE_PROBE_FAILED',
      message:'独立结构检查发生错误：'+(error?.message||String(error))+
        '。没有修改任何文件；本次未取得结构保留证明。',
    };
  }
  // Even when a scan began with valid sources, an asynchronous user edit,
  // new mux or File rebind can supersede it. Keep results tied to the exact
  // completed output without publishing stale evidence.
  const stillCurrent = owner === lastActualOutput &&
    owner.sourceFile === (videoInput.files?.[0] || null) &&
    JSON.stringify(buildMuxPlan()) === JSON.stringify(owner.report?.plan);
  // A later real mux may retire this output while its old scan is still
  // running. Never clear the new output's pending flag or publish a stale scan.
  if (inspectionSequence !== outputIndexAuditSequence) return;
  outputIndexAuditPending = false;
  if (stillCurrent) {
    lastOutputIndexAudit = {
      owner,status:inspected.status,
      text:inspected.message || formatS12WorkbenchStructure(inspected),
    };
  }
  renderActualOutputEvidence();
});

function renderOutputComposition() {
  if (!outputCompositionPanel || !compositionTracks) return;
  renderPreservationReadiness();
  const source = videoInput.files?.[0] || null;
  const scanned = source && scannedSourceFile === source &&
    trackState?.fileKey === fileKey(source) ? trackState : null;
  const containerDocument = buildContainerDocument({
    video: source,
    trackState: scanned,
    appendMode: Boolean(appendPreserveAll?.checked && currentVideoIsMatroska()),
    externalAudio: externalAudioState,
    newSubtitles: newSubtitleState,
    fonts: selectedFonts(),
    fontMode: fontMode.value,
    unsupportedAssets: importedAssetEntries.filter(entry => entry.kind === 'unknown' ||
      entry.status === ASSET_STATUS.UNSUPPORTED),
  });
  // Source attachment/chapter/format-tag objects are rendered from the
  // same exact-File-bound scan; unscanned inputs yield no observed objects.
  updateSoftmux1014SourceSections(document, withSourceAttachmentUndoIndicator(buildSourceObjectSections(scanned, {
    appendMode: Boolean(appendPreserveAll?.checked && currentVideoIsMatroska()),
    sourceFile: scanned ? source : null,
  })));
  // Preserve the exact File reference, not just the name/size/mtime display
  // key. A replacement with identical metadata may NOT inherit the snapshot.
  currentProjectSourceProjection = containerDocument;
  currentProjectSourceFile = source;
  if (importedProjectForReview && containerProjectImportReview) {
    const comparison = compareContainerProjectDraft(importedProjectForReview, containerDocument);
    const applicableProof = detachedSourceProof &&
      detachedSourceProof.source === source &&
      detachedSourceProof.draft === importedProjectForReview
      ? detachedSourceProof.verdict : null;
    containerProjectImportReview.hidden = false;
    containerProjectImportReview.dataset.state = applicableProof?.state || comparison.state;
    containerProjectImportReview.textContent = '已读取工程草稿：' + comparison.importedCount +
      ' 个原对象、当前 ' + comparison.currentCount + ' 个；消失 ' + comparison.missingCount +
      '，新增 ' + comparison.addedCount + '。' + comparison.warning +
      (applicableProof ? ' ' + applicableProof.message : '') +
      ' 未恢复编辑状态、封装权限或媒体文件。';
  }
  if (containerProjectIntentReview && containerProjectIntentList &&
      containerProjectIntentSummary) {
    containerProjectIntentReview.hidden = !importedProjectForReview;
    if (importedProjectForReview) {
      // parseContainerProjectDraft already fails closed on incoherent chains.
      // A matching self-consistent edit log is still untrusted text, not
      // evidence of its author, origin or permission to touch current tracks.
      const intentAudit = auditDetachedContainerProjectIntentChain(importedProjectForReview);
      containerProjectIntentSummary.textContent = intentAudit.intentCount
        ? '草稿修改记录：' + intentAudit.intentCount + ' 项内部一致（仅只读）'
        : '草稿没有可恢复的修改记录';
      containerProjectIntentList.replaceChildren(...intentAudit.preview.map(intent => {
        const row = document.createElement('li');
        const target = intent.type === 'set-attribute'
          ? '字段 ' + intent.field
          : intent.type === 'include' ? '是否保留' : '排列顺序';
        const value = entry => entry === null ? '(未设置)'
          : typeof entry === 'boolean' ? (entry ? '是' : '否') : String(entry);
        row.textContent = 'r' + intent.revision + ' · ' + intent.objectId +
          ' · ' + target + '：' + value(intent.from) + ' → ' + value(intent.to);
        return row;
      }));
      if (!intentAudit.intentCount) {
        const row = document.createElement('li');
        row.textContent = '没有修改记录；不能据此判断草稿是否曾被编辑。';
        containerProjectIntentList.append(row);
      }
    } else {
      containerProjectIntentList.replaceChildren();
    }
  }
  // Read-only three-way comparison. It cannot update the editable legacy
  // track list, composition, source File, writer plan or permission state.
  if (containerProjectConflictReview && containerProjectConflictSummary &&
      containerProjectConflictList) {
    const hasIntents = Boolean(importedProjectForReview?.editIntents?.length);
    containerProjectConflictReview.hidden = !hasIntents;
    if (hasIntents) {
      const proof = detachedSourceProof &&
        detachedSourceProof.source === source &&
        detachedSourceProof.draft === importedProjectForReview
        ? detachedSourceProof.verdict : null;
      const result = previewDetachedProjectIntentConflicts({
        draft: importedProjectForReview,
        liveProjection: containerDocument,
        sourceProof: proof,
      });
      containerProjectConflictReview.dataset.state = result.status;
      containerProjectConflictSummary.textContent = result.status === 'READ_ONLY_PREVIEW_MATCHES'
        ? '当前来源基线匹配：' + result.comparedCount + ' 项（仅供预览，未应用）'
        : '编辑意图对照受阻：' + result.conflictCount + '/' + result.proposedCount +
          ' 项尚不能安全比较';
      const reasons = {
        SOURCE_ABSENT: '未绑定当前媒体', SOURCE_IDENTITY_DRIFT: '来源身份不符',
        SOURCE_BYTES_UNVERIFIED: '未完成来源字节 SHA-256 核对',
        TRACKS_NOT_INSPECTED: '当前真实轨道尚未扫描',
        OBJECT_MISSING: '对应对象不存在',
        OBJECT_IDENTITY_DRIFT: '对象身份或类型变化',
        UNBOUND_OR_EXTERNAL_OBJECT: '外部对象没有可证明的原来源身份',
        BASELINE_FIELD_CONFLICT: '当前字段值与草稿修改前记录冲突',
        READ_ONLY_COMPARISON: '字段旧值匹配（只读）',
      };
      const display = value => value === null ? '(未设置)'
        : typeof value === 'boolean' ? (value ? '是' : '否') : String(value);
      containerProjectConflictList.replaceChildren(...result.changes.slice(0,12).map(item => {
        const row = document.createElement('li');
        row.dataset.verdict = item.verdict;
        row.textContent = item.objectId +
          ' · ' + (item.field || (item.type === 'include' ? '保留状态' : '顺序')) +
          ' · 旧值 ' + display(item.from) + ' → 目标 ' + display(item.to) +
          ' · 当前 ' + display(item.current) +
          ' · ' + (reasons[item.reason] || item.reason);
        return row;
      }));
      if (result.changes.length > 12) {
        const omitted = document.createElement('li');
        omitted.textContent = '其余 ' + (result.changes.length - 12) +
          ' 项尚未展示；不会隐式接受或执行。';
        containerProjectConflictList.append(omitted);
      }
    } else containerProjectConflictList.replaceChildren();
  }
  if (containerProjectRestorePanel && containerProjectRestoreBtn) {
    const hasChanges = Boolean(importedProjectForReview?.editIntents?.length);
    containerProjectRestorePanel.hidden = !hasChanges;
    let ready = false;
    let reason = '没有可恢复的修改记录';
    if (hasChanges) {
      try {
        const proof = detachedSourceProof?.source === source &&
          detachedSourceProof?.draft === importedProjectForReview
          ? detachedSourceProof.verdict : null;
        const prepared = prepareVerifiedTrackReplay({
          draft: importedProjectForReview,
          liveProjection: containerDocument, sourceProof: proof,
          trackState: scanned,
          appendMode: Boolean(appendPreserveAll?.checked && currentVideoIsMatroska()),
        });
        ready = prepared.proposedCount > 0;
        reason = '已核验 ' + prepared.proposedCount + ' 项更改，等待确认';
      } catch (error) {
        reason = error?.message || String(error);
      }
    }
    containerProjectRestoreBtn.disabled = !ready ||
      !containerProjectRestoreConfirm?.checked || isBusy() ||
      batchRunning || importInProgress || sourceDigestCheckInProgress;
    containerProjectRestoreBtn.title = reason;
    if (containerProjectRestorePanel) containerProjectRestorePanel.dataset.ready = String(ready);
    if (containerProjectRestoreUndoBtn) {
      const undo = lastProjectRestore;
      const relevant = undo && undo.source === source && undo.draft === importedProjectForReview &&
        undo.trackState === scanned;
      containerProjectRestoreUndoBtn.hidden = !relevant;
      containerProjectRestoreUndoBtn.disabled = !relevant || isBusy() || batchRunning || importInProgress;
    }
  }
  if (containerProjectVerifySourceBtn) {
    const canHash = importedProjectForReview?.sources?.length === 1 &&
      Boolean(importedProjectForReview.sources[0]?.sha256);
    containerProjectVerifySourceBtn.hidden = !importedProjectForReview;
    containerProjectVerifySourceBtn.disabled = sourceDigestCheckInProgress ||
      Boolean(activeProjectHash) || !canHash || !source ||
      source.size > PROJECT_SOURCE_HASH_MAX_BYTES;
    containerProjectVerifySourceBtn.title = !canHash
      ? '此草稿没有完整 SHA-256，无法执行字节级核对'
      : source && source.size > PROJECT_SOURCE_HASH_MAX_BYTES
        ? '来源文件超过当前 16 GiB 哈希上限，需要另一种来源证明'
        : '完整哈希相等仅能证明与草稿所写的摘要相等，不授权执行';
  }
  // Export is read-only and has no mux/write side effects. Background preview
  // and track scan are not grounds to silently drop an export command: the
  // snapshot explicitly says that inspection and source relinking are pending.
  if (containerProjectExportBtn) containerProjectExportBtn.disabled =
    projectDigestExportInProgress || Boolean(activeProjectHash) ||
    !containerDocument.objects.length || importInProgress;
  if (containerProjectHashActions)
    containerProjectHashActions.hidden = !activeProjectHash;
  const model = containerDocument.composition;
  if (containerCapabilitySummary) {
    const caps = resolveContainerCapabilities({
      hasSource: Boolean(source),
      sourceContainer: selectedVideoHeaderIdentity(source)?.container || 'unknown',
      sourceInspected: Boolean(scanned),
      hasVideo: Boolean(scanned?.streams?.some(stream => stream.codec_type === 'video')),
      preservationStatus: currentPreservationReadiness().status,
    });
    const items = summarizeContainerCapability(caps);
    const shown = [items[0], items[1]];
    containerCapabilitySummary.textContent = shown
      .map(item => item.label + '：' + ({
        'available': '可用', 'requires-preflight': '需预检', 'blocked': '阻断',
        'unsupported': '不支持', 'experimental': '实验', 'unverified': '未验证',
        'requires-source': '需来源',
      }[item.status] || '未验证')).join(' · ');
    containerCapabilitySummary.title = items.map(item =>
      item.label + ' [' + item.status + '] ' + item.reason).join('\n');
    containerCapabilitySummary.dataset.muxStatus = caps.mux.status;
    if (containerCapabilityDetailsList) {
      containerCapabilityDetailsList.replaceChildren(...items.map(item => {
        const line = document.createElement('li');
        line.textContent = item.label + '（' + ({
          available: '可用', 'requires-preflight': '需预检', blocked: '阻断',
          unsupported: '不支持', experimental: '实验性', unverified: '未验证',
          'requires-source': '需来源',
        }[item.status] || '未验证') + '）：' + item.reason;
        line.dataset.status = item.status;
        return line;
      }));
    }
  }
  selectedCompositionId = reconcileContainerSelection(containerDocument, lastCompositionSourceKey, selectedCompositionId);
  lastCompositionSourceKey = containerDocument.sourceKey;
  outputCompositionPanel.hidden = !model.items.length && !model.diagnostics.length;
  const exists = model.items.some(item => item.id === selectedCompositionId);
  if (!exists) selectedCompositionId = '';
  const kinds = ['video', 'audio', 'subtitle', 'attachment', 'font'];
  compositionCount.textContent = kinds
    .filter(kind => model.counts[kind])
    .map(kind => `${compositionKindNames[kind]} ${model.counts[kind]}`).join(' · ') || '待导入';
  compositionTracks.innerHTML = model.items.map(item => {
    const active = item.id === selectedCompositionId;
    const label = compositionKindNames[item.kind] || item.kind;
    const status = item.status === 'remove' ? '移除' :
      item.status === 'add' ? '新增' : item.status === 'modify' ? '修改' :
      item.status === 'pending' ? '待核验' : '';
    const info = `<span class="composition-kind">${escapeHtml(label)}</span>
      <span class="composition-track-main"><strong>${escapeHtml(item.title)}</strong>
      <small>${escapeHtml(item.detail)}</small></span>
      <span class="composition-state">${escapeHtml(status || (item.included ? '保留' : '排除'))}</span>`;
    if (!item.target) return `<div class="composition-row composition-pending" data-status="${escapeHtml(item.status)}">${info}</div>`;
    return `<button type="button" class="composition-row composition-select" data-composition-id="${escapeHtml(item.id)}"
      data-status="${escapeHtml(item.status)}" aria-pressed="${active}"
      aria-label="编辑${escapeHtml(label)}：${escapeHtml(item.title)}">${info}</button>`;
  }).join('') || '<div class="track-empty">暂无可封装轨道</div>';
  const meaningfulChanges = model.changes;
  compositionChanges.hidden = !meaningfulChanges.length;
  compositionChanges.textContent = meaningfulChanges.length
    ? `变更 ${meaningfulChanges.length} · ${meaningfulChanges.map(item => item.title).join('、')}` : '';
  compositionIssues.hidden = !model.diagnostics.length;
  compositionIssues.textContent = model.diagnostics.map(issue =>
    `${issue.title}：${issue.reason}`).join('；');
  const sourceEvidence = projectSourceStructureEvidence({ source, trackState: scanned });
  if (compositionSourceEvidence) {
    compositionSourceEvidence.hidden = !sourceEvidence.observed;
    compositionSourceSummary.textContent = sourceEvidence.summary;
    compositionSourceEvidenceList.innerHTML = sourceEvidence.items.map(item =>
      `<div class="composition-evidence-row" data-evidence-kind="${escapeHtml(item.kind)}">
        <span class="composition-evidence-kind">${escapeHtml({
          chapter: '章节', metadata: '标签', data: '数据流', other: '其他流',
        }[item.kind] || '观察')}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.detail)}</small>
      </div>`
    ).join('') || '<div class="track-empty">ffprobe 未返回可展示的章节、标签或其他流。</div>';
  }
  renderActualOutputEvidence();
  document.querySelector('.workspace')?.setAttribute('data-has-composition', String(model.items.length > 0));
  if (compositionMuxBtn) compositionMuxBtn.disabled = muxBtn.disabled;
  if (editorMuxBtn) editorMuxBtn.disabled = muxBtn.disabled;
  if (objectSelectionHint) objectSelectionHint.hidden =
    Boolean(selectedCompositionId || assetInspectorHost && !assetInspectorHost.hidden);
  return model;
}

function activateCompositionTrack(item) {
  if (!item?.target) return;
  const target = item.target;
  const targetRows = target.type === 'external'
    ? (target.kind === 'subtitle' ? newSubtitleState : externalAudioState) : [];
  const index = target.index;
  // Never route a duplicated external object by the first metadata match:
  // two distinct File grants can share name, length and lastModified.
  const matched = target.type === 'external' &&
    Number.isSafeInteger(index) && index >= 0 && index < targetRows.length &&
    targetRows[index]?.file &&
    outputCompositionFileKey(targetRows[index].file) === target.fileKey ? index : -1;
  if (target.type === 'external' && matched < 0) {
    selectedCompositionId = '';
    renderOutputComposition();
    return;
  }
  selectedCompositionId = item.id;
  if (target.type === 'source') {
    const roles = resolveImportedRoles(importedAssetEntries, chosenImportSourceKey);
    if (!roles.sourceKey) return;
    containerTreeSelectedItem.set(roles.sourceKey, target.key);
    renderImportedAssetInventory();
    document.querySelector('[data-editor-filter="source"]')?.click();
  } else if (target.type === 'external') {
    const entry = importedAssetEntries.find(entry => entry.kind === target.kind &&
      entry.file === targetRows[matched].file);
    focusedImportedAssetKey = entry?.key || '';
    document.querySelector(`[data-editor-filter="${target.kind}"]`)?.click();
  } else if (target.type === 'font') {
    document.querySelector('[data-editor-filter="font"]')?.click();
  }
  if (matchMedia('(max-width: 600px)').matches) {
    document.querySelector('.workbench-jump-nav a[href="#workbench-editor-title"]')?.click();
  }
  const selector = target.type === 'source' ?
    '#assetInspectorHost [data-tree-track-field="title"]:not(:disabled), #assetInspectorHost button:not(:disabled)' :
    target.type === 'font' ? '#fontMode' :
    `[data-index="${matched}"][data-new-${target.kind === 'subtitle' ? 'sub' : 'audio'}-field="title"]`;
  // A click can detach its own composition button during the repaint.
  // Browser default focus finalization may then leave focus on <body>
  // AFTER our synchronous focus call. Reinstate the exact live editor on the
  // next animation frame, but only while the same object and File grant remain.
  const selection = item.id;
  const selectedFile = target.type === 'external' ? targetRows[matched].file : null;
  renderOutputComposition();
  const focusLiveTarget = () => {
    if (selectedCompositionId !== selection) return;
    if (target.type === 'external') {
      const current = target.kind === 'subtitle' ? newSubtitleState : externalAudioState;
      if (current[matched]?.file !== selectedFile ||
          outputCompositionFileKey(selectedFile) !== target.fileKey) return;
    }
    const first = document.querySelector(selector);
    if (first && document.activeElement !== first) first.focus({ preventScroll: true });
    first?.scrollIntoView({ block: 'nearest' });
  };
  focusLiveTarget();
  requestAnimationFrame(focusLiveTarget);
}
// R1 bounded navigation: ffprobe flat Chapter / format Tag observations are
// never themselves EBML writer targets. Explicitly rebind only the EXACT
// still-scanned public source File into the existing independent P2 inspector.
// Its change handler resets review and candidate, then re-inspects raw EBML.
// No field selection, user consent, writer authority or proof is forwarded.
document.addEventListener('softmux:open-observed-metadata-tool',event => {
  const {sourceFile,kind,observedId}=event.detail || {};
  if (!['chapters','tags'].includes(kind) || typeof observedId!=='string' ||
      isBusy() || batchRunning) return;
  const source=videoInput.files?.[0] || null;
  if (!source || sourceFile!==source || scannedSourceFile!==source ||
      !trackState || trackState.fileKey!==fileKey(source)) return;
  const roles=resolveImportedRoles(importedAssetEntries,chosenImportSourceKey);
  if (!roles.sourceKey || !importedAssetEntries.some(entry =>
      entry.key===roles.sourceKey && entry.file===source)) return;
  const rows=buildSourceObjectSections(trackState,{sourceFile:source})[kind];
  if (!rows?.some(row => row.id===observedId)) return;
  const input=$('p2MetadataSource');
  if (!input || typeof DataTransfer!=='function') return;
  try {
    const files=new DataTransfer();
    files.items.add(source);
    input.files=files.files;
    if (input.files?.[0]!==source) return;
    // Always invalidate any previous independent candidate / consent by
    // dispatching a new source change, even when the same File was used.
    input.dispatchEvent(new Event('change',{bubbles:true}));
    event.preventDefault();
  } catch(error) {
    // Unsupported FileList rebinds fail closed, without claiming navigation.
    console.warn('受限章节/标签工具来源绑定失败',error);
  }
});
// R1: route an observed source attachment into the existing authoritative
// source tree editor. Scan must still bind to this exact File; no second
// attachment field owner or guessed writer capability is introduced.
document.addEventListener('softmux:undo-observed-source-attachment',event => {
  if (undoRecentSourceAttachmentChange()) event.preventDefault();
});
document.addEventListener(
  'softmux:open-observed-source-attachment',event => {
    const index = event.detail?.sourceIndex;
    const source = videoInput.files?.[0] || null;
    if (!Number.isSafeInteger(index) || index < 0 || !source ||
        !trackState || scannedSourceFile !== source ||
        trackState.fileKey !== fileKey(source) ||
        !trackState.attachments?.some(row => row.index === index)) return;
    const documentModel = buildContainerDocument({
      video: source,
      trackState,
      appendMode: Boolean(appendPreserveAll?.checked && currentVideoIsMatroska()),
      externalAudio: externalAudioState,
      newSubtitles: newSubtitleState,
      fonts: selectedFonts(),
      fontMode: fontMode.value,
    });
    const matching = documentModel.composition.items.find(item =>
      item.target?.type === 'source' &&
      item.target.key === 'attachment:' + index);
    if (!matching) return;
    const roles = resolveImportedRoles(importedAssetEntries, chosenImportSourceKey);
    if (!roles.sourceKey) return;
    activateCompositionTrack(matching);
    // The caller changes from Attachments to Tracks only on acceptance.
    event.preventDefault();
  }
);
compositionTracks?.addEventListener('click', event => {
  const button = event.target.closest('button[data-composition-id]');
  if (!button) return;
  const currentDocument = buildContainerDocument({
    video: videoInput.files?.[0] || null,
    trackState: trackState?.fileKey === fileKey(videoInput.files?.[0]) ? trackState : null,
    appendMode: Boolean(appendPreserveAll?.checked && currentVideoIsMatroska()),
    externalAudio: externalAudioState,
    newSubtitles: newSubtitleState,
    fonts: selectedFonts(),
    fontMode: fontMode.value,
  });
  activateCompositionTrack(currentDocument.composition.items.find(item => item.id === button.dataset.compositionId));
});
sourceFilesDetails?.querySelector('summary')?.addEventListener('click', () => {
  sourceFilesDetails.dataset.userToggled = 'true';
});
function displayHashProgress({ bytesHashed, totalBytes }, source, controller) {
  if (videoInput.files?.[0] !== source || currentProjectSourceFile !== source) {
    controller.abort();
    return;
  }
  const done = (bytesHashed / (1024 * 1024)).toFixed(1);
  const total = (totalBytes / (1024 * 1024)).toFixed(1);
  const percent = totalBytes ? Math.floor(bytesHashed * 100 / totalBytes) : 100;
  if (containerProjectHashProgress)
    containerProjectHashProgress.textContent =
      '完整 SHA-256：' + percent + '% · ' + done + ' / ' + total + ' MiB';
}

async function runProjectHash(source, operation) {
  if (activeProjectHash) throw Error('PROJECT_HASH_BUSY');
  const controller = new AbortController();
  const task = { source, controller };
  activeProjectHash = task;
  if (containerProjectHashProgress) containerProjectHashProgress.textContent =
    '正在读取来源文件以计算完整 SHA-256…';
  renderOutputComposition();
  try {
    return await operation({
      signal: controller.signal,
      onProgress: progress => displayHashProgress(progress, source, controller),
    });
  } finally {
    if (activeProjectHash === task) {
      activeProjectHash = null;
      renderOutputComposition();
    }
  }
}

containerProjectHashCancelBtn?.addEventListener('click', () => {
  activeProjectHash?.controller.abort();
});
videoInput.addEventListener('change', () => {
  activeProjectHash?.controller.abort();
});
containerProjectRestoreConfirm?.addEventListener('change', () => renderOutputComposition());
containerProjectRestoreBtn?.addEventListener('click', () => {
  const source = videoInput.files?.[0] || null;
  const draft = importedProjectForReview;
  const proof = detachedSourceProof?.source === source &&
    detachedSourceProof?.draft === draft ? detachedSourceProof.verdict : null;
  try {
    if (!source || !draft || !containerProjectRestoreConfirm?.checked ||
        !proof || sourceDigestCheckInProgress || importInProgress ||
        isBusy() || batchRunning)
      throw Error('TRACK_REPLAY_CONFIRMATION_OR_SOURCE_REQUIRED');
    // Freshly project the current owned track editor at the commit boundary.
    // No asynchronous work occurs between final validation and mutation.
    const scanned = trackState?.fileKey === fileKey(source) ? trackState : null;
    const liveProjection = buildContainerDocument({
      video: source, trackState: scanned,
      appendMode: Boolean(appendPreserveAll?.checked && currentVideoIsMatroska()),
      externalAudio: externalAudioState, newSubtitles: newSubtitleState,
      fonts: selectedFonts(), fontMode: fontMode.value,
    });
    if (currentProjectSourceFile !== source ||
        liveProjection.sourceKey !== currentProjectSourceProjection?.sourceKey)
      throw Error('TRACK_REPLAY_SOURCE_CHANGED');
    const plan = prepareVerifiedTrackReplay({
      draft, liveProjection, sourceProof: proof, trackState: scanned,
      appendMode: Boolean(appendPreserveAll?.checked && currentVideoIsMatroska()),
    });
    const receipt = applyPreparedTrackReplay(plan, scanned);
    refreshLiveSourceTrackAuthority();
    lastProjectRestore = { source, draft, trackState: scanned, plan };
    containerProjectRestoreConfirm.checked = false;
    renderTrackList();
    renderAttachmentList();
    renderImportedAssetInventory();
    renderMuxPlan();
    renderOutputComposition();
    containerProjectRestoreStatus.textContent = '已将 ' +
      receipt.reviewedFields + ' 项修改一次应用到 ' + receipt.updatedTracks +
      ' 条来源轨道及 ' + (receipt.updatedAttachments || 0) +
       ' 个来源附件的当前编辑方案；未写入文件、未启动封装。后续仍须正常预检与成品审计。';
  } catch (error) {
    containerProjectRestoreStatus.textContent = '未应用：' +
      (error?.message || String(error)) + '。当前轨道与附件编辑状态未更改。';
    renderOutputComposition();
  }
});
containerProjectRestoreUndoBtn?.addEventListener('click', () => {
  const undo = lastProjectRestore;
  const source = videoInput.files?.[0] || null;
  try {
    if (!undo || undo.source !== source ||
        undo.draft !== importedProjectForReview ||
        undo.trackState !== trackState ||
        isBusy() || batchRunning || importInProgress)
      throw Error('TRACK_REPLAY_UNDO_SOURCE_CHANGED');
    const result = revertPreparedTrackReplay(undo.plan, trackState);
    refreshLiveSourceTrackAuthority();
    lastProjectRestore = null;
    renderTrackList();
    renderAttachmentList();
    renderImportedAssetInventory();
    renderMuxPlan();
    renderOutputComposition();
    containerProjectRestoreStatus.textContent = '已撤销本次恢复涉及的 ' +
      result.revertedTracks + ' 条轨道及 ' + (result.revertedAttachments || 0) +
       ' 个附件的修改，仍未写入文件。';
  } catch (error) {
    containerProjectRestoreStatus.textContent = '撤销未执行：' +
      (error?.message || String(error)) + '。请检查当前编辑冲突。';
    renderOutputComposition();
  }
});
containerProjectImportInput?.addEventListener('change', async () => {
  const file = containerProjectImportInput.files?.[0];
  containerProjectImportInput.value = '';
  if (!file) return;
  try {
    if (file.size > PROJECT_IMPORT_MAX_BYTES) throw Error('PROJECT_IMPORT_TOO_LARGE');
    // Even byte-identical names are NOT evidence of file byte identity.
    // This never changes file inputs, the writer's current source state,
    // directory grants, active jobs or the executable composition.
    const draft = parseContainerProjectDraft(await file.text());
    activeProjectHash?.controller.abort();
    importedProjectForReview = draft;
    detachedSourceProof = null;
    if (containerProjectRestoreConfirm) containerProjectRestoreConfirm.checked = false;
    if (containerProjectRestoreStatus) containerProjectRestoreStatus.textContent = '';
    renderOutputComposition();
  } catch (error) {
    // Invalid new import cannot overwrite a previously validated draft.
    if (containerProjectImportReview) {
      containerProjectImportReview.hidden = false;
      containerProjectImportReview.dataset.state = 'rejected';
      containerProjectImportReview.textContent =
        '工程草稿被拒绝：' + (error?.message || String(error)) +
        '。未修改当前素材、轨道或封装计划。';
    }
  }
});
containerProjectVerifySourceBtn?.addEventListener('click', async () => {
  const source = videoInput.files?.[0] || null;
  const draft = importedProjectForReview;
  if (!source || !draft || sourceDigestCheckInProgress || activeProjectHash) return;
  sourceDigestCheckInProgress = true;
  containerProjectVerifySourceBtn.disabled = true;
  containerProjectVerifySourceBtn.textContent = '正在核对完整 SHA-256…';
  try {
    const verdict = await runProjectHash(source, options =>
      verifyContainerProjectSourceDigest(draft, source, options));
    // No successful hash may cross a source-File or detached-draft change.
    if (videoInput.files?.[0] !== source || importedProjectForReview !== draft) {
      status.textContent = '来源或草稿在核对期间发生变化，结果已作废。';
      return;
    }
    detachedSourceProof = { source, draft, verdict };
    renderOutputComposition();
  } catch (error) {
    if (videoInput.files?.[0] === source && importedProjectForReview === draft) {
      detachedSourceProof = null;
      containerProjectImportReview.hidden = false;
      containerProjectImportReview.dataset.state = 'hash-refused';
      containerProjectImportReview.textContent =
        '来源字节验证失败：' + (error?.message || String(error)) +
        '。没有恢复旧编辑意图、文件权限或成品。';
    }
  } finally {
    sourceDigestCheckInProgress = false;
    containerProjectVerifySourceBtn.textContent = '核对已导入草稿与当前媒体的完整 SHA-256';
    renderOutputComposition();
  }
});
// External checkpoint recovery is a separate, user-reviewed authorization
// boundary. Imported JSON is inert and does not retain File/sidecar grants.
const externalCheckpointControls = {
  export: $('externalCheckpointExportBtn'),
  input: $('externalCheckpointImportInput'),
  prepare: $('externalCheckpointPrepareBtn'),
  confirm: $('externalCheckpointConfirm'),
  apply: $('externalCheckpointApplyBtn'),
  undo: $('externalCheckpointUndoBtn'),
  status: $('externalCheckpointStatus'),
};
let pendingExternalCheckpoint = null;
let preparedExternalCheckpoint = null;
let externalCheckpointUndo = null;
let externalCheckpointBusy = false;
function resetExternalCheckpointApproval() {
  preparedExternalCheckpoint = null;
  externalCheckpointControls.confirm.checked = false;
  externalCheckpointControls.confirm.disabled = true;
  externalCheckpointControls.apply.disabled = true;
}
externalCheckpointControls.export?.addEventListener('click', async () => {
  if(externalCheckpointBusy || isBusy() || batchRunning) return;
  externalCheckpointBusy = true;
  try {
    if(!liveWorkspaceAuthority) throw Error('EXTERNAL_CHECKPOINT_NO_ACTIVE_PROJECT');
    const json = await exportExternalMetadataCheckpoint(
      liveWorkspaceAuthority,liveWorkspaceContext());
    const url = URL.createObjectURL(new Blob([json],{type:'application/json;charset=utf-8'}));
    const a=document.createElement('a');
    a.href=url;a.download='mkv-external-metadata-checkpoint-v1.json';
    document.body.appendChild(a);a.click();a.remove();
    // Give the browser download handler ownership of the URL first.
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    externalCheckpointControls.status.textContent =
      '已导出不含文件权限的外部元数据草稿；恢复时必须重新选择文件并逐字节验证 SHA-256。';
  } catch(e) {
    externalCheckpointControls.status.textContent='外部草稿导出失败：'+(e.message||String(e));
  } finally { externalCheckpointBusy = false; }
});
externalCheckpointControls.input?.addEventListener('change',async()=>{
  const file=externalCheckpointControls.input.files?.[0];
  externalCheckpointControls.input.value='';
  pendingExternalCheckpoint=null;
  resetExternalCheckpointApproval();
  externalCheckpointControls.prepare.disabled=true;
  if(!file)return;
  try {
    if(file.size>1024*1024)throw Error('EXTERNAL_CHECKPOINT_TOO_LARGE');
    pendingExternalCheckpoint=parseExternalMetadataCheckpoint(await file.text());
    externalCheckpointControls.prepare.disabled=false;
    externalCheckpointControls.status.textContent =
      '草稿已作为未授权数据读取。请确认当前外部文件与 sidecar 选择，再点击 SHA-256 验证。';
  } catch(e) {
    externalCheckpointControls.status.textContent='外部草稿无效：'+(e.message||String(e));
  }
});
externalCheckpointControls.prepare?.addEventListener('click',async()=>{
  if(externalCheckpointBusy||isBusy()||batchRunning||!pendingExternalCheckpoint)return;
  resetExternalCheckpointApproval();
  externalCheckpointBusy=true;
  externalCheckpointControls.status.textContent='正在核验当前音频、字幕和 sidecar 全部内容 SHA-256…';
  try {
    if(!liveWorkspaceAuthority)throw Error('EXTERNAL_CHECKPOINT_NO_ACTIVE_PROJECT');
    const workspace=liveWorkspaceAuthority,context=liveWorkspaceContext();
    const prepared=await prepareExternalMetadataRecovery(
      workspace,context,pendingExternalCheckpoint);
    if(workspace!==liveWorkspaceAuthority)
      throw Error('EXTERNAL_CHECKPOINT_WORKSPACE_CHANGED');
    preparedExternalCheckpoint=prepared;
    externalCheckpointControls.confirm.disabled=false;
    externalCheckpointControls.status.textContent=
      '所有外部文件内容已与草稿摘要匹配；待恢复 '+prepared.changes.length+
      ' 项字段。摘要匹配不证明草稿作者或写入权限。请检查当前字段后单独确认。';
  } catch(e) {
    externalCheckpointControls.status.textContent='来源重新绑定未通过：'+(e.message||String(e));
  } finally {externalCheckpointBusy=false;}
});
externalCheckpointControls.confirm?.addEventListener('change',()=>{
  externalCheckpointControls.apply.disabled=
    !externalCheckpointControls.confirm.checked||!preparedExternalCheckpoint;
});
externalCheckpointControls.apply?.addEventListener('click',()=>{
  if(!preparedExternalCheckpoint||!externalCheckpointControls.confirm.checked||
      isBusy()||batchRunning)return;
  try {
    if(!liveWorkspaceAuthority)throw Error('EXTERNAL_CHECKPOINT_WORKSPACE_MISSING');
    const result=applyPreparedExternalRecovery(
      liveWorkspaceAuthority,liveWorkspaceContext(),preparedExternalCheckpoint,
      {confirmed:true});
    externalCheckpointUndo=result.undo;
    externalCheckpointControls.undo.disabled=!externalCheckpointUndo;
    resetExternalCheckpointApproval();
    externalCheckpointControls.status.textContent=
      '已明确应用 '+(result.applied||0)+' 项外部元数据；没有恢复文件权限或自动执行封装。';
    // Domain commit precedes UI: redraw from authoritative rows BEFORE
    // updateUI snapshots editor controls, or stale DOM can reapply old values.
    renderNewTrackLists();
    updateUI();renderMuxPlan();
  } catch(e) {
    resetExternalCheckpointApproval();
    externalCheckpointControls.status.textContent='恢复拒绝：'+(e.message||String(e));
  }
});
externalCheckpointControls.undo?.addEventListener('click',()=>{
  if(!externalCheckpointUndo||isBusy()||batchRunning)return;
  try {
    undoAppliedExternalRecovery(
      liveWorkspaceAuthority,liveWorkspaceContext(),externalCheckpointUndo);
    externalCheckpointUndo=null;
    externalCheckpointControls.undo.disabled=true;
    externalCheckpointControls.status.textContent='已撤销本次外部元数据恢复。';
    renderNewTrackLists();
    updateUI();renderMuxPlan();
  } catch(e) {
    externalCheckpointControls.status.textContent='撤销拒绝：'+(e.message||String(e));
    externalCheckpointUndo=null;
    externalCheckpointControls.undo.disabled=true;
  }
});

// Packaging combines existing independent recovery scopes; it never grants
// either domain a File or writer permission and never atomically replays edits.
workspaceBundleExportBtn?.addEventListener('click',async()=>{
  const source=videoInput.files?.[0]||null;
  const workspace=liveWorkspaceAuthority,generation=workspace?.generation??null;
  if(workspaceBundleBusy||projectDigestExportInProgress||
      externalCheckpointBusy||activeProjectHash||isBusy()||batchRunning){
    workspaceBundleStatus.textContent='当前正在执行媒体扫描、散列或其他工作台操作；'+
      '组合草稿未导出。操作结束后可重新点击，既有成品不受影响。';
    return;
  }
  if(!source||currentProjectSourceFile!==source||!currentProjectSourceProjection){
    workspaceBundleStatus.textContent='请先加载并检查真实来源。';return;
  }
  workspaceBundleBusy=true;projectDigestExportInProgress=true;
  externalCheckpointBusy=true;workspaceBundleExportBtn.disabled=true;
  try{
    // Computing the plan belongs to the protected export boundary too; an
    // invalid live project must be reported rather than silently failing an
    // async click handler before any user-visible status update.
    const initialPlan=JSON.stringify(buildMuxPlan());
    const digest=source.size<=PROJECT_SOURCE_HASH_MAX_BYTES
      ?await runProjectHash(source,opts=>hashBoundedProjectSource(source,opts)):null;
    const current=()=>videoInput.files?.[0]===source&&
      currentProjectSourceFile===source&&liveWorkspaceAuthority===workspace&&
      (workspace?.generation??null)===generation&&
      JSON.stringify(buildMuxPlan())===initialPlan;
    if(!current())throw Error('WORKSPACE_BUNDLE_SOURCE_OR_PLAN_CHANGED');
    const latest=currentProjectSourceProjection;
    if(!latest||latest.sourceKey!==outputCompositionFileKey(source))
      throw Error('WORKSPACE_BUNDLE_SOURCE_PROJECTION_CHANGED');
    let project=createEditedContainerProjectFromProjection(latest);
    if(digest)project=attachContainerProjectSourceDigest(project,digest);
    const withExternal=externalAudioState.length>0||newSubtitleState.length>0;
    const externalJson=withExternal
      ?await exportExternalMetadataCheckpoint(workspace,liveWorkspaceContext()):null;
    if(!current())throw Error('WORKSPACE_BUNDLE_EXTERNAL_OR_PLAN_CHANGED');
    const json=serializePortableWorkspaceBundle({
      sourceDraftJson:serializeContainerProject(project),
      externalCheckpointJson:externalJson,
    });
    const url=URL.createObjectURL(new Blob([json],{type:'application/json;charset=utf-8'}));
    const link=document.createElement('a');
    link.href=url;link.download='softmux-workspace-metadata-bundle-v1.json';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    workspaceBundleStatus.textContent='已导出一个组合元数据草稿：'+
      (digest?'来源完整 SHA-256 已记录；':'来源超过哈希限制，恢复必须拒绝；')+
      (withExternal?'外部轨道及 sidecar 有独立 SHA-256。':'未包含外部轨道元数据。')+
      ' 媒体字节、浏览器文件权限和一键原子恢复均不包含。';
  }catch(error){
    workspaceBundleStatus.textContent='组合草稿导出拒绝：'+
      (error?.message||String(error))+'；未生成未经核验的文件。';
  }finally{
    workspaceBundleBusy=false;externalCheckpointBusy=false;
    projectDigestExportInProgress=false;workspaceBundleExportBtn.disabled=false;
    renderOutputComposition();
  }
});
workspaceBundleImportInput?.addEventListener('change',async()=>{
  const file=workspaceBundleImportInput.files?.[0]||null;
  workspaceBundleImportInput.value='';
  if(!file||workspaceBundleBusy||isBusy()||batchRunning)return;
  workspaceBundleBusy=true;
  try{
    if(file.size>PORTABLE_WORKSPACE_BUNDLE_MAX_BYTES)
      throw Error('WORKSPACE_BUNDLE_TOO_LARGE');
    // Validate both imported schemas before mutating either draft slot.
    const parsed=parsePortableWorkspaceBundle(await file.text());
    activeProjectHash?.controller.abort();
    importedProjectForReview=parsed.sourceDraft;
    detachedSourceProof=null;
    // Import is inert: do not destroy undo receipts for edits that were
    // already explicitly applied to the live workspace. Their own revision
    // guards determine whether they remain usable.
    pendingExternalCheckpoint=parsed.externalCheckpoint;
    resetExternalCheckpointApproval();
    externalCheckpointControls.prepare.disabled=!pendingExternalCheckpoint;
    if(containerProjectRestoreConfirm)containerProjectRestoreConfirm.checked=false;
    if(containerProjectRestoreStatus)containerProjectRestoreStatus.textContent='';
    externalCheckpointControls.status.textContent=pendingExternalCheckpoint
      ?'组合草稿已读取；须重新选择外部音频/字幕/sidecar，再核对 SHA-256 并独立确认。'
      :'组合草稿没有外部音频/字幕草稿，未恢复任何外部权限。';
    workspaceBundleStatus.textContent='已同时读取两个相互独立的未授权草稿范围。'+
      ' 来源与外部部分仍需分别验证和确认；未修改可执行工程或封装器。';
    renderOutputComposition();
  }catch(error){
    workspaceBundleStatus.textContent='组合草稿无效，整包已拒绝：'+
      (error?.message||String(error))+
      '；此前的待审核草稿、媒体与执行方案未改变。';
  }finally{workspaceBundleBusy=false;}
});

containerProjectExportBtn?.addEventListener('click', async () => {
  // Detached domain export is an explicit READ, never a writer authorization.
  // It can run during track scanning, but must not retain stale source bytes.
  const source = videoInput.files?.[0] || null;
  const oldProjection = currentProjectSourceProjection;
  if (projectDigestExportInProgress || activeProjectHash) return;
  if (!source || !oldProjection || currentProjectSourceFile !== source) {
    status.textContent = '工程草稿来源不可用；请重新导入并检查当前素材。';
    return;
  }
  projectDigestExportInProgress = true;
  containerProjectExportBtn.disabled = true;
  try {
    let digest = null;
    if (source.size <= PROJECT_SOURCE_HASH_MAX_BYTES) {
      status.textContent = '正在计算来源完整 SHA-256（大型文件分块读取）…';
      digest = await runProjectHash(source, options =>
        hashBoundedProjectSource(source, options));
    }
    if (videoInput.files?.[0] !== source ||
        currentProjectSourceFile !== source) {
      status.textContent = '计算期间来源已更换，未导出过期草稿。';
      return;
    }
    // Re-read the latest projection following any async scan. Do not export
    // a preview from before the track inventory or source selection changed.
    const latest = currentProjectSourceProjection;
    if (!latest || latest.sourceKey !== outputCompositionFileKey(source))
      throw Error('PROJECT_SOURCE_PROJECTION_STALE');
    let project = createEditedContainerProjectFromProjection(latest);
    if (digest) project = attachContainerProjectSourceDigest(project, digest);
    const url = URL.createObjectURL(new Blob([serializeContainerProject(project)], {
      type: 'application/json;charset=utf-8',
    }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mkv-container-project-draft-v1.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    const sourceEditorBound = scannedSourceFile === source &&
      trackState?.fileKey === fileKey(source);
    const movedKinds = new Set(sourceEditorBound
      ? trackState.tracks.filter(track => track.order !== track.index)
        .map(track => track.type) : []);
    const orderChanges = movedKinds.size > 0;
    const orderHasExcludedPeer = sourceEditorBound && trackState.tracks.some(track =>
      movedKinds.has(track.type) && !track.include);
    const attachmentEdits = sourceEditorBound &&
      trackState.attachments.some(item => !item.include ||
        item.filename !== item.originalFilename ||
        item.mimetype !== item.originalMimetype);
    status.textContent = (digest
      ? '已导出含完整来源 SHA-256 的解绑草稿；它不能自动恢复写入权限。'
      : '已导出解绑草稿；来源超过 16 GiB，未证明字节一致，恢复编辑仍被阻断。') +
      (orderChanges
        ? !digest
          ? ' 注意：轨道排序虽已记录，但缺少完整来源 SHA-256，无法执行安全恢复。'
          : orderHasExcludedPeer
            ? ' 注意：排序涉及的同类轨道包含已排除项；此类排序恢复仍被保守阻断。'
            : ' 轨道排序修改已记录为可核验的草稿意图；同类轨道全部保留时可在来源与排列核对、明确确认后恢复。'
        : '') +
      (attachmentEdits
        ? digest
          ? ' 来源附件的保留、文件名和 MIME 修改已记录为可核验的草稿意图；仍需同一来源文件、旧值无冲突、显式确认，且最终封装仍受原有保真预检限制。'
          : ' 注意：来源附件修改虽已记录，但缺少完整来源 SHA-256，不能执行安全恢复。'
        : '');
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch (error) {
    status.textContent = '无法导出工程草稿：' + (error?.message || String(error));
  } finally {
    projectDigestExportInProgress = false;
    // Recompute every control from current source identity.
    renderOutputComposition();
  }
});
compositionMuxBtn?.addEventListener('click', () => { if (!muxBtn.disabled) void executeCurrentMuxTask(); });
editorMuxBtn?.addEventListener('click', () => { if (!muxBtn.disabled) void executeCurrentMuxTask(); });
objectEditorBack?.addEventListener('click', () =>
  document.querySelector('.workbench-jump-nav a[href="#source-title"]')?.click());

function renderImportedAssetInventory() {
  if (!assetInventory || !assetImportStatus) return;
  // Preserve both disclosure levels when replacing the list after a checkbox
  // change; an editing click must not collapse the same control it updated.
  assetInventory.querySelectorAll('details[data-source-tree]').forEach((details) => {
    containerTreeExpansion.set(details.dataset.sourceTree, details.open);
  });
  assetInspectorHost?.querySelectorAll('details[data-tree-advanced]').forEach((details) => {
    containerTreeAdvancedExpansion.set(details.dataset.treeAdvanced, details.open);
  });
  sourceInspectorMarkup = '';
  const entries = importedAssetEntries;
  const editorGrid = document.querySelector('.editor-grid');
  if (editorGrid) {
    editorGrid.dataset.intakeMode = entries.length ? 'unified' : 'empty';
    editorGrid.dataset.showAdvancedSource = String(showAdvancedSourceTools);
  }
  const roles = resolveImportedRoles(entries, chosenImportSourceKey);
  // Choosing a source may clear the ambiguity that opened this disclosure.
  // Do not collapse it under a focused keyboard control: that would remove
  // the active radio from the accessibility tree mid-interaction.
  const focusedSourceRadio = sourceFilesDetails?.contains(document.activeElement)
    ? document.activeElement?.getAttribute('data-asset-source') : null;
  if (sourceFilesDetails && !sourceFilesDetails.dataset.userToggled) {
    sourceFilesDetails.open = Boolean(
      roles.needsSourceChoice || roles.unknown.length || focusedSourceRadio
    );
  }
  const identityCollisions = entries.filter(entry =>
    entry.evidence === 'metadata-identity-collision').length;
  assetImportStatus.textContent = importInProgress
    ? `正在按内容识别 ${importPendingCount} 个文件…`
    : !entries.length
      ? '尚未导入文件'
      : `${entries.length} 项资源 · ${roles.unknown.length} 项未识别${identityCollisions ? ` · ${identityCollisions} 项文件身份冲突` : ''}${roles.needsSourceChoice ? ' · 请选择主源' : ''}`;
  if (!entries.length) {
    assetInventory.innerHTML = '<div class="track-empty">暂无文件</div>';
    if (assetInspectorHost) {
      assetInspectorHost.replaceChildren();
      assetInspectorHost.hidden = true;
    }
    renderOutputComposition();
    return;
  }
  assetInventory.innerHTML = entries.map((entry) => {
    const selected = roles.sourceKey === entry.key && entry.kind === 'container';
    const canChange = !isBusy() && !batchRunning && !importInProgress;
    const kindLabel = {
      container: '媒体容器', subtitle: '字幕', font: '字体',
      audio: '独立音频', unknown: '未识别',
    }[entry.kind] || '未知';
    const sourceScanned = selected && trackState?.fileKey === fileKey(entry.file);
    const statusLabel = sourceScanned ? '已扫描'
      : entry.status === ASSET_STATUS.RECOGNIZED ? '已识别'
      : entry.status === ASSET_STATUS.UNVERIFIED ? '待核验'
      : '不可用';
    const counts = sourceScanned
      ? Object.entries(
          (trackState.streams || []).reduce((all, stream) => {
            all[stream.codec_type] = (all[stream.codec_type] || 0) + 1;
            return all;
          }, {})
        ).map(([type, count]) => `${containerKindLabel(type)} ${count}`).join(' · ')
      : '';
    const sourceNote = entry.kind === 'container' && !selected
      ? '未设为主源'
      : '';
    return `<div class="asset-entry" data-kind="${entry.kind}" ${focusedImportedAssetKey === entry.key ? 'data-focused="true"' : ''}>
      <div class="asset-entry-main">
        <div class="asset-entry-line">
          <strong class="asset-entry-name">${escapeHtml(entry.file.webkitRelativePath || entry.file.name)}</strong>
          <span class="asset-entry-type">${kindLabel} · ${escapeHtml(entry.label)} · ${statusLabel}</span>
          ${entry.kind === "container" ? sourceSizeAdvisoryMarkup(entry.file) : ""}
        </div>
        <div class="asset-entry-desc">${escapeHtml(counts || sourceNote || entry.detail || '')}</div>
      </div>
      <div class="asset-entry-roles">
        ${['subtitle', 'audio', 'font'].includes(entry.kind) ? `<button type="button" class="asset-focus" data-asset-focus-key="${escapeHtml(entry.key)}" aria-label="编辑 ${escapeHtml(entry.file.name)}">编辑</button>` : ''}
        ${entry.kind === 'container' ? `<label class="asset-select-source">
          <input type="radio" name="assetMainSource" data-asset-source="${escapeHtml(entry.key)}" ${selected ? 'checked' : ''} ${canChange ? '' : 'disabled'} />
          设为主源
        </label>` : ''}
        <button type="button" class="asset-remove" data-asset-remove="${escapeHtml(entry.key)}" ${canChange ? '' : 'disabled'}>移除</button>
      </div>
      ${renderSourceContainerTree(entry, selected, sourceScanned)}
    </div>`;
  }).join('');
  if (focusedSourceRadio) {
    const replacement = [...assetInventory.querySelectorAll('[data-asset-source]')]
      .find(radio => radio.dataset.assetSource === focusedSourceRadio);
    if (replacement && !replacement.disabled && sourceFilesDetails?.open) {
      replacement.focus({ preventScroll: true });
    }
  }
  if (assetInspectorHost) {
    assetInspectorHost.innerHTML = sourceInspectorMarkup;
    assetInspectorHost.hidden = !sourceInspectorMarkup;
  }
  renderOutputComposition();
}

async function importUnifiedAssets(files) {
  if (isBusy() || batchRunning || importInProgress) return;
  const selections = planIncomingAssetIntake(files, importedAssetEntries);
  const incoming = selections.filter(item => !item.conflict).map(item => item.file);
  const conflicts = selections.filter(item => item.conflict).map(item => item.conflict);
  if (!incoming.length && !conflicts.length) return;
  importInProgress = true;
  importPendingCount = incoming.length;
  updateUI();
  try {
    // Bound concurrent reads: each classifier inspects at most 256 KiB.
    const identified = [];
    for (let start = 0; start < incoming.length; start += 4) {
      identified.push(...await Promise.all(incoming.slice(start, start + 4).map((file) =>
        identifyImportedAsset(file)
      )));
    }
    importedAssetEntries = [...importedAssetEntries, ...identified, ...conflicts];
    applyImportedAssetRoles();
  } finally {
    importInProgress = false;
    importPendingCount = 0;
    updateUI();
  }
}

unifiedAssetInput?.addEventListener('change', () => {
  void importUnifiedAssets(unifiedAssetInput.files);
  unifiedAssetInput.value = '';
});
unifiedFolderInput?.addEventListener('change', () => {
  void importUnifiedAssets(unifiedFolderInput.files);
  unifiedFolderInput.value = '';
});
assetDropzone?.addEventListener('click', () => {
  if (!isBusy() && !batchRunning && !importInProgress) unifiedAssetInput?.click();
});
assetDropzone?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  if (!isBusy() && !batchRunning && !importInProgress) unifiedAssetInput?.click();
});
assetDropzone?.addEventListener('dragover', (event) => {
  if (isBusy() || batchRunning || importInProgress) return;
  event.preventDefault();
  assetDropzone.dataset.dragging = 'true';
});
assetDropzone?.addEventListener('dragleave', () => {
  assetDropzone.dataset.dragging = 'false';
});
assetDropzone?.addEventListener('drop', (event) => {
  event.preventDefault();
  assetDropzone.dataset.dragging = 'false';
  void importUnifiedAssets(event.dataTransfer?.files);
});
assetInventory?.addEventListener('toggle', (event) => {
  const details = event.target.closest?.('details[data-source-tree]');
  if (details && assetInventory.contains(details)) {
    containerTreeExpansion.set(details.dataset.sourceTree, details.open);
  }
}, true);
assetInspectorHost?.addEventListener('toggle', (event) => {
  const details = event.target.closest?.('details[data-tree-advanced]');
  if (details && assetInspectorHost.contains(details)) {
    containerTreeAdvancedExpansion.set(details.dataset.treeAdvanced, details.open);
  }
}, true);

function editSourceFromInventory(event) {
  if (!trackState || isBusy() || batchRunning) return;
  const element = event.target;
  const trackIndex = element.dataset.treeTrackIndex ?? element.dataset.treeTrackInclude;
  const attachmentIndex = element.dataset.treeAttachmentIndex ?? element.dataset.treeAttachmentInclude;
  let modified = false;
  if (trackIndex !== undefined) {
    const track = trackState.tracks.find((item) => item.index === Number(trackIndex));
    if (!track) return;
    if (element.dataset.treeTrackInclude !== undefined) {
      if (!changeSourceTracks([{ index: track.index, field: 'include', value: element.checked }]))
        return;
    } else if (element.dataset.treeTrackFlag) {
      if (!changeSourceTracks([{ index: track.index,
        field: element.dataset.treeTrackFlag, value: element.checked }]))
        return;
    } else if (element.dataset.treeTrackField) {
      if (!changeSourceTracks([{ index: track.index, field: element.dataset.treeTrackField, value: element.value }]))
        return;
      if (element.dataset.treeTrackField === 'title') {
        const activeLabel = assetInventory?.querySelector('.asset-tree-select[aria-pressed="true"] .asset-tree-index-name');
        if (activeLabel) activeLabel.textContent = element.value || containerStreamTitle(
          trackState.streams.find((stream) => stream.index === track.index) || { index: track.index }
        );
      }
    }
    renderTrackList();
    modified = true;
  } else if (attachmentIndex !== undefined) {
    const item = trackState.attachments.find((entry) => entry.index === Number(attachmentIndex));
    if (!item) return;
    if (element.dataset.treeAttachmentInclude !== undefined) {
      if (!changeSourceAttachments([{index:item.index,field:'include',value:element.checked}])) return;
      preserveAttachments.checked = trackState.attachments.length > 0 &&
        trackState.attachments.every((entry) => entry.include);
    } else if (element.dataset.treeAttachmentField) {
      if (!changeSourceAttachments([{index:item.index,
        field:element.dataset.treeAttachmentField,value:element.value}])) return;
      if (element.dataset.treeAttachmentField === 'filename') {
        const activeLabel = assetInventory?.querySelector('.asset-tree-select[aria-pressed="true"] .asset-tree-index-name');
        if (activeLabel) activeLabel.textContent = element.value || `附件 #${item.index}`;
      }
    }
    renderAttachmentList();
    modified = true;
  }
  if (modified) {
    renderContainerChangeSummary();
    renderMuxPlan();
    if (event.type === 'change' && element.type === 'checkbox') renderImportedAssetInventory();
  }
}

for (const target of [assetInventory, assetInspectorHost]) {
  target?.addEventListener('input', (event) => {
    if (event.target.matches('[data-tree-track-field], [data-tree-attachment-field]')) {
      editSourceFromInventory(event);
    }
  });
  target?.addEventListener('change', (event) => {
    if (event.target.matches('[data-tree-track-field], [data-tree-attachment-field]')) return;
    if (event.target.matches('[data-tree-preserve-all]')) {
      appendPreserveAll.checked = event.target.checked;
      appendPreserveAll.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (event.target.matches('[data-tree-track-include], [data-tree-track-flag], [data-tree-attachment-include]')) {
      editSourceFromInventory(event);
    }
  });
}

assetInventory?.addEventListener('change', (event) => {
  const radio = event.target.closest('[data-asset-source]');
  if (!radio || isBusy() || batchRunning || importInProgress) return;
  chosenImportSourceKey = radio.dataset.assetSource;
  applyImportedAssetRoles();
  focusUpdatedInventoryItem(assetInventory, {
    selector: '[data-asset-source]',
    keyAttribute: 'data-asset-source',
    key: chosenImportSourceKey,
    fallback: assetDropzone,
  });
});
function handleInspectorTrackMove(event) {
  const moveButton = event.target.closest('button[data-tree-track-move]');
  if (!moveButton) return false;
  if (!trackState || isBusy() || batchRunning || appendPreserveAll?.checked) return true;
  const track = trackState.tracks.find((item) => item.index === Number(moveButton.dataset.treeTrackIndex));
  if (!track || !track.include) return true;
  if (!moveTrack(track, Number(moveButton.dataset.treeTrackMove))) return true;
  renderTrackList();
  renderImportedAssetInventory();
  renderContainerChangeSummary();
  renderMuxPlan();
  return true;
}
assetInspectorHost?.addEventListener('click', (event) => {
  handleInspectorTrackMove(event);
});

assetInventory?.addEventListener('click', (event) => {
  const open = event.target.closest('button[data-asset-focus-key]');
  if (open) {
    const entry = importedAssetEntries.find(item => item.key === open.dataset.assetFocusKey);
    if (!entry || !['subtitle', 'audio', 'font'].includes(entry.kind)) return;
    focusedImportedAssetKey = entry.key;
    document.querySelector(`[data-editor-filter="${entry.kind}"]`)?.click();
    // Update the visual selection without rerendering or losing input focus.
    assetInventory.querySelectorAll('.asset-entry').forEach(row => row.removeAttribute('data-focused'));
    open.closest('.asset-entry')?.setAttribute('data-focused', 'true');
    if (matchMedia('(max-width: 600px)').matches) {
      document.querySelector('.workbench-jump-nav a[href="#workbench-editor-title"]')?.click();
    }
    const list = entry.kind === 'subtitle' ? newSubtitleList :
      entry.kind === 'audio' ? newAudioList : null;
    const states = entry.kind === 'subtitle' ? newSubtitleState :
      entry.kind === 'audio' ? externalAudioState : [];
    const index = states.findIndex(item => fileKey(item.file) === fileKey(entry.file));
    const selector = entry.kind === 'subtitle' ? 'data-new-sub-field' : 'data-new-audio-field';
    const control = index >= 0 ? list?.querySelector(`[data-index="${index}"][${selector}="title"]`)
      : entry.kind === 'font' ? document.getElementById('fontMode') :
        document.querySelector(`[data-editor-filter="${entry.kind}"]`);
    control?.focus({ preventScroll: true });
    control?.scrollIntoView({ block: 'nearest' });
    return;
  }
  const selected = event.target.closest('button[data-tree-select]');
  if (selected) {
    const source = selected.closest('[data-source-tree]');
    if (!source) return;
    const targetKey = selected.dataset.treeSelect;
    containerTreeSelectedItem.set(source.dataset.sourceTree, targetKey);
    renderImportedAssetInventory();
    // One selected source stream owns the center inspector. Keep container
    // mode/probe controls available, without displaying a second full tree.
    document.querySelector('[data-editor-filter="source"]')?.click();
    // Inventory list nodes are replaced during projection; return keyboard
    // focus to the same logical item rather than dropping it to document.body.
    const reselected = [...assetInventory.querySelectorAll('button[data-tree-select]')]
      .find((button) => button.dataset.treeSelect === targetKey);
    reselected?.focus({ preventScroll: true });
    if (matchMedia('(max-width: 600px)').matches) {
      // Phone: one work area at a time. Selecting a track opens its *existing*
      // inspector; no secondary editor or copied form is instantiated.
      const editorTab = document.querySelector('.workbench-jump-nav a[href="#workbench-editor-title"]');
      editorTab?.click();
      assetInspectorHost?.querySelector('input:not([disabled]), select:not([disabled]), button:not([disabled])')
        ?.focus({ preventScroll: true });
    } else if (matchMedia('(max-width: 1439px)').matches) {
      assetInspectorHost?.scrollIntoView({ block: 'nearest' });
    }
    return;
  }
  const tools = event.target.closest('button[data-tree-advanced-tools]');
  if (tools) {
    showAdvancedSourceTools = !showAdvancedSourceTools;
    renderImportedAssetInventory();
    if (showAdvancedSourceTools) {
      document.querySelector('.source-track-card')?.scrollIntoView({ block: 'nearest' });
    }
    return;
  }
  if (handleInspectorTrackMove(event)) return;
  const button = event.target.closest('[data-asset-remove]');
  if (!button || isBusy() || batchRunning || importInProgress) return;
  const key = button.dataset.assetRemove;
  const previousIndex = [...assetInventory.querySelectorAll('button[data-asset-remove]')].indexOf(button);
  importedAssetEntries = importedAssetEntries.filter((entry) => entry.key !== key);
  if (chosenImportSourceKey === key) chosenImportSourceKey = '';
  if (focusedImportedAssetKey === key) focusedImportedAssetKey = '';
  applyImportedAssetRoles();
  focusUpdatedInventoryItem(assetInventory, {
    selector: 'button[data-asset-remove]',
    previousIndex,
    fallback: assetDropzone,
  });
});

videoInput.addEventListener('change', () => {
  // Selecting another primary media begins a different task authorization
  // generation. In particular, cancelled/restarted tasks must not retain
  // an external-domain inventory snapshot from the previous source.
  liveExternalAssetSession = null;
  reconcileLiveWorkspaceAuthority();
  externalAssetPendingTaskRebind = true;
  externalAssetAuthorityEpoch++;
  containerScanGeneration += 1;
  containerAutoScanSuppressedKey = '';
  resetTrackState();
  videoSniffGeneration += 1;
  videoSniffState = {
    status: 'idle',
    fileKey: '',
    identity: null,
  };
  if (appendPreserveAll) {
    appendPreserveAll.dataset.userTouched = '0';
    appendPreserveAll.checked = false;
  }
  preserveAttachments.checked = false;
  destroySubtitlePreview();
  clearPreviewImage();
  videoSniffPromise = inspectSelectedVideoHeader();
  beginPreservationPreview();
  previewStatus.textContent = '视频已更换；正在识别实际容器。';
});
audioInput.addEventListener('change', () => {
  invalidateExactSelectionFiles(audioInput);
  syncNewTrackState();
  updateUI();
});
subInput.addEventListener('change', () => {
  invalidateExactSelectionFiles(subInput);
  subtitleInspectGeneration += 1;
  subtitleInspectState = {
    status: 'idle',
    selectionKey: '',
    collected: null,
  };
  previewCueTimes = [];
  previewCueIndex = -1;
  if (previewTimeInput) previewTimeInput.value = '';
  destroySubtitlePreview();
  subtitleInspectPromise = inspectSelectedSubtitles();
  previewStatus.textContent = '字幕已更换；正在识别实际字幕格式。';
});
fontInput.addEventListener('change', () => {
  invalidateExactSelectionFiles(fontInput);
  refreshExternalAssetAuthority();
  fontInspectGeneration += 1;
  fontInspectState = {
    status: 'idle',
    selectionKey: '',
    recognition: { recognized: [], ignored: [] },
  };
  destroySubtitlePreview();
  fontInspectPromise = inspectSelectedFonts();
  previewStatus.textContent = '字体已更换；正在识别实际字体结构。';
});
fontSubsetEnabled?.addEventListener('change', () => {
  updateUI();
  renderMuxPlan();
});
fontMode.addEventListener('change', () => {
  try {
    if(!liveExternalAssetSession)refreshExternalAssetAuthority();
    const previousMode=liveExternalAssetSession.mode;
    commitLiveWorkspaceChange(liveWorkspaceAuthority,{
      ...liveWorkspaceContext(previousMode),
      kind:'font-mode',previousMode,nextMode:fontMode.value,
    });
  } catch(error) {
    if(liveExternalAssetSession)fontMode.value=liveExternalAssetSession.mode;
    status.textContent='字体模式未提交：'+(error?.message||String(error));
    return;
  }
  destroySubtitlePreview();
  updateUI();
  previewStatus.textContent = '字体模式已更换；点击“生成预览帧”重新检查。';
});
previewSubtitleSelect?.addEventListener('change', () => {
  previewCueTimes = [];
  previewCueIndex = -1;
  if (previewTimeInput) previewTimeInput.value = '';
  destroySubtitlePreview();
  previewStatus.textContent = '预览字幕已切换；可输入任意时间点，或使用上一条 / 下一条。';
});
previewTimeInput?.addEventListener('change', () => {
  const value = parsePreviewTime(previewTimeInput.value);
  previewTimeInput.setCustomValidity(Number.isFinite(value) ? '' : '请输入秒数或 HH:MM:SS.mmm');
});
previewPrevCueBtn?.addEventListener('click', () => navigatePreviewCue(-1));
previewNextCueBtn?.addEventListener('click', () => navigatePreviewCue(1));
previewRefreshBtn?.addEventListener('click', refreshSubtitlePreview);
previewImage?.addEventListener('click', openPreviewDialog);
previewImage?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  openPreviewDialog();
});
previewDialogClose?.addEventListener('click', () => previewDialog?.close());
previewDialog?.addEventListener('click', (event) => {
  if (event.target === previewDialog) previewDialog.close();
});

appendPreserveAll?.addEventListener('change', () => {
  appendPreserveAll.dataset.userTouched = '1';
  if (appendPreserveAll.checked) preserveAttachments.checked = true;
  updateUI();
  renderMuxPlan();
});

preserveAttachments.addEventListener('change', () => {
  if (trackState) {
    const changes = trackState.attachments.map(item => ({
      index:item.index,field:'include',value:preserveAttachments.checked,
    }));
    if (changes.length && !changeSourceAttachments(changes)) {
      preserveAttachments.checked = trackState.attachments.length > 0 &&
        trackState.attachments.every(item=>item.include);
      return;
    }
    renderAttachmentList();
  }
  renderMuxPlan();
});
refreshPlanBtn.addEventListener('click', renderMuxPlan);
bindNewTrackEditor(newAudioList, '[data-new-audio-field]', () => externalAudioState,'audio');
bindNewTrackEditor(newSubtitleList, '[data-new-sub-field]', () => newSubtitleState,'subtitle');

function applyLanguageToSelectedTracks(type) {
  if (!trackState) return;
  const language = normalizeTrackLanguage(bulkLanguage?.value);
  const chosen = selectedTracks(type);
  if (!chosen.length) return;
  if (!changeSourceTracks(chosen.map(track =>
    ({ index: track.index, field: 'language', value: language })))) return;
  renderTrackList();
  renderImportedAssetInventory();
}

function setOnlyFirstDefault(type) {
  if (!trackState) return;
  const selected = selectedTracks(type);
  if (!selected.length) return;
  if (!changeSourceTracks(selected.map((track, index) =>
    ({ index: track.index, field: 'default', value: index === 0 })))) return;
  renderTrackList();
  renderImportedAssetInventory();
}

applyAudioLanguage?.addEventListener('click', () => applyLanguageToSelectedTracks('audio'));
applySubtitleLanguage?.addEventListener('click', () => applyLanguageToSelectedTracks('subtitle'));
firstAudioDefault?.addEventListener('click', () => setOnlyFirstDefault('audio'));
firstSubtitleDefault?.addEventListener('click', () => setOnlyFirstDefault('subtitle'));
clearAllDefaults?.addEventListener('click', () => {
  if (!trackState) return;
  const chosen = [...selectedTracks('audio'), ...selectedTracks('subtitle')];
  if (chosen.length && !changeSourceTracks(chosen.map(track =>
    ({ index: track.index, field: 'default', value: false })))) return;
  const clearExternal=[
    ...externalAudioState.map((track,index)=>({kind:'audio',index,field:'default',value:false})),
    ...newSubtitleState.map((track,index)=>({kind:'subtitle',index,field:'default',value:false})),
  ];
  if(clearExternal.length && !changeExternalAssetFields(clearExternal))return;
  renderTrackList();
  renderImportedAssetInventory();
  renderNewTrackLists();
  renderMuxPlan();
});

function setTrackInclusion(type, include) {
  if (!trackState) return;
  const changes = trackState.tracks
    .filter(track => track.type === type)
    .map(track => ({ index: track.index, field: 'include', value: include }));
  if (changes.length && !changeSourceTracks(changes)) return;
  renderTrackList();
  renderImportedAssetInventory();
}

function restoreTrackMetadata(type) {
  if (!trackState) return;
  const targets = trackState.tracks.filter(track => track.type === type);
  const changes = targets.flatMap(track => [
    { index: track.index, field: 'language', value: track.originalLanguage },
    { index: track.index, field: 'title', value: track.originalTitle },
    { index: track.index, field: 'default', value: track.include && track.originalDefault },
    { index: track.index, field: 'forced', value: track.include && track.originalForced },
    { index: track.index, field: 'original', value: track.include && track.originalOriginal },
    { index: track.index, field: 'commentary', value: track.include && track.originalCommentary },
    { index: track.index, field: 'hearingImpaired', value: track.include && track.originalHearingImpaired },
  ]);
  if (changes.length && !changeSourceTracks(changes)) return;
  renderTrackList();
  renderImportedAssetInventory();
}

keepAllAudio?.addEventListener('click', () => setTrackInclusion('audio', true));
dropAllAudio?.addEventListener('click', () => setTrackInclusion('audio', false));
keepAllSubtitles?.addEventListener('click', () => setTrackInclusion('subtitle', true));
dropAllSubtitles?.addEventListener('click', () => setTrackInclusion('subtitle', false));
resetAudioMetadata?.addEventListener('click', () => restoreTrackMetadata('audio'));
resetSubtitleMetadata?.addEventListener('click', () => restoreTrackMetadata('subtitle'));

function setAttachmentInclusion(include) {
  if (!trackState) return;
  const changes=trackState.attachments.map(item=>({
    index:item.index,field:'include',value:include,
  }));
  if (changes.length && !changeSourceAttachments(changes)) return;
  preserveAttachments.checked = include && trackState.attachments.length > 0;
  renderAttachmentList();
  renderImportedAssetInventory();
  renderMuxPlan();
}

keepAllAttachments?.addEventListener('click', () => setAttachmentInclusion(true));
dropAllAttachments?.addEventListener('click', () => setAttachmentInclusion(false));
resetAttachmentMetadata?.addEventListener('click', () => {
  if (!trackState) return;
  const changes=trackState.attachments.flatMap(item=>[
    {index:item.index,field:'filename',value:item.originalFilename},
    {index:item.index,field:'mimetype',value:item.originalMimetype},
  ]).filter(change=>trackState.attachments.find(item=>item.index===change.index)?.include);
  if (changes.length && !changeSourceAttachments(changes)) return;
  renderAttachmentList();
  renderImportedAssetInventory();
  renderMuxPlan();
});

async function loadFFmpeg() {
  if (loaded) return;

  status.textContent = '正在从本机加载 ffmpeg.wasm 核心（约 31 MB）……';
  bar.style.width = '8%';

  const coreBase = new URL('ffmpeg-core/', window.location.href).href;
  const classWorkerURL = new URL('ffmpeg-class-worker/worker.js', window.location.href).href;

  const slowTimer = setTimeout(() => {
    status.textContent = '核心仍在加载。若持续超过约 30 秒，请查看 Termux 输出和浏览器开发者日志。';
  }, 15000);

  try {
    await ffmpeg.load({
      coreURL: `${coreBase}ffmpeg-core.js`,
      wasmURL: `${coreBase}ffmpeg-core.wasm`,
      classWorkerURL,
    });
    loaded = true;
  } finally {
    clearTimeout(slowTimer);
  }

  status.textContent = 'ffmpeg.wasm 已从本机加载。';
  bar.style.width = '12%';
}

async function removeQuietly(path) {
  if (!loaded) return;
  try { await ffmpeg.deleteFile(path); } catch {}
}

async function execWithCapturedLogs(args) {
  const lines = [];
  const listener = ({ message }) => {
    const value = String(message || '').trim();
    if (value) lines.push(value);
  };
  ffmpeg.on('log', listener);
  try {
    const code = await ffmpeg.exec(args);
    return { code, logs: lines };
  } finally {
    ffmpeg.off('log', listener);
  }
}

function usefulLogTail(lines, limit = 6) {
  const cleaned = (lines || [])
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .filter((line) => !/^frame=|^size=|^video:|^Input #|^Output #/.test(line));
  return cleaned.slice(-limit).join(' | ');
}

function previewSourceDuration(probe) {
  const values = [
    Number(probe?.format?.duration),
    ...(probe?.streams || [])
      .filter((stream) => stream.codec_type === 'video')
      .map((stream) => Number(stream.duration)),
  ].filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.max(...values) : 0;
}

function clampPreviewTime(timeSeconds, durationSeconds) {
  const value = Math.max(0, Number(timeSeconds) || 0);
  if (!(durationSeconds > 0)) return value;
  return Math.min(value, Math.max(0, durationSeconds - 0.08));
}

function waitForMedia(video, eventName, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`浏览器等待 ${eventName} 超时`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(eventName, onReady);
      video.removeEventListener('error', onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      const mediaError = video.error;
      cleanup();
      reject(new Error(mediaError?.message || `浏览器无法解码该视频（MediaError ${mediaError?.code || 'unknown'}）`));
    };
    video.addEventListener(eventName, onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

async function captureBrowserFramePng(file, timeSeconds) {
  const video = document.createElement('video');
  const url = URL.createObjectURL(file);
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;

  try {
    video.src = url;
    video.load();
    if (video.readyState < 1) await waitForMedia(video, 'loadedmetadata');

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const target = clampPreviewTime(timeSeconds, duration);
    if (target > 0.001) {
      video.currentTime = target;
      await waitForMedia(video, 'seeked', 20000);
    } else if (video.readyState < 2) {
      await waitForMedia(video, 'loadeddata', 20000);
    }

    if (typeof video.requestVideoFrameCallback === 'function') {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1000);
        video.requestVideoFrameCallback(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!(sourceWidth > 0 && sourceHeight > 0)) {
      throw new Error('浏览器没有取得可绘制的视频帧。');
    }

    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / sourceWidth);
    const width = Math.max(2, Math.round(sourceWidth * scale));
    const height = Math.max(2, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('浏览器 Canvas 不可用。');
    context.drawImage(video, 0, 0, width, height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('浏览器无法编码预览 PNG。')), 'image/png');
    });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    video.pause();
    video.removeAttribute('src');
    URL.revokeObjectURL(url);
  }
}

function taskPrefix() {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `task-${Date.now()}-${random}`;
}

function decodeUtf16BE(bytes) {
  const evenLength = bytes.length - (bytes.length % 2);
  const swapped = new Uint8Array(evenLength);
  for (let i = 0; i < evenLength; i += 2) {
    swapped[i] = bytes[i + 1];
    swapped[i + 1] = bytes[i];
  }
  return new TextDecoder('utf-16le').decode(swapped);
}

function detectUtf16WithoutBom(bytes) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 512));
  let evenZeros = 0;
  let oddZeros = 0;
  let pairs = 0;

  for (let i = 0; i + 1 < sample.length; i += 2) {
    if (sample[i] === 0) evenZeros += 1;
    if (sample[i + 1] === 0) oddZeros += 1;
    pairs += 1;
  }

  if (pairs < 4) return null;
  if (oddZeros / pairs > 0.3 && evenZeros / pairs < 0.1) return 'utf-16le';
  if (evenZeros / pairs > 0.3 && oddZeros / pairs < 0.1) return 'utf-16be';
  return null;
}

async function readAssText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'UTF-16LE BOM' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: decodeUtf16BE(bytes.subarray(2)), encoding: 'UTF-16BE BOM' };
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'UTF-8 BOM' };
  }

  const guessedUtf16 = detectUtf16WithoutBom(bytes);
  if (guessedUtf16 === 'utf-16le') {
    return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'UTF-16LE（启发式）' };
  }
  if (guessedUtf16 === 'utf-16be') {
    return { text: decodeUtf16BE(bytes), encoding: 'UTF-16BE（启发式）' };
  }

  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      encoding: 'UTF-8',
    };
  } catch {
    throw new Error('字幕文件不是有效的 UTF-8 / UTF-16 文本。请先转换为 UTF-8、UTF-16LE 或 UTF-16BE。');
  }
}

function assTimestampSeconds(value = '') {
  const match = String(value).trim().match(/^(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!match) return NaN;
  const fraction = Number(`0.${match[4] || '0'}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + fraction;
}

function splitAssCsv(text, count) {
  const out = [];
  let start = 0;
  for (let index = 0; index < count - 1; index += 1) {
    const comma = text.indexOf(',', start);
    if (comma < 0) break;
    out.push(text.slice(start, comma).trim());
    start = comma + 1;
  }
  out.push(text.slice(start).trim());
  while (out.length < count) out.push('');
  return out;
}

function secondsToAssTime(seconds) {
  const centiseconds = Math.max(0, Math.round(Number(seconds || 0) * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);
  const fraction = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(fraction).padStart(2, '0')}`;
}

function shiftAssForPreview(text, offsetSeconds) {
  if (!Number.isFinite(offsetSeconds) || offsetSeconds <= 0) return text;

  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  let section = '';
  let format = [];

  return lines.map((raw) => {
    const header = raw.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      section = header[1].toLowerCase();
      return raw;
    }
    if (section !== 'events') return raw;

    if (/^\s*Format\s*:/i.test(raw)) {
      format = raw.replace(/^\s*Format\s*:/i, '').split(',').map((item) => item.trim().toLowerCase());
      return raw;
    }
    if (!/^\s*(Dialogue|Comment)\s*:/i.test(raw) || !format.length) return raw;

    const prefix = raw.slice(0, raw.indexOf(':') + 1);
    const values = splitAssCsv(raw.slice(raw.indexOf(':') + 1), format.length);
    const startIndex = format.indexOf('start');
    const endIndex = format.indexOf('end');
    if (startIndex < 0 || endIndex < 0) return raw;

    const start = assTimestampSeconds(values[startIndex]);
    const end = assTimestampSeconds(values[endIndex]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return raw;

    values[startIndex] = secondsToAssTime(Math.max(0, start - offsetSeconds));
    values[endIndex] = secondsToAssTime(Math.max(0, end - offsetSeconds));
    return `${prefix} ${values.join(',')}`;
  }).join('\n');
}

function extractPreviewCueTimes(assText) {
  const lines = String(assText || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  let section = '';
  let format = [];
  const candidates = [];

  for (const raw of lines) {
    const header = raw.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      section = header[1].toLowerCase();
      continue;
    }
    if (section !== 'events') continue;

    if (/^\s*Format\s*:/i.test(raw)) {
      format = raw.replace(/^\s*Format\s*:/i, '').split(',').map((item) => item.trim().toLowerCase());
      continue;
    }

    if (!/^\s*Dialogue\s*:/i.test(raw) || !format.length) continue;
    const values = splitAssCsv(raw.slice(raw.indexOf(':') + 1), format.length);
    const startIndex = format.indexOf('start');
    const endIndex = format.indexOf('end');
    if (startIndex < 0 || endIndex < 0) continue;

    const start = assTimestampSeconds(values[startIndex]);
    const end = assTimestampSeconds(values[endIndex]);
    if (!Number.isFinite(start)) continue;

    const midpoint = Number.isFinite(end) && end > start
      ? start + Math.max(0.08, Math.min((end - start) / 2, 1))
      : start + 0.12;
    candidates.push(Math.max(0, midpoint));
  }

  return candidates;
}

function choosePreviewFrameTime(assText) {
  const candidates = extractPreviewCueTimes(assText);
  if (!candidates.length) return 0;
  const firstVisible = candidates.find((value) => value >= 0.25);
  return firstVisible ?? candidates[0];
}

function parsePreviewTime(value) {
  const text = String(value || '').trim();
  if (!text) return NaN;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const match = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!match) return NaN;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const fraction = Number(`0.${String(match[4] || '0').padEnd(3, '0')}`);
  return hours * 3600 + minutes * 60 + seconds + fraction;
}

function formatPreviewTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);
  const millis = Math.round((value - Math.floor(value)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

async function loadPreviewCueTimes() {
  const tracks = selectedSubtitleTracks();
  const selectedIndex = Number(previewSubtitleSelect?.value || 0);
  const track = tracks[selectedIndex];
  const file = track?.file;
  if (!file || !track?.format?.previewable) {
    previewCueTimes = [];
    previewCueIndex = -1;
    return [];
  }
  const { text } = await readAssText(file);
  previewCueTimes = extractPreviewCueTimes(text);
  const current = parsePreviewTime(previewTimeInput?.value);
  if (Number.isFinite(current) && previewCueTimes.length) {
    let nearest = 0;
    let distance = Infinity;
    previewCueTimes.forEach((value, index) => {
      const delta = Math.abs(value - current);
      if (delta < distance) {
        nearest = index;
        distance = delta;
      }
    });
    previewCueIndex = nearest;
  } else {
    previewCueIndex = previewCueTimes.length ? 0 : -1;
  }
  return previewCueTimes;
}

async function navigatePreviewCue(delta) {
  if (isBusy()) return;
  await loadPreviewCueTimes();
  if (!previewCueTimes.length) return;
  if (previewCueIndex < 0) previewCueIndex = 0;
  else previewCueIndex = Math.max(0, Math.min(previewCueTimes.length - 1, previewCueIndex + delta));
  const target = previewCueTimes[previewCueIndex];
  if (previewTimeInput) previewTimeInput.value = formatPreviewTime(target);
  await refreshSubtitlePreview();
}

async function destroySubtitlePreview() {
  previewGeneration += 1;
  if (previewImageURL) {
    URL.revokeObjectURL(previewImageURL);
    previewImageURL = null;
  }
  previewImage?.removeAttribute('src');
  previewImage?.classList.add('hidden');
}

function clearPreviewImage() {
  if (previewImageURL) {
    URL.revokeObjectURL(previewImageURL);
    previewImageURL = null;
  }
  previewImage?.removeAttribute('src');
  previewImage?.classList.add('hidden');
  previewDialogImage?.removeAttribute('src');
  if (previewDialog?.open) previewDialog.close();
}

function openPreviewDialog() {
  if (!previewImage?.src || !previewDialog || !previewDialogImage) return;
  previewDialogImage.src = previewImage.src;
  if (!previewDialog.open) previewDialog.showModal();
}

function syncPreviewControls() {
  if (!previewSubtitleSelect || !previewRefreshBtn) return;
  const tracks = selectedSubtitleTracks();
  const previewable = tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => Boolean(track.format?.previewable));
  const previous = Number(previewSubtitleSelect.value);
  previewSubtitleSelect.innerHTML = previewable.length
    ? previewable.map(({ track, index }) => `<option value="${index}">${escapeHtml(track.file.name)} · ${escapeHtml(track.format?.label || 'ASS/SSA')}</option>`).join('')
    : '<option value="">没有可预览的 ASS / SSA</option>';

  if (previewable.length) {
    const known = previewable.some((item) => item.index === previous);
    previewSubtitleSelect.value = String(known ? previous : previewable[0].index);
  }

  previewSubtitleSelect.disabled = !previewable.length;
  const fontRecognition = selectedFontRecognition();
  previewRefreshBtn.disabled =
    !(videoInput.files[0] && previewable.length) ||
    fontIdentityPending() ||
    fontRecognition.ignored.length > 0;
  if (previewTimeInput) previewTimeInput.disabled = !previewable.length;
  if (previewPrevCueBtn) previewPrevCueBtn.disabled = !previewable.length;
  if (previewNextCueBtn) previewNextCueBtn.disabled = !previewable.length;
}

async function buildPreviewAss(track, fontFiles) {
  const { text } = await readAssText(track.file);
  if ((fontMode.value || 'preserve') !== 'force' || !fontFiles.length) return text;
  const descriptors = await readFontDescriptors(fontFiles[0]);
  const forcedFamily = preferredAssFontFamily(descriptors[0]);
  return forceAssFontFamily(text, forcedFamily);
}

async function refreshSubtitlePreview() {
  if (running || previewing) return;
  if (scanning) {
    previewStatus.textContent = '正在等待后台容器扫描完成，然后生成预览帧……';
    try { await containerScanPromise; } catch {}
  }
  if (isBusy()) return;

  const video = videoInput.files[0];
  const tracks = selectedSubtitleTracks();
  const selectedIndex = Number(previewSubtitleSelect?.value || 0);
  const track = tracks[selectedIndex];
  const fontFiles = selectedFonts();

  await destroySubtitlePreview();
  const generation = previewGeneration;
  syncPreviewControls();

  if (!video || !track?.file || !track?.format?.previewable) {
    previewStatus.textContent = '等待视频与 ASS / SSA。';
    previewEmpty?.classList.remove('hidden');
    return;
  }

  previewing = true;
  cancelRequested = false;
  updateUI();
  previewRefreshBtn.disabled = true;

  const prefix = taskPrefix();
  const mountPoint = `/${prefix}-preview-input`;
  const inputPath = `${mountPoint}/${video.name}`;
  const assPath = `/${prefix}-preview.ass`;
  const fontDir = `/${prefix}-preview-fonts`;
  const basePath = `/${prefix}-preview-base.png`;
  const outputPath = `/${prefix}-preview-sub.png`;
  const previewFontPaths = [];
  let mounted = false;

  try {
    previewStatus.textContent = '正在加载 FFmpeg 并提取字幕所在画面……';
    previewEmpty?.classList.remove('hidden');
    await loadFFmpeg();
    if (cancelRequested || generation !== previewGeneration) return;

    const previewFonts = await Promise.all(fontFiles.map(async (font) => {
      const identity = await identifyFontFile(font);
      if (!isSupportedFontIdentity(identity)) {
        throw new Error(`字体“${font.name}”的实际内容无法识别：${identity.parseError || '无有效字体结构'}`);
      }
      const mismatch = fontIdentityMismatchMessage(identity);
      if (mismatch) {
        logEl.textContent += `WARNING: 预览字体“${font.name}”：${mismatch}；按实际字体结构载入。\n`;
      }
      return { file: font, identity };
    }));
    const sourceAss = await buildPreviewAss(track, fontFiles);

    await ffmpeg.createDir(mountPoint);
    await ffmpeg.mount(FFFSType.WORKERFS, { files: [video] }, mountPoint);
    mounted = true;
    await ffmpeg.createDir(fontDir);

    const previewProbePath = `/${prefix}-preview-probe.json`;
    const sourceProbe = await runProbe(inputPath, previewProbePath, { decodeStreams: false }).catch((error) => {
      logEl.textContent += `PREVIEW PROBE WARNING: ${error?.message || error}\n`;
      return null;
    });
    await removeQuietly(previewProbePath);

    previewCueTimes = extractPreviewCueTimes(sourceAss);
    const manualPreviewTime = parsePreviewTime(previewTimeInput?.value);
    const requestedPreviewTime = Number.isFinite(manualPreviewTime)
      ? manualPreviewTime
      : choosePreviewFrameTime(sourceAss);
    const duration = previewSourceDuration(sourceProbe);
    const previewTime = clampPreviewTime(requestedPreviewTime, duration);
    if (previewTimeInput) previewTimeInput.value = formatPreviewTime(previewTime);
    if (previewCueTimes.length) {
      let nearest = 0;
      let distance = Infinity;
      previewCueTimes.forEach((value, index) => {
        const delta = Math.abs(value - previewTime);
        if (delta < distance) {
          nearest = index;
          distance = delta;
        }
      });
      previewCueIndex = nearest;
    }
    const previewCenter = 0.5;
    const shiftedAss = shiftAssForPreview(sourceAss, Math.max(0, previewTime - previewCenter));

    await Promise.all(previewFonts.map(async (item, index) => {
      const path = `${fontDir}/font-${index}${fontVirtualSuffix(item.identity)}`;
      previewFontPaths.push(path);
      await ffmpeg.writeFile(path, await fetchFile(item.file));
    }));
    await ffmpeg.writeFile(assPath, new TextEncoder().encode(shiftedAss));

    const codec = sourceProbe?.streams?.find((stream) => stream.codec_type === 'video')?.codec_name || 'unknown';
    previewStatus.textContent = `正在提取 ${previewTime.toFixed(2)} s 视频帧（${codec}）……`;

    const extractionAttempts = [
      {
        label: 'FFmpeg 快速定位',
        args: [
          '-hide_banner', '-loglevel', 'error', '-y',
          '-ss', previewTime.toFixed(3),
          '-i', inputPath,
          '-map', '0:v:0',
          '-an', '-sn',
          '-frames:v', '1',
          basePath,
        ],
      },
      {
        label: 'FFmpeg 兼容定位',
        args: [
          '-hide_banner', '-loglevel', 'error', '-y',
          '-i', inputPath,
          '-ss', previewTime.toFixed(3),
          '-map', '0:v:0',
          '-an', '-sn',
          '-frames:v', '1',
          basePath,
        ],
      },
    ];

    let extracted = false;
    let extractionMethod = '';
    const extractErrors = [];

    const tryBrowserFrame = async () => {
      try {
        previewStatus.textContent = `正在用浏览器解码 ${codec} 预览帧……`;
        const bytes = await captureBrowserFramePng(video, previewTime);
        if (!(bytes instanceof Uint8Array) || !bytes.byteLength) throw new Error('浏览器返回了空预览帧。');
        await ffmpeg.writeFile(basePath, bytes);
        extracted = true;
        extractionMethod = 'browser';
        return true;
      } catch (error) {
        extractErrors.push(`浏览器解码：${error?.message || error}`);
        return false;
      }
    };

    // ffmpeg.wasm 5.1.x 的内置 AV1 解码器对部分 MP4 AV1 bitstream
    // 会报 Missing Sequence Header。现代 Chromium 通常能直接解码 AV1，
    // 因此 AV1 优先用浏览器抽一帧，再交给 FFmpeg/libass 烧字幕。
    if (codec === 'av1') {
      await tryBrowserFrame();
    }

    if (!extracted) {
      for (const attempt of extractionAttempts) {
        await removeQuietly(basePath);
        const result = await execWithCapturedLogs(attempt.args);
        if (result.code === 0) {
          try {
            const bytes = await ffmpeg.readFile(basePath);
            if (bytes instanceof Uint8Array && bytes.byteLength > 0) {
              extracted = true;
              extractionMethod = 'ffmpeg';
              break;
            }
          } catch {}
        }
        const detail = usefulLogTail(result.logs);
        extractErrors.push(`${attempt.label}：返回 ${result.code}${detail ? ` · ${detail}` : ''}`);
      }
    }

    if (!extracted) {
      await tryBrowserFrame();
    }

    if (!extracted) {
      throw new Error(`视频帧提取失败。编码：${codec}；目标：${previewTime.toFixed(2)} s${duration > 0 ? ` / 时长 ${duration.toFixed(2)} s` : ''}。 ${extractErrors.join('；')}`);
    }

    previewStatus.textContent = '正在用 libass 渲染字幕到预览帧……';
    const filter = `ass=${assPath}:fontsdir=${fontDir}`;
    const renderCode = await ffmpeg.exec([
      '-hide_banner', '-loglevel', 'error', '-y',
      '-loop', '1',
      '-framerate', '10',
      '-i', basePath,
      '-vf', filter,
      '-ss', previewCenter.toFixed(3),
      '-frames:v', '1',
      outputPath,
    ]);
    if (renderCode !== 0) throw new Error(`libass 预览渲染失败（FFmpeg 返回 ${renderCode}）`);

    const bytes = await ffmpeg.readFile(outputPath);
    if (!(bytes instanceof Uint8Array) || !bytes.byteLength) throw new Error('预览 PNG 没有生成。');
    if (generation !== previewGeneration) return;

    clearPreviewImage();
    previewImageURL = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    previewImage.src = previewImageURL;
    previewImage.classList.remove('hidden');
    previewEmpty?.classList.add('hidden');
    previewStatus.textContent = `预览帧：${track.file.name} · ${previewTime.toFixed(2)} s · ${extractionMethod === 'browser' ? '浏览器抽帧 + ' : ''}FFmpeg/libass`;
  } catch (error) {
    if (generation !== previewGeneration) return;
    clearPreviewImage();
    previewEmpty?.classList.remove('hidden');
    previewStatus.textContent = `无法生成预览帧：${error?.message || error}`;
    logEl.textContent += `PREVIEW ERROR: ${error?.stack || error}\n`;
  } finally {
    await removeQuietly(outputPath);
    await removeQuietly(basePath);
    await removeQuietly(assPath);
    if (loaded) {
      for (const path of previewFontPaths) {
        await removeQuietly(path);
      }
      if (mounted) {
        try { await ffmpeg.unmount(mountPoint); } catch {}
      }
      try { await ffmpeg.deleteDir(fontDir); } catch {}
      try { await ffmpeg.deleteDir(mountPoint); } catch {}
    }
    previewing = false;
    updateUI();
    syncPreviewControls();
  }
}

async function runProbe(path, probePath, { decodeStreams = false } = {}) {
  await removeQuietly(probePath);
  const code = await ffmpeg.ffprobe(
    buildProbeArgs(path, probePath, { decodeStreams })
  );

  // @ffmpeg/core 0.12.10 is known to sometimes report ffprobe ret=-1 even
  // when ffprobe successfully wrote the requested output file. Treat the
  // generated JSON as the source of truth; only fail when it is missing or
  // invalid. This also gives us a real E2E assertion instead of trusting the
  // wrapper return code alone.
  let raw;
  try {
    raw = await ffmpeg.readFile(probePath);
  } catch (readError) {
    const mode = decodeStreams ? '完整 stream-info' : '结构探测';
    throw new Error(`ffprobe 未生成结果（返回 ${code}，${mode}）：${readError?.message || readError}`);
  }

  let json;
  try {
    json = JSON.parse(new TextDecoder().decode(raw));
  } catch (parseError) {
    throw new Error(`ffprobe 结果不是有效 JSON（返回 ${code}）：${parseError?.message || parseError}`);
  }

  if (code !== 0) {
    logEl.textContent += `INFO: ffprobe wrapper 返回 ${code}，但结构化结果文件有效，继续使用该结果。\n`;
  }

  const streams = Array.isArray(json.streams) ? json.streams : [];

  return {
    streams,
    chapters: Array.isArray(json.chapters) ? json.chapters : [],
    format: json.format || {},
    attachmentCount: streams.filter((stream) => stream.codec_type === 'attachment').length,
    probeMode: decodeStreams ? 'decoded' : 'container',
  };
}

async function probeInput(path, probePath, { allowDecodeFallback = true } = {}) {
  try {
    return await runProbe(path, probePath, { decodeStreams: false });
  } catch (headerError) {
    if (!allowDecodeFallback) throw headerError;

    logEl.textContent += `WARNING: 容器头探测失败，将尝试完整 stream-info：${headerError?.message || headerError}\n`;
    return runProbe(path, probePath, { decodeStreams: true });
  }
}

function containerKindLabel(type) {
  switch (type) {
    case 'video': return '视频';
    case 'audio': return '音频';
    case 'subtitle': return '字幕';
    case 'attachment': return '附件';
    case 'data': return '数据';
    default: return '其他';
  }
}

function sourceTrackModified(track) {
  return (
    track.order !== track.index ||
    track.language !== track.originalLanguage ||
    track.title !== track.originalTitle ||
    track.default !== track.originalDefault ||
    track.forced !== track.originalForced ||
    track.original !== track.originalOriginal ||
    track.commentary !== track.originalCommentary ||
    track.hearingImpaired !== track.originalHearingImpaired
  );
}

function sourceAttachmentModified(item) {
  return (
    item.filename !== item.originalFilename ||
    item.mimetype !== item.originalMimetype
  );
}

function plannedFontAttachmentCount() {
  const recognized = selectedFontRecognition().recognized || [];
  if (!recognized.length) return 0;
  const hasAssLikeSubtitle = newSubtitleState.some((track) => track.format?.assLike);
  return fontMode.value === 'force' && hasAssLikeSubtitle ? 1 : recognized.length;
}

function containerChangeCounts({ newFontCount = plannedFontAttachmentCount() } = {}) {
  const added =
    externalAudioState.length +
    newSubtitleState.length +
    newFontCount;

  if (!trackState) {
    return { added, removed: 0, modified: 0 };
  }

  const appendMode = Boolean(currentVideoIsMatroska() && appendPreserveAll?.checked);
  let removed = appendMode
    ? 0
    : (trackState.streams || [])
        .filter((stream) => !['video', 'audio', 'subtitle', 'attachment', 'data'].includes(stream.codec_type))
        .length;
  let modified = 0;

  if (!appendMode) {
    for (const track of trackState.tracks) {
      if (!track.include) removed += 1;
      else if (sourceTrackModified(track)) modified += 1;
    }
    for (const item of trackState.attachments) {
      if (!item.include) removed += 1;
      else if (sourceAttachmentModified(item)) modified += 1;
    }
  }

  return { added, removed, modified };
}

function renderContainerChangeSummary() {
  if (!containerChangeSummary) return;
  if (scanning) {
    containerChangeSummary.textContent = '读取中…';
    containerChangeSummary.dataset.state = 'pending';
    return;
  }
  if (!currentVideoIsMatroska()) {
    containerChangeSummary.textContent = '—';
    containerChangeSummary.dataset.state = 'idle';
    return;
  }
  if (!trackState) {
    containerChangeSummary.textContent = '等待容器扫描';
    containerChangeSummary.dataset.state = 'pending';
    return;
  }

  const { added, removed, modified } = containerChangeCounts();
  containerChangeSummary.dataset.state = removed ? 'destructive' : (added || modified ? 'changed' : 'clean');
  containerChangeSummary.innerHTML = [
    added ? `<span data-change="add">+${added} 新增</span>` : '',
    removed ? `<span data-change="remove">−${removed} 删除</span>` : '<span data-change="keep">无删除</span>',
    modified ? `<span data-change="modify">~${modified} 修改</span>` : '',
  ].filter(Boolean).join('');
}

function containerStatusBadge(state) {
  const labels = {
    keep: '保留',
    add: '新增',
    remove: '删除',
    modify: '修改',
  };
  return `<span class="change-badge" data-change="${state}">${labels[state] || state}</span>`;
}

function containerStreamTitle(stream) {
  const title = String(stream.tags?.title || '').trim();
  const type = containerKindLabel(stream.codec_type);
  return title || `${type} #${stream.index}`;
}

function containerStreamMeta(stream) {
  return [
    stream.codec_name || 'unknown',
    stream.tags?.language || '',
    `source #${stream.index}`,
  ].filter(Boolean).join(' · ');
}

function streamLabel(stream) {
  const type = stream.codec_type === 'audio' ? '音频' : '字幕';
  const language = stream.tags?.language || 'und';
  const title = stream.tags?.title || '';
  const codec = stream.codec_name || 'unknown';
  return `${type} #${stream.index} · ${codec} · ${language}${title ? ` · ${title}` : ''}`;
}

function trackKindLabel(type) {
  return type === 'audio' ? '音频' : '字幕';
}

function selectedTracks(type) {
  if (!trackState) return [];
  return trackState.tracks
    .filter((track) => track.type === type && track.include)
    .sort((a, b) => a.order - b.order);
}

function moveTrack(track, delta) {
  const source = videoInput.files?.[0] || null;
  if (!source || scannedSourceFile !== source ||
      !trackState || trackState.fileKey !== fileKey(source)) {
    status.textContent = '来源轨道已变化，请重新扫描后排序。';
    return false;
  }
  try {
    if (!liveSourceTrackSession ||
        liveSourceTrackSession.source !== source ||
        liveSourceTrackSession.trackState !== trackState)
      refreshLiveSourceTrackAuthority();
    commitLiveWorkspaceChange(liveWorkspaceAuthority, {
      ...liveWorkspaceContext(), kind:'source-order',
      source, trackState, index: track.index, delta,
      appendMode: Boolean(appendPreserveAll?.checked && currentVideoIsMatroska()),
    });
    return true;
  } catch (error) {
    status.textContent = '来源排序领域修改未执行：' +
      (error?.message || String(error)) + '。未提交部分变更。';
    return false;
  }
}

function selectedOriginalAttachments() {
  return trackState?.attachments?.filter((item) => item.include) || [];
}

const VOLATILE_FORMAT_TAGS = new Set([
  'encoder',
  'major_brand',
  'minor_version',
  'compatible_brands',
]);

function preservableFormatTags(tags) {
  return Object.fromEntries(
    Object.entries(tags || {})
      .filter(([key]) => !VOLATILE_FORMAT_TAGS.has(String(key).toLowerCase()))
      .map(([key, value]) => [String(key).toLowerCase(), value])
  );
}

function attachmentNameConflicts(items) {
  const counts = new Map();
  for (const item of items) {
    const name = String(item.filename || '').trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase('en-US');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
}

function defaultConflictWarnings() {
  const warnings = [];
  const audioDefaultCount =
    selectedTracks('audio').filter((track) => track.default).length +
    externalAudioState.filter((track) => track.default).length;
  const subtitleDefaultCount =
    selectedTracks('subtitle').filter((track) => track.default).length +
    newSubtitleState.filter((track) => track.default).length;

  if (audioDefaultCount > 1) {
    warnings.push(`存在 ${audioDefaultCount} 条 Default 音频轨；播放器行为可能不一致。`);
  }
  if (subtitleDefaultCount > 1) {
    warnings.push(`存在 ${subtitleDefaultCount} 条 Default 字幕轨；建议只保留一个 Default。`);
  }

  return warnings;
}

function buildMuxPlan() {
  const video = videoInput.files[0];
  const fonts = selectedFonts();
  const mode = fontMode.value || 'preserve';
  const appendMode = Boolean(video && currentVideoIsMatroska(video) && appendPreserveAll?.checked);
  const entries = [];
  const warnings = appendMode ? [] : defaultConflictWarnings();

  if (video) {
    entries.push({
      kind: '视频',
      title: video.name,
      meta: '原视频轨 · stream copy',
      flags: '',
    });
  }

  if (video) {
    if (trackState) {
      const tags = preservableFormatTags(trackState.format?.tags || {});
      const chapterCount = trackState.chapters?.length || 0;
      entries.push({
        kind: '章节',
        title: chapterCount ? `${chapterCount} 个 Chapter` : '无 Chapter',
        meta: '请求映射源章节 · 未验证所有章节层级与 UID 关联',
        flags: 'copy',
      });
      entries.push({
        kind: '元数据',
        title: trackState.format?.tags?.title || `${Object.keys(tags).length} 个全局 tag`,
        meta: `请求映射部分全局 metadata · ${Object.keys(tags).length} 个可审计 tag；非完整 EBML 保留`,
        flags: 'copy',
      });
    } else {
      entries.push({
        kind: '容器',
        title: 'Chapters / 全局 metadata',
        meta: '执行时尝试映射源章节与部分元数据；完整性待验证',
        flags: 'copy',
      });
    }
  }

  if (appendMode && video) {
    entries.push({
      kind: '音频',
      title: '全部原音频轨',
      meta: '请求复制全部已识别原音频流；属性以输出审计为准',
      flags: 'source',
    });
  } else if (trackState) {
    selectedTracks('audio').forEach((track, index) => {
      entries.push({
        kind: `音频 ${index + 1}`,
        title: track.title || `Audio #${track.index}`,
        meta: `${track.stream.codec_name || 'unknown'} · ${normalizeTrackLanguage(track.language)} · source #${track.index}`,
        flags: dispositionValue(track.default, false, track),
      });
    });
  } else if (video) {
    entries.push({
      kind: '音频',
      title: '全部原音频轨',
      meta: '未扫描 · 保持源顺序',
      flags: 'source',
    });
  }

  externalAudioState.forEach((track, index) => {
    entries.push({
      kind: `外部音频 ${index + 1}`,
      title: track.title || track.file.name,
      meta: `${normalizeTrackLanguage(track.language)} · ${track.file.name} · stream copy`,
      flags: dispositionValue(track.default, false, track),
    });
  });

  newSubtitleState.forEach((track, index) => {
    entries.push({
      kind: `字幕 ${index + 1}`,
      title: track.title || track.file.name,
      meta: `${track.format?.label || subtitleFormatInfo(track.file.name)?.label || 'SUB'} · ${normalizeTrackLanguage(track.language)} · 新增`,
      flags: dispositionValue(track.default, track.forced, track),
    });
  });

  if (appendMode && video) {
    entries.push({
      kind: '原字幕',
      title: '全部原字幕轨',
      meta: '请求复制全部已识别原字幕流；属性以输出审计为准',
      flags: 'source',
    });
  } else {
    selectedTracks('subtitle').forEach((track, index) => {
      entries.push({
        kind: `原字幕 ${index + 1}`,
        title: track.title || `Subtitle #${track.index}`,
        meta: `${track.stream.codec_name || 'unknown'} · ${normalizeTrackLanguage(track.language)} · source #${track.index}`,
        flags: dispositionValue(track.default, track.forced, track),
      });
    });
  }

  if (appendMode && video) {
    entries.push({
      kind: '附件',
      title: '全部原 MKV 附件',
      meta: '请求映射原附件；不代表完整保留原 EBML 结构',
      flags: 'source',
    });
  } else if (trackState) {
    selectedOriginalAttachments().forEach((item) => {
      entries.push({
        kind: '附件',
        title: item.filename || `Attachment #${item.index}`,
        meta: `${item.mimetype || item.stream.codec_name || 'attachment'} · source #${item.index}`,
        flags: '',
      });
    });
  } else if (preserveAttachments.checked) {
    entries.push({
      kind: '附件',
      title: '全部原 MKV 附件',
      meta: '未扫描 · 封装时全部保留',
      flags: '',
    });
  }

  const hasAssLikeSubtitle = newSubtitleState.some((track) => track.format?.assLike);
  const attachedFonts = mode === 'force' && hasAssLikeSubtitle ? fonts.slice(0, 1) : fonts;
  attachedFonts.forEach((file, index) => {
    entries.push({
      kind: `字体 ${index + 1}`,
      title: file.name,
      meta: `Matroska attachment${fontSubsetEnabled?.checked ? ' · subset 可选' : ''}`,
      flags: '',
    });
  });

  if (!appendMode && trackState && selectedTracks('audio').length === 0 && externalAudioState.length === 0) {
    warnings.push('扫描后没有选择原音频，也没有外部音频；输出将没有音频。');
  }

  if (trackState && !appendMode) {
    const selectedAttachments = selectedOriginalAttachments();
    const duplicateNames = attachmentNameConflicts(selectedAttachments);
    if (duplicateNames.length) {
      warnings.push(`原附件存在同名输出：${duplicateNames.join('、')}；建议修改附件文件名。`);
    }

    const reserved = new Set(
      selectedAttachments
        .map((item) => String(item.filename || '').trim().toLocaleLowerCase('en-US'))
        .filter(Boolean)
    );
    const collisions = attachedFonts
      .map((file) => file.name)
      .filter((name) => reserved.has(String(name).toLocaleLowerCase('en-US')));
    if (collisions.length) {
      warnings.push(`新字体与原附件同名：${collisions.join('、')}；封装时会自动重命名新字体附件。`);
    }
  }

  const hasKnownAssLikeSource = Boolean(
    trackState &&
    selectedTracks('subtitle').some((track) =>
      ['ass', 'ssa', 'substation_alpha'].includes(
        String(track.stream?.codec_name || '').toLowerCase()
      )
    )
  );
  warnings.push(...compatibilityPlanMessages({
    newSubtitles: newSubtitleState,
    fontCount: attachedFonts.length,
    hasKnownAssLikeSource,
    sourceSubtitleKnowledge: appendMode && !trackState ? 'unknown' : 'known',
  }));

  return { entries, warnings };
}

function planKindClass(kind) {
  const label = String(kind || '');
  if (label.startsWith('视频')) return 'plan-video';
  if (label.includes('音频')) return 'plan-audio';
  if (label.includes('字幕')) return 'plan-subtitle';
  if (label.startsWith('字体')) return 'plan-font';
  if (label.startsWith('附件')) return 'plan-attachment';
  return '';
}

function planGroupForKind(kind) {
  const label = String(kind || '');
  if (['容器', '章节', '元数据'].some((prefix) => label.startsWith(prefix))) return '容器';
  if (label.startsWith('视频')) return '视频';
  if (label.includes('音频')) return '音频';
  if (label.includes('字幕')) return '字幕';
  if (label.startsWith('附件') || label.startsWith('字体')) return '附件';
  return '其他';
}

function groupedPlanEntries(entries) {
  const order = ['容器', '视频', '音频', '字幕', '附件', '其他'];
  const groups = new Map(order.map((name) => [name, []]));
  entries.forEach((entry) => groups.get(planGroupForKind(entry.kind))?.push(entry));
  return order
    .map((name) => ({ name, entries: groups.get(name) || [] }))
    .filter((group) => group.entries.length);
}

function renderMuxPlan() {
  if (!muxPlan || !planWarnings) return;
  const { entries, warnings } = buildMuxPlan();
  const groups = groupedPlanEntries(entries);

  muxPlan.innerHTML = groups.length
    ? groups.map((group) => `
      <section class="plan-group" data-plan-group="${escapeHtml(group.name)}">
        <div class="plan-group-head">
          <strong>${escapeHtml(group.name)}</strong>
          <span>${group.entries.length}</span>
        </div>
        <div class="plan-group-body">
          ${group.entries.map((entry) => `
            <div class="plan-row ${planKindClass(entry.kind)}">
              <span class="plan-kind">${escapeHtml(entry.kind)}</span>
              <span class="plan-main">
                <strong>${escapeHtml(entry.title)}</strong>
                <small>${escapeHtml(entry.meta)}</small>
              </span>
              <span class="plan-flags">${escapeHtml(entry.flags === '0' ? '—' : entry.flags)}</span>
            </div>`).join('')}
        </div>
      </section>`).join('')
    : '<div class="track-empty">选择文件后可预览最终 MKV 结构。</div>';

  if (warnings.length) {
    planWarnings.textContent = warnings.join(' ');
    planWarnings.classList.remove('hidden');
  } else {
    planWarnings.textContent = '';
    planWarnings.classList.add('hidden');
  }
  renderOutputComposition();
}

function renderTrackList() {
  renderedSourceTrackEditor = trackState
    ? { source:videoInput.files?.[0] || null, state:trackState,
        appendMode:Boolean(currentVideoIsMatroska() && appendPreserveAll?.checked) }
    : null;
  if (!trackState) {
    trackList.innerHTML = '<div class="track-empty">选择 MKV 后自动读取容器内容。</div>';
    renderContainerChangeSummary();
    return;
  }

  const appendMode = Boolean(currentVideoIsMatroska() && appendPreserveAll?.checked);
  const editableByIndex = new Map(trackState.tracks.map((track) => [track.index, track]));
  const sourceRows = [];

  for (const stream of trackState.streams || []) {
    if (stream.codec_type === 'attachment') continue;

    const track = editableByIndex.get(stream.index);
    if (track) {
      const forced = track.type === 'subtitle'
        ? `<label><input type="checkbox" data-track-action="forced" data-track-index="${track.index}" ${track.forced ? 'checked' : ''} ${appendMode || !track.include ? 'disabled' : ''}> Forced</label>`
        : '';
      const change = appendMode
        ? 'keep'
        : (!track.include ? 'remove' : (sourceTrackModified(track) ? 'modify' : 'keep'));
      const controlsDisabled = appendMode || !track.include ? 'disabled' : '';
      sourceRows.push(`
        <div class="track-row track-${track.type} container-item" data-change="${change}">
          <span class="container-item-kind">${containerKindLabel(track.type)}</span>
          <div class="track-title">
            <strong>${escapeHtml(containerStreamTitle(stream))}</strong>
            <span class="track-meta">${escapeHtml(containerStreamMeta(stream))}</span>
            <div class="track-edit-grid">
              <label>语言
                <input type="text" data-track-field="language" data-track-index="${track.index}" value="${escapeHtml(track.language)}" list="languageSuggestions" maxlength="35" ${controlsDisabled}>
              </label>
              <label>标题
                <input type="text" data-track-field="title" data-track-index="${track.index}" value="${escapeHtml(track.title)}" maxlength="160" ${controlsDisabled}>
              </label>
            </div>
          </div>
          <div class="track-controls">
            <span class="track-order">
              <button type="button" data-track-move="-1" data-track-index="${track.index}" ${controlsDisabled} aria-label="上移" title="上移">↑</button>
              <button type="button" data-track-move="1" data-track-index="${track.index}" ${controlsDisabled} aria-label="下移" title="下移">↓</button>
            </span>
            <label><input type="checkbox" data-track-action="include" data-track-index="${track.index}" ${track.include ? 'checked' : ''} ${appendMode ? 'disabled' : ''}> 保留</label>
            <label><input type="checkbox" data-track-action="default" data-track-index="${track.index}" ${track.default ? 'checked' : ''} ${controlsDisabled}> Default</label>
            ${forced}
            <details class="track-advanced">
              <summary>属性</summary>
              <label><input type="checkbox" data-track-action="original" data-track-index="${track.index}" ${track.original ? 'checked' : ''} ${controlsDisabled}> Original</label>
              <label><input type="checkbox" data-track-action="commentary" data-track-index="${track.index}" ${track.commentary ? 'checked' : ''} ${controlsDisabled}> Commentary</label>
              <label><input type="checkbox" data-track-action="hearingImpaired" data-track-index="${track.index}" ${track.hearingImpaired ? 'checked' : ''} ${controlsDisabled}> Hearing impaired</label>
            </details>
          </div>
          ${containerStatusBadge(change)}
        </div>`);
      continue;
    }

    const supportedReadOnly = ['video', 'data'].includes(stream.codec_type);
    const change = appendMode ? 'keep' : (supportedReadOnly ? 'keep' : 'remove');
    sourceRows.push(`
      <div class="container-item container-readonly-row" data-change="${change}">
        <span class="container-item-kind">${containerKindLabel(stream.codec_type)}</span>
        <div class="container-item-main">
          <strong>${escapeHtml(containerStreamTitle(stream))}</strong>
          <small>${escapeHtml(containerStreamMeta(stream))}</small>
        </div>
        ${containerStatusBadge(change)}
      </div>`);
  }

  const chapters = trackState.chapters || [];
  chapters.forEach((chapter, index) => {
    const chapterTitle = String(chapter.tags?.title || '').trim() || `Chapter #${index + 1}`;
    const chapterLanguage = String(chapter.tags?.language || '').trim();
    const start = String(chapter.start_time ?? chapter.start ?? '').trim();
    const end = String(chapter.end_time ?? chapter.end ?? '').trim();
    sourceRows.push(`
      <div class="container-item container-readonly-row" data-change="keep">
        <span class="container-item-kind">章节</span>
        <div class="container-item-main">
          <strong>${escapeHtml(chapterTitle)}</strong>
          <small>${escapeHtml([start && end ? `${start} → ${end}` : (start || end), chapterLanguage].filter(Boolean).join(' · '))}</small>
        </div>
        ${containerStatusBadge('keep')}
      </div>`);
  });

  const tags = preservableFormatTags(trackState.format?.tags || {});
  const tagEntries = Object.entries(tags);
  sourceRows.push(`
    <div class="container-item container-readonly-row container-metadata-row" data-change="keep">
      <span class="container-item-kind">元数据</span>
      <div class="container-item-main">
        <strong>${tagEntries.length} 个全局字段</strong>
        ${tagEntries.length ? `<details class="container-meta"><summary>查看</summary><div>${tagEntries.map(([key, value]) => `<span><b>${escapeHtml(key)}</b> ${escapeHtml(value)}</span>`).join('')}</div></details>` : ''}
      </div>
      ${containerStatusBadge('keep')}
    </div>`);

  externalAudioState.forEach((item, index) => {
    sourceRows.push(`
      <div class="container-item container-readonly-row" data-change="add">
        <span class="container-item-kind">音频</span>
        <div class="container-item-main"><strong>${escapeHtml(item.title || item.file.name)}</strong><small>外部音频 #${index + 1} · ${escapeHtml(normalizeTrackLanguage(item.language))}</small></div>
        ${containerStatusBadge('add')}
      </div>`);
  });
  newSubtitleState.forEach((item, index) => {
    sourceRows.push(`
      <div class="container-item container-readonly-row" data-change="add">
        <span class="container-item-kind">字幕</span>
        <div class="container-item-main"><strong>${escapeHtml(item.title || item.displayName || item.file.name)}</strong><small>${escapeHtml(item.format?.label || 'SUB')} · ${escapeHtml(normalizeTrackLanguage(item.language))} · 新字幕 #${index + 1}</small></div>
        ${containerStatusBadge('add')}
      </div>`);
  });

  const fonts = selectedFontRecognition().recognized || [];
  const visibleFonts = fontMode.value === 'force' && newSubtitleState.some((track) => track.format?.assLike)
    ? fonts.slice(0, 1)
    : fonts;
  visibleFonts.forEach((item) => {
    sourceRows.push(`
      <div class="container-item container-readonly-row" data-change="add">
        <span class="container-item-kind">附件</span>
        <div class="container-item-main"><strong>${escapeHtml(item.file.name)}</strong><small>新字体附件</small></div>
        ${containerStatusBadge('add')}
      </div>`);
  });

  trackList.innerHTML = sourceRows.join('') || '<div class="track-empty">容器中没有可显示的流。</div>';
  renderContainerChangeSummary();
  renderMuxPlan();
}

function renderAttachmentList() {
  if (!trackState || !trackState.attachments.length) {
    attachmentList.innerHTML = '';
    renderContainerChangeSummary();
    return;
  }

  const appendMode = Boolean(currentVideoIsMatroska() && appendPreserveAll?.checked);
  attachmentList.innerHTML = trackState.attachments.map((item) => {
    const change = appendMode
      ? 'keep'
      : (!item.include ? 'remove' : (sourceAttachmentModified(item) ? 'modify' : 'keep'));
    const disabled = appendMode || !item.include ? 'disabled' : '';
    return `
      <div class="attachment-item container-item" data-change="${change}">
        <span class="container-item-kind">附件</span>
        <div class="attachment-main">
          <strong>${escapeHtml(item.filename || item.originalFilename || `Attachment #${item.index}`)}</strong>
          <span class="attachment-meta">source #${item.index} · ${escapeHtml(item.stream.codec_name || item.mimetype || 'attachment')}</span>
          <div class="attachment-fields">
            <label>文件名
              <input type="text" data-attachment-field="filename" data-attachment-index="${item.index}" value="${escapeHtml(item.filename)}" maxlength="240" ${disabled}>
            </label>
            <label>MIME
              <input type="text" data-attachment-field="mimetype" data-attachment-index="${item.index}" value="${escapeHtml(item.mimetype)}" maxlength="120" ${disabled}>
            </label>
          </div>
        </div>
        <label class="attachment-select">
          <input type="checkbox" data-attachment-action="include" data-attachment-index="${item.index}" ${item.include ? 'checked' : ''} ${appendMode ? 'disabled' : ''}>
          保留
        </label>
        ${containerStatusBadge(change)}
      </div>`;
  }).join('');
  renderContainerChangeSummary();
}

attachmentList.addEventListener('input', (event) => {
  if (!trackState) return;
  const input = event.target.closest('input[data-attachment-field]');
  if (!input) return;
  const item = trackState.attachments.find((entry) => entry.index === Number(input.dataset.attachmentIndex));
  if (!item) return;
  if (!changeSourceAttachments([{index:item.index,
    field:input.dataset.attachmentField,value:input.value}])) return;
  renderMuxPlan();
});

attachmentList.addEventListener('change', (event) => {
  if (!trackState) return;
  const includeInput = event.target.closest('input[data-attachment-action="include"]');
  const fieldInput = event.target.closest('input[data-attachment-field]');
  const target = includeInput || fieldInput;
  if (!target) return;

  const item = trackState.attachments.find((entry) => entry.index === Number(target.dataset.attachmentIndex));
  if (!item) return;

  if (includeInput) {
    if (!changeSourceAttachments([{index:item.index,field:'include',value:includeInput.checked}])) {
      renderAttachmentList();
      return;
    }
    preserveAttachments.checked = trackState.attachments.length > 0 && trackState.attachments.every((entry) => entry.include);
    renderAttachmentList();
  } else if (!changeSourceAttachments([{index:item.index,
    field:fieldInput.dataset.attachmentField,value:fieldInput.value}])) return;
  renderMuxPlan();
  renderImportedAssetInventory();
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

trackList.addEventListener('change', (event) => {
  if (!trackState) return;
  const actionInput = event.target.closest('input[data-track-action]');
  const fieldInput = event.target.closest('input[data-track-field]');
  const target = actionInput || fieldInput;
  if (!target) return;

  const index = Number(target.dataset.trackIndex);
  const track = trackState.tracks.find((item) => item.index === index);
  if (!track) return;

  if (actionInput) {
    const action = actionInput.dataset.trackAction;
    if (!changeSourceTracks([{ index: track.index, field: action, value: actionInput.checked }])) {
      renderTrackList();
      return;
    }
    renderTrackList();
    renderImportedAssetInventory();
    return;
  }

  // Text fields are already synchronized on the input event. Re-rendering the
  // whole track list on blur/change can replace a sibling field while the user
  // is moving focus to it, causing the next edit to be lost.
  if (!changeSourceTracks([{ index: track.index,
    field: fieldInput.dataset.trackField, value: fieldInput.value }])) return;
  renderMuxPlan();
  renderImportedAssetInventory();
});

trackList.addEventListener('input', (event) => {
  if (!trackState) return;
  const input = event.target.closest('input[data-track-field]');
  if (!input) return;
  const track = trackState.tracks.find((item) => item.index === Number(input.dataset.trackIndex));
  if (!track) return;
  if (!changeSourceTracks([{ index: track.index,
    field: input.dataset.trackField, value: input.value }])) return;
  renderMuxPlan();
});

trackList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-track-move]');
  if (!button || !trackState) return;
  const track = trackState.tracks.find((item) => item.index === Number(button.dataset.trackIndex));
  if (!track) return;
  if (!moveTrack(track, Number(button.dataset.trackMove))) return;
  renderTrackList();
  renderImportedAssetInventory();
  renderContainerChangeSummary();
  renderMuxPlan();
});

async function scanSourceContainer({ automatic = false } = {}) {
  const video = videoInput.files[0];
  if (!video || !currentVideoIsMatroska(video) || isBusy()) return;

  const sourceKey = fileKey(video);
  if (automatic && (trackState?.fileKey === sourceKey || containerAutoScanSuppressedKey === sourceKey)) return;
  if (!automatic) containerAutoScanSuppressedKey = '';


  const scanGeneration = ++containerScanGeneration;
  scanning = true;
  cancelRequested = false;
  updateUI();
  logEl.textContent = '';
  bar.style.width = '4%';

  const prefix = taskPrefix();
  let videoPath = `${prefix}-scan.mkv`;
  let stagedVideoSource = null;
  const probePath = `${prefix}-tracks.json`;

  try {
    await loadFFmpeg();
    if (
      cancelRequested ||
      scanGeneration !== containerScanGeneration ||
      fileKey(videoInput.files[0]) !== sourceKey
    ) return;

    status.textContent = automatic ? '正在读取 MKV 容器内容……' : '正在重新扫描 MKV 容器……';
    stagedVideoSource=await stageBrowserPrimarySource({
      ffmpeg,file:video,prefix,fallbackPath:videoPath,
      workerFsType:FFFSType.WORKERFS,loadBytes:fetchFile,
    });
    videoPath=stagedVideoSource.path;
    logEl.textContent += 'INFO: 来源扫描输入策略：'+stagedVideoSource.kind+'。\n';
    const probe = await probeInput(videoPath, probePath);
    if (
      cancelRequested ||
      scanGeneration !== containerScanGeneration ||
      fileKey(videoInput.files[0]) !== sourceKey
    ) return;

    // ffprobe can output parseable JSON with a missing/empty streams array
    // under an actual large-source runtime failure. Never create an
    // authoritative trackState or display "scan complete: 0 streams".
    // Suppress the automatic retry loop for this exact input generation.
    // Explicit user retry clears this suppression; a new File resets it.
    if (!Array.isArray(probe?.streams) || !probe.streams.length) {
      containerAutoScanSuppressedKey = sourceKey;
      // A user-invoked rescan can start from an earlier valid trackState.
      // An empty new observation must invalidate that cached source editor,
      // never leave historical track metadata executable as if revalidated.
      if (scannedSourceFile === video) resetTrackState();
      requireObservedSourceStreams(probe);
    }

    const headerIdentity = selectedVideoHeaderIdentity(video) || sniffedVideoIdentity(video, {});
    const verifiedIdentity = videoIdentityFromProbe(video, probe, headerIdentity);
    if (!isMatroskaIdentity(verifiedIdentity)) {
      throw new Error(`实际检测到的容器为 ${verifiedIdentity.containerLabel}，不是 Matroska / MKV，不能进入 MKV 原轨扫描。`);
    }
    const identityMismatch = identityMismatchMessage(verifiedIdentity);
    if (identityMismatch) {
      logEl.textContent += `WARNING: ${identityMismatch}；轨道扫描以实际内容为准。\n`;
    }

    const tracks = probe.streams
      .filter((stream) => ['audio', 'subtitle'].includes(stream.codec_type))
      .map((stream) => ({
        index: stream.index,
        type: stream.codec_type,
        stream,
        include: true,
        language: stream.tags?.language || 'und',
        title: stream.tags?.title || '',
        order: stream.index,
        default: Boolean(stream.disposition?.default),
        forced: Boolean(stream.disposition?.forced),
        original: Boolean(stream.disposition?.original),
        commentary: Boolean(stream.disposition?.comment),
        hearingImpaired: Boolean(stream.disposition?.hearing_impaired),
        originalLanguage: stream.tags?.language || 'und',
        originalTitle: stream.tags?.title || '',
        originalDefault: Boolean(stream.disposition?.default),
        originalForced: Boolean(stream.disposition?.forced),
        originalOriginal: Boolean(stream.disposition?.original),
        originalCommentary: Boolean(stream.disposition?.comment),
        originalHearingImpaired: Boolean(stream.disposition?.hearing_impaired),
      }));

    const attachments = probe.streams
      .filter((stream) => stream.codec_type === 'attachment')
      .map((stream) => ({
        index: stream.index,
        stream,
        filename: stream.tags?.filename || '',
        mimetype: stream.tags?.mimetype || '',
        originalFilename: stream.tags?.filename || '',
        originalMimetype: stream.tags?.mimetype || '',
        include: true,
      }));

    trackState = {
      fileKey: fileKey(video),
      streams: probe.streams || [],
      tracks,
      attachments,
      chapters: probe.chapters,
      format: probe.format,
      attachmentCount: probe.attachmentCount,
    };
    scannedSourceFile = video;
    refreshLiveSourceTrackAuthority();

    preserveAttachments.checked = true;
    trackBulkTools?.classList.remove('hidden');
    attachmentBulkTools?.classList.toggle('hidden', !attachments.length);
    renderTrackList();
    renderAttachmentList();
    bar.style.width = '0%';
    status.textContent = `轨道扫描完成：${(probe.streams || []).length} 个流 · ${attachments.length} 个附件 · ${(probe.chapters || []).length} 个章节。`;
  } catch (err) {
    if (cancelRequested || String(err?.message || err).includes('terminate')) {
      status.textContent = '轨道扫描已取消。';
    } else {
      logEl.textContent += `ERROR: ${err?.stack || err}\n`;
      status.textContent = formatOperationError(err, {
        phase: 'scan',
        logText: logEl.textContent,
      });
    }
    bar.style.width = '0%';
  } finally {
    if (loaded) {
      if(stagedVideoSource) await stagedVideoSource.cleanup();
      else await removeQuietly(videoPath);
      await removeQuietly(probePath);
    }
    scanning = false;
    cancelRequested = false;
    updateUI();

    const current = videoInput.files[0];
    if (
      current &&
      currentVideoIsMatroska(current) &&
      containerAutoScanSuppressedKey !== fileKey(current) &&
      (!trackState || trackState.fileKey !== fileKey(current))
    ) {
      queueMicrotask(() => {
        containerScanPromise = scanSourceContainer({ automatic: true });
      });
    }
  }
}

scanTracksBtn.addEventListener('click', () => {
  containerScanPromise = scanSourceContainer({ automatic: false });
});
function charPreview(chars, limit = 24) {
  const values = chars.slice(0, limit).map((char) => (
    `${char}(U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`
  ));
  return values.join(' ') + (chars.length > limit ? ' …' : '');
}

function faceLabel(face) {
  return `${face.name} [w${face.weight || 400}${face.italic ? ', italic' : ''}]`;
}

function reportFontFamilyCompleteness(uploadedFonts) {
  const groups = new Map();

  for (const item of uploadedFonts) {
    const family = item.descriptor.family || item.file.name;
    const key = family.normalize('NFKC').trim().toLocaleLowerCase('en-US');
    let group = groups.get(key);
    if (!group) {
      group = { family, faces: new Set(), files: [] };
      groups.set(key, group);
    }

    const bold = Boolean(item.descriptor.bold);
    const italic = Boolean(item.descriptor.italic);
    const face = bold && italic ? 'Bold Italic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular';
    group.faces.add(face);
    group.files.push(item.file.name);
  }

  for (const group of groups.values()) {
    const expected = ['Regular', 'Bold', 'Italic', 'Bold Italic'];
    const missing = expected.filter((face) => !group.faces.has(face));
    logEl.textContent += `字体家族：${group.family} · 已有 ${[...group.faces].join(', ')}${missing.length ? ` · 缺 ${missing.join(', ')}` : ' · 四种基础 face 齐全'}\n`;
  }
}

async function analyzePreservedFonts(analysis, uploadedFonts) {
  const usedUploaded = new Set();
  const missingFamilies = [];
  const faceFallbacks = [];
  const missingGlyphGroups = [];

  logEl.textContent += `ASS 实际使用字体 face：${analysis.usedFonts.length}；样式声明 face：${analysis.declaredFonts.length}\n`;

  for (const required of analysis.usedFonts) {
    const candidates = uploadedFonts
      .map((item) => ({ item, match: scoreFontFaceMatch(required, item.descriptor) }))
      .filter((entry) => entry.match.matched)
      .sort((a, b) => b.match.score - a.match.score);

    if (!candidates.length) {
      missingFamilies.push(faceLabel(required));
      logEl.textContent += `WARNING: ASS 字体依赖未满足：“${faceLabel(required)}”（来源：${required.sources.join(', ') || 'Dialogue'}）\n`;
      continue;
    }

    const bestScore = candidates[0].match.score;
    const bestCandidates = candidates.filter((entry) => entry.match.score >= bestScore - 20);
    const styleExact = bestCandidates.some((entry) => entry.match.styleExact);

    if (!styleExact) {
      faceFallbacks.push(faceLabel(required));
      logEl.textContent += `WARNING: 找到字体家族，但没有精确 face：“${faceLabel(required)}”；将使用最接近的 ${bestCandidates.map((entry) => entry.item.file.name).join('、')}\n`;
    }

    for (const entry of bestCandidates) usedUploaded.add(entry.item.index);

    logEl.textContent += `字体 face 映射：“${faceLabel(required)}” -> ${bestCandidates.map((entry) => `${entry.item.file.name} [w${entry.item.descriptor.weight}${entry.item.descriptor.italic ? ', italic' : ''}]`).join('、')}\n`;

    if (!required.characters.length) continue;

    let remaining = [...required.characters];
    let successfulChecks = 0;

    for (const entry of bestCandidates) {
      if (!remaining.length) break;
      try {
        const result = await checkFontCharacters(entry.item.file, remaining, entry.item.descriptor.collectionIndex);
        const missing = new Set(result.missing);
        remaining = remaining.filter((char) => missing.has(char));
        successfulChecks += 1;
      } catch (error) {
        logEl.textContent += `WARNING: 无法检查“${entry.item.file.name}”的字形覆盖：${error?.message || error}\n`;
      }
    }

    if (successfulChecks > 0 && remaining.length) {
      missingGlyphGroups.push({ font: faceLabel(required), characters: remaining });
      logEl.textContent += `WARNING: “${faceLabel(required)}”仍缺少 ${remaining.length} 个实际字幕字符：${charPreview(remaining)}\n`;
    } else if (successfulChecks > 0) {
      logEl.textContent += `字形覆盖通过：“${faceLabel(required)}”的 ${required.characters.length} 个实际字幕字符均有匹配 face 覆盖。\n`;
    }
  }

  const unused = uploadedFonts.filter((item) => !usedUploaded.has(item.index));
  if (unused.length) {
    logEl.textContent += `INFO: ${unused.length} 个上传字体未匹配到当前 ASS 的实际 face，但仍会作为附件封装：${unused.map((item) => item.file.name).join('、')}\n`;
  }

  return { missingFamilies, faceFallbacks, missingGlyphGroups };
}

function getScannedSelection(video) {
  if (!trackState || trackState.fileKey !== fileKey(video)) return null;
  return trackState;
}

function cancelCurrentMuxTask() {
  // Directory writes are not an ffmpeg task and must never terminate Wasm.
  if (!(running || scanning || previewing)) return;
  cancelRequested = true;
  if (scanning) containerAutoScanSuppressedKey = fileKey(videoInput.files[0]);
  status.textContent = '正在取消当前操作……';
  logEl.textContent += 'CANCEL: 用户请求终止当前操作。\n';
  ffmpeg.terminate();
  loaded = false;
}
cancelBtn.addEventListener('click', cancelCurrentMuxTask);

// One mux operation returns the actual in-memory artifacts to its caller.
// The single-task button and batch adapter share this executor without
// synthesizing click events or polling mutable download-link state.
async function executeCurrentMuxTask(explicit = null) {
  const independent = explicit?.kind === 'frozen-batch-mux-context-v1';
  // The batch owns the shared FFmpeg instance across all prepare/mux/save
  // phases. A synthetic single-task click must not start between jobs.
  if (isBusy() || (batchRunning && !independent)) return;
  const video = independent ? explicit.source : videoInput.files[0];
  const evidenceSourceAtExecution = outputCompositionFileKey(video || null);

  if (!independent) {
    try {
      if (!liveExternalAssetSession) syncNewTrackState();
      const verifyCurrent=()=>inspectLiveExternalAssets(liveExternalAssetSession,{
        audioRows:externalAudioState,subtitleRows:newSubtitleState,
        fonts:selectedFonts(),mode:fontMode.value,
      });
      if (externalAssetPendingTaskRebind) {
        // An explicitly selected new primary video grants ONE bounded
        // inventory rebind if the async picker/font inventory remained from
        // the previous task (not a general bypass for source/field drift).
        // If the current owner is coherent, keep its authored title/flags:
        // recreating it after a successful check discards domain revisions.
        try {
          verifyCurrent();
        } catch(error) {
          if (error?.message !== 'EXTERNAL_DOMAIN_INVENTORY_CHANGED') throw error;
          // Rebinding an external font/file inventory must never re-infer
          // authorized metadata. Validate exact currently selected File and
          // sidecar references before rebuilding the immutable owner.
          const audioFiles=selectedExternalAudioFiles();
          const subtitles=selectedSubtitleTrackInputs().tracks;
          if(audioFiles.length!==externalAudioState.length ||
              subtitles.length!==newSubtitleState.length ||
              audioFiles.some((file,index)=>externalAudioState[index]?.file!==file) ||
              subtitles.some((track,index)=>
                newSubtitleState[index]?.file!==track.file ||
                newSubtitleState[index]?.sidecarFile!==(track.sidecarFile||null)))
            throw Error('EXTERNAL_DOMAIN_REBIND_SOURCE_CHANGED');
          refreshExternalAssetAuthority();
        }
        externalAssetPendingTaskRebind=false;
      }
      verifyCurrent();
      // The source/attachment/external adapters must still own the SAME
      // immutable ContainerProject. Detect legacy mutation of either half
      // before any real single-task FFmpeg handoff.
      if(liveWorkspaceAuthority)
        inspectLiveWorkspaceAuthority(liveWorkspaceAuthority,liveWorkspaceContext());
      // No second syncNewTrackState here. A successful authoritative
      // domain check commits the exact editor values to the legacy executor;
      // re-inference from a filename can erase a user's second-task title.
    } catch(error) {
      status.textContent='外部音频、字幕或字体来源已变化，请重新选择并确认后封装（'+
        (error?.message||String(error))+'）。';
      return;
    }
  }
  const fontRecognition = independent ? explicit.fontRecognition : selectedFontRecognition();
  if (!independent && fontIdentityPending()) return;
  if ((independent ? explicit.fonts.length : selectedFonts().length) && fontRecognition.ignored.length) {
    const first = fontRecognition.ignored[0];
    status.textContent = `字体“${first.file.name}”的实际内容无法识别：${first.identity?.parseError || '无有效字体结构'}`;
    return;
  }
  const fontFiles = fontRecognition.recognized.map((entry) => entry.file);
  const fontIdentityByKey = new Map(
    fontRecognition.recognized.map((entry) => [fileKey(entry.file), entry.identity])
  );
  const subtitleTracks = independent ? explicit.subtitles : newSubtitleState;
  const externalAudioTracks = independent ? explicit.externalAudio : externalAudioState;
  // A source-only remux is valid: existing MKV tracks, chapters and attachments
  // do not require an extra subtitle file. ffprobe still checks video presence.
  if (!video || (!independent && importInProgress)) return;

  const headerVideoIdentity = independent ? explicit.headerIdentity :
    (selectedVideoHeaderIdentity(video) || sniffedVideoIdentity(video, {}));
  const videoIsMatroska = isMatroskaIdentity(headerVideoIdentity);
  const invalidSubtitle = subtitleTracks.find((track) => !track.format);
  const mode = fontFiles.length ? (independent ? explicit.fontMode : (fontMode.value || 'preserve')) : 'preserve';
  const manualScanned = independent ? null : getScannedSelection(video);
  const appendMode = Boolean(videoIsMatroska && (independent
    ? explicit.appendPreserveAll : appendPreserveAll?.checked));
  const scanned = appendMode ? null : manualScanned;
  // Capture the exact attachment intent before any asynchronous FFmpeg work.
  // This is report-only evidence, not an editor or mutable task authority.
  const deliverySourceRows = independent ? [] : (manualScanned?.attachments || []).map(row => ({
    index:row.index,
    originalFilename:String(row.originalFilename || row.stream?.tags?.filename || ''),
    filename:appendMode ? String(row.originalFilename || row.stream?.tags?.filename || '') : String(row.filename || ''),
    originalMimetype:String(row.originalMimetype || row.stream?.tags?.mimetype || ''),
    mimetype:appendMode ? String(row.originalMimetype || row.stream?.tags?.mimetype || '') : String(row.mimetype || ''),
    include:appendMode || Boolean(row.include),
  }));
  const preserveAllOriginalSubtitles = appendMode;
  const preserveAllOriginalAttachments = videoIsMatroska && (
    appendMode || (!scanned && (independent
      ? explicit.preserveAttachments : preserveAttachments.checked))
  );
  if (invalidSubtitle) {
    status.textContent = `字幕“${invalidSubtitle.file.name}”的实际内容无法识别为支持的 ASS / SSA / SRT / WebVTT / PGS / VobSub。`;
    return;
  }
  const subtitleWitness = captureSubtitleExecutionWitness({
    source: video, tracks: subtitleTracks, appendMode,
  });
  const assertCurrentSubtitleWitness = () => {
    const fresh = validateSubtitleExecutionWitness(subtitleWitness, {
      source: independent ? explicit.source : videoInput.files[0],
      tracks: independent ? explicit.subtitles : newSubtitleState,
      appendMode: independent ? Boolean(explicit.appendPreserveAll)
        : Boolean(currentVideoIsMatroska() && appendPreserveAll?.checked),
    });
    if (!fresh.ok) {
      throw new Error('执行准备期间字幕来源、格式或轨道选项已改变，请重新核对并启动（' + fresh.reason + '）。');
    }
  };
  running = true;
  cancelRequested = false;
  updateUI();
  let preservationInfo = '';
  try {
    // A new task must replace any preceding error *synchronously*, before
    // this awaited safety inspection. Otherwise recovery workflows can display
    // the previous task's failure while a new task is already in progress.
    status.textContent = '正在重新确认来源容器身份与保留风险……';
    // Re-read the exact source at the authorization boundary. A stale
    // name/size/mtime-keyed header cache must not skip Matroska protection.
    // Unknown headers fail closed: they may conceal a complex MKV.
    const actualHeader = await sniffFileContainer(video);
    if (!independent && videoInput.files?.[0] !== video) {
      throw new Error('源文件在预检期间已替换，请重新确认后启动。');
    }
    if (actualHeader.container === 'unknown' || actualHeader.container !== headerVideoIdentity.container) {
      throw new Error('无法确认当前来源容器身份或文件头已变化；为避免复杂 MKV 元数据丢失，拒绝封装。');
    }
    // Preserve a previous successful download until the new source passes
    // preflight. Never revoke prior artifacts merely to refuse an unsafe MKV.
    if (['matroska', 'matroska-webm'].includes(actualHeader.container)) {
      status.textContent = '正在检查原 MKV 章节与标签的保留风险……';
      const protection = await inspectMatroskaPreservation(video);
      if (cancelRequested) {
        status.textContent = '源结构预检已取消。';
        running = false;
        updateUI();
        return;
      }
      if (!independent && (videoInput.files?.[0] !== video || fileKey(videoInput.files[0]) !== fileKey(video))) {
        throw new Error('预检期间来源已改变，请重新确认当前输入。');
      }
      const refusal = preservationBlockMessage(video.name, protection);
      if (refusal) throw new Error(refusal);
      if (protection.state === 'UNVERIFIED_REFERENCES') {
        preservationInfo = 'WARNING: ' + protection.warnings.join('；') +
          '。封装仍可继续，但这些关联的保留未经独立验证；请复核输出。' + String.fromCharCode(10);
      } else if (protection.state === 'NO_KNOWN_HAZARD') {
        preservationInfo = 'INFO: 未检出当前硬阻断结构；不代表完整 EBML 保留已验证。' + String.fromCharCode(10);
      }
    }
    assertCurrentSubtitleWitness();
  } catch (err) {
    status.textContent = formatOperationError(err, { phase: 'mux' });
    bar.style.width = '0%';
    running = false;
    updateUI();
    return;
  }
  // A frozen batch task owns its artifacts via batchResultUrls. Never
  // revoke or repoint a user's existing single-task download/report URLs.
  if (!independent) {
    downloadLink.classList.add('hidden');
    reportLink.classList.add('hidden');
    auditResult.className = 'audit-result hidden';
    auditResult.textContent = '';
    if (outputURL) {
      URL.revokeObjectURL(outputURL);
      outputURL = null;
    }
    if (reportURL) {
      URL.revokeObjectURL(reportURL);
      reportURL = null;
    }
    // The old download grants are now revoked. Retire its associated Blob and
    // structure receipt, not just its visible link, before starting a new mux.
    ++outputIndexAuditSequence;
    outputIndexAuditPending = false;
    lastActualOutput = null;
    lastOutputIndexAudit = null;
    singleDirectorySession.release();
    singleDirectoryHandle=null;
    singleDirectoryStatusMessage='';
    renderActualOutputEvidence();
  }
  logEl.textContent = preservationInfo;
  bar.style.width = '4%';

  const prefix = taskPrefix();
  let videoPath = `${prefix}-input${sourceVirtualSuffix(headerVideoIdentity)}`;
  let stagedVideoSource = null;
  const outputPath = `${prefix}-output.mkv`;
  const probePath = `${prefix}-probe.json`;
  const auditPath = `${prefix}-audit.json`;
  const outputName = independent ? explicit.outputName : safeOutputName(video.name);
  const fontPaths = [];
  const audioPaths = [];
  const subtitlePaths = [];
  const subtitlePrimaryPaths = [];
  const extraProbePaths = [];

  try {
    status.textContent = '正在解析 ASS 与字体 face……';
    bar.style.width = '10%';

    const fontDedupe = await dedupeFilesBySha256(fontFiles);
    const identifiedFontItems = await Promise.all(fontDedupe.unique.map(async (item) => {
      const fontIdentity = fontIdentityByKey.get(fileKey(item.file)) || await identifyFontFile(item.file);
      if (!isSupportedFontIdentity(fontIdentity)) {
        throw new Error(`字体“${item.file.name}”的实际内容无法识别为支持的 TTF / OTF / TTC / OTC：${fontIdentity.parseError || '无有效 SFNT / collection 结构'}`);
      }
      const mismatch = fontIdentityMismatchMessage(fontIdentity);
      if (mismatch) {
        logEl.textContent += `WARNING: 字体“${item.file.name}”：${mismatch}；按实际字体结构处理。\n`;
      }
      return {
        ...item,
        fontIdentity,
        attachmentName: normalizedFontAttachmentName(item.file.name, fontIdentity),
      };
    }));
    const initialReservedAttachmentNames = scanned
      ? selectedOriginalAttachments().map((item) => item.filename).filter(Boolean)
      : [];
    const uniqueFontItems = assignUniqueAttachmentNames(identifiedFontItems, initialReservedAttachmentNames)
      .map((item, sourceIndex) => ({ ...item, sourceIndex }));
    const descriptorGroups = uniqueFontItems.map((item, attachmentIndex) => (
      item.fontIdentity.descriptors.map((descriptor, faceIndex) => ({
        ...item,
        index: `${attachmentIndex}:${faceIndex}`,
        attachmentIndex,
        descriptor,
      }))
    ));
    const descriptors = descriptorGroups.flat();

    if (fontDedupe.duplicates.length) {
      logEl.textContent += `INFO: 检测到 ${fontDedupe.duplicates.length} 个内容完全相同的重复字体，按 SHA-256 去重，不重复写入 MKV：${fontDedupe.duplicates.map((item) => item.file.name).join('、')}\n`;
    }
    for (const item of descriptors) {
      const attachmentRename = item.attachmentName !== item.file.name ? ` -> attachment “${item.attachmentName}”` : '';
      const collectionFace = item.descriptor.collectionIndex == null ? '' : ` · collection face #${item.descriptor.collectionIndex}`;
      logEl.textContent += `上传字体：${item.file.name}${attachmentRename} -> Family “${item.descriptor.family}” / ${item.descriptor.subfamily || 'Regular'} / weight ${item.descriptor.weight}${item.descriptor.italic ? ' / italic' : ''}${collectionFace}\n`;
    }
    if (descriptors.length) reportFontFamilyCompleteness(descriptors);

    let attachments = uniqueFontItems;
    let completionNote = '';
    let dependencyWarningCount = 0;
    const preparedSubtitles = [];

    let fontSubsetText = '';

    for (let index = 0; index < subtitleTracks.length; index += 1) {
      const track = subtitleTracks[index];
      const format = track.format || subtitleFormatInfo(track.file.name);

      if (!format?.text) {
        logEl.textContent += `字幕 #${index + 1}：${track.displayName || track.file.name} · ${format?.label || 'BITMAP'} · 二进制 stream copy\n`;
        preparedSubtitles.push({
          ...track,
          format,
          encoding: 'binary',
          outputText: null,
          inputExtension: format?.inputExtension || ext(track.file.name) || '.bin',
          codecOverride: null,
          expectedCodec: format?.expectedCodec || '',
          binary: true,
        });
        continue;
      }

      const { text: sourceText, encoding } = await readAssText(track.file);
      let outputText = sourceText;

      logEl.textContent += `字幕 #${index + 1}：${track.file.name} · ${format?.label || 'SUB'} · 编码 ${encoding}\n`;

      if (format?.assLike) {
        const analysis = analyzeAssFontUsage(sourceText);
        fontSubsetText += analysis.allCharacters.join('');

        if (descriptors.length && mode === 'force') {
          const primary = descriptors[0];
          const forcedFamily = preferredAssFontFamily(primary.descriptor);
          outputText = forceAssFontFamily(sourceText, forcedFamily);
          attachments = [uniqueFontItems[primary.attachmentIndex]];
          logEl.textContent += `INFO: 字幕 #${index + 1} 强制字体使用 libass 兼容族名 “${forcedFamily}”${forcedFamily !== primary.descriptor.family ? `（字体首选族名：${primary.descriptor.family}）` : ''}\n`;

          try {
            const coverage = await checkFontCharacters(primary.file, analysis.allCharacters, primary.descriptor.collectionIndex);
            if (coverage.missing.length) {
              dependencyWarningCount += 1;
              logEl.textContent += `WARNING: 字幕 #${index + 1} 强制字体缺少 ${coverage.missing.length}/${coverage.checkedCount} 个唯一字幕字符：${charPreview(coverage.missing)}\n`;
            }
          } catch (coverageError) {
            logEl.textContent += `WARNING: 字幕 #${index + 1} 无法完成字体缺字检查：${coverageError?.message || coverageError}\n`;
          }
        } else if (descriptors.length) {
          const dependencyResult = await analyzePreservedFonts(analysis, descriptors);
          dependencyWarningCount +=
            dependencyResult.missingFamilies.length +
            dependencyResult.faceFallbacks.length +
            dependencyResult.missingGlyphGroups.length;
        } else {
          logEl.textContent += `INFO: 字幕 #${index + 1} 未选择字体附件，跳过字体依赖与 glyph coverage 检查。\n`;
        }
      } else {
        fontSubsetText += visibleTextForPlainSubtitle(sourceText, format?.id);
      }

      preparedSubtitles.push({
        ...track,
        format,
        encoding,
        outputText,
        inputExtension: format?.inputExtension || ext(track.file.name) || '.txt',
        codecOverride: format?.ffmpegOutputCodec || null,
        expectedCodec: format?.expectedCodec || '',
        binary: false,
      });
    }

    if ((independent ? explicit.subsetEnabled : fontSubsetEnabled?.checked) && attachments.length) {
      status.textContent = '正在用 HarfBuzz 生成字体子集……';
      const beforeBytes = attachments.reduce((sum, item) => sum + Number(item.file.size || 0), 0);
      attachments = await subsetFontItems(attachments, fontSubsetText);
      const applied = attachments.filter((item) => item.subset?.applied);
      const skipped = attachments.filter((item) => item.subset?.enabled && !item.subset?.applied);
      const afterBytes = attachments.reduce((sum, item) => sum + Number(item.file.size || 0), 0);
      if (applied.length) {
        logEl.textContent += `字体子集化：${applied.length} 个文件 · ${formatBytes(beforeBytes)} → ${formatBytes(afterBytes)}。HarfBuzz 保留 layout glyph closure。\n`;
      }
      if (skipped.length) {
        logEl.textContent += `INFO: ${skipped.length} 个字体未子集化（TTC / OTC 集合或没有可提取字幕文本），保留原文件。\n`;
      }
    }

    if (mode === 'force' && preparedSubtitles.some((track) => track.format?.assLike) && uniqueFontItems.length > 1) {
      logEl.textContent += `INFO: 强制字体模式只对 ASS / SSA 生效，并只使用第一个字体文件；其余 ${uniqueFontItems.length - 1} 个上传字体文件不会附加。\n`;
    }
    if (dependencyWarningCount) {
      completionNote = `；字体检查存在 ${dependencyWarningCount} 组警告`;
    }

    await loadFFmpeg();
    if (cancelRequested) return;

    status.textContent = '正在把文件载入浏览器内存……';
    bar.style.width = '20%';

    stagedVideoSource=await stageBrowserPrimarySource({
      ffmpeg,file:video,prefix,fallbackPath:videoPath,
      workerFsType:FFFSType.WORKERFS,loadBytes:fetchFile,
    });
    videoPath=stagedVideoSource.path;
    logEl.textContent += 'INFO: 正式封装输入策略：'+stagedVideoSource.kind+'。\n';

    for (let index = 0; index < externalAudioTracks.length; index += 1) {
      const track = externalAudioTracks[index];
      const path = `${prefix}-audio-${index}.source`;
      audioPaths.push(path);
      await ffmpeg.writeFile(path, await fetchFile(track.file));
    }

    for (let index = 0; index < preparedSubtitles.length; index += 1) {
      const item = preparedSubtitles[index];
      const path = `${prefix}-subtitle-${index}${item.inputExtension}`;
      subtitlePrimaryPaths.push(path);
      subtitlePaths.push(path);

      if (item.binary) {
        await ffmpeg.writeFile(path, await fetchFile(item.file));
        if (item.format?.id === 'vobsub' && item.sidecarFile) {
          const sidecarPath = `${prefix}-subtitle-${index}.sub`;
          subtitlePaths.push(sidecarPath);
          await ffmpeg.writeFile(sidecarPath, await fetchFile(item.sidecarFile));
        }
      } else {
        await ffmpeg.writeFile(path, new TextEncoder().encode(item.outputText));
      }
    }

    // Commit the exact in-memory bytes sent to the FFmpeg FS. A source
    // filename or a pre-subset hash is NOT the output payload witness.
    const stagedFontPayloads = [];
    for (let index = 0; index < attachments.length; index += 1) {
      const item = attachments[index];
      const path = `${prefix}-font-${index}${fontVirtualSuffix(item.fontIdentity)}`;
      fontPaths.push(path);
      const stagedBytes = await fetchFile(item.file);
      stagedFontPayloads.push({
        sha256: await sha256Hex(stagedBytes),
        sizeBytes: stagedBytes.byteLength,
      });
      await ffmpeg.writeFile(path, stagedBytes);
    }
    if (cancelRequested) return;

    status.textContent = '正在读取输入容器结构……';
    const inputProbe = await probeInput(videoPath, probePath);
    const inputIdentity = videoIdentityFromProbe(video, inputProbe, headerVideoIdentity);
    if (!inputIdentity.hasVideo) {
      throw new Error(`“${video.name}”没有检测到可用视频轨。`);
    }
    if (!isSupportedVideoIdentity(inputIdentity)) {
      throw new Error(`实际检测到的媒体容器“${inputIdentity.containerLabel}”不在当前 MP4 / MOV / M4V / MKV / WebM Stream Copy 支持范围内。`);
    }
    const inputIdentityMismatch = identityMismatchMessage(inputIdentity);
    if (inputIdentityMismatch) {
      logEl.textContent += `WARNING: ${inputIdentityMismatch}；后续封装以 ffprobe 实际内容为准。\n`;
    } else {
      logEl.textContent += `INFO: 实际媒体身份：${inputIdentity.containerLabel} · ${inputIdentity.videoStreams.map((stream) => stream.codec_name || 'unknown').join(' / ')}。\n`;
    }

    const originalAttachmentCount = inputProbe.attachmentCount;
    const preserveAllSourceStreams = Boolean(appendMode && isMatroskaIdentity(inputIdentity));
    const sourceVideos = inputProbe.streams.filter((stream) => stream.codec_type === 'video');
    const sourceAudios = inputProbe.streams.filter((stream) => stream.codec_type === 'audio');
    const sourceSubtitles = inputProbe.streams.filter((stream) => stream.codec_type === 'subtitle');
    const sourceAttachments = inputProbe.streams.filter((stream) => stream.codec_type === 'attachment');
    const sourceData = inputProbe.streams.filter((stream) => stream.codec_type === 'data');
    const knownContainerTypes = new Set(['video', 'audio', 'subtitle', 'attachment', 'data']);
    const sourceOtherStreams = inputProbe.streams.filter((stream) => !knownContainerTypes.has(stream.codec_type));

    const selectedAudio = scanned ? selectedTracks('audio') : null;
    const selectedSubtitles = scanned ? selectedTracks('subtitle') : [];
    const originalAttachments = scanned ? selectedOriginalAttachments() : [];

    const reservedAttachmentNames = scanned
      ? originalAttachments.map((item) => item.filename).filter(Boolean)
      : (preserveAllOriginalAttachments
          ? sourceAttachments.map((stream) => String(stream.tags?.filename || '')).filter(Boolean)
          : []);
    const renamedFontItems = assignUniqueAttachmentNames(attachments, reservedAttachmentNames);
    renamedFontItems.forEach((named, index) => {
      if (attachments[index].attachmentName !== named.attachmentName) {
        logEl.textContent += `INFO: 新字体附件与原附件重名，“${attachments[index].attachmentName}”自动改为“${named.attachmentName}”。\n`;
      }
      attachments[index].attachmentName = named.attachmentName;
    });

    const runtimeExternalAudio = [];
    for (let index = 0; index < externalAudioTracks.length; index += 1) {
      const probeOutput = `${prefix}-audio-${index}-probe.json`;
      extraProbePaths.push(probeOutput);
      const probe = await probeInput(audioPaths[index], probeOutput);
      const audioIdentity = audioIdentityFromProbe(externalAudioTracks[index].file, probe);
      if (!audioIdentity.hasAudio) {
        throw new Error(`外部音频“${externalAudioTracks[index].file.name}”没有可用音频轨。`);
      }
      const audioMismatch = identityMismatchMessage(audioIdentity);
      if (audioMismatch) {
        logEl.textContent += `WARNING: 外部音频“${externalAudioTracks[index].file.name}”：${audioMismatch}；按实际 codec ${audioIdentity.codec || 'unknown'} 处理。\n`;
      }
      runtimeExternalAudio.push({
        ...externalAudioTracks[index],
        path: audioPaths[index],
        inputIndex: 1 + index,
        codec: audioIdentity.codec,
        identity: audioIdentity,
      });
    }

    const subtitleInputOffset = 1 + runtimeExternalAudio.length;
    const runtimeSubtitles = preparedSubtitles.map((track, index) => ({
      ...track,
      path: subtitlePrimaryPaths[index],
      inputIndex: subtitleInputOffset + index,
    }));

    const compatibilitySourceAudio = selectedAudio
      ? selectedAudio.map((track) => track.stream)
      : sourceAudios;
    const compatibilitySourceSubtitles = preserveAllOriginalSubtitles
      ? sourceSubtitles
      : selectedSubtitles.map((track) => track.stream);
    const compatibility = resolveMuxCompatibility({
      targetContainer: 'matroska',
      videoStreams: sourceVideos,
      sourceAudioStreams: compatibilitySourceAudio,
      externalAudioTracks: runtimeExternalAudio,
      newSubtitles: runtimeSubtitles,
      sourceSubtitleStreams: compatibilitySourceSubtitles,
      fontAttachments: attachments,
    });

    logEl.textContent += `COMPATIBILITY: ${summarizeCompatibility(compatibility)} · 视频/音频策略 stream-copy-only · silent transcode=false。\n`;
    for (const item of compatibility.issues) {
      const level = item.state === COMPATIBILITY_STATE.CONVERSION_REQUIRED ? 'INFO' : 'WARNING';
      logEl.textContent += `${level}: [${item.state}] ${item.message}\n`;
    }
    if (compatibility.state === COMPATIBILITY_STATE.UNSUPPORTED) {
      const reasons = compatibility.issues
        .filter((item) => item.state === COMPATIBILITY_STATE.UNSUPPORTED)
        .map((item) => item.message);
      throw new Error(`组合兼容性不支持：${reasons.join('；')}`);
    }

    if (scanned) {
      logEl.textContent += `轨道方案：原音频 ${selectedAudio.length}/${scanned.tracks.filter((x) => x.type === 'audio').length}，外部音频 ${runtimeExternalAudio.length}，新增字幕 ${runtimeSubtitles.length}，原字幕 ${selectedSubtitles.length}/${scanned.tracks.filter((x) => x.type === 'subtitle').length}，原附件 ${originalAttachments.length}/${scanned.attachments.length}。\n`;
    } else if (isMatroskaIdentity(inputIdentity)) {
      logEl.textContent += appendMode
        ? `INFO: 源流复制并追加：通过 -map 0 请求映射原 stream，并请求映射源章节与部分 metadata；重封装不保证原 EBML 结构或 UID 关系完整保留。\n`
        : `INFO: 未扫描轨道，兼容模式保留所有原音频、不保留原字幕；原附件${preserveAllOriginalAttachments ? '全部保留' : '不保留'}。\n`;
    }

    status.textContent = '正在使用 FFmpeg 重封装 MKV……';
    bar.style.width = '40%';

    const fontAttachments = attachments.map((item, index) => ({
      path: fontPaths[index],
      mimeType: fontMimeType(item.fontIdentity),
      filename: item.attachmentName,
    }));

    const commandOptions = {
      mainInputPath: videoPath,
      outputPath,
      sourceAudioCount: sourceAudios.length,
      sourceSubtitleCount: sourceSubtitles.length,
      preserveAllSourceStreams,
      originalAudioTracks: selectedAudio,
      externalAudioTracks: runtimeExternalAudio,
      newSubtitleTracks: runtimeSubtitles,
      originalSubtitleTracks: selectedSubtitles,
      preserveAllOriginalSubtitles,
      originalAttachments,
      preserveAllOriginalAttachments,
      preserveOriginalDataStreams: isMatroskaIdentity(inputIdentity),
      originalAttachmentCount,
      fontAttachments,
    };
    const args = buildMuxCommand(commandOptions);
    // A read-only independent descriptor mapping must produce exactly the
    // legacy arguments. Refuse before ffmpeg.exec on any mismatch or stale
    // subtitle/source edit; do not claim EBML output preservation.
    assertCurrentSubtitleWitness();
    verifyStagedSubtitleCommandParity({
      source: video, runtimeSubtitles,
      commandOptions, expectedArgs: args,
    });

    const code = await ffmpeg.exec(args);
    if (cancelRequested) return;
    if (code !== 0) throw new Error(`FFmpeg 返回错误代码 ${code}`);

    status.textContent = '正在审计输出 MKV……';
    bar.style.width = '94%';

    const expectedAudio = [
      ...(selectedAudio
        ? selectedAudio.map((track) => ({
            codec: track.stream.codec_name || '',
            language: normalizeTrackLanguage(track.language),
            title: track.title || '',
            default: track.default,
            original: track.original,
            commentary: track.commentary,
            hearingImpaired: track.hearingImpaired,
          }))
        : sourceAudios.map((stream) => ({
            codec: stream.codec_name || '',
            language: normalizeTrackLanguage(stream.tags?.language),
            title: stream.tags?.title || '',
            default: Boolean(stream.disposition?.default),
            original: Boolean(stream.disposition?.original),
            commentary: Boolean(stream.disposition?.comment),
            hearingImpaired: Boolean(stream.disposition?.hearing_impaired),
          }))),
      ...runtimeExternalAudio.map((track) => ({
        codec: track.codec,
        language: normalizeTrackLanguage(track.language),
        title: track.title || '',
        default: track.default,
        original: track.original,
        commentary: track.commentary,
        hearingImpaired: track.hearingImpaired,
      })),
    ];

    const expectedOriginalAttachments = scanned
      ? originalAttachments.map((item) => ({
          filename: item.filename || '',
          mimetype: item.mimetype || '',
        }))
      : (preserveAllOriginalAttachments
          ? sourceAttachments.map((stream) => ({
              filename: String(stream.tags?.filename || ''),
              mimetype: String(stream.tags?.mimetype || ''),
            }))
          : []);
    const expectedOriginalAttachmentNames = expectedOriginalAttachments
      .map((item) => item.filename)
      .filter(Boolean);
    const expectedFontAttachments = attachments.map((item) => ({
      filename: item.attachmentName,
      mimetype: fontMimeType(item.fontIdentity),
    }));

    const runtimeChanges = independent
      ? { added: runtimeSubtitles.length + runtimeExternalAudio.length + attachments.length,
          removed: 0, modified: 0 }
      : containerChangeCounts({ newFontCount: attachments.length });

    const expectedAudit = {
      video: sourceVideos.map((stream) => ({ codec: stream.codec_name || '' })),
      data: isMatroskaIdentity(inputIdentity)
        ? sourceData.map((stream) => ({ codec: stream.codec_name || '' }))
        : [],
      otherStreams: preserveAllSourceStreams
        ? sourceOtherStreams.map((stream) => ({
            type: stream.codec_type || 'unknown',
            codec: stream.codec_name || '',
          }))
        : [],
      audio: expectedAudio,
      subtitles: preserveAllSourceStreams
        ? [
            ...sourceSubtitles.map((stream) => ({
              codec: stream.codec_name || '',
              language: normalizeTrackLanguage(stream.tags?.language),
              title: stream.tags?.title || '',
              default: Boolean(stream.disposition?.default),
              forced: Boolean(stream.disposition?.forced),
              original: Boolean(stream.disposition?.original),
              commentary: Boolean(stream.disposition?.comment),
              hearingImpaired: Boolean(stream.disposition?.hearing_impaired),
            })),
            ...runtimeSubtitles.map((track) => ({
              codec: track.expectedCodec || track.codec || '',
              language: normalizeTrackLanguage(track.language),
              title: track.title || '',
              default: track.default,
              forced: track.forced,
              original: track.original,
              commentary: track.commentary,
              hearingImpaired: track.hearingImpaired,
            })),
          ]
        : [
            ...runtimeSubtitles.map((track) => ({
              codec: track.expectedCodec || track.codec || '',
              language: normalizeTrackLanguage(track.language),
              title: track.title || '',
              default: track.default,
              forced: track.forced,
              original: track.original,
              commentary: track.commentary,
              hearingImpaired: track.hearingImpaired,
            })),
            ...selectedSubtitles.map((track) => ({
              codec: track.stream.codec_name || '',
              language: normalizeTrackLanguage(track.language),
              title: track.title || '',
              default: track.default,
              forced: track.forced,
              original: track.original,
              commentary: track.commentary,
              hearingImpaired: track.hearingImpaired,
            })),
          ],
      chapterCount: inputProbe.chapters.length,
      chapters: inputProbe.chapters.map(chapterAuditExpectation),
      formatTitle: inputProbe.format?.tags?.title || '',
      formatTags: preservableFormatTags(inputProbe.format?.tags || {}),
      attachmentCount: expectedOriginalAttachments.length + expectedFontAttachments.length,
      attachments: [...expectedOriginalAttachments, ...expectedFontAttachments],
      attachmentFilenames: expectedOriginalAttachmentNames,
      newFontFilenames: attachments.map((item) => item.attachmentName),
    };

    let finalAudit = null;
    let actualOutputProbe = null;

    try {
      const auditProbe = await probeInput(outputPath, auditPath, {
        allowDecodeFallback: false,
      });
      actualOutputProbe = auditProbe;
      const audit = auditMuxProbe(auditProbe, expectedAudit);
      finalAudit = {
        status: audit.ok ? 'pass' : 'warning',
        ...audit,
      };
      if (audit.ok) {
        const auditText = `封装后审计通过：${audit.counts.video} 视频 / ${audit.counts.audio} 音频 / ${audit.counts.subtitle} 字幕 / ${audit.counts.data} 数据 / ${audit.counts.other} 其他 / ${audit.counts.attachment} 附件 / ${audit.counts.chapter} 章节 · 变更 +${runtimeChanges.added} / −${runtimeChanges.removed} / ~${runtimeChanges.modified}。`;
        logEl.textContent += `AUDIT: ${auditText}\n`;
      if (!independent) {
        auditResult.textContent = auditText;
        auditResult.className = 'audit-result';
      }
      } else {
        const auditText = `封装后审计发现 ${audit.issues.length} 项偏差：${audit.issues.join('；')}`;
        logEl.textContent += `AUDIT WARNING: 输出与计划存在 ${audit.issues.length} 项偏差：\n- ${audit.issues.join('\n- ')}\n`;
      if (!independent) {
        auditResult.textContent = auditText;
        auditResult.className = 'audit-result warn';
      }
        completionNote += `；封装后审计发现 ${audit.issues.length} 项偏差`;
      }
    } catch (auditError) {
      const reason = auditError?.message || String(auditError);
      const auditText = `封装已完成，但 ffprobe 审计不可用：${reason}`;
      logEl.textContent += `AUDIT WARNING: ${auditText}。已保留 MKV 输出，不把审计工具限制当作封装失败。\n`;
      if (!independent) {
      auditResult.textContent = auditText;
      auditResult.className = 'audit-result warn';
      }
      completionNote += '；封装后审计未完成（不影响已生成 MKV）';
      finalAudit = {
        status: 'unavailable',
        reason,
        ok: false,
        issues: [reason],
      };
    }

    status.textContent = '正在准备保存……';
    bar.style.width = '96%';

    const data = await ffmpeg.readFile(outputPath);
    const outputSha256 = await sha256Hex(data);
    const outputBlob = new Blob([data.buffer], { type: 'video/x-matroska' });
    const fontPayloadAudit = await auditProducedFontAttachments(outputBlob,
      attachments.map((item, index) => ({
        ...stagedFontPayloads[index],
        filename: item.attachmentName,
        mimeType: fontMimeType(item.fontIdentity),
      })));
    if (fontPayloadAudit.status === 'pass') {
      logEl.textContent += `AUDIT: ${fontPayloadAudit.verified}/${fontPayloadAudit.total} 个新字体附件已从最终 MKV 中独立回读并通过 SHA-256 校验。\n`;
    } else if (!['not-requested'].includes(fontPayloadAudit.status)) {
      const detail = fontPayloadAudit.issues.join('；') || '附件校验未完成';
      logEl.textContent += `AUDIT WARNING: 成品新字体附件字节验证未通过：${detail}\n`;
      if (finalAudit.status === 'pass') finalAudit.status = 'warning';
      finalAudit.ok = false;
      finalAudit.issues = [...(finalAudit.issues || []), ...fontPayloadAudit.issues];
      if (!independent) {
      auditResult.className = 'audit-result warn';
      auditResult.textContent = '成品字体附件验证待复核：' + detail;
      }
      completionNote += '；成品字体附件字节核验待复核';
    }
    finalAudit.fontPayloadAudit = fontPayloadAudit;
    const originalAttachmentClaims = scanned
      ? originalAttachments.map((item) => ({
          sourceFilename: item.originalFilename || item.stream?.tags?.filename || '',
          outputFilename: item.filename || '',
          sourceMimeType: item.originalMimetype || item.stream?.tags?.mimetype || '',
          outputMimeType: item.mimetype || '',
        }))
      : preserveAllOriginalAttachments
        ? sourceAttachments.map((stream) => ({
            sourceFilename: String(stream.tags?.filename || ''),
            outputFilename: String(stream.tags?.filename || ''),
            sourceMimeType: String(stream.tags?.mimetype || ''),
            outputMimeType: String(stream.tags?.mimetype || ''),
          }))
        : [];
    const originalPayloadAudit = await auditPreservedOriginalAttachmentData(
      video, outputBlob, originalAttachmentClaims, {
        // Explicit bounded fallback for original MKV attachments larger than
        // the 32 MiB single-Blob SHA limit. Compare ALL bytes by chunks, not
        // hashes of chunks. No UID/Tag preservation or writer permission.
        chunkCompare: {
          maxFileBytes: 128 * 1024 * 1024,
          maxTotalBytes: 1024 * 1024 * 1024,
          chunkBytes: 1024 * 1024,
        },
        shouldCancel: () => cancelRequested || (independent && batchCancelRequested),
      });
    // A cancelled audit can return "unavailable", but a user cancellation
    // must never publish an MKV under the ordinary "audit warning" policy.
    if (cancelRequested || (independent && batchCancelRequested)) {
      throw new Error('ATTACHMENT_AUDIT_CANCELLED');
    }
    if (originalPayloadAudit.status === 'pass') {
      logEl.textContent += `AUDIT: ${originalPayloadAudit.verified}/${originalPayloadAudit.total} 个原 MKV 附件实际 FileData 已通过 SHA-256 或完整分块逐字节核对。UID 与引用关系不包含在此结论内。\n`;
    } else if (originalPayloadAudit.status !== 'not-requested') {
      const detail = originalPayloadAudit.issues.join('；') || '原附件验证未完成';
      logEl.textContent += `AUDIT WARNING: 原 MKV 附件源/成品字节核验待复核：${detail}\n`;
      if (finalAudit.status === 'pass') finalAudit.status = 'warning';
      finalAudit.ok = false;
      finalAudit.issues = [...(finalAudit.issues || []), ...originalPayloadAudit.issues];
      if (!independent) {
        auditResult.className = 'audit-result warn';
        auditResult.textContent = '原 MKV 附件字节验证待复核：' + detail;
      }
      completionNote += '；原 MKV 附件的字节保真待复核';
    }
    finalAudit.originalAttachmentPayloadAudit = originalPayloadAudit;
    finalAudit.sourceAttachmentDeliveryAudit = auditSourceAttachmentDelivery({
      sourceRows:deliverySourceRows,
      outputProbe:actualOutputProbe,
      payloadAudit:originalPayloadAudit,
      ffprobeStatus:finalAudit.status,
    });
    // P3 subtitle-delivery proof: recover NEW ASS Dialogue events from the
    // actual finished Matroska track. This is deliberately distinct from
    // ffprobe stream identity and does not claim Style/font/render fidelity.
    const assOutputClaims = runtimeSubtitles.map((track, index) => ({
      name: track.file.name,
      formatId: track.format?.id || '',
      outputText: track.outputText,
      ordinal: (preserveAllSourceStreams ? sourceSubtitles.length : 0) + index,
    }));
    // One actual finished-MKV readback serves two INDEPENDENT semantic
    // checks. Cache a pending Promise to avoid concurrent FFmpeg reads.
    const recoveredAssCache = new Map();
    const readFinalAss = async (ordinal) => {
      if (recoveredAssCache.has(ordinal)) return recoveredAssCache.get(ordinal);
      const pending = (async () => {
        const extractedPath = prefix + '-final-ass-check-' + ordinal + '.ass';
        try {
          const extraction = await execWithCapturedLogs([
            '-hide_banner', '-loglevel', 'error', '-copyts', '-i', outputPath,
            '-map', '0:s:' + ordinal, '-c:s', 'ass', '-f', 'ass',
            '-y', extractedPath,
          ]);
          if (extraction.code !== 0) {
            throw new Error('成品字幕回读失败：' +
              (usefulLogTail(extraction.logs) || 'FFmpeg 返回非零状态'));
          }
          const recovered = await ffmpeg.readFile(extractedPath);
          if (!(recovered instanceof Uint8Array) ||
              recovered.byteLength > 2 * 1024 * 1024) {
            throw new Error('ASS 回读文件超过 2 MiB 或不是可读取字节');
          }
          return new TextDecoder('utf-8', { fatal: true }).decode(recovered);
        } finally {
          await removeQuietly(extractedPath);
        }
      })();
      recoveredAssCache.set(ordinal, pending);
      return pending;
    };
    const assAuditSource = {
      claims: assOutputClaims,
      outputProbe: actualOutputProbe,
      outputBytes: data.byteLength,
      readFinalAss,
    };
    const assEventAudit = await auditProducedAssEvents(assAuditSource);
    const assStyleAudit = await auditProducedAssStyles(assAuditSource);
    if (assEventAudit.status === 'pass') {
      logEl.textContent += 'AUDIT: 已从最终 MKV 回读并逐事件核对 ' +
        assEventAudit.verified + '/' + assEventAudit.total +
        ' 条新增 ASS 轨；文本、时间、覆盖标签及事件顺序一致。样式、字体渲染和播放器兼容仍未验证。\n';
    } else if (assEventAudit.status === 'warning') {
      const detail = assEventAudit.issues.join('；') || 'Dialogue 存在差异';
      logEl.textContent += 'AUDIT WARNING: 新增 ASS 事件回读偏差：' + detail + '\n';
      if (finalAudit.status === 'pass') finalAudit.status = 'warning';
      finalAudit.ok = false;
      finalAudit.issues = [...(finalAudit.issues || []), ...assEventAudit.issues];
      if (!independent) {
        auditResult.className = 'audit-result warn';
        auditResult.textContent = '成品 ASS 事件验证待复核：' + detail;
      }
      completionNote += '；新增 ASS 事件回读存在差异';
    } else if (assEventAudit.status === 'unavailable') {
      logEl.textContent += 'AUDIT UNAVAILABLE: ASS 事件回读未完成（属于独立可选证据，不将其冒充验证通过）：' +
        assEventAudit.issues.join('；') + '\n';
    }
    finalAudit.assEventAudit = assEventAudit;
    if (assStyleAudit.status === 'pass') {
      logEl.textContent += 'AUDIT: 最终 MKV 中 ' +
        assStyleAudit.verified + '/' + assStyleAudit.total +
        ' 条新增 ASS 的 ' + assStyleAudit.styleRecords +
        ' 项 V4+ Style 定义字段一致；不代表字体解析、渲染或播放器效果已验证。\n';
    } else if (assStyleAudit.status === 'warning') {
      const detail = assStyleAudit.issues.join('；') || 'Style 定义存在差异';
      logEl.textContent += 'AUDIT WARNING: 成品 ASS Style 定义不一致：' + detail + '\n';
      finalAudit.status = 'warning';
      finalAudit.ok = false;
      finalAudit.issues = [...(finalAudit.issues || []), ...assStyleAudit.issues];
      if (!independent) {
        auditResult.className = 'audit-result warn';
        auditResult.textContent = '成品 ASS 样式待复核：' + detail;
      }
      completionNote += '；新增 ASS Style 成品核验存在差异';
    } else if (assStyleAudit.status === 'unavailable') {
      logEl.textContent += 'AUDIT UNAVAILABLE: 新增 ASS V4+ Style 样式核验未完成：' +
        assStyleAudit.issues.join('；') + '\n';
    }
    finalAudit.assStyleAudit = assStyleAudit;
    const subripCueAudit = await auditProducedSubripCues({
      claims: assOutputClaims, outputProbe: actualOutputProbe,
      outputBytes: data.byteLength,
      readFinalSrt: async (ordinal) => {
        const extractedPath = prefix + '-final-subrip-check-' + ordinal + '.srt';
        try {
          const extraction = await execWithCapturedLogs([
            '-hide_banner', '-loglevel', 'error', '-copyts', '-i', outputPath,
            '-map', '0:s:' + ordinal, '-c:s', 'srt', '-f', 'srt', '-y', extractedPath,
          ]);
          if (extraction.code !== 0) throw new Error('成品 SubRip 回读失败');
          const recovered = await ffmpeg.readFile(extractedPath);
          if (!(recovered instanceof Uint8Array) || recovered.byteLength > 2 * 1024 * 1024) {
            throw new Error('成品 SubRip 回读超过 2 MiB 预算');
          }
          return new TextDecoder('utf-8', { fatal: true }).decode(recovered);
        } finally {
          await removeQuietly(extractedPath);
        }
      },
    });
    finalAudit.subripCueAudit = subripCueAudit;
    if (subripCueAudit.status === 'pass') {
      logEl.textContent += `AUDIT: 最终 MKV 的 ${subripCueAudit.verified}/${subripCueAudit.total} 条新增 SRT/WebVTT 轨，纯文本、毫秒时间、数量与顺序一致；排版和播放器未验证。\n`;
    } else if (subripCueAudit.status === 'warning') {
      const detail = subripCueAudit.issues.join('；');
      finalAudit.status = 'warning';
      finalAudit.ok = false;
      finalAudit.issues = [...(finalAudit.issues || []), ...subripCueAudit.issues];
      completionNote += '；新增 SRT/WebVTT 成品条目存在差异';
      logEl.textContent += 'AUDIT WARNING: ' + detail + '\n';
      if (!independent) {
        auditResult.className = 'audit-result warn';
        auditResult.textContent = '成品 SRT/WebVTT 条目待复核：' + detail;
      }
    } else if (subripCueAudit.status === 'unavailable') {
      completionNote += '；新增 SRT/WebVTT 成品条目未验证';
      logEl.textContent += 'AUDIT UNAVAILABLE: ' + subripCueAudit.issues.join('；') + '\n';
    }
    if (!independent) outputURL = URL.createObjectURL(outputBlob);

    const report = createMuxReport({
      appVersion: PRODUCT_PACKAGE_VERSION,
      input: {
        name: video.name,
        sizeBytes: video.size,
        format: inputProbe.format?.format_name || '',
        formatTitle: inputProbe.format?.tags?.title || '',
        formatTags: preservableFormatTags(inputProbe.format?.tags || {}),
        videoCodecs: sourceVideos.map((stream) => stream.codec_name || 'unknown'),
        audioCodecs: sourceAudios.map((stream) => stream.codec_name || 'unknown'),
        dataCodecs: sourceData.map((stream) => stream.codec_name || 'unknown'),
        otherStreams: sourceOtherStreams.map((stream) => ({
          type: stream.codec_type || 'unknown',
          codec: stream.codec_name || 'unknown',
        })),
        chapterCount: inputProbe.chapters.length,
        chapters: inputProbe.chapters.map((chapter) => ({
          id: chapter.id,
          startTime: chapter.start_time,
          endTime: chapter.end_time,
          title: chapter.tags?.title || '',
          language: chapter.tags?.language || '',
        })),
        attachmentCount: originalAttachmentCount,
        selectedOriginalAttachments: expectedOriginalAttachments,
      },
      subtitle: {
        tracks: runtimeSubtitles.map((track) => ({
          name: track.file.name,
          format: track.format?.label || '',
          encoding: track.encoding,
          language: normalizeTrackLanguage(track.language),
          title: track.title || '',
          default: track.default,
          forced: track.forced,
          original: track.original,
          commentary: track.commentary,
          hearingImpaired: track.hearingImpaired,
        })),
      },
      fonts: {
        selectedCount: fontFiles.length,
        uniqueCount: uniqueFontItems.length,
        faceCount: descriptors.length,
        duplicateCount: fontDedupe.duplicates.length,
        attachments: attachments.map((item) => ({
          sourceName: item.file.name,
          attachmentName: item.attachmentName,
          sizeBytes: item.file.size,
          sha256: item.sha256,
          mimeType: fontMimeType(item.fontIdentity),
          subset: item.subset || { enabled: false, applied: false },
          faces: descriptors
            .filter((face) => face.attachmentIndex === (item.sourceIndex ?? uniqueFontItems.indexOf(item)))
            .map((face) => ({
              family: face.descriptor.family,
              subfamily: face.descriptor.subfamily || '',
              weight: face.descriptor.weight,
              italic: Boolean(face.descriptor.italic),
              collectionIndex: face.descriptor.collectionIndex,
            })),
        })),
      },
      plan: independent ? explicit.reportPlan : buildMuxPlan(),
      compatibility: {
        ...compatibility,
        execution: {
          muxSucceeded: true,
          auditStatus: finalAudit?.status || 'unknown',
          evidence: 'actual-ffmpeg-mux',
        },
      },
      expectedAudit,
      audit: finalAudit,
      output: {
        name: outputName,
        sizeBytes: data.byteLength,
        sha256: outputSha256,
        container: 'matroska',
        streamCopy: true,
      },
      warnings: {
        fontDependencyWarningCount: dependencyWarningCount,
        externalAudioCount: runtimeExternalAudio.length,
        originalAttachmentSelectionCount: originalAttachments.length,
      },
    });
    report.externalAudio = runtimeExternalAudio.map((track) => ({
      name: track.file.name,
      codec: track.codec,
      language: normalizeTrackLanguage(track.language),
      title: track.title || '',
      default: track.default,
      original: track.original,
      commentary: track.commentary,
      hearingImpaired: track.hearingImpaired,
    }));

    const reportBlob = new Blob([serializeMuxReport(report)], { type: 'application/json' });
    if (!independent) {
      reportURL = URL.createObjectURL(reportBlob);
      downloadLink.href = outputURL;
      downloadLink.download = outputName;
      downloadLink.textContent = `保存成品 · ${outputName}`;
      downloadLink.setAttribute('aria-label', `保存成品 ${outputName} 到本机`);
      downloadLink.classList.remove('hidden');
      reportLink.href = reportURL;
      reportLink.download = reportFilename(outputName);
      reportLink.textContent = '保存封装报告';
      reportLink.classList.remove('hidden');
    }

    logEl.textContent += `REPORT: 输出 SHA-256 ${outputSha256}；封装报告已生成。\n`;
    if (!independent) {
      // Retain the exact downloaded-output bytes for explicit read-only
      // structure inspection; the existing output object URL already retains
      // these bytes until the next task clears it.
      lastActualOutput = { sourceKey: evidenceSourceAtExecution, sourceFile:video,
        outputBlob, report };
      singleDirectorySession.replace(lastActualOutput,{
        blob:outputBlob,outputName,reportBlob,
        reportName:reportFilename(outputName),outputSha256,
      });
      singleDirectoryHandle=null;
      singleDirectoryStatusMessage='';
      lastOutputIndexAudit = null;
      renderActualOutputEvidence();
    }

    bar.style.width = '100%';
    const assLikeCount = runtimeSubtitles.filter((track) => track.format?.assLike).length;
    const webvttCount = runtimeSubtitles.filter((track) => track.format?.id === 'webvtt').length;
    const modeText = attachments.length
      ? (mode === 'force'
          ? `已处理 ${assLikeCount} 条 ASS / SSA 并附加 ${attachments.length} 个字体文件`
          : `已附加 ${attachments.length} 个字体文件`)
      : '未附加字体';
    const webvttNote = webvttCount ? `；${webvttCount} 条 WebVTT 已转换为 Matroska 兼容 SubRip 字幕流` : '';
    status.textContent = `完成。共新增 ${runtimeSubtitles.length} 条字幕；${modeText}${webvttNote}${completionNote}；新增 ${runtimeExternalAudio.length} 条外部音频；视频/音频未重新编码。`;

    if (dependencyWarningCount) {
      logEl.textContent += `完成，但存在 ${dependencyWarningCount} 组字体 face / 字形覆盖警告。请在发布前检查日志。\n`;
    }

    // Content-first asset inventory remains the user's editable task after
    // export. Clearing only the hidden File adapters here would strand the
    // visible source/track tree and discard its live edits. Keep the task ready
    // for another revision; users can explicitly remove assets to release it.
    // Preserve original cleanup behavior only for the pre-inventory path.
    if (!independent && !importedAssetEntries.length) {
      videoInput.value = '';
      audioInput.value = '';
      subInput.value = '';
      externalAudioState = [];
      newSubtitleState = [];
      refreshExternalAssetAuthority();
      renderNewTrackLists();
      resetTrackState();
    }
    return {
      blob: outputBlob,
      outputName,
      reportBlob,
      reportName: reportFilename(outputName),
      outputSha256,
      auditStatus: finalAudit?.status || 'unavailable',
      auditIssues: Array.from(finalAudit?.issues || []),
    };
  } catch (err) {
    console.error(err);
    if (cancelRequested || String(err?.message || err).includes('terminate')) {
      status.textContent = '任务已取消。下次操作会重新加载 ffmpeg.wasm 核心。';
      bar.style.width = '0%';
    } else {
      logEl.textContent += `ERROR: ${err?.stack || err}\n`;
      status.textContent = formatOperationError(err, {
        phase: 'mux',
        logText: logEl.textContent,
      });
      bar.style.width = '0%';
    }
  } finally {
    if (loaded) {
      if(stagedVideoSource) await stagedVideoSource.cleanup();
      else await removeQuietly(videoPath);
      for (const path of audioPaths) await removeQuietly(path);
      for (const path of subtitlePaths) await removeQuietly(path);
      for (const path of fontPaths) await removeQuietly(path);
      for (const path of extraProbePaths) await removeQuietly(path);
      await removeQuietly(outputPath);
      await removeQuietly(probePath);
      await removeQuietly(auditPath);
    }
    running = false;
    cancelRequested = false;
    updateUI();
  }
}
muxBtn.addEventListener('click', () => { void executeCurrentMuxTask(); });

// Batch uses the same *content identity* scanner as single-task intake,
// but each candidate media container may become a separate video job.
// Legacy category inputs remain execution adapters and an explicit fallback.
function renderBatchAssetInventory() {
  if (!batchAssetInventory || !batchAssetStatus) return;
  const entries = batchImportEntries;
  const roles = resolveBatchImportedAssets(entries);
  const blocked = roles.unsupported.length;
  const identityCollisions = entries.filter(entry =>
    entry.evidence === 'metadata-identity-collision').length;
  batchAssetStatus.textContent = batchImportInProgress
    ? '识别中…'
    : !entries.length ? '0 文件'
    : `${entries.length} 文件 · ${roles.containers.length} 容器 · ${roles.subtitles.length} 字幕 · ${roles.fonts.length} 字体${blocked ? ` · ${blocked} 不可用` : ''}${identityCollisions ? ` · ${identityCollisions} 项文件身份冲突` : ''}`;
  if (!entries.length) {
    batchAssetInventory.innerHTML = '<div class="track-empty">暂无文件</div>';
    return;
  }
  const locked = batchRunning || isBusy() || batchImportInProgress;
  batchAssetInventory.innerHTML = entries.map((entry) => {
    const role = { container: '媒体容器候选', subtitle: '字幕', font: '字体', audio: '独立音频', unknown: '未识别' }[entry.kind] || '未知';
    const supported = ['container', 'subtitle', 'font'].includes(entry.kind);
    const state = supported
      ? '待预检'
      : entry.kind === 'audio' ? '批量不支持独立音频' : '不可用'; 
    // Routine recognized inputs only need their current state; keep the
    // classifier's detailed reason visible for unsupported/unknown input.
    const diagnosis = supported ? state : [state, entry.detail].filter(Boolean).join(' · ');
    return `<div class="asset-entry" data-kind="${entry.kind}">
      <div class="asset-entry-main">
        <div class="asset-entry-line">
          <strong class="asset-entry-name">${escapeHtml(entry.file.webkitRelativePath || entry.file.name)}</strong>
          <span class="asset-entry-type">${role} · ${escapeHtml(entry.label)}</span>
          ${entry.kind === "container" ? sourceSizeAdvisoryMarkup(entry.file) : ""}
        </div>
        <div class="asset-entry-desc">${escapeHtml(diagnosis)}</div>
      </div>
      <div class="asset-entry-roles">
        <button type="button" class="asset-remove" data-batch-asset-remove="${escapeHtml(entry.key)}"
          ${locked ? 'disabled' : ''}>移除</button>
      </div>
    </div>`;
  }).join('');
}

function replaceBatchAdapterFiles() {
  // Import/removal starts a new source selection; a choice for an older File
  // object must never silently authorize a different batch.
  batchManualAssignments.clear();
  currentBatchTaskMetadata=new Map();
  selectedBatchVideoFile = null;
  activeBatchJobLedger = null;
  const roles = resolveBatchImportedAssets(batchImportEntries);
  batchInternalAdapterUpdate = true;
  try {
    for (const input of [batchVideoInput, batchSubtitleInput, batchFontInput,
      batchVideoFolderInput, batchSubtitleFolderInput, batchFontFolderInput]) {
      setInputFiles(input, input === batchVideoInput ? roles.containers
        : input === batchSubtitleInput ? roles.subtitles
        : input === batchFontInput ? roles.fonts : []);
    }
  } finally {
    batchInternalAdapterUpdate = false;
  }
  renderBatchAssetInventory();
  requestBatchPlanSync();
}

async function importBatchUnifiedAssets(files) {
  if (batchImportInProgress || batchRunning || isBusy()) return;
  const selections = planIncomingAssetIntake(files, batchImportEntries);
  const incoming = selections.filter(item => !item.conflict).map(item => item.file);
  const conflicts = selections.filter(item => item.conflict).map(item => item.conflict);
  if (!incoming.length && !conflicts.length) return;
  batchImportInProgress = true;
  batchStartBtn.disabled = true;
  ++batchPlanGeneration; // Stale preflight results may not re-enable execution.
  renderBatchAssetInventory();
  try {
    const identified = [];
    for (let start = 0; start < incoming.length; start += 4) {
      identified.push(...await Promise.all(incoming.slice(start, start + 4)
        .map((file) => identifyImportedAsset(file))));
    }
    batchImportEntries = [...batchImportEntries, ...identified, ...conflicts];
    batchUnifiedMode = true;
  } finally {
    batchImportInProgress = false;
    replaceBatchAdapterFiles();
    updateUI();
  }
}

batchUnifiedInput?.addEventListener('change', () => {
  void importBatchUnifiedAssets(batchUnifiedInput.files);
  batchUnifiedInput.value = '';
});
batchUnifiedFolderInput?.addEventListener('change', () => {
  void importBatchUnifiedAssets(batchUnifiedFolderInput.files);
  batchUnifiedFolderInput.value = '';
});
batchAssetDropzone?.addEventListener('click', () => {
  if (!isBusy() && !batchRunning && !batchImportInProgress) batchUnifiedInput?.click();
});
batchAssetDropzone?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  if (!isBusy() && !batchRunning && !batchImportInProgress) batchUnifiedInput?.click();
});
batchAssetDropzone?.addEventListener('dragover', (event) => {
  if (isBusy() || batchRunning || batchImportInProgress) return;
  event.preventDefault();
  batchAssetDropzone.dataset.dragging = 'true';
});
batchAssetDropzone?.addEventListener('dragleave', () => {
  batchAssetDropzone.dataset.dragging = 'false';
});
batchAssetDropzone?.addEventListener('drop', (event) => {
  event.preventDefault();
  batchAssetDropzone.dataset.dragging = 'false';
  void importBatchUnifiedAssets(event.dataTransfer?.files);
});
batchAssetInventory?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-batch-asset-remove]');
  if (!button || batchRunning || isBusy() || batchImportInProgress) return;
  const previousIndex = [...batchAssetInventory.querySelectorAll('button[data-batch-asset-remove]')].indexOf(button);
  batchImportEntries = batchImportEntries.filter((item) => item.key !== button.dataset.batchAssetRemove);
  batchUnifiedMode = true;
  replaceBatchAdapterFiles();
  focusUpdatedInventoryItem(batchAssetInventory, {
    selector: 'button[data-batch-asset-remove]',
    previousIndex,
    fallback: batchAssetDropzone,
  });
});

function batchVideoFiles() {
  return mergeFileSelections(batchVideoInput?.files, batchVideoFolderInput?.files);
}

function batchSubtitleFiles() {
  return mergeFileSelections(batchSubtitleInput?.files, batchSubtitleFolderInput?.files);
}

function batchFontCandidates() {
  const selected = mergeFileSelections(batchFontInput?.files, batchFontFolderInput?.files);
  // Unified batch mode must never inherit invisible single-task fonts.
  return selected.length || batchUnifiedMode ? selected : selectedFonts();
}

function indexBatchExecutionBySource() {
  const ledger = activeBatchJobLedger;
  if (!ledger) return new Map();
  const states = ledger.snapshot();
  return new Map(ledger.plan.jobs.map((job, index) => [job.video, {
    outputName: job.outputName, state: states[index],
  }]));
}

function renderBatchJobInspector(pairing) {
  if (!batchJobInspector) return;
  const job = pairing?.jobs?.find((item) => item.video === selectedBatchVideoFile);
  if (!job) {
    batchJobInspector.innerHTML = '<div class="track-empty">请选择任务，查看拟输出容器与字幕配对。</div>';
    return;
  }
  const confirmed = (pairing.manuallyAssignedPairings || [])
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => entry.video === job.video);
  const filenameCollision = pairing.outputNameCollisions?.some((entry) => entry.videos.includes(job.video));
  const directoryCollision = pairing.directoryConflicts?.includes(job.outputName);
  const unresolvedTie = pairing.ambiguousPairings?.some((entry) => entry.candidates.includes(job.video));
  const indexedExecution = indexBatchExecutionBySource().get(job.video);
  const executionState = indexedExecution?.outputName === job.outputName
    ? indexedExecution.state : null;
  const warnings = [
    filenameCollision ? '当前输出名与批内其他任务冲突' : '',
    directoryCollision ? '输出目录存在同名文件，禁止覆盖' : '',
    unresolvedTie ? '仍有字幕可匹配此来源，需先人工确认' : '',
    pairing.directoryCheckError ? '输出目录尚未安全核验' : '',
  ].filter(Boolean);
  batchJobInspector.innerHTML = `
    <div class="batch-inspector-head">
      <strong>任务检查 · ${escapeHtml(job.outputName)}</strong>
      <span class="batch-review-state" data-state="${warnings.length ? 'blocked' : 'review'}">${warnings.length ? '需要处理' : '计划预览'}</span>
    </div>
    ${executionState ? `<p class="batch-review-lifecycle" data-state="${executionState.state}">
      执行状态：${escapeHtml(BATCH_JOB_STATES[executionState.state] || executionState.state)}
      ${executionState.error ? ` · ${escapeHtml(executionState.error)}` : ''}
    </p>` : ''}
    <dl class="batch-job-facts">
      <div><dt>来源</dt><dd>${escapeHtml(job.video.webkitRelativePath || job.video.name)} ${sourceSizeAdvisoryMarkup(job.video)}</dd></div>
      <div><dt>实际类型</dt><dd>${escapeHtml(job.videoIdentity?.containerLabel || '待识别')}${job.videoIdentityMismatch ? ' · 扩展名不一致' : ''}</dd></div>
      <div><dt>字幕</dt><dd>${job.subtitleTracks.length} 条 · ${escapeHtml(batchSubtitleSummary(job))}</dd></div>
      <div><dt>字体策略</dt><dd>${escapeHtml(pairing.fonts?.length
        ? `${pairing.fonts.length} 个 · ${batchFontSubsetEnabled?.checked ? (batchSubsetScope?.value === 'group' ? 'Group 子集' : '逐任务子集') : '完整字体'}`
        : '无新字体')}</dd></div>
    </dl>
    <div class="batch-inspector-subtitles">
      ${job.subtitleTracks.map((track,index)=>`
        <div class="batch-inspector-subtitle batch-task-meta-editor">
          <strong>${escapeHtml(track.displayName || track.file.name)}</strong>
          <label>标题 <input data-batch-task-field="title"
            data-batch-track-index="${index}" data-batch-generation="${batchPlanGeneration}"
            maxlength="160" value="${escapeHtml(track.title||'')}"
            aria-label="任务 ${escapeHtml(job.outputName)} 字幕标题"></label>
          <label>语言 <input data-batch-task-field="language"
            data-batch-track-index="${index}" data-batch-generation="${batchPlanGeneration}"
            maxlength="35" value="${escapeHtml(track.language||'und')}"
            aria-label="任务 ${escapeHtml(job.outputName)} 字幕语言"></label>
          <label><input type="checkbox" data-batch-task-field="default"
            data-batch-track-index="${index}" data-batch-generation="${batchPlanGeneration}"
            ${track.default?'checked':''}>Default</label>
          <label><input type="checkbox" data-batch-task-field="forced"
            data-batch-track-index="${index}" data-batch-generation="${batchPlanGeneration}"
            ${track.forced?'checked':''}>Forced</label>
        </div>`).join('')}
    </div>
    ${confirmed.map((entry) =>
      `<div class="batch-reviewed-choice">
        <span>已人工确认：${escapeHtml(entry.track.file.name)}</span>
        <button type="button" data-batch-revoke="${entry.index}" data-batch-generation="${batchPlanGeneration}"
          ${batchRunning || batchStartPending ? 'disabled' : ''}>撤销配对</button>
      </div>`
    ).join('')}
    ${warnings.length ? `<div class="batch-review-warnings">${warnings.map((w) => `<p>${escapeHtml(w)}</p>`).join('')}</div>` : ''}
    <p class="batch-review-disclaimer">此处仅审核配对与目标构成；点击开始时仍重新执行来源结构和输出冲突预检。</p>`;
}

async function syncBatchPlan() {
  if (!batchVideoInput || !batchSubtitleInput || !batchPlan) return null;

  const generation = ++batchPlanGeneration;
  const candidateVideos = batchVideoFiles();
  const subtitles = batchSubtitleFiles();
  const fontCandidates = batchFontCandidates();
  const unifiedRoles = batchUnifiedMode ? resolveBatchImportedAssets(batchImportEntries) : null;

  batchVideoName.textContent = Array.from(batchVideoInput.files || []).length
    ? `${Array.from(batchVideoInput.files || []).length} 个文件` : '未选择';
  batchVideoFolderName.textContent = Array.from(batchVideoFolderInput?.files || []).length
    ? `${Array.from(batchVideoFolderInput.files).length} 个文件` : '未选择';
  batchSubtitleName.textContent = Array.from(batchSubtitleInput.files || []).length
    ? `${Array.from(batchSubtitleInput.files || []).length} 个文件` : '未选择';
  batchSubtitleFolderName.textContent = Array.from(batchSubtitleFolderInput?.files || []).length
    ? `${Array.from(batchSubtitleFolderInput.files).length} 个文件` : '未选择';
  batchFontName.textContent = Array.from(batchFontInput?.files || []).length
    ? `${Array.from(batchFontInput.files).length} 个字体` : '未选择';
  batchFontFolderName.textContent = Array.from(batchFontFolderInput?.files || []).length
    ? `${Array.from(batchFontFolderInput.files).length} 个文件` : '未选择';

  batchStartBtn.disabled = true;
  batchCancelBtn.disabled = !(batchRunning || batchStartPending);
  if (batchSubsetScope) batchSubsetScope.disabled = batchRunning || batchStartPending || !batchFontSubsetEnabled?.checked;
  if (batchPreserveAttachments) batchPreserveAttachments.disabled = batchRunning || batchStartPending;
  if (batchFontSubsetEnabled) batchFontSubsetEnabled.disabled = batchRunning || batchStartPending;
  if (batchOutputDirBtn) batchOutputDirBtn.disabled = batchRunning || batchStartPending;

  if (candidateVideos.length || subtitles.length) {
    batchPlan.innerHTML = '<div class="track-empty">正在读取实际视频容器与字幕格式…</div>';
  }

  const [recognition, subtitleRecognition, fontRecognition] = await Promise.all([
    identifyBatchVideos(candidateVideos, {
      cache: batchVideoIdentityCache,
      concurrency: 8,
    }),
    identifySubtitleInputs(subtitles, {
      cache: batchSubtitleIdentityCache,
      concurrency: 8,
    }),
    identifyBatchFonts(fontCandidates, {
      cache: batchFontIdentityCache,
      concurrency: 4,
    }),
  ]);

  if (generation !== batchPlanGeneration) return null;

  const videos = recognition.recognized.map((entry) => entry.file);
  const fonts = fontRecognition.recognized.map((entry) => entry.file);
  const identityByVideo = new Map(recognition.recognized.map((entry) => [entry.file, entry]));
  // User-authored metadata is an in-memory, File-bound projection, not
  // changes to the recognized source or a second mutable executor. The
  // reviewed pairing is what the existing frozen JobPlan will receive.
  const inferredPairing=buildBatchJobsFromCollected(videos,subtitleRecognition,
    {manualAssignments:batchManualAssignments});
  const pairing=projectCurrentBatchTaskMetadata(inferredPairing,currentBatchTaskMetadata);
  pairing.videoRecognition = recognition;
  pairing.subtitleRecognition = subtitleRecognition;
  pairing.fontRecognition = fontRecognition;
  pairing.fonts = fonts;
  pairing.jobs.forEach((job) => {
    const recognized = identityByVideo.get(job.video);
    job.videoIdentity = recognized?.identity || null;
    job.videoIdentityMismatch = recognized?.mismatch || '';
  });

  pairing.ignoredVideos = recognition.ignored.map((entry) => entry.file);

  pairing.directoryConflicts = [];
  pairing.directoryCheckError = '';
  if (batchOutputDirectoryHandle && pairing.jobs.length) {
    try {
      pairing.directoryConflicts = await findExistingBatchOutputs(
        batchOutputDirectoryHandle, pairing.jobs
      );
    } catch (error) {
      pairing.directoryCheckError = error?.message || String(error);
    }
  }
  if (generation !== batchPlanGeneration) return null;

  // The matrix is a projection of the same pairing that the existing executor
  // will freeze, not a second mutable job plan.
  if (!pairing.jobs.some((job) => job.video === selectedBatchVideoFile)) {
    selectedBatchVideoFile = pairing.jobs[0]?.video || null;
  }
  const executionBySource = indexBatchExecutionBySource();
  const rows = pairing.jobs.map((job, index) => {
    const outputCollision = pairing.outputNameCollisions.some((entry) => entry.videos.includes(job.video));
    const directoryCollision = pairing.directoryConflicts.includes(job.outputName);
    const hasTie = pairing.ambiguousPairings.some((entry) => entry.candidates.includes(job.video));
    const state = outputCollision || directoryCollision ? '输出冲突' : hasTie ? '待确认' : '待执行';
    const selected = selectedBatchVideoFile === job.video;
    const indexed = executionBySource.get(job.video);
    const executionState = indexed?.outputName === job.outputName ? indexed.state : null;
    return `
    <button type="button" class="plan-row plan-video batch-job-row" data-batch-job-index="${index}"
      data-selected="${selected}" aria-pressed="${selected}" aria-label="检查任务 ${escapeHtml(job.outputName)}${classifyMuxSourceSize(job.video).warning ? " · 文件超过 1 GB，可能占用较多内存，仍允许尝试封装" : ""}">
      <span class="plan-kind">#${index + 1}</span>
      <span class="plan-main">
        <strong>${escapeHtml(job.outputName)}</strong>${classifyMuxSourceSize(job.video).warning ? `<span class="mux-source-size-inline" role="img" title="${escapeHtml(MUX_SOURCE_MEMORY_WARNING)}" aria-label="${escapeHtml(MUX_SOURCE_MEMORY_WARNING)}">⚠ 超过 1 GB · 可继续</span>` : ""}
        <small>${escapeHtml(job.video.webkitRelativePath || job.video.name)} · 实际：${escapeHtml(job.videoIdentity?.containerLabel || "未识别")} · ${escapeHtml(batchSubtitleSummary(job))}
          · ${job.subtitleTracks.map((track) => escapeHtml(track.displayName || track.file.name)).join('、')}</small>
      </span>
      <span class="plan-flags batch-review-state" data-state="${executionState ? executionState.state : state === '待执行' ? 'review' : 'blocked'}">${executionState ? escapeHtml(BATCH_JOB_STATES[executionState.state] || executionState.state) : state}</span>
    </button>`;
  }).join('');

  const tieReview = pairing.ambiguousPairings.length ? `
    <section class="batch-review-conflicts" aria-label="需要人工确认的字幕配对">
      <h4>待确认的字幕配对 · ${pairing.ambiguousPairings.length}</h4>
      ${pairing.ambiguousPairings.map(({ track, candidates }, index) => `
        <label class="batch-pairing-choice">
          <span>${escapeHtml(track.file.name)} · 未自动选择来源</span>
          <select data-batch-tie-index="${index}" data-batch-generation="${generation}"
            ${batchRunning || batchStartPending ? 'disabled' : ''} aria-label="选择字幕 ${escapeHtml(track.file.name)} 对应的来源视频">
            <option value="">选择目标视频以解除歧义</option>
            ${candidates.map((video, candidateIndex) =>
              `<option value="${candidateIndex}">${escapeHtml(video.webkitRelativePath || video.name)}</option>`
            ).join('')}
          </select>
        </label>`).join('')}
    </section>` : '';

  const notes = [];
  const mismatchCount = recognition.recognized.filter((entry) => entry.mismatch).length;
  if (mismatchCount) notes.push(`${mismatchCount} 个视频扩展名与实际内容不一致，已按实际容器识别`);
  if (recognition.ignored.length) notes.push(`${recognition.ignored.length} 个文件未识别为支持的视频容器`);
  if (unifiedRoles?.unsupported.length) notes.push(`${unifiedRoles.unsupported.length} 个统一导入项目不支持当前批量模式，请在资源清单中移除`);
  if (subtitleRecognition.mismatches?.length) notes.push(`${subtitleRecognition.mismatches.length} 个字幕扩展名与实际内容不一致，已按实际格式识别`);
  if (pairing.ambiguousPairings.length) {
    const examples = pairing.ambiguousPairings.slice(0, 3).map(({ track, candidates }) =>
      `${track.file.name} → ${candidates.map((video) => video.webkitRelativePath || video.name).join(' / ')}`
    );
    notes.push(`${pairing.ambiguousPairings.length} 条字幕匹配多个视频（${examples.join('；')}）；请调整文件名或分批处理，未自动选择第一个`);
  }
  if (pairing.outputNameCollisions.length) {
    const examples = pairing.outputNameCollisions.map(({ outputName, videos }) =>
      `${outputName} ← ${videos.map((video) => video.webkitRelativePath || video.name).join(' / ')}`
    );
    notes.push(`输出文件名冲突（${examples.join('；')}）；请调整文件名或分批处理，以免覆盖已有任务产物`);
  }
  if (pairing.directoryConflicts.length) {
    notes.push(`输出目录已有 ${pairing.directoryConflicts.length} 个同名文件（${pairing.directoryConflicts.join('、')}）；不会覆盖，请换目录或移走冲突文件`);
  }
  if (pairing.directoryCheckError) {
    notes.push(`无法安全检查输出目录：${pairing.directoryCheckError}；已禁止启动，避免误覆盖`);
  }
  if (pairing.unmatchedVideos.length) notes.push(`${pairing.unmatchedVideos.length} 个视频没有匹配字幕`);
  if (pairing.unmatchedSubtitles.length) notes.push(`${pairing.unmatchedSubtitles.length} 条字幕没有匹配视频`);
  if (pairing.orphanSidecars.length) notes.push(`${pairing.orphanSidecars.length} 个 VobSub .sub 缺少同名 .idx`);
  if (pairing.invalidSubtitles.length) notes.push(`${pairing.invalidSubtitles.length} 个字幕输入无效或缺少配对文件`);
  const fontMismatchCount = fontRecognition.recognized.filter((entry) => entry.mismatch).length;
  if (fontMismatchCount) notes.push(`${fontMismatchCount} 个字体扩展名与实际内容不一致，已按实际字体结构识别`);
  if (fontRecognition.ignored.length) notes.push(`${fontRecognition.ignored.length} 个文件未识别为支持的字体`);
  if (fonts.length) {
    notes.push(`批量字体：${fonts.length} 个${batchFontSubsetEnabled?.checked ? ` · ${batchSubsetScope?.value === 'group' ? 'Group 子集' : '逐任务子集'}` : ' · 完整字体'}`);
  }
  if (batchOutputDirectoryHandle) notes.push(`输出目录：${batchOutputDirectoryHandle.name}`);

  batchPlan.innerHTML = (rows || '<div class="track-empty">没有形成可执行配对。</div>') + tieReview;
  if (batchReviewSummary) {
    const globalProblems = pairing.ambiguousPairings.length + pairing.outputNameCollisions.length +
      pairing.directoryConflicts.length + Number(Boolean(pairing.directoryCheckError)) +
      pairing.invalidSubtitles.length + (pairing.fontRecognition?.ignored?.length || 0) +
      (unifiedRoles?.unsupported.length || 0) + recognition.ignored.length;
    const readiness = !pairing.jobs.length ? '无可执行任务'
      : globalProblems ? `${globalProblems} 项待处理` : '配对无阻断';
    batchReviewSummary.textContent = `${pairing.jobs.length} 个拟输出 · ${readiness}` +
      ` · ${pairing.manuallyAssignedPairings.length} 项已人工确认`;
  }
  renderBatchJobInspector(pairing);
  if (notes.length) batchPlan.innerHTML += `<div class="track-empty">${escapeHtml(notes.join('；'))}</div>`;
  batchStartBtn.disabled =
    batchRunning ||
    batchStartPending ||
    batchImportInProgress ||
    (batchUnifiedMode && Boolean(unifiedRoles?.unsupported.length || recognition.ignored.length)) ||
    isBusy() ||
    !pairing.jobs.length ||
    pairing.ambiguousPairings.length > 0 ||
    pairing.outputNameCollisions.length > 0 ||
    pairing.directoryConflicts.length > 0 ||
    Boolean(pairing.directoryCheckError) ||
    pairing.invalidSubtitles.length > 0 ||
    fontRecognition.ignored.length > 0;
  batchCancelBtn.disabled = !(batchRunning || batchStartPending);
  if (batchSubsetScope) batchSubsetScope.disabled = batchRunning || batchStartPending || !batchFontSubsetEnabled?.checked;

  latestBatchPairing = pairing;
  // Never silently carry recipe approval to a different File selection.
  if(approvedBatchRecipeV2 &&
      !verifyBatchRecipeV2Binding(approvedBatchRecipeV2,pairing)) {
    approvedBatchRecipeV2=null;
    batchRecipeV2Notice.textContent='当前批次的 File/字幕归属已变化；先前的 v2 确认已撤销，请重新核对。';
  }
  if(pendingBatchRecipeV2) {
    const review=previewBatchRecipeV2(pendingBatchRecipeV2,pairing);
    batchRecipeV2ConfirmBtn.hidden=false;
    batchRecipeV2ConfirmBtn.disabled=
      review.state!=='ready'||batchRunning||batchStartPending||isBusy();
    if(!approvedBatchRecipeV2)
      batchRecipeV2Notice.textContent=review.state==='ready'
        ? '逐输出规则已匹配 '+review.matchedJobs+' 个任务；必须点击“确认应用”，仍须冻结时再次预检。'
        : '逐输出规则尚不能应用：'+review.issues.join('；');
  } else {
    batchRecipeV2ConfirmBtn.hidden=true;
    batchRecipeV2ConfirmBtn.disabled=true;
  }
  return pairing;
}

batchPlan?.addEventListener('change', (event) => {
  const select = event.target.closest('select[data-batch-tie-index]');
  if (!select || batchRunning || batchStartPending || batchImportInProgress || isBusy()) return;
  if (Number(select.dataset.batchGeneration) !== batchPlanGeneration) return;
  const ambiguous = latestBatchPairing?.ambiguousPairings[Number(select.dataset.batchTieIndex)];
  const candidateIndex = Number(select.value);
  if (!ambiguous || select.value === '' || !Number.isInteger(candidateIndex)) return;
  const video = ambiguous.candidates[candidateIndex];
  if (!video) return;
  batchManualAssignments.set(ambiguous.track.file, video);
  activeBatchJobLedger = null;
  selectedBatchVideoFile = video;
  requestBatchPlanSync();
});
batchPlan?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-batch-job-index]');
  if (!button || !latestBatchPairing) return;
  const job = latestBatchPairing.jobs[Number(button.dataset.batchJobIndex)];
  if (!job) return;
  selectedBatchVideoFile = job.video;
  for (const row of batchPlan.querySelectorAll('button[data-batch-job-index]')) {
    const selected = row === button;
    row.dataset.selected = String(selected);
    row.setAttribute('aria-pressed', String(selected));
  }
  renderBatchJobInspector(latestBatchPairing);
});
batchJobInspector?.addEventListener('change',(event)=>{
  const control=event.target.closest('[data-batch-task-field]');
  if(!control||batchRunning||batchStartPending||batchImportInProgress||isBusy())return;
  if(Number(control.dataset.batchGeneration)!==batchPlanGeneration)return;
  const job=latestBatchPairing?.jobs?.find(item=>item.video===selectedBatchVideoFile);
  const track=job?.subtitleTracks?.[Number(control.dataset.batchTrackIndex)];
  if(!job||!track)return;
  try{
    const value=control.type==='checkbox'?control.checked:control.value;
    currentBatchTaskMetadata=setCurrentBatchTaskMetadata(currentBatchTaskMetadata,{
      job,track,field:control.dataset.batchTaskField,value,
    });
    // Changing an individual track after approving imported JSON must
    // invalidate the old whole-pairing approval, not stack silent overrides.
    if(approvedBatchRecipeV2||pendingBatchRecipeV2){
      approvedBatchRecipeV2=null;
      pendingBatchRecipeV2=null;
      renderBatchRecipeV2Review(null);
      batchRecipeV2ConfirmBtn.hidden=true;
      batchRecipeV2ConfirmBtn.disabled=true;
      batchRecipeV2Notice.textContent='当前逐任务编辑已取代先前的导入建议和整体确认；需要重新导入才能使用那份配方。';
    }
    activeBatchJobLedger=null;
    requestBatchPlanSync();
  }catch(error){
    batchRecipeV2Notice.textContent='逐任务字幕编辑被拒绝：'+(error?.message||String(error));
    renderBatchJobInspector(latestBatchPairing);
  }
});
batchJobInspector?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-batch-revoke]');
  if (!button || batchRunning || batchStartPending || batchImportInProgress || isBusy()) return;
  if (Number(button.dataset.batchGeneration) !== batchPlanGeneration) return;
  const confirmed = latestBatchPairing?.manuallyAssignedPairings[Number(button.dataset.batchRevoke)];
  if (!confirmed) return;
  batchManualAssignments.delete(confirmed.track.file);
  activeBatchJobLedger = null;
  requestBatchPlanSync();
});

function requestBatchPlanSync() {
  batchPlanPromise = syncBatchPlan();
  return batchPlanPromise;
}

// Running results update only the derived matrix and inspector, never edit
// current subtitle assignments or any source-track state.
function refreshBatchExecutionViews() {
  const ledger = activeBatchJobLedger;
  if (!ledger) return;
  const bySource = indexBatchExecutionBySource();
  for (const row of batchPlan.querySelectorAll('button[data-batch-job-index]')) {
    const paired = latestBatchPairing?.jobs[Number(row.dataset.batchJobIndex)];
    const indexed = bySource.get(paired?.video);
    const state = indexed?.outputName === paired?.outputName ? indexed.state : null;
    if (!state) continue;
    const marker = row.querySelector('.batch-review-state');
    if (marker) {
      marker.dataset.state = state.state;
      marker.textContent = BATCH_JOB_STATES[state.state] || state.state;
    }
  }
  renderBatchJobInspector(latestBatchPairing);
}

function setInputFiles(input, files) {
  const transfer = new DataTransfer();
  for (const file of files || []) transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function chooseBatchOutputDirectory() {
  if (batchRunning || batchStartPending || batchSaveRetryBusy) return;
  if (!('showDirectoryPicker' in window)) {
    batchOutputDirStatus.textContent = '当前浏览器不支持目录写入；仍可逐项保存。';
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const permission = await handle.requestPermission?.({ mode: 'readwrite' });
    if (permission && permission !== 'granted') throw new Error('没有输出目录写入权限。');
    batchOutputDirectoryHandle = handle;
    activeBatchJobLedger = null;
    batchOutputDirStatus.textContent = `已选择：${handle.name}`;
    requestBatchPlanSync();
  } catch (error) {
    if (error?.name !== 'AbortError') {
      batchOutputDirStatus.textContent = `无法使用输出目录：${error?.message || error}`;
    }
  }
}

async function collectBatchSubsetText(pairing) {
  let text = '';
  for (const job of pairing.jobs || []) {
    for (const track of job.subtitleTracks || []) {
      const format = track.format || subtitleFormatInfo(track.file.name);
      if (!format?.text) continue;
      const decoded = await readAssText(track.file);
      if (format.assLike) {
        text += analyzeAssFontUsage(decoded.text).allCharacters.join('');
      } else {
        text += visibleTextForPlainSubtitle(decoded.text, format.id);
      }
    }
  }
  return text;
}

async function buildGroupedSubsetFonts(fonts, pairing) {
  if (!fonts.length) return [];
  const subsetText = await collectBatchSubsetText(pairing);
  const deduped = await dedupeFilesBySha256(fonts);
  const identityByFile = new Map(
    Array.from(pairing?.fontRecognition?.recognized || [])
      .map((entry) => [entry.file, entry.identity])
  );
  const items = deduped.unique.map((item) => ({
    ...item,
    attachmentName: normalizedFontAttachmentName(
      item.file.name,
      identityByFile.get(item.file) || null
    ),
    fontIdentity: identityByFile.get(item.file) || null,
  }));
  const subsetted = await subsetFontItems(items, subsetText);
  return subsetted.map((item) => item.file);
}

// The previous 150 ms polling loop over mutable download links is removed.
// Batch receives the actual mux task result from executeCurrentMuxTask().

[
  batchVideoInput,
  batchVideoFolderInput,
  batchSubtitleInput,
  batchSubtitleFolderInput,
  batchFontInput,
  batchFontFolderInput,
].forEach((input) => input?.addEventListener('change', () => {
  if (batchInternalAdapterUpdate) return;
  batchManualAssignments.clear();
  currentBatchTaskMetadata=new Map();
  approvedBatchRecipeV2=null;
  selectedBatchVideoFile = null;
  activeBatchJobLedger = null;
  if (batchUnifiedMode) {
    // Internal input-adapter updates (including regression fixtures) must
    // invalidate an older unified inventory rather than mix incompatible roles.
    batchUnifiedMode = false;
    batchImportEntries = [];
    batchInternalAdapterUpdate = true;
    try {
      for (const other of [batchVideoInput, batchVideoFolderInput, batchSubtitleInput,
        batchSubtitleFolderInput, batchFontInput, batchFontFolderInput]) {
        if (other !== input) setInputFiles(other, []);
      }
    } finally {
      batchInternalAdapterUpdate = false;
    }
    renderBatchAssetInventory();
  }
  requestBatchPlanSync();
}));
batchPreserveAttachments?.addEventListener('change', () => {
  if (batchRunning || batchStartPending) return;
  activeBatchJobLedger = null;
  requestBatchPlanSync();
});
batchFontSubsetEnabled?.addEventListener('change', () => {
  if (batchRunning || batchStartPending) return;
  activeBatchJobLedger = null;
  requestBatchPlanSync();
});
batchSubsetScope?.addEventListener('change', () => {
  if (batchRunning || batchStartPending) return;
  activeBatchJobLedger = null;
  requestBatchPlanSync();
});
// A portable Recipe saves ONLY explicit policies. It never stores browser File
// handles, destination permissions, output Blobs or a runnable JobPlan.
batchRecipeExportBtn?.addEventListener('click', () => {
  if (batchRunning || batchStartPending || batchImportInProgress || isBusy()) return;
  try {
    const recipe = buildBatchRecipe({
      policy: {
        preserveAttachments: Boolean(batchPreserveAttachments.checked),
        subsetEnabled: Boolean(batchFontSubsetEnabled.checked),
        subsetScope: batchSubsetScope.value,
      },
    });
    const url = URL.createObjectURL(new Blob([stringifyBatchRecipe(recipe)], {
      type: 'application/json;charset=utf-8',
    }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mkv-batch-recipe-v1.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    batchRecipeNotice.textContent = '规则已导出；素材、权限及成品不包含在配方中。';
  } catch (error) {
    batchRecipeNotice.textContent = '导出配方失败：' + (error?.message || String(error));
  }
});
batchRecipeImportInput?.addEventListener('change', async () => {
  const file = batchRecipeImportInput.files?.[0];
  batchRecipeImportInput.value = '';
  if (!file) return;
  if (batchRunning || batchStartPending || batchImportInProgress || isBusy()) {
    batchRecipeNotice.textContent = '工作中不能导入配方，请等待本次任务结束。';
    return;
  }
  try {
    if (file.size > BATCH_RECIPE_MAX_BYTES) throw Error('RECIPE_TOO_LARGE');
    const parsed = parseBatchRecipe(await file.text());
    const preview = recipeApplyPreview(parsed, {
      hasSelectedSources: Boolean(batchVideoFiles().length),
    });
    // No implicit restoration of manual source pairings or old save paths.
    pendingBatchRecipeV2=null;
    approvedBatchRecipeV2=null;
    renderBatchRecipeV2Review(null);
    batchManualAssignments.clear();
    selectedBatchVideoFile = null;
    activeBatchJobLedger = null;
    batchPreserveAttachments.checked = preview.policy.preserveAttachments;
    batchFontSubsetEnabled.checked = preview.policy.subsetEnabled;
    batchSubsetScope.value = preview.policy.subsetScope;
    batchRecipeNotice.textContent = preview.notice;
    await requestBatchPlanSync();
  } catch (error) {
    batchRecipeNotice.textContent = '配方被拒绝：' + (error?.message || String(error));
  }
});

function renderBatchRecipeV2Review(recipe) {
  if(!batchRecipeV2Review || !batchRecipeV2ReviewItems)return;
  batchRecipeV2Review.hidden=!recipe;
  if(!recipe){batchRecipeV2ReviewItems.innerHTML='';return;}
  batchRecipeV2ReviewItems.innerHTML=recipe.jobs.map(job=>`
    <section class="batch-recipe-v2-review-job">
      <strong>${escapeHtml(job.sourceName)} → ${escapeHtml(job.outputName)}</strong>
      ${job.subtitleRules.map(row=>`
        <div class="track-meta">${escapeHtml(row.fileName)} ${row.sidecarName
          ? ' + '+escapeHtml(row.sidecarName) : ''} · ${escapeHtml(row.title)}
          · ${escapeHtml(row.language)} · ${escapeHtml(row.formatId||'未声明格式')}
          · Default:${row.default?'是':'否'} · Forced:${row.forced?'是':'否'}
          · Original:${row.original?'是':'否'}
          · Commentary:${row.commentary?'是':'否'}
          · Hearing impaired:${row.hearingImpaired?'是':'否'}</div>`).join('')}
    </section>`).join('');
}
function isApprovedBatchRecipeV2SelectionCurrent(binding,pairing) {
  if(!binding)return true;
  if(!verifyBatchRecipeV2Binding(binding,pairing))return false;
  const selectedVideos=batchVideoFiles();
  const selectedSubtitles=batchSubtitleFiles();
  return pairing.jobs.every(job=>selectedVideos.includes(job.video) &&
    (job.subtitleInputFiles||[]).every(file=>selectedSubtitles.includes(file)));
}

batchRecipeV2ExportBtn?.addEventListener('click',()=>{
  if(batchRunning||batchStartPending||batchImportInProgress||isBusy())return;
  try {
    if(!latestBatchPairing?.jobs?.length)throw Error('请先选择有效媒体并完成配对');
    const recipe=buildBatchRecipeV2({
      pairing:latestBatchPairing,
      policy:{
        preserveAttachments:Boolean(batchPreserveAttachments.checked),
        subsetEnabled:Boolean(batchFontSubsetEnabled.checked),
        subsetScope:batchSubsetScope.value,
      },
    });
    const url=URL.createObjectURL(new Blob([stringifyBatchRecipeV2(recipe)],{
      type:'application/json;charset=utf-8',
    }));
    const link=document.createElement('a');
    link.href=url;link.download='mkv-batch-recipe-v2.json';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30_000);
    batchRecipeV2Notice.textContent='逐输出 v2 规则已导出；文件、保存路径和执行权限均不包含。';
  }catch(error){
    batchRecipeV2Notice.textContent='逐输出规则导出被拒绝：'+
      (error?.message||String(error));
  }
});
batchRecipeV2ImportInput?.addEventListener('change',async()=>{
  const file=batchRecipeV2ImportInput.files?.[0];
  batchRecipeV2ImportInput.value='';
  if(!file)return;
  if(batchRunning||batchStartPending||batchImportInProgress||isBusy()){
    batchRecipeV2Notice.textContent='批次进行中不能读取 v2 规则。';
    return;
  }
  try {
    if(file.size>BATCH_RECIPE_V2_MAX_BYTES)throw Error('BATCH_RECIPE_V2_SIZE_LIMIT');
    const parsed=parseBatchRecipeV2(await file.text());
    if(batchRunning||batchStartPending||batchImportInProgress||isBusy())
      throw Error('BATCH_RECIPE_V2_BUSY');
    pendingBatchRecipeV2=parsed;
    approvedBatchRecipeV2=null;
    renderBatchRecipeV2Review(parsed);
    activeBatchJobLedger=null;
    const review=previewBatchRecipeV2(parsed,latestBatchPairing);
    batchRecipeV2ConfirmBtn.hidden=false;
    batchRecipeV2ConfirmBtn.disabled=review.state!=='ready';
    batchRecipeV2Notice.textContent=review.state==='ready'
      ? '已读取 '+review.totalJobs+' 个逐输出任务：核对当前素材后点击确认；导入本身未改变配对和执行状态。'
      : '配方未绑定当前媒体：'+review.issues.join('；');
  }catch(error){
    pendingBatchRecipeV2=null;
    approvedBatchRecipeV2=null;
    renderBatchRecipeV2Review(null);
    batchRecipeV2ConfirmBtn.hidden=true;
    batchRecipeV2Notice.textContent='逐输出 v2 导入拒绝：'+
      (error?.message||String(error));
  }
});
batchRecipeV2ConfirmBtn?.addEventListener('click',()=>{
  if(!pendingBatchRecipeV2||batchRunning||batchStartPending||
      batchImportInProgress||isBusy())return;
  try {
    const pairing=latestBatchPairing;
    const approval=captureBatchRecipeV2Binding(pendingBatchRecipeV2,pairing);
    if(!isApprovedBatchRecipeV2SelectionCurrent(approval,pairing))
      throw Error('BATCH_RECIPE_V2_CURRENT_FILES_CHANGED');
    // Only explicit user confirmation may update current task-level policies.
    const policy=approval.recipe.policy;
    batchPreserveAttachments.checked=policy.preserveAttachments;
    batchFontSubsetEnabled.checked=policy.subsetEnabled;
    batchSubsetScope.value=policy.subsetScope;
    approvedBatchRecipeV2=approval;
    activeBatchJobLedger=null;
    batchRecipeV2Notice.textContent='已确认 '+approval.bindings.length+
      ' 个逐输出字幕规则；冻结前仍将重新核查 File 来源、配对、保真和目录冲突。';
    void requestBatchPlanSync();
  }catch(error){
    approvedBatchRecipeV2=null;
    batchRecipeV2Notice.textContent='逐输出规则尚未确认：'+
      (error?.message||String(error));
  }
});

batchOutputDirBtn?.addEventListener('click', chooseBatchOutputDirectory);

batchCancelBtn?.addEventListener('click', () => {
  if (batchStartPending) {
    batchStartCancelled = true;
    batchStatus.textContent = '批量启动预检取消中；不会提交任何任务。';
    return;
  }
  if (!batchRunning) return;
  batchCancelRequested = true;
  if (running || scanning || previewing) cancelCurrentMuxTask();
  batchStatus.textContent = '正在取消批量任务……';
});

// The start lock is acquired before the first async plan build and released
// only after the batch has been atomically marked running or refused.
async function prepareBatchStart() {
  if (batchStartPending || batchRunning || batchImportInProgress || isBusy()) return null;
  batchStartPending = true;
  batchStartCancelled = false;
  batchStatus.textContent = '正在冻结批量计划并检查来源结构……';
  updateUI();
  batchStartBtn.disabled = true;
  batchCancelBtn.disabled = false;

  try {
    if (batchUnifiedMode && resolveBatchImportedAssets(batchImportEntries).unsupported.length) {
      batchStatus.textContent = '批量未开始：请移除无法参与批量封装的文件。';
      return null;
    }
    const pairing = await requestBatchPlanSync();
    if (!pairing) {
      batchStatus.textContent = '批量计划已被新的输入选择替代，请确认更新后的配对再开始。';
      return null;
    }
    const generation = batchPlanGeneration;
    const currentRecipeV2Approval=approvedBatchRecipeV2;
    if(pendingBatchRecipeV2&&!currentRecipeV2Approval){
      batchStatus.textContent='批量未开始：导入的 v2 规则尚未确认或已失效。';
      return null;
    }
    if(currentRecipeV2Approval &&
        !isApprovedBatchRecipeV2SelectionCurrent(currentRecipeV2Approval,pairing)){
      batchStatus.textContent='批量未开始：逐输出字幕规则与当前来源绑定失效。';
      approvedBatchRecipeV2=null;
      return null;
    }
    const selectedOutputDirectory = batchOutputDirectoryHandle;
    // The legacy executor reads live rules; freeze their identities too.
    const snapshot = {
      source: batchVideoFiles().map(fileIdentity).join('\u0000'),
      subtitles: batchSubtitleFiles().map(fileIdentity).join('\u0000'),
      fonts: batchFontCandidates().map(fileIdentity).join('\u0000'),
      preserveAttachments: Boolean(batchPreserveAttachments?.checked),
      subsetEnabled: Boolean(batchFontSubsetEnabled?.checked),
      subsetScope: batchSubsetScope?.value || '',
    };
    const isCurrent = () => !batchStartCancelled &&
      generation === batchPlanGeneration &&
      approvedBatchRecipeV2 === currentRecipeV2Approval &&
      isApprovedBatchRecipeV2SelectionCurrent(currentRecipeV2Approval,pairing) &&
      selectedOutputDirectory === batchOutputDirectoryHandle &&
      !batchImportInProgress && !batchRunning && !isBusy() &&
      snapshot.source === batchVideoFiles().map(fileIdentity).join('\u0000') &&
      snapshot.subtitles === batchSubtitleFiles().map(fileIdentity).join('\u0000') &&
      snapshot.fonts === batchFontCandidates().map(fileIdentity).join('\u0000') &&
      snapshot.preserveAttachments === Boolean(batchPreserveAttachments?.checked) &&
      snapshot.subsetEnabled === Boolean(batchFontSubsetEnabled?.checked) &&
      snapshot.subsetScope === (batchSubsetScope?.value || '');
    const refuseStale = () => {
      if (isCurrent()) return false;
      batchStatus.textContent = batchStartCancelled
        ? '批量启动预检已取消，没有执行任何任务。'
        : '批量未开始：预检期间输入或规则发生变化，请重新审核新的计划。';
      return true;
    };
    if (refuseStale()) return null;
    if (
      !pairing.jobs.length ||
      pairing.ambiguousPairings.length ||
      pairing.outputNameCollisions.length ||
      pairing.directoryConflicts.length ||
      pairing.directoryCheckError ||
      pairing.invalidSubtitles.length ||
      pairing.fontRecognition?.ignored?.length ||
      (batchUnifiedMode && pairing.videoRecognition?.ignored?.length)
    ) {
      batchStatus.textContent = '批量未开始：请先解决配对歧义、重名输出或无效输入。';
      return null;
    }
    if (selectedOutputDirectory) {
      try {
        const conflicts = await findExistingBatchOutputs(selectedOutputDirectory, pairing.jobs);
        if (refuseStale()) return null;
        if (conflicts.length) {
          batchStatus.textContent = '批量未开始：输出目录已有 ' +
            conflicts.join('、') + '；不会覆盖。';
          requestBatchPlanSync();
          return null;
        }
      } catch (error) {
        if (refuseStale()) return null;
        batchStatus.textContent = '批量未开始：无法核对输出目录（' +
          (error?.message || error) + '）。';
        requestBatchPlanSync();
        return null;
      }
    }

    // Revalidate after each awaited source sniff and EBML read.
    for (const job of pairing.jobs) {
      if (refuseStale()) return null;
      try {
        const inspected = await sniffFileContainer(job.video);
        if (refuseStale()) return null;
        if (inspected.container === 'unknown') {
          throw new Error('无法可靠识别批量来源容器；未知结构必须在运行前整体阻断');
        }
        if (!['matroska', 'matroska-webm'].includes(inspected.container)) continue;
        const protection = await inspectMatroskaPreservation(job.video);
        if (refuseStale()) return null;
        const refusal = preservationBlockMessage(job.video.name, protection);
        if (refusal) {
          batchStatus.textContent = '批量未开始：' + refusal;
          return null;
        }
      } catch (error) {
        if (refuseStale()) return null;
        batchStatus.textContent = '批量未开始：无法完成源结构风险预检：' +
          (error?.message || String(error));
        return null;
      }
    }
    if (refuseStale()) return null;
    // Freeze every actual input choice and batch policy after destructive
    // preservation preflight; do not let the legacy executor read live batch
    // settings once the run has started.
    const approvedPairing=currentRecipeV2Approval
      ? applyBatchRecipeV2ToPairing(currentRecipeV2Approval.recipe,pairing)
      : pairing;
    const frozenPlan = freezeBatchJobPlan(approvedPairing, {
      generation,
      preserveAttachments: batchPreserveAttachments?.checked,
      subsetEnabled: batchFontSubsetEnabled?.checked,
      subsetScope: batchSubsetScope?.value || 'job',
      directoryName: selectedOutputDirectory?.name || '',
      strictVideoInputs: batchUnifiedMode,
    });
    if (refuseStale()) return null;
    batchRunning = true;
    batchCancelRequested = false;
    return { pairing, frozenPlan, selectedOutputDirectory };
  } catch (error) {
    batchStatus.textContent = '批量未开始：启动预检异常：' + (error?.message || String(error));
    return null;
  } finally {
    batchStartPending = false;
    batchStartCancelled = false;
    updateUI();
    batchCancelBtn.disabled = !batchRunning;
    // The plan was recomputed with batchStartPending=true, so its start button
    // remained disabled. Restore semantic readiness after any aborted start.
    if (!batchRunning) void requestBatchPlanSync();
  }
}

function renderRetainedBatchResults(currentResults = retainedBatchResults) {
  retainedBatchResults = Array.from(currentResults);
  const resultStates = new Map(retainedBatchLedger?.snapshot().map(entry => [entry.jobId, entry]) || []);
  batchResults.innerHTML = retainedBatchResults.map((item) => item.ok
          ? `<div class="new-track-row"><div class="new-track-main"><strong>${escapeHtml(item.job.video.name)}</strong><small>已生成 · ${item.auditStatus === 'pass' ? 'ffprobe 审计通过' : item.auditStatus === 'warning' ? `审计差异 ${item.auditIssues?.length || 0} 项` : '审计未完成，需复核'}${item.savedToDirectory ? ` · MKV 与报告均已写入 ${escapeHtml(item.destinationName || '输出目录')}` : item.mkvSavedToDirectory ? ` · MKV 已写入目录，但报告写入失败：${escapeHtml(item.reportSaveError || item.directorySaveError || '未知原因')}；报告仍可单独下载` : item.directorySaveError ? ` · 目录保存失败：${escapeHtml(item.directorySaveError)}；可通过下载链接保存 MKV 与报告` : ' · 等待下载保存'}</small></div><div class="new-track-flags"><a class="download" href="${item.url}" download="${escapeHtml(item.outputName)}">保存 MKV</a>${item.reportUrl ? `<a class="report-download" href="${item.reportUrl}" download="${escapeHtml(item.reportName)}">报告</a>` : ''}${!item.savedToDirectory && batchSaveRetries.has(item.job.jobId) ? `<button type="button" data-batch-save-retry="${escapeHtml(item.job.jobId)}" ${batchSaveRetryBusy || batchRunning ? 'disabled' : ''}>仅重试保存</button>` : ''}</div></div>`
          : `<div class="new-track-row"><div class="new-track-main"><strong>${escapeHtml(item.job.video.name)}</strong><small>${escapeHtml(BATCH_JOB_STATES[resultStates.get(item.job.jobId)?.state] || '执行失败')} · ${escapeHtml(resultStates.get(item.job.jobId)?.error || item.error)}</small></div>${resultStates.get(item.job.jobId)?.state === 'failed' ? `<button type="button" data-batch-job-retry="${escapeHtml(item.job.jobId)}" ${batchRunning || batchStartPending || batchSaveRetryBusy ? 'disabled' : ''}>重试此失败任务</button>` : ''}</div>`
        ).join('');
}

batchResults?.addEventListener('click', async (event) => {
  const button = event.target.closest?.('[data-batch-save-retry]');
  if (!button || isBusy() || batchRunning || batchStartPending || batchImportInProgress) return;
  const id = button.dataset.batchSaveRetry;
  const index = retainedBatchResults.findIndex(item => item.job.jobId === id);
  const item = retainedBatchResults[index];
  if (!item?.ok || !batchSaveRetries.has(id)) return;
  if (!batchOutputDirectoryHandle) await chooseBatchOutputDirectory();
  if (!batchOutputDirectoryHandle || isBusy() || batchRunning || batchStartPending ||
      retainedBatchResults[index] !== item || !batchSaveRetries.has(id)) return;
  const directory = batchOutputDirectoryHandle;
  const ledger = retainedBatchLedger;
  const previous = ledger?.snapshot().find(entry => entry.jobId === id);
  batchSaveRetryBusy = true;
  updateUI();
  renderRetainedBatchResults();
  batchStatus.textContent = '正在保存已生成成品（不重新封装）……';
  try {
    if (previous) ledger.transition(id, 'saving');
    const receipt = await batchSaveRetries.retry(id, directory);
    retainedBatchResults[index] = Object.freeze({ ...item, ...receipt });
    if (previous) ledger.transition(id, item.auditStatus !== 'pass' ? 'auditWarning'
      : receipt.savedToDirectory ? 'succeeded' : 'saveWarning',
      { error: item.auditStatus !== 'pass'
        ? '独立审计仍待复核；保存重试未执行新的审计。' + receipt.directorySaveError
        : receipt.directorySaveError });
  } catch (error) {
    const reason = error?.message || String(error);
    retainedBatchResults[index] = Object.freeze({ ...item,
      mkvSaveError: '', reportSaveError: '', directorySaveError: reason });
    if (previous && ledger.snapshot().find(entry => entry.jobId === id)?.state === 'saving')
      ledger.transition(id, previous.state, { error: reason });
  } finally {
    batchSaveRetryBusy = false;
    renderRetainedBatchResults();
    batchStatus.textContent = formatBatchTerminalStatus({
      ...retainedBatchTerminal, results: retainedBatchResults,
    });
    updateUI();
    void requestBatchPlanSync();
  }
});

batchResults?.addEventListener('click', async (event) => {
  const button = event.target.closest?.('[data-batch-job-retry]');
  if (!button || isBusy() || batchRunning || batchStartPending || batchImportInProgress) return;
  const id = button.dataset.batchJobRetry;
  const execution = retainedBatchExecution;
  const ledger = retainedBatchLedger;
  const item = retainedBatchResults.find(result => result.job.jobId === id);
  if (!execution || !ledger || item?.ok !== false ||
      ledger.snapshot().find(entry => entry.jobId === id)?.state !== 'failed') return;
  const job = execution.frozenPlan.jobs.find(entry => entry.jobId === id);
  const directory = batchOutputDirectoryHandle;
  batchStartPending = true;
  batchStartCancelled = false;
  updateUI();
  renderRetainedBatchResults();
  batchStatus.textContent = '正在检查原失败任务与输出目录……';
  try {
    if (directory) {
      const conflicts = await findExistingBatchOutputs(directory, [job]);
      if (conflicts.length) throw Error('输出目录已有 ' + conflicts.join('、') + '；不会覆盖，请检查残留或选择新目录。');
    }
    const identity = await sniffFileContainer(job.video);
    if (identity.container === 'unknown') throw Error('原来源容器身份无法核验');
    if (['matroska', 'matroska-webm'].includes(identity.container)) {
      const protection = await inspectMatroskaPreservation(job.video);
      const refusal = preservationBlockMessage(job.video.name, protection);
      if (refusal) throw Error(refusal);
    }
    if (batchStartCancelled) throw Error('失败任务重试预检已取消');
    if (retainedBatchExecution !== execution || retainedBatchLedger !== ledger ||
        batchOutputDirectoryHandle !== directory ||
        retainedBatchResults.find(result => result.job.jobId === id) !== item)
      throw Error('重试期间任务或目录发生变化，请重新选择');
    ledger.requeueFailed([id]);
    batchRunning = true;
    batchCancelRequested = false;
  } catch (error) {
    batchStatus.textContent = '重试未开始：' + (error?.message || String(error));
  } finally {
    batchStartPending = false;
    batchStartCancelled = false;
    updateUI();
    renderRetainedBatchResults();
  }
  if (batchRunning) await executeFrozenBatch({ ...execution, selectedOutputDirectory: directory }, [id]);
});

batchStartBtn?.addEventListener('click', async () => {
  const preparation = await prepareBatchStart();
  if (!preparation) return;
  await executeFrozenBatch(preparation);
});

async function executeFrozenBatch(preparation, retryIds = null) {
  const { pairing, frozenPlan, selectedOutputDirectory } = preparation;
  const previousResults = retryIds ? [...retainedBatchResults] : [];
  const previousTerminal = retryIds ? retainedBatchTerminal : null;
  const mergeResults = next => frozenPlan.jobs.map(job =>
    next.find(item => item.job.jobId === job.jobId) ||
    previousResults.find(item => item.job.jobId === job.jobId)).filter(Boolean);
  if (!retryIds) {
    retainedBatchExecution = preparation;
    // Old batch links remain valid until a replacement batch actually starts.
    // Clear them together with the old results to release large Blob references.
    batchSaveRetries.releaseAll();
    retainedBatchResults = [];
    retainedBatchTerminal = { cancelled: false, fatalError: '' };
    batchResultUrls.releaseAll();
    batchResults.innerHTML = '';
    batchStatus.textContent = `批量任务：0 / ${frozenPlan.jobs.length}`;
    activeBatchJobLedger = createBatchJobLedger(frozenPlan, refreshBatchExecutionViews);
    retainedBatchLedger = activeBatchJobLedger;
  } else {
    activeBatchJobLedger = retainedBatchLedger;
  }
  renderRetainedBatchResults();
  requestBatchPlanSync();

  const requestedBatchFonts = frozenPlan.fonts;
  const results = [];
  let batchFatalError = '';
  let jobFonts = requestedBatchFonts;
  let activeBatchMuxContext = null;

  // Frozen batch context no longer rewrites the user's FileLists or editor.
  try {
    if (
      frozenPlan.policy.subsetEnabled &&
      frozenPlan.policy.subsetScope === 'group' &&
      requestedBatchFonts.length
    ) {
      batchStatus.textContent = '正在汇总全批次字幕字符并生成 Group 字体子集……';
      jobFonts = await buildGroupedSubsetFonts(requestedBatchFonts, frozenPlan);
    }

    const outcome = await runFrozenBatchQueue(frozenPlan, {
      ledger: activeBatchJobLedger,
      ...(retryIds ? { jobIds: retryIds } : {}),
      shouldCancel: () => batchCancelRequested,
      prepare: async (job, index) => {
        batchStatus.textContent = `${retryIds ? '重试失败任务' : '批量任务'}：${index + 1} / ${frozenPlan.jobs.length} · ${job.video.name}`;
        activeBatchMuxContext = null;
        const headerIdentity = await sniffFileContainer(job.video);
        if (headerIdentity.container === 'unknown') {
          throw Error('BATCH_MUX_SOURCE_IDENTITY_UNVERIFIED');
        }
        const fontIdentities = await Promise.all(jobFonts.map(async file => ({
          file, identity: await identifyFontFile(file),
        })));
        if (fontIdentities.some(item => !isSupportedFontIdentity(item.identity))) {
          throw Error('BATCH_MUX_FONT_CONTENT_UNVERIFIED');
        }
        activeBatchMuxContext = createFrozenBatchMuxContext(frozenPlan, job, {
          headerIdentity, fonts: jobFonts, fontIdentities,
        });
      },
      execute: async (job) => {
        if (!activeBatchMuxContext || activeBatchMuxContext.jobId !== job.jobId) {
          throw Error('BATCH_MUX_CONTEXT_STALE');
        }
        const result = await executeCurrentMuxTask(activeBatchMuxContext);
        activeBatchMuxContext = null;
        if (!result?.blob && batchCancelRequested) throw new Error('batch-cancelled');
        if (!result?.blob) throw new Error(status.textContent || '批量单项封装未交付成品');
        return result;
      },
      publish: async (job, artifact) => {
        let publication = {
          savedToDirectory: false,
          mkvSavedToDirectory: false,
          reportSavedToDirectory: false,
          directorySaveError: '',
        };
        if (selectedOutputDirectory) {
          try {
            publication = await writeNewBatchArtifactPair(selectedOutputDirectory, {
              mkvName: artifact.outputName,
              mkvBlob: artifact.blob,
              reportName: artifact.reportName,
              reportBlob: artifact.reportBlob,
            });
          } catch (error) {
            // Preserve the in-memory MKV and report for manual downloads.
            publication = { ...publication,
              directorySaveError: error?.message || String(error) };
          }
        }
        batchSaveRetries.retain(job.jobId, artifact, publication, selectedOutputDirectory);
        return {
          destinationName: selectedOutputDirectory?.name || '',
          url: batchResultUrls.create(artifact.blob),
          reportUrl: batchResultUrls.create(artifact.reportBlob),
          reportName: artifact.reportName,
          ...publication,
        };
      },
      onResults: next => renderRetainedBatchResults(mergeResults(next)),
    });
    results.push(...outcome.results);
    batchFatalError = outcome.fatalError;
    if (outcome.cancelled) batchCancelRequested = true;
  } catch (error) {
    // Preparation (notably Group font subsetting) and per-job setup happen
    // outside the per-item mux try/catch. These failures must be visible, not
    // mistaken for an empty, successful batch; always restore inputs below.
    batchFatalError = error?.message || String(error);
    const inProgress = activeBatchJobLedger?.snapshot().find((entry) =>
      ['preparing', 'muxing', 'saving'].includes(entry.state));
    if (inProgress) {
      activeBatchJobLedger.transition(inProgress.jobId, 'interrupted', { error: batchFatalError });
    }
    console.error('Batch preparation/execution interrupted:', error);
  } finally {
    activeBatchJobLedger?.interruptRemaining(batchCancelRequested ? '用户取消后尚未运行' : batchFatalError || '队列已结束', { cancelled: batchCancelRequested });
    batchRunning = false;
    const currentTerminal = { cancelled: batchCancelRequested, fatalError: batchFatalError };
    retainedBatchTerminal = retryIds
      ? combineBatchRetryTerminal(previousTerminal, currentTerminal) : currentTerminal;
    const combinedResults = mergeResults(results);
    renderRetainedBatchResults(combinedResults);
    batchStatus.textContent = formatBatchTerminalStatus({
      results: combinedResults,
      ...retainedBatchTerminal,
    });
    batchCancelRequested = false;
    // Batch did not modify the user's source, subtitle, font or audio inputs.
    updateUI();
    requestBatchPlanSync();
  }
}

resetTrackState();
updateUI();

// Product label is dynamically tied to package version; legacy sf14 internal ids remain compatible.
// Keep the original UI explicitly addressable for diagnosis/regression only.
// This changes presentation identity, never media permission or executor.
if (new URLSearchParams(window.location.search).get('ui') !== 'legacy') {
  if (mountSoftmux1014Workbench(document)) {
    const source = videoInput.files?.[0] || null;
    const scanned = source && scannedSourceFile === source &&
    trackState?.fileKey === fileKey(source) ? trackState : null;
    updateSoftmux1014SourceSections(document, withSourceAttachmentUndoIndicator(buildSourceObjectSections(scanned, {
      appendMode: Boolean(appendPreserveAll?.checked && currentVideoIsMatroska()),
      sourceFile: scanned ? source : null,
    })));
  }
}
