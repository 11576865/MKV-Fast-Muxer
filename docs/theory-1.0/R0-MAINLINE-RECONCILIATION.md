# 理论 1.0 / R0：主干事实与验收账本只读对账

状态：开发分支实现，准确提交 CI / 独立核查仍须执行。基线：2026-10-16 观察到的 main `f0d6f78bd794844571cb22d089f8075cbd8b27e0`；产品开发版 `0.1019`。

## 决策权威与使用限制

此工作包执行 2026-10-12 理论总决议 D-01—D-10、P0 基线工作与 2026-10-16 1.0 发布合同 R0。它**不是**新产品功能、原始决议修订、阶段验收或产品 1.0 发布。57 个 R/T/B/S/U 原始场景和 44 个旧功能继承要求未删减。

原始 `docs/ten-round-sprint-20261015/acceptance-ledger.json` 的十轮记录是历史执行快照：例如 Round 7/8 仍为 `planned`，不代表当前仓库没有批量或 UI 实现。某些直接功能 PR 虽关闭、未以该 PR 直接合并，但代码可能已在整合 PR 中进入主干。必须沿合并提交及实际源码再核对，不能根据 PR 标签给出功能缺失结论。

## 本轮新增的实际执行工具

- `scripts/reconcile-theory-mainline.mjs`：只读校验原始 57 场景合同，接收外部 PR 观察数据，输出差异与人工复核范围；**绝不修改**理论账本，不自行验证功能，也不调用写入器。
- `docs/theory-1.0/mainline-snapshot-20261016.json`：精确日期、`main` SHA、关联 PR 和观察到的合并状态；关联范围 `scope` 明确说明为什么不能推导验收。
- `tests/theory-mainline-reconciliation.test.mjs`：验证 57/51/39 分母不变，历史 planned 与实际开发活动分开，关闭未直接合并的 PR 不等同于代码缺席；伪造 SHA、重复 PR、矛盾 merged/open 状态及缺少成品证据的场景晋级均失败。

执行：

```bash
npm test
node scripts/verify-theory-sprint-ledger.mjs
node scripts/reconcile-theory-mainline.mjs docs/theory-1.0/mainline-snapshot-20261016.json
```

此工具不访问 GitHub 网络。后续代理需从 GitHub API/连接器取得**新的真实 PR 状态和 main SHA**，更新或生成下一份注明日期的 snapshot，再运行。不要因为旧快照格式合法而把它当成当日事实。

## 本次观察产生的人工对账队列

1. **P0/R0**：确认已合并 R1-R5 的整合 PR #148 与 Round 2—5 的直接 PR #143/#144/#145/#147 在 `main` 的语义覆盖；拒绝以旧 PR 的 `closed / unmerged` 宣称未实现。
2. **P3/字幕**：#149 已合并；核对具体 SRT/WebVTT 成品时间审计、AAC priming 修复的准确 CI，不因此标记完整 P3。
3. **P3-B/批量**：#150/#151 仍 open，优先审查 save-only retry 与失败项重试的重复范围和冲突，选择一个受控整合点；不得平行重造第二条 BatchRunner。
4. **P4/UI**：#153 与 #155 已合并、#154 仍为 draft；应检查真实对象 Inspector、实际任务矩阵以及 1024/768 和 1440 等窗口的端到端用户操作，不把 Figma 画面等同于完成。
5. **P6/发布**：#156 已合并的是目标合同和有界 R1 观察入口，不是 1.0 发布的验收记录。

## 此次不得认定为完成的事项

- `accepted_verified = 0` 只是目前全证据回填状态，**不是产品功能数量零**。
- `merged = true` 不能证明准确 head 下 Chromium/native 的全部场景，更不能证明用户本机安全保存。
- 静态 `round_links` 仅为明确标注的审查线索，不证明 PR 中所有修改完整保留到了 main。
- 这次不运行真实 ffmpeg.wasm 浏览器封装，不进行独立 MKVToolNix 成品检验，不更新软件版本号（没有新的用户可交付产品功能）。
- 复杂 ChapterUID/Tag 丢失的 Issue #77 技术风险继续保持；不可解除 fail-closed。

