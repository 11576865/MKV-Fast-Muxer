# P2-RG UI — Existing Matroska AttachmentUID relationship inspector

Status: **feature implementation submitted; exact-head CI plus actual-source Chromium output Pending**.

This slice displays the already externally verified #98 exact TagAttachmentUID relationship graph and deny-only impact preview to browser users. It does NOT add an existing-MKV writer, edit/save/overwrite button or replace the established video mux/batch and attachment-only creation UI.

## UI and source of truth

A separate disclosure `检查已有 MKV 附件的 UID 引用与变更影响（只读）` near the existing container attachment extraction tool accepts a **single existing Matroska source**. The data model is not duplicated: `createMatroskaAttachmentReader(file)` returns a bound source inventory, and `createExistingAttachmentEditIntent({reader, actions})` performs fresh inventory, P0 structural preflight, exact TagUID graph and immutable edit-impact resolution. UI selectors allow only **模拟操作：保留 / 移除**; there is no mutation, actual replacement chooser or unsupported export action.

Per attachment, the view shows FileName, exact decimal FileUID, declared MIME, byte size, observed count of Tag targets resolving to that identity, and whether simulated removal would orphan those observed targets. A zero matched reference count explicitly says it is **not proof of overall safety**. Summary includes Tag/UID edge count, affected targets, graph coverage, capability diagnostic and explicit `真实写入器：不可用`. Text is injected through DOM `textContent` rather than executing source-provided metadata.

The actual reader and editor are the only owners of source identity; the UI stores merely the File object selected by the user, observed attachment IDs and a local selection map. A generation-token + direct `input.files[0] === originalFile` check prevents an earlier asynchronous inspection from updating the view after changing the source or selecting another simulated action. A fresh input clears all old rows and local selection map.

## Acceptance: real Chromium, real independent source

New `scenarioP2ExistingAttachmentImpactReadonlyUI` in full Chromium E2E selects the **existing independently MKVToolNix/mkvpropedit-authored fixture** containing one AttachmentUID-targeted Tag and a decoy. It asserts two rows, exact one target link for the evidence attachment, zero observed reference for decoy, and `NO_WRITE_REQUESTED` on initial read-only preview. Selecting simulated removal of the target must report **one dangling UID Tag reference**, while simulated removal of the decoy (retaining the source) must report zero known dangling references and still `SOURCE_UID_RELATIONS_UNVERIFIED`. It compares real fixture source SHA-256 before and after UI interaction. Switching to a separate deterministic one-PNG MKV must clear all previous source rows and return read-only no-change status.

CI uploads the JSON `BROWSER_UID_TARGET_GRAPH_IMPACT_AND_SOURCE_ISOLATION_MATCH` and source hashes, subject to full Node/Build/Chromium success. The prior independent source graph research step remains a separate required oracle `INDEPENDENT_ATTACHMENT_UID_TAG_GRAPH_AND_CHANGE_IMPACT_MATCH`. No green workflow conclusion alone should be used to claim a user-facing existing-MKV writer or complete EBML preservation.

## Remaining limits

- Only known TagUID target references in a bounded one-Segment scan are observed; unknown EBML, nested Chapter references, Target types, SeekHead/Cues and packet preservation are not proven.
- A simulated replacement is implemented as an immutable domain EditIntent but deliberately not exposed as a UI mutation workflow; the current user UI only visualizes retain/remove.
- Real browser test uses one independently authored source fixture and one deterministic PNG-only source; long-file/large-scale/malformed UI, touch and device memory remain outside this slice.
- Writer safety and #77 independently red complex chapter/tag preservation are unaffected.
