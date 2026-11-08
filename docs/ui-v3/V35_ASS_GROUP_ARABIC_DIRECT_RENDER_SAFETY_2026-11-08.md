# Softmux V3.5 · ASS Group 字体原件回退与真实 Matroska 渲染闭环

日期：2026-11-08
状态：**Draft PR #269 内已实现；准确提交 `8f7436149610af5f72343f0564559fec897d033d` 的 V3 专项与原生 MKV 回归通过；完整 Browser E2E 单独执行。**
项目：`11576865/MKV-Fast-Muxer`
关联代码：`src/ass-arabic-presentation-closure.js`、`src/main.js`、`src/batch-mux-context.js`
关联测试：`tests/e2e/v35-batch-ass-group-isolated-shaping.e2e.mjs`、`tests/e2e/v35-batch-ass-group-union.e2e.mjs`、`tests/batch-mux-context.test.mjs`

## 1. 发现：三个“字体保真”断言仍不足以保证实际播放器输入

曾经成功的真实双 MKV 测试证明了：Group 子集确实缩小、两个 MKV 内的子集附件逐字节相同、Unicode 字符覆盖正确。然而新增的、**系统中不存在的唯一字体族** `UIGS S03 TrueType Proof` 的真实 ASS 测试发现了更高层次的偏差：

- 原始字体与 Group 子集通过独立 HarfBuzz 的 cluster、advance、offset 与部分 `.notdef` 检测；GSUB/GPOS 表均存在。
- 将源 ASS 与从成品 MKV 解出的 ASS 分别通过 FFmpeg `ass=filename=...:fontsdir=...` 渲染，**像素完全一致**。
- 使用 FFmpeg `subtitles=filename=实际MKV:si=0` 直接从成品及其内嵌字体渲染，含阿拉伯文的字幕字形宽度发生可见变化，与原字体参考 SSIM 为 **0.973473**，低于原 `0.995` 的显式门槛。
- 对比 `ass` 与 `subtitles` 是不同滤镜这一因素后，再以同一个 `subtitles` 滤镜分别输入**原始 ASS + 完整来源字体**、**真实 MKV + 内嵌子集字体**，仍出现不同像素，说明并非单纯“比较了两种不同滤镜”。
- 向待子集化字符集加入 Arabic Presentation Forms 的实验也没有修复这一结果。不能靠字体名字被选中、某几个 Unicode codepoint 存在、或简单的 HarfBuzz 摘要就推定完整渲染保真。

