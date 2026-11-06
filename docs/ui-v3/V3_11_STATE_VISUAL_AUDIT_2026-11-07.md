# Softmux V3 — 批准的 11 状态整体 UI 对照审查（2026-11-07）

**审查性质：** 逐状态证据审查与偏差台账；不是 Figma 视觉签核证书，也不授权默认 UI 切换。  
**Figma 权威：** [V3 · Object-first / Adaptive](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=27-2) 和 [UI_DESIGN_CONTRACT.md](./UI_DESIGN_CONTRACT.md)。  
**已核对代码候选：** Draft [PR #262](https://github.com/11576865/MKV-Fast-Muxer/pull/262) 的 `3e091ec6e7dd4873e05958c3f783503d6be5b344`（审查基线；后续变更需重跑精确 HEAD）。  
**该 SHA 自动化：** [V3 Pilot #42243936202](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/42243936202)、[blank Matroska #42243936342](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/42243936342)、[Browser E2E #42243936285](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/42243936285)、[Pages #42243936226](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/42243936226) 均为 success。  
**可复查的浏览器证据：** [V3 Pilot artifact #13516219112](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/42243936202/artifacts/13516219112)，内含 `ui-v3-visual-comparison/review-index.json`、10 张视觉对照、22 个响应式用例与真实来源、ASS、五轨、blank-MKV 成品截图/JSON。

## 方法和不可越过的证据边界

1. 已读批准的 11 个真实 Figma 节点，检查节点名、自然画布尺寸、关键层位置与文字，不假定 Figma 链接本身是不可变快照；本次图像对照以 CI 冻结参考图为准。
2. 10 个视觉态有**同视口**的 Figma/实际 Chromium 图片配对；`V3-11 (40:2)` 是 1300×650 的**状态/自适应规范板**，应用规则及 22 个源/目标 viewport 证据核查，绝不冒充第 11 张应用 UI 截图。
3. `review-index.json` 明确 `fixtureMatched:false` 且原来的 10 项均为 `UNREVIEWED`；本审查只给出人工结构观察和可证实的差异。真实 fixture 与静态设计示例的文件名、音视频编码、字幕数、附件数、章节数不同，**不能计算像素准确率或自动判断数据文字为视觉缺陷**。
4. 浏览器模拟触控、`reducedMotion` 和键盘测试不等于真实 Android/平板旋转、系统文件管理器 OS Drop、屏幕阅读器、软键盘盖挡或完整 1.0 发布验收。正式验收仍需负责人确认。

## 11 状态逐项审查台账

| 状态 / Figma | 界面或功能已有的独立浏览器证据 | 对照结论 / 遗留缺口 | 分类 |
|---|---|---|---|
| **V3-01** `28:2` 桌面来源 1440×900 | `ui-v3-multitrack/five-track-source-1440x900.png`、`ui-v3-evidence/1440-loaded-source.png`；只读源轨道与明确目标前无写入权限已测试 | 文件标题、资源栏、分组顺序具对应实现；Figma 两音轨/两字幕/六附件与真实 fixture 的资源不同，逐像素/文案仍未匹配 | 功能证据充分，视觉未签 |
| **V3-02** `30:2` 桌面选中 ASS | `ui-v3-ass-source/v3-ass-selected-1440x900.png`、`ui-v3-cross-source/wu04-source-subtitle-inspector.png`；原生预览/提取/加入入口与 no-target 授权测试 | 真实操作已接通；Figma 设计将部分动作紧邻选中行，实际使用右侧单一原生对象检查器，需对动作邻近性与视线移动作人工复审；不新增平行编辑器 | 行为通过，空间层级待签 |
| **V3-03** `31:2` 明确目标 | `ui-v3-cross-source/wu02-target-dialog.png`、`wu02-target-dialog-820.png`、`ui-v3-blank-target/blank-choice-selected-subtitle-1440.png`；真实 B.mkv 与显式 blank 目标均有输出测试 | 单一目标 chooser、取消不授予、精确 File 许可均实现；B/blank 实际方案与 Figma 静态示例需要同样测试数据才能逐像素复审 | 已实现，视觉未签 |
| **V3-04** `32:2` 桌面拟输出 1440×900 | `ui-v3-multitrack/five-track-1440x900.png`；真实 1 视频/2 音频/2 字幕，原生编辑器、执行入口 | **实测偏差：** 桌面下方仍有蓝色 Legacy `.execution-panel` 底色、`#cancelBtn` 在 disabled 时参与布局，和 Figma 的统一深色单行工具条存在明显差异；本轮进行 opt-in 视觉修复与 CI 验证 | **本轮整改** |
| **V3-05** `33:2` 820×1180 来源选中 ASS | `ui-v3-ass-source/v3-ass-selected-820x1180.png`、`v3-native-ass-preview-820.png`、真实无字体供应商拒绝/显式字体可生成 PNG 的测试 | 选中来源、原生底部上下文和预览可达；截图间的预览激活状态不同，不能把未开启的画面误判为缺功能。Figma 附件数量是假数据，实际按扫描显示 | 功能通过，演示数据不匹配 |
| **V3-06** `35:2` 820×1180 拟输出 | `ui-v3-multitrack/five-track-820x1180.png`、`ui-v3-responsive/plan-820x1180-inspector.png` | 真实轨道优先、检查器与输出 dock 已实现；Figma 目标文件名/资源数据不同，真实触摸、软件键盘、固定工具条遮挡待设备核验 | 响应式已测，设备待签 |
| **V3-07** `36:2` 1180×820 横屏 | `ui-v3-multitrack/five-track-1180x820.png` 与 `ui-v3-responsive/delivery-plan-1180x820.png` | 真实媒体轨道、资源卡与 60px 操作区可见；Figma 状态与真实实例不相同，不能给整体像素 PASS | 结构已有证据，视觉未签 |
| **V3-08** `37:223` 620×900 紧凑 | `ui-v3-multitrack/five-track-620x900.png`、`ui-v3-blank-target/blank-complete-dock-620.png` / `blank-complete-evidence-620.png`；命中区/原生计划与报告验证 | 已修复组间累积纵向偏差，真实完成态仍保持单行 dock；同 viewport 不是同 fixture，且长状态文字截断须依靠原生计划/检查器获取完整信息 | 单点回归通过，视觉未签 |
| **V3-09** `38:2` Default/Forced 解释 | `ui-v3-ass-source/v3-source-ass-flags-and-font-observation.png`，同一 `#sfv3SubtitleFlagsHelp` 在来源/目标间 rehost；未知值与可编辑字段分离 | **有形态差异**：Figma 是临近 Default 的局部说明浮层，实际是上下文检查器中可展开 `details`。术语解释和进入方式可用，但说明的相对位置仍需设计签核 | P1 交互/视觉 |
| **V3-10** `39:2` 空态载入 | `ui-v3-evidence/1440-empty.png`、`1440-empty-canvas-drop-result.png`；鼠标点击原生 file chooser 与 DataTransfer drop 实测 | 无平行导入器，浏览器空态真实入口已验证；OS 原生拖拽并未在实体桌面设备验证；当前多一个辅助选择按钮不构成失败 | 功能通过，实体拖放待签 |
| **V3-11** `40:2` 状态与自适应规则 | `ui-v3-responsive/v3-responsive-geometry.json` 11 宽度×来源/目标，共 22 实际视口；原 File 与唯一编辑器连续性 | 这是**规则板，不是屏幕**。代码已有 600/720/960/1320 边界处理；高度不足/软键盘、实体屏幕阅读器与旋转仍属未验收范围 | 规则部分通过，设备待签 |

## 本次优先级及整改边界

- **可确认的 UI 视觉缺陷：** V3-04 桌面底栏遗留蓝色背景与 disabled 取消按钮。只在 `?ui=v3`、`min-width:1320px`、目标界面且 Cancel disabled 时消除多余装饰；绝不隐藏**运行中的 Cancel**，不修改执行器、File、状态文字或结果鉴别。必须加入真实 Chromium computed-style 与可见性断言，失败就按实际红灯修复。
- **仍须设计复审的差异：** V3-02 的对象动作空间归属、V3-09 的 Default/Forced 解释浮层/折叠行为、同数据/同字体的逐状态截图签核。这些**不是已验收 BUG**，不据一张不同 fixture 截图擅自重写单一原生检查器。
- **无法由云端浏览器替代的验收：** 实体平板/触摸、屏幕阅读器、系统软键盘、窗口旋转、OS 文件拖放，以及负责人明确批准切换默认。保留 Issue #256。
- **回归原则：** 只重跑新增改动的精确 commit SHA 上的 V3 Pilot、完整 Browser E2E、new-MKV 和 Pages；任何绿色只证明该代码及其覆盖，不给 11 态最终视觉合格章。

## Stop / 不应继续无限小修

代码级的 11 态界面入口与核心任务流已经基本具备。除已确认桌面 dock 偏差外，下一阶段不是添加 11 个并行重绘组件，而是使用**相同媒体数据/字体**的一次完整视觉复审和**真实设备**签核。用户未批准以前，V3 仍由 `?ui=v3` 启用；旧默认 UI、原生写入器和审计保持不变。