## 下一纵向工作包

通过当前 R0 文件和测试的准确提交 CI 后，以 **真实来源 MKV + 新 ASS + TTF + 已有附件** 建立统一领域事务、冻结计划、FFmpeg 输出、原生结构/字节检查、保存结果身份的完整链路。先调查当前是否已有对应 E2E 和执行代码；只填补真实缺口，不复制旧入口。与之并行先处理 #150/#151 的批量 PR 关系，不提前合并或改写 main。

长期交接：以 `.uigs/tasks/2026-10-16-softmux-theory1-r0-reconciliation.json` 为持久恢复记录，后续每轮都更新准确 SHA / PR / CI 状态。


## Round 2–5 主干语义核查（2026-10-17；只证明接线与测试存在）

原 Round 2–5 的直接 PR #143/#144/#145/#147 均为 `closed / unmerged`，但其堆叠代码由 #148 整合进入 `main`。为避免误删旧实现，对 `main=f0d6f78bd794844571cb22d089f8075cbd8b27e0` 进一步做了模块、运行接线与 E2E 场景检查：

| 原冲刺 | 当前主干实际模块 | 主干入口接线 | 现有真实浏览器场景 | 事实边界 |
| --- | --- | --- | --- | --- |
| R2 / P1 | `src/live-container-workspace-authority.js` blob `a73636af2bd75668e2040b4f843745d2bfbc1a58` | `src/main.js` 包含 `createLiveWorkspaceAuthority`、`commitLiveWorkspaceChange` | `scenarioSharedContainerProjectRealMux` 已定义并在测试主流程调用 | 不等于长期撤销和所有跨会话操作完整 |
| R3 / P1 | `src/portable-external-project-recovery.js` blob `2b113f58ffdb4599fdeed43f0f2a074703b678ef` | `prepareExternalMetadataRecovery`、`applyPreparedExternalRecovery` 均接入 `main.js` | `scenarioExternalCheckpointRecoveryRealMux` 已定义并调用 | 仅外部素材元数据恢复，不是全部源工程恢复 |
| R4 / P2 | `src/p2-existing-mkv-writer-router.js` blob `8c31d155e4f9459d786c572986eae86f1358b30f` | `main.js` 调用 `setupExistingMkvRoutedEditorUI`，它封装调用 Router | `scenarioRoutedExistingMkvNativeOutput` 已定义并调用 | 四条受限 FileData writer，不是通用 EBML 修改 |
| R5 / P2 | `src/p2-matroska-inline-metadata-writer.js` blob `fa91cc21adcd6a4730dd2ba34d4697b046864c72` | `main.js` 调用 `setupMatroskaInlineMetadataUI`，该 UI 引入受限 Writer | `scenarioTracklessMkaRealChapterTagTextEdit` 已定义并调用 | 仅等 UTF-8 字节长度的 ChapString/TagString |

四组对应独立 Node 测试文件也已在同一主干存在：
`tests/live-container-workspace-authority.test.mjs`、
`tests/portable-external-project-recovery.test.mjs`、
`tests/p2-existing-mkv-writer-router.test.mjs`、
`tests/p2-matroska-inline-metadata-writer.test.mjs`。

**可执行结论：** 下一代理不得因为旧功能 PR 关闭未合并就重新开发第二套 Workspace / 外部恢复 / FileData 路由 / Metadata writer。应先复用上述模块，针对缺口追加差分测试、准确 head 的 CI 和独立真实产物核查。

**不可推导：** 此处核对的是主干源代码接线、文件存在与测试调用路径，并未重新单独执行以上四个 Chromium 场景，不证明全部理论目标、所有原 PR 逐行覆盖、准确 CI 通过或实际播放器兼容；仍须依据具体部署提交独立验收，保留 Issue #77 的复杂章节与 TagUID 风险。
