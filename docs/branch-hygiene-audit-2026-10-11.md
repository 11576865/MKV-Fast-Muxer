# MKV branch audit and consolidation — 2026-10-11

Scope: GitHub branch and PR metadata on 2026-10-11. This is an
evidence-based cleanup inventory, **not** an assertion that refs were deleted.

## Verified integration

- PR #63: durable agent protocol, squash-merged to main.
- PR #69: content-first unified MKV workbench, squash-merged to main.
- PR #66: fatal batch preparation reporting, semantically re-landed on the
  new main and squash-merged after browser E2E and Pages checks.
- PR #70: chapter semantic audit and corrected mux report provenance,
  independently re-landed on the above main; CI/merge is a separate result.

## Branch references

The repository had 40 remote branches at this snapshot.
Exactly 33 branches pointed at the recorded HEAD of a merged same-repository
PR whose base was main. All 33 also had Git commits ahead of current
main according to compare(main...branch), typically because prior work was
squash-merged. Therefore **zero of these 33 qualify** for the existing
ancestry-based cleanup condition ahead_by == 0.

Do not interpret "PR merged" or "same head SHA as merged PR" as
"ancestry-proven deletion-safe." The existing
.github/workflows/branch-hygiene.yml intentionally retains these
branches rather than destroying Git-unique history to satisfy a count
target. No second, weaker branch-deletion workflow is installed.

Four additional historical refs lacked exact matching merged-PR evidence:
- docs/seo-discovery-metadata-20260930
- feat/font-content-identity
- ui/mkv-workbench-action-hierarchy
- ui/mobile-tablet-density-20260930

They require explicit investigation. Retain main, uigs-outbox and active PRs.

## Next cleanup boundary

1. Finish and merge the active functional PR.
2. Reconcile old squash-merged branches in bounded batches, checking
   actual retained semantic changes and whether additional unique commits
   matter before approving deletion.
3. Delete only branches whose preservation decision has been recorded,
   or those independently eligible under the existing ancestry-based job.
4. Recount refs and check for newly active or protected branches.

Branch cleanup remains **Pending Review**, not completed.
