# Softmux 1.0 convergence implementation plan

Goal: finish the approved Plan B using existing writers and preserve the original quick subtitle/font workflow. This request authorizes execution; do not restart design approval questions.
Architecture: maintain one immutable ContainerProject. Imported external tracks remain available for editing and preview regardless of output membership. Membership is an explicit semantic include edit, reflected in execution, evidence and portable recovery.
Tech stack: existing Vite, vanilla JavaScript, FFmpeg/Wasm, Node test runner and Playwright.
Spec: docs/softmux-1.0-scope-b-1gb-decision-20261020.md; docs/softmux-1.0-product-acceptance-contract-20261020.md; research PR #206 (integration gap evidence).

## Global constraints
- Preserve existing batch and quick mux behavior; new tracks default to included for backward compatibility.
- Preview focus never changes output membership. Excluded tracks retain metadata and exact File identity.
- Imported JSON never grants File/writer permission. Old checkpoints remain readable.
- Do not equate test counts, merged code, simulated tablet viewports or prototypes with 1.0 acceptance.
- Existing complex-MKV fail-closed rules remain enforced; >1GB remains advisory.

## Review focus
- Exclusion must affect real MKV, not only a visible counter.
- Reinclude must preserve authored metadata and preview must remain available.
- Member changes invalidate stale output audit/save owners and async execution witnesses.
- Old checkpoint import must retain backward-compatible behavior; explicit membership must survive recovery.
- Batch contexts remain independent of standalone membership.

## Task 1: External resource membership and real delivery
- [ ] Test immutable include/exclude transactions, bypass rejection, composition counts and compatibility of existing rows.
- [ ] Implement include in external authority using ContainerProject's existing include operation.
- [ ] Bind include checkboxes in existing external editors and inventory; preserve all candidates for preview.
- [ ] Filter only execution projections, plan counts, defaults and finished-output witnesses.
- [ ] Test/export/import membership in portable checkpoints and atomic recovery without granting permissions.
- [ ] Run Node suite/build and add real-browser output/preview regression with independent ffprobe.
- [ ] Commit and push coherent work; use repository asynchronous CI boundary and record exact pending validations.

## Next units tracked in .uigs/tasks/2026-11-01-softmux-1.0-completion.json
Actual attachment-only writer delivery; multi-container focus/state preservation; final release contract reconciliation, physical-device evidence and candidate release verification. These are not completed by Task 1.