实际缺陷在 [CI #42470001327](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/42470001327) 和 [CI #42489226672](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/42489226672) 留有准确截图和原始 MKV。**目前没有足够证据把根本原因归结为某个单一 GSUB/GPOS lookup、所有阿拉伯文字体或所有播放器。**

## 2. 修复：保留来源字体，而不是降低视觉阈值

`mustPreserveOriginalGroupFonts(text)` 识别批次实际可见字符并集中的 `Unicode Script=Arabic`。

- 若命中，则 Group 预处理返回用户真正导入的、按文件字节 SHA 去重的**原始 File 引用和原始字体字节**，不再运行未经验证的子集化。
- 若不命中，继续通过 HarfBuzz 生成 Group 字体子集，不因一个特定阿拉伯文样本禁用其他文字的优化。
- `frozenPlan.policy` 仍如实保存用户请求的 `subsetEnabled=true` / `subsetScope='group'`。与此同时，每个真实输出报告新增独立、不可变的 `plan.fontPreparation`，用 `applied=false`、`reason='arabic-direct-libass-shaping-unverified'` 表达**真正执行的字体决策**。不复制执行状态或改变任何 File 许可边界。
- 批量结束状态额外显示“Group 字体保留原件：阿拉伯文字形塑造尚未验证可安全子集化”，避免用户误以为已经生成小体积字体。
- 本修改发生在共用的 Batch 业务实现，因此一旦合并，会作用于使用该 Group 批次路径的界面；它不依赖 V3.5 的新导航，也未在 Draft 阶段修改线上默认行为。

这是一项**保真优先的有限回退**，不是对未知字体/脚本兼容性的通用证明。尤其不代表尚未测试的梵文、泰文、变体字符、可变字体或复合 ASS 动画已安全。

## 3. 通过的准确提交验收

准确提交：`8f7436149610af5f72343f0564559fec897d033d`

[Softmux V3 design pilot #42490189529](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/42490189529)：**SUCCESS**。

### A. 含阿拉伯文的两个真实 MKV：完整原件回退

两个独立 MP4 + 两条 ASS，原始字体族在 CI 环境的 `fc-list` 中不存在。经 Chromium 原生 BatchRunner 确实生成两个 MKV。

- 结束状态：**2 个生成、2 个审计通过、0 待复核、0 失败**。
- 两个独立 MKV 的字体附件均为 `TrueTypeRegularOnly.ttf`，实测大小各 **759,868 字节**；SHA-256 均与来源原件完全一致：`ef1d4216d1b359086a481a88512fd78ae6eee5c9c37ec8f46c9d911b58948219`。
- 两个真实输出报告的 `plan.fontPreparation` 明确为 `{mode:'group', applied:false, reason:'arabic-direct-libass-shaping-unverified', fontCount:1}`。
- 来源完整性与实际 ASS 提取、字体族和 GSUB/GPOS、HarfBuzz 形态检查通过；`ass` 对 `ass` 像素相同。
- 最关键的**同路径直接 MKV**验证：`subtitles` 对 `subtitles` 的 SSIM **两份均为 1.000000**，PNG SHA-256 也完全相同。
- 记录不同滤镜之间的 SSIM（分别约 0.997034、0.999777）仅用于说明不同渲染入口可以表现不同，**不拿它们替代任何验收阈值**。
- 附件中的临时字体仅供实际封装/独立原生工具验证；不另行分享或分发字体文件。

真实证据包：[V3 精确提交 Actions Artifact #13620904177](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/42490189529/artifacts/13620904177)，包括真实 MKV、审计、PNG 及 `isolated-ass-group-evidence.json`（`passed:true`）。

### B. 不含阿拉伯文的两个真实 MKV：仍然生成 Group 子集

同一精确提交的 `v35-batch-ass-group-union.e2e.mjs` 仍通过，分别输入独有的 `Ω` 和 `Ж` 字符，并在两个独立 MKV 中得到**同一份真正缩小的字体附件**：
- 原始字体 759,720 字节，实际子集各 **7,856 字节**，两个附件 SHA-256 相同：`5ff036de7040cbf9245f09aa57c688b1884ff5c89cec0428df074fb7fa20f478`；
- 两份 MKV 各自具有正确 ASS 轨、独立字体附件、两个字符的并集覆盖、独立报告 SHA 与真实审计，结束状态 **2/2 通过**。
- 因此“复杂脚本回退”**没有**不加区分地关闭 Group 字体子集功能。

### C. 其他门禁

[独立空白 MKV #42490189531](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/42490189531)：**SUCCESS**。

[S12 有界大媒体 #42490189588](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/42490189588)：**SUCCESS**。

[完整 Browser E2E #42490190335](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/42490190335)：此报告初版撰写时**仍在执行**，须以最终独立结论为准。

## 4. 明确的未完成事项

- 真正适用于阿拉伯文的**安全字体子集算法/lookup 闭包**仍未证明；当前交付是有条件的、透明的原件回退，不是字体优化已被修复。
- 尚未完成任意 ASS 内联 `\\fn`、`\\r`、`\\t` 动画、多字体族混排、多字重、可变字体、TTC/OTC、多种复杂文字、物理设备及所有播放器的矩阵验收。
- 完整 55 个 Figma 设计状态与 44 项遗留功能没有因本轮字体修复而获得完成签核。
- PR #269 仍应保持 Draft；无合并、发布或更改默认 UI 的授权。

## 5. 可复用工程判断

将**用户意图**与**实际执行的内容变换**分开记录；确知某个未验证变换会引起实际媒体渲染偏差时，应维持原始授权对象与完整字节，不要把“字节较小”当作内容正确，也不要降低独立图像阈值。每次升级证据层级（cmap → 字形塑造 → 提取后 ASS → 真正成品 MKV）都可能发现前一层覆盖不到的缺陷。
