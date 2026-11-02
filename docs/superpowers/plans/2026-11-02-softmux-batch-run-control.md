# Batch run control console

Goal: deliver a complete current-session batch running workflow: progress/current/next, pause after current output, resume, finish-current stop, immediate cancel and exportable run record. Existing Plan B S10/S11 remains the scope.
Architecture: a bounded headless controller supplies a boundary gate to the frozen queue. Pausing never terminates FFmpeg or changes the immutable plan. Stop is checked only before another job; generated outputs remain retained. Hard cancel releases a paused gate and preserves existing immediate cancellation semantics.

- [x] Test controller pause/resume/stop/cancel/finish and immutable bounded event records.
- [x] Extend runner boundary gate; test current publication preserved, next preparation blocked, resume exactly once, stop and paused hard cancel terminal semantics.
- [x] Add console controls/progress and run JSON export in actual batch workspace; disabled during invalid phases; clean per-run controller and terminal state.
- [x] Real browser 3-job pause/resume with actual outputs and native metadata/hash checks; second run finish-current stop; retain/download paused output and single-project draft isolation.
- [x] Full Node/build and fresh review; wire CI artifacts, persist checkpoint and PR.

No reload/background-service resume claim. Pausing retains generated Blobs and may retain engine memory. Input edits and a replacement batch stay locked while paused. Stop does not delete outputs or silently restart remaining jobs. Run records contain observations, not File grants or replay permission. Formal S10/device verdicts unchanged.

Verification: 815/815 Node tests, build and real three-mode console scenario passed. Five actual outputs, native stream/subtitle checks and independently compared directory/download hashes. Standalone authoring unchanged. Fresh review no material issues; record consistency clarified with capturedAt, explicit historical snapshot scope, per-run terminal and aggregate batchTerminal. Later save-only retries do not rewrite the historical execution record. Complete CI pending.

Final compatibility regression: unified history 6 steps / 3 actual MKVs passed on the 0.1042 build.
