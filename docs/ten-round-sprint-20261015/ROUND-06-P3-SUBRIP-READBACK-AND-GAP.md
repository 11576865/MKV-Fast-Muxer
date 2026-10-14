# 软封理论模型差距复核与 Round 6 实现（2026-10-15）

依据《软封工程_未来规划总决议_2026-10-12(1).txt》D-01—10、P0—P6 退出条件和 57 个原始验收场景。此次延续已有十轮实现，没有重新定义产品目标。

## 核验基线

- 主干 `fefd97e0c1386d8b4f30328c167561f6690bf628`，包含合并 PR #141；此前 10-13 报告仅到 #103，不能代表当前工程。
- 最新 R1—R5 整合与产品 R5 的准确提交相同：`dd709601645a8e5787f2b6e8e22c026823e2981e`。
- 该准确提交的 Browser E2E mux tests run `38608413912`（#716）与 Deploy to GitHub Pages run `38608414346`（#798）均 completed/success。这里 Pages 是该 PR 的构建检查，不是宣称产品主干部署已经更新。
- #142—145、#147 是仍开放的产品 PR；#146/#148 是整合验证 PR。成功的整合测试与产品已合并分开。
- 本地原整合基线：579/579 Node。新切片：586/586 Node、Vite build 通过；新的 Chromium 实际产品输出须等待本轮准确提交的外部 CI。

## 与理论模型的差距

| 阶段 | 当前真实基础（主干及注明的整合分支） | 尚未闭合的理论退出条件 |
|---|---|---|
| P0 风险与继承 | 旧字幕、批次、原轨回归；#77 复杂章节/定向 Tag 的丢失反例；R1 补首 Segment 后尾部/第二 Segment 阻断 | 旧 FFmpeg 重封装不能证明任意复杂容器完整保真；57 场景需要逐项重新关联准确证据 |
| P1 唯一领域文档 | 主干有源轨/外部对象事务；R2 共享一个 live ContainerProject；R3 外部元数据 SHA 重绑定、确认、版本绑定撤销 | 多来源/外部/字体全部工程的原子恢复；跨会话完整历史；所有 writer 与批次计划进一步收敛。不能把外部元数据 checkpoint 称完整工程恢复 |
| P2 真实容器修改 | 原附件提取、UID 图与受限局部修改；R4 合并四类附件 writer 路由；R5 同字节长度 ChapString/TagString 修改并验证无视频来源 | 任意长度章节/标签编辑、对象增删、所有 CRC/未知 EBML、通用多来源写入；来源 <=60 MiB 与布局限制仍在 |
| P3 字幕字体交付 | 真实 ASS 事件与 Style 回读、原/新附件 SHA；特定独特字体隔离 libass 与 move/transition/karaoke 负控 | 原 MKV 内嵌字幕到资源依赖与实际成品的更完整闭环、SSA/图形字幕等完整验收、播放器特定表现；此前 WebVTT 只有 codec 转换声明，没有逐 cue 成品核对 |
| P3-B 独立批次 | runFrozenBatchQueue 无 DOM；单/批调用共享执行核心；Recipe v2、覆盖、输出身份与保存状态 | 20 集全矩阵对照、18/20 明确执行范围、关闭页面后已确认任务清单恢复、只重试保存/失败项与长期资源证据。不能重复宣称模拟 muxBtn.click 是现状 |
| P4 专业 UI | 真实对象树/检查器、上下文编辑与现有窗口尺寸回归 | 20 集复杂实际任务步数/耗时/误操作对照；缩放、触摸、焦点与草稿完整矩阵；高级功能分散披露区仍需收敛 |
| P5 平台性能 | 来源流式 SHA 与有限输入预算、Blob 所有权/释放和失败测试 | 真实大文件峰值内存、跨浏览器/设备、休眠/授权/容量不足、长期批次证据 |
| P6 稳定发布 | 有版本化配方/报告、风险披露和持续测试 | 原迁移矩阵、发布承诺与实际能力逐项审核；前述平台与 UI 缺口不能靠文档抹掉 |

不能给出可信的“实现百分比”。账本固定 57 场景（51 高/关键，目标 39 verified），现有 accepted_verified=0 是严格证据字段尚未回填，不是功能为零。9 partial/48 unassessed 也不是代码实现数量。本轮保留分母及所有开放风险。

## 本轮完成的有界产品实现

补 T-005 的成品语义证据：对实际完成 MKV 的新增 SRT/WebVTT 轨使用 FFmpeg/Wasm `-copyts` demux 为 SRT，与真正送入封装器的文本逐条比较纯文本、毫秒起止、数量、顺序及重复条目。每条使用实际输出字幕 ordinal，不根据文件名猜轨。单文件与无 DOM 批次共享此检查。

报告新增 `audit.subripCueAudit`；成品证据面板区分 pass/warning/unavailable/not-requested。实际差异使总体审计 warning，保留产物；解析或资源限制显示未验证，不能视为转换/排版等价证明。WebVTT settings、STYLE/REGION、时间映射、markup/entities 与 SSA/PGS 均不被本检查冒充覆盖。上限 8 条新轨、512 MiB 成品、每回读 2 MiB。

- Node 反证：1ms 偏移、缺条目/重复条目、文本变更、错误轨 codec/ordinal、重复 ordinal、demux 异常、预算、WebVTT 带格式内容。
- 扩充原全 Chromium 的 additional-formats 场景：真实 Wasm 成品下载，独立系统 FFmpeg 的显式期望文本核对 UTF-8/多行/毫秒/时间重叠；再实际封装 layout cue，要求 UI 与报告明确 unavailable。
- 保留现有独立 ASS/libass/字体/批次/复杂 Matroska 全回归，没有降低原测试门槛。
- 补充 native 探针 `node scripts/verify-r6-subrip-native.mjs`，本地 FFmpeg 6.1.1 真实字幕轨 MKV 成品及 3 个负控通过。此探针不等于新产品浏览器验收。探针改用真实 AAC 媒体与产品 buildMuxCommand 后复现旧命令导致 +21ms 整体偏移；本轮把原 ASS 的 -copyts + -avoid_negative_ts disabled 时间保护扩展到 SRT/WebVTT，修复后显式毫秒期望和负控均通过。

## 接续顺序

1. 本轮准确提交全 Node/build/Chromium/native CI；存在红灯即阻断，不将本地纯模块或 native fixture 推广为完整产品。
2. 完整 P3 内嵌资源依赖/SSA 与格式验收；按原 T/R 场景补具具体 SHA 的证据。
3. 既定 Round 7 批次工作包（20 集、失败/保存重试/恢复），Round 8 真实任务 UI，Round 9 平台，Round 10 发布复核。

此切片不宣称 P3 完整退出、理论模型已达到 75%、相关 PR 已合并或已正式发布。

## 提交状态

2026-10-15 用户明确授权公开推送本轮分支及创建 Draft PR。此前审批阻断已经解决；本机 git push 缺少登录凭据，改用已授权的 GitHub 插件发布同一 Git tree，并校验远程 tree 身份。准确提交的全 Chromium/native CI 必须单独取得成功结果，方可晋级验收。
