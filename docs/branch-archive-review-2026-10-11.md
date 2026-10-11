# One-time consolidation of squash-merged MKV development branches

Date: 2026-10-11. Scope: `11576865/MKV-Fast-Muxer`.

## Why the ordinary branch-hygiene gate kept the old refs

The existing `.github/workflows/branch-hygiene.yml` correctly removes only
branches with no Git commits ahead of current `main` (`ahead_by == 0`).
Squash merging retained original PR commits outside `main`'s ancestry,
despite the feature diff having been accepted. At review, **33 exact
unchanged branch heads** corresponded to same-repository PRs merged into
`main`; all 33 still showed Git-unique commits. Thus general automatic
branch deletion had to retain them.

## Separate reconciliation and restore contract

`branch-archive-allowlist-2026-10-11.json` pins, separately for every
reviewed historical PR, its number, original branch name, immutable SHA, and
recorded merge commit SHA. It is an **explicit one-time review list**, not a
rule that every old merged PR may automatically be deleted.

The one-time workflow checks again on GitHub that:

1. The original branch exists, is unprotected and has exactly the reviewed SHA.
2. The PR belongs to this repository, has truly merged into main and recorded
   the exact reviewed head SHA and merge commit SHA.
3. The recorded merge commit is an ancestor of current main.
4. The branch is neither an open PR head nor an open PR base.
5. Before deleting the branch, a durable lightweight Git **archive tag**
   `refs/tags/archives/mkv-merged-pr-N` points to the original commit SHA.
6. The branch SHA, PR state and open-PR ownership are checked again before
   deletion. The Git push uses `--force-with-lease` against the exact SHA;
   unexpected branch movement must reject the deletion.
7. The branch is counted as removed **only after** GitHub confirms its ref is
   absent. Any candidate failing a precondition is retained, not guessed.

This preserves **every original Git commit** by a reachable tag. Historical
features do not have to be reintroduced into current main merely to preserve
old history. Recovering an archived branch remains possible, for example:

```bash
git fetch origin tag archives/mkv-merged-pr-63
git switch -c fix/durable-agent-execution-boundary archives/mkv-merged-pr-63
```

The archive tag is not a release tag, is not a product version, and is not
proof that old code is preferable to the current implementation.

## Explicitly excluded

Not in the allowlist: `main`, `uigs-outbox`, the active maintenance
integration PR, and these four historical branches with no exact merged-PR
head match:

- `docs/seo-discovery-metadata-20260930`
- `feat/font-content-identity`
- `ui/mkv-workbench-action-hierarchy`
- `ui/mobile-tablet-density-20260930`

These still need separate semantic review. No arbitrary branch-count
target overrides safety gates.

## Execution and evidence boundary

- Source-owned script: `scripts/archive_reviewed_merged_branches.py`
- Unit guards: `scripts/test_archive_reviewed_merged_branches.py`
- One-time workflow: `.github/workflows/archive-reviewed-merged-branches.yml`
- Trigger: merge that introduces the workflow on main; can also be dispatched
  manually for recovery. It does not run on every normal main push.
- The existing ancestry-based Branch hygiene workflow remains unchanged.
- A submitted workflow is not evidence that refs were archived or removed.
  After the run, separately verify its GitHub result, ref/tag inventory,
  retained-branch count, and any partial failures.

UIGS intake: this is a product-specific **recoverable reconciliation case**,
not a revision or automatic promotion of the general branch-hygiene Test.


## Observed post-run verification — 2026-10-11

This section supersedes the earlier *Pending* status for the specific
33-entry one-time archive operation; it does **not** change the general
ancestry-only branch-hygiene policy.

- PR #72 merged to main at `68d885fdb8b681e86ed9969c0a76e895be3b6877`.
- Archive workflow [run 38117660994](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/38117660994): **completed / success**.
- Compared the 33 immutable entries in
  `branch-archive-allowlist-2026-10-11.json` against GitHub
  `git/matching-refs/tags/archives/mkv-merged-pr-`: **33 tags found,
  0 missing or mismatched SHAs**.
- Compared the same manifest against GitHub's post-run remote branch list:
  **0 of the 33 archived source branch refs remain**.
- Main Browser E2E [run 38117661003](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/38117661003) and Pages
  [run 38117660997](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/38117660997):
  **completed / success**.
- Post-run remote branches: **7**. The four unmatched historical refs,
  `main` and `uigs-outbox` are intentionally retained. The seventh
  is `maintenance/archive-reviewed-merged-pr-refs`, which has
  `ahead_by = 0` but is still retained by the existing
  `maintenance/*` exemption in the general Branch hygiene script.
  Its rerun [38117661267](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/38117661267)
  completed successfully with zero deletions; it was not a CI failure.

The archive operation is **complete** for the 33 reviewed refs. The
remaining 7 refs are explicitly accounted for. No canonical UIGS policy
is changed, and no unsupported historical branch was deleted.
