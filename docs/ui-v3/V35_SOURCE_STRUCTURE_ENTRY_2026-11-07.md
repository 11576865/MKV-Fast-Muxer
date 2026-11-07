# Softmux V3.5 · 来源结构直接入口（只读，不创造写入权）

日期：2026-11-07  
状态：Draft / 来源对象可发现性扩展，**依赖功能入口 PR #267 的 opt-in `?ui=v3&nav=full`**  
追溯设计：V3.5 55 态候选（A02/A06/D01/D06/D07/D08），[PR #266](https://github.com/11576865/MKV-Fast-Muxer/pull/266)。

## 具体问题

现有 V3 已通过 `softmux:source-sections-updated` 取得单一、绑定准确 File 的附件、章节和格式级标签来源扫描结果；在 `#sfv3SourceContents` 末尾以 `.sfv3-source-resource-card[data-kind=attachments|chapters|tags]` 显示。此前虽有图标式 `#sfv3SourceStructureToggle`，但 V3.5 十入口导航并没有直接到达这三组已存在的信息。用户需要先找到来源页下方折叠结构，属于功能发现缺口，不等于扫描引擎或结构模型缺失。

## 已实现（非推测）

在现有试验路由上加入一个**文本命名**的 `源结构` 任务入口，使候选顶级导航合计 **11 项**。导航动作复用原 `setSurface('source')`，在本次 File 的三张只读卡片中复用 `#sfv3SourceStructureToggle` 的展开行为和本来的 `.sfv3-source-resource-strip`。仍依赖原生 `#videoInput`、单一 ffprobe 扫描结果、原来源观察卡及其自身 `open` 属性，不新建第二份 Chapters/Tags 对象，也不添加 DOM 编辑器。选择此任务不会打开目标选择器、不会切到拟输出，也不会激活封装按钮。

紧凑宽度 500—959px：11 个有名称任务按钮排为两行六列（最后一行 5 项）；499px 以下为三行四列，保持最小命中面积。原 V3 无 `nav=full` 时界面保持不变。

## 严格解释边界

- 来源附件的 FFprobe 观察不等于已验证成品附件 `FileData` 字节；能看见“notes.txt”不表示已执行提取、修改、重新封装或写入。
- `chapters` 是扫描可见的**扁平章节/时间**，不是完整嵌套 EBML ChapterAtom / ChapterUID 引用树。不能推出可以保真改写任意章节。
- `tags` 是 **FFprobe 格式级标签**，不是完整 Matroska TagTargets、UID 关联或未知顶层 EBML 保真证据。
- 未扫描、不支持或缺失的对象必须显示真实“尚未报告/未验证”状态；不能把无观察推定为不存在，也不能凭文件名生成伪结构。
- 此变更只加入口与浏览器证明，不触碰受限 EBML 写入、BatchRunner、主流程状态所有者、默认 V3 或生产切换。

## 真实 Chromium 证据合同

新增 `tests/e2e/v35-source-structure.e2e.mjs`：
1. FFmpeg 创建带章节（Opening）、格式标签（Structure Fixture）和文本附件（notes.txt）的真实 Matroska；**独立 FFprobe** 先检查夹具真实性。
2. 真实浏览器导入这份 MKV，等待同一来源 File 扫描得出的三类有内容观察卡。
3. 点击「源结构」后验证三张原只读观察卡展开、对象数均为正，拟输出仍未授权，封装按钮仍不可用。
4. 切换批量再回来，原 `File` 对象身份不变；手动折叠后再次点「源结构」只展开原卡片，不复制第二套。
5. 620×900 下全 11 个入口两行可见，检查命中区及右边界；输出实际截图、JSON 和失败诊断。

CI：`.github/workflows/ui-v3-pilot.yml` 按准确 HEAD 执行新的源结构 E2E 与之前十入口 E2E，并上传 `.e2e/ui-v35-source-structure/`。**CI 是否通过，以 GitHub Actions 实际结果为准，本说明不预先声明通过。**

## 待办和验收边界

- 尚未把独立来源观察变成全功能的结构编辑器，不允许冒用成品保真验证。
- 需继续对 V3.5 44 项旧能力逐项核对可见入口及实际执行结果；该入口主要补齐 L-016—L-018 的**来源可发现性**，不是实现通用章节写入。
- Figma 已批准的原 V3 页面仍不更改，设计权威漂移及产品默认切换仍需要独立审查；本 PR 为 Draft。
