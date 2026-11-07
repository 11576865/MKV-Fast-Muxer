# Softmux V3.5 · 第一组真实功能入口接线与验收台账

日期：2026-11-07  
性质：**Opt-in 实现切片 / 不属于 V3.5 全量功能验收**  
验证入口：`?ui=v3&nav=full`  
对照设计：[V3.5 · 55 态 Figma 候选](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=60-2)，[设计账本 PR #266](https://github.com/11576865/MKV-Fast-Muxer/pull/266)。

## 1. 确认的生产代码事实

- `src/softmux-10.14-workbench.js` 原本就以 `get(doc,'sf14Batch').appendChild(batch)` 将**真实** `.stage-batch` 和所有原有任务矩阵、导入控件、任务队列与运行控制器移动到同一工作台；另有 `changeView('batch')` 和 `changeView('tools')`。**本次没有新建 BatchRunner、导入器、计划模型或文件权限持有者。**
- 原 V3 的 `src/softmux-v3-surface.js` 将原 `[data-sf-view]` 放入顶部 `.sfv3-legacy-menu`，只给侧栏设置来源和“添加资源”图标。故“Batch 已实现”与“Batch 在 V3 中为一级可发现入口”是不同判断。
- 本 PR 在试验路由下增加有文本名称的 `#sfv35FeatureNavigation`，并且**只是点击已存在的原生 `[data-sf-view]` 导航**。原有 `#sf14Batch`、`#batchPlan`、`#batchUnifiedInput`、`#sf14Tools` 和 `#muxBtn` 的 DOM、事件和文件引用保持单一所有者。
- 直接点击「拟输出」时，仍经原 `setSurface('plan')` 授权检查；缺少已确认目标则调用**原目标选择器** `openTargetPicker(null)`。返回来源模式保留原有只读条件，不能仅因显示按钮就宣布可执行。
- `.sfv35-nav` 范围内修复 V3 强制 `display:grid!important` 会覆盖已有 `[hidden]` 的冲突，避免切到批量时原单工程页面叠在下面；不改变默认 V3 CSS。

## 2. 导航路径和证据类型

| 当前 V3.5 入口 | 原始 DOM / 业务状态 | 保护要求 | 证据 |
|---|---|---|---|
| 来源 | `[data-sf-view=single]` → `setSurface('source')` → `#sf14Single` | 不自动生成可执行拟输出，来源只读 | 单元合同 + Chromium 真实 MP4 扫描 |
| 拟输出 | `[data-sf-view=single]` → `setSurface('plan')` 或原目标弹窗 | 明确选择目标后才允许编辑／封装 | Chromium 打开、取消目标选择 |
| 批量任务 | `[data-sf-view=batch]` → `#sf14Batch` | 保留单工程 File、批次独立 JobPlan、无伪完成状态 | Chromium 导入真实媒体及字幕 |
| 容器工具 | `[data-sf-view=tools]` → `#sf14Tools` | 受限写入门禁不放宽 | Chromium 原容器工具工作区可达 |

## 3. 并非本次完成的设计入口

V3.5 55 态设计包含完整的轨道、字幕、字体、附件、验证、工程恢复和批量任务细分。**目前仅有四个任务路由新增了试验性常驻入口**；这不构成九类任务都已达到一级可发现性的证据。

以下领域必须继续做独立真实入口核查与执行确认：
- L-010/L-012/L-013：轨道元数据、排序及批量属性在 V3 对象检查器中的可见路径；
- L-020—L-027：ASS/libass 预览、字体闭包、子集化/统一字体和成品证明；
- L-016—L-018：附件、Chapters/Tags/UID、Data/Other 的安全只读/受限写入路径；
- L-030—L-037：交付验证报告、批量运行／保存恢复；
- L-040：**本次部分实现**，独立一级 Batch 入口可进入原生任务矩阵，但绝非 Batch 全面 V3.5 视觉批准。

## 4. 验收出口

1. 准确 HEAD 的 `npm test`、`npm run build`、V3 Chromium 专项、Browser E2E、new-MKV 独立 E2E 均通过才允许提出进一步范围评审；**不得**从旧 SHA 的 CI 结果继承绿色。
2. 在真实浏览器检查 `#sf14Batch`、`#batchPlan`、`#batchUnifiedInput` 和单工程 `#videoInput` 的实际节点唯一性；导航前后原 File 引用不变；目标未经确认不能写入。
3. 核查 `1440×900`、`620×900` 的入口命中区和 `aria-current="page"`；真机触控、屏幕阅读器与 55 态视觉一致性未覆盖。
4. 尚未取得正式 V3.5 设计签核、原 V3 Figma 来源漂移未闭合，因此 **Draft PR、不自动合并、不切默认**。

## 5. 交付范围与状态

**已实施（代码）：** 试验性命名导航、Batch/Tools 实际复用、目标许可检查复用、CSS 显隐修复、单元测试与 Chromium E2E、专项 CI 接线。  
**待证实（运行）：** 精确 PR HEAD 的完整 CI、真实浏览器来源和批量入口操作，具体结果以 GitHub Actions 和产物为准。  
**Pending（整体验收）：** Figma 设计版本冻结、九类入口充分性、全旧能力功能可达性、设备与无障碍、1.0 发布。

此台账是基于当前实现源码的**局部真实接线审查**，并非从 Figma 或旧报告推定全量功能完成。
