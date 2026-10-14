# Round 2 / P1 — 单工程统一可写领域文档（有界纵向交付）

2026-10-15。基于 Round 1 的分支 `feat/ten-round-theory-p0-baseline-20261015`（PR #142，独立 exact-head CI 仍待验收）；本 Round 2 是**叠加分支**，不可绕过父 PR 的安全回归直接宣告主干完成。

## 交付的真实运行路径

以前来源 MKV 的音轨／字幕／原附件由 `liveSourceTrackSession.project` 维护，外部音频／新增字幕／字体模式由 `liveExternalAssetSession.project` 维护。它们各自的内存 Project 虽不可变，**同一个正在制作的 MKV 却存在两个不同的领域文档及独立修改入口**。

本轮新增 `src/live-container-workspace-authority.js`：
1. 在真实来源扫描、外部资源/字体重新选择时，有界合成**一个** `ContainerProject v1`；双方会话现在指向**相同的冻结 Project 对象引用**。整合保留当前真实编辑值，并按真实来源/会话严格区分全部已有原对象、外部轨道、外部字体及策略。旧外部对象在显式重新选择时不会累积到新工程。
2. 五条原有界操作（来源轨字段、来源附件字段、来源同类型排序、外部音轨/字幕元数据、字体 preserve/force 策略）通过 `commitLiveWorkspaceChange`。**修改前同时核查**来源轨+附件和外部 File/sidecar/字体与旧 FFmpeg 投影；只要另一侧发生身份或字段漂移，整次操作都拒绝。编辑动作仍由各自已测试的领域事务执行，成功后两个适配器同步接收同一个新的不可变 Project 引用。
3. 单工程 `executeCurrentMuxTask` 在实际写入之前还验证**两侧共享文档与完整投影一致性**，不将一个未授权、未经核验的 Legacy 行绕过另一个领域所有者送到 FFmpeg。
4. 来源/字体/文件的选择重新绑定是唯一允许重新建立会话文档的路径。新文档丢弃的是旧会话内的瞬时 edit-history（已有旧值通过受控投影保留），不是浏览器文件许可的“自动恢复”。旧保存的项目 JSON 仍必须重新验证来源 SHA、旧值并显式确认。
5. 原快速封装、流复制、已验证附件写入器、复杂 MKV P0 风险阻断、批量独立冻结任务及真实成品审计都不换后端。

## 新增验证

- `tests/live-container-workspace-authority.test.mjs`：同一冻结文档对象身份；交错修改两侧元数据；另一侧未经授权字段写入/同名替换 File 阻断；字体模式；来源无附件的合法场景；旧外部会话重新绑定去重；持续键入与历史压缩；无视频工程只能描述但无法自动写入。
- Chromium `scenarioSharedContainerProjectRealMux`：实际来源 MKV + 新 FLAC + 新 ASS + TTF，先修改来源音轨再修改外部轨与字体模式，最终真正保存 MKV 并由**独立宿主机 ffprobe**检查各轨标题、Forced 及附件。
- 这些新增测试与原 Node、Build 和 Chromium 完整测试应在**准确 PR head** 运行。此前独立 source/external E2E 成功并不能替代新的混合来源测试。

## 尚未完成，不能作为本轮声明

- 目前合一的是**单工程活会话的一个共享领域文档**；旧已验收执行适配器继续保留不同的原生行数组，且入站 File/sidecar 授权在内存而非可序列化 Project 中。
- 章节和标签在领域中主要是观察对象，不代表已有安全修改权限；来源原附件直接写入器仍受原有来源/CRC/SeekHead/TagUID/大小上限。
- 独立冻结 BatchJobPlan 尚未迁入单工程统一事务，也没有跨编辑器全局持久 Undo、音频-only/附件-only 一般化写入。
- 本轮**不自动将 P1 全阶段标为 verified**。待 GitHub exact-head CI、Chromium 实际新 MKV 与后续重绑/中断测试通过，再更新对应原始验收场景证据。

## UIGS Intake

可复用原则是“同一用户工程的多个既有领域所有者可在过渡期共享一个不可变对象和统一事务入口；每次跨域提交必须核验所有独立执行投影，而不是只验证被点击的对象”。需在 UIGS-Foundry 检索去重，登记为限定范围的 Candidate/Case（非 Canonical）。若无法写入，标记 Pending。
