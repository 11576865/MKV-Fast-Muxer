# 软封目标 B：10 轮理论模型冲刺（Round 1 基线）

依据用户批准的《软封工程未来规划总决议与实施纲领》（2026-10-12），以 main@fefd97e0c1386d8b4f30328c167561f6690bf628 为核查起点。此文件不是对现行完整产品的验收证书。

## 分母与证据边界

- D-01—D-10 是产品决议和不变量，不计入完成率。
- P0/P1/P2/P3/P3-B/P4/P5/P6 是八个工程阶段，不计入完成率。
- **R-01—05、T-001—015、B-001—017、S-001—008、U-001—012 共 57 个原始验收场景**，ID 不得删除或合并。其中暂定 **51 个高/关键优先级**，10 轮冲刺目标为至少 **39 项**达到完整证据门槛（75% 向上取整）。优先级是当前执行建议，不变更正式 Canonical 规范。
- 初录的 `unassessed` 不代表未实现；`partial` 指有界实现证据而非整个原始场景已完成。首次登记仅有 9 条有界 `partial`，不能将目前 `accepted_verified=0` 误读为软件功能为零。
- `verified` 必须具备准确 40 位 commit SHA、完整场景、指定 workflow run、独立 oracle 与真实成品 SHA-256。脚本只检查证据字段和分母稳定性，**不会自动运行 57 项真实验收**。

账本：[`acceptance-ledger.json`](acceptance-ledger.json)。执行 `npm test` 或 `node scripts/verify-theory-sprint-ledger.mjs` 进行契约核查。

## P0 必须延续的安全事实

1. [Issue #77](https://github.com/11576865/MKV-Fast-Muxer/issues/77) 在真实复杂 MKV 上发现旧 FFmpeg/Wasm 重封装丢失嵌套 ChapterAtom 和 ChapterUID 定向 Tag。Issue Closed 不代表该旧路径的普遍结构保真已有修复。
2. PR #136—#141 的已有 MKV 附件操作只授权明确受限的来源结构、被验证的无引用 FileUID、大小和 CRC/SeekHead 约束；不能据此外推任意 EBML 写入。
3. 原文件不得被自动覆盖；无法证明的布局保持只读或 fail-closed。封装、Stream Copy、结构保留、字幕渲染、播放器兼容、目录保存是不同的结论。
4. 旧快速字幕软封、ASS/SSA/SRT/PGS/VobSub、字体、旧批处理 Group、取消与保存能力必须保留；每轮都跑真实旧路径的回归。
5. Round 1 额外补充：有限长度首个 Segment 结束之后仍存在未检查尾部/第二 Segment 时，旧 preflight 不再报告 `NO_KNOWN_HAZARD`。此为**有界旧重封装安全预检**，不禁止独立只读研究。

## 十轮交付（每轮必须含功能/安全代码 + 回归 + 精确提交）

| Round | 主线 | 退出证据 |
|---|---|---|
| 1 | P0 基线、57项账本、后续 Segment 安全反证 | 主干事实/旧路径/测试，PR exact-head 门禁 |
| 2 | P1 统一 ContainerProject 领域状态 | 主要来源/外部/附件由一个领域权威驱动 |
| 3 | P1 工程恢复与事务 | 来源重授权、草稿冲突、撤销、冻结执行 |
| 4 | P2 容器修改能力整合 | UID/EBML/输出审计的真实操作 |
| 5 | P2 Chapter/Tag、无视频容器 | 有界真实写入与独立输出验证 |
| 6 | P3 专业字幕与字体 | ASS/SSA/字体/动态渲染的成品回读 |
| 7 | P3-B 独立批量体系 | Recipe v2、任务矩阵、20集失败/重试/恢复 |
| 8 | P4 UI | 真实项目对象的桌面/平板高密度主工作台 |
| 9 | P5 性能与平台 | 大文件、多浏览器、长期批次和权限证据 |
| 10 | P6 发布 | 原始验收账本复查、未闭合风险、发布候选 |

不同阶段可交叠，但只计算真实验收场景，不通过删减分母、删除红灯或将单次观察升级 Canonical 来达到 75%。提交 PR 后外部 CI 异步运行，`Pending CI` 与已接受/已合并/已实机验收必须分开。UIGS Intake 需去重写入 Foundry，失败则明确 Pending。
