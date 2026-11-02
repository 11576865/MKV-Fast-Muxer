# Batch execution selection

Goal: let users retain the complete reviewed batch while executing only explicitly checked tasks. S10 remains the scope; do not add another independent executor.
Architecture: a session-only selection owner binds each job to exact source/subtitle File references and output identity. Recompute preserves choices only for identical bindings; changed bindings default to included. A pure execution projection filters jobs and output-name/directory conflicts before the existing freezer, preserving unresolved pairing/invalid-input gates. Recipe v2 applies to the complete reviewed pairing before projection; selection is not serialized as a permission.

- [x] Test binding preservation/reset, set-all/invert, empty selection refusal, stale object rejection and selected collision scoping.
- [x] Add independent row checkboxes, All/None/Invert and selection count; lock under preflight/running/paused/save retry. Inspector focus remains separate from execution choice.
- [x] Apply selection consistently to directory checks, start readiness, preservation preflight, frozen plan and runtime record; capture revision during async preflight.
- [x] Real browser: run tasks 1+3 from three retained jobs, retain edits on excluded task2; select task2 later and run without reimport; independently verify all actual outputs and absence of excluded outputs, metadata and input identity. Check all/none/invert and run locks.
- [x] Run full tests/build, console compatibility regression and fresh review; persist PR and CI boundary.

Unresolved ambiguous/invalid input warnings remain blockers. Unselected targets are not written or checked as destination conflicts; selected collisions remain blocking. Selection is current-session/File-bound, not an imported recipe grant. Formal S10/device verdicts unchanged.

Verification:819/819 Node tests, production build and actual selection scenario passed; console pause/resume/stop/paused-cancel regression passed. Fresh review no material findings, focused4 selector tests independently passed.3 actualMKVs prove1+3 then edited2, retained files/metadata, recipe3jobs and runtime2/1 scopes. Full CI pending.
