# 软封 1.0 — S10 连续 20 个真实浏览器批量成品：可审计验收记录

日期：2026-10-20  
证据阶段：**持续执行基准（S10 子场景已验证），不是 S10 全域及 1.0 正式验收**  
完成 PR：[PR #164](https://github.com/11576865/MKV-Fast-Muxer/pull/164)  
精确已测 PR SHA：`4410f53ef9f5f415904bd6741f9a1af86baf627d`  
已合并主干提交：`c3118ae308c1d2133969a179a6ec1479c3883d36`  
完整 [Node + S10 + Chromium E2E CI #39401811327](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/39401811327) **success**  
GitHub Actions 产物：`s10-twenty-real-matroska-batch-evidence`（artifact ID `12255024668`；该 ID 属本次验收构建，ZIP 不作为独立的托管下载承诺）。

## 已实现和真实通过的范围

- `npm run test:e2e:batch20`：在 Google Chrome 中打开真实软封网页，生成 20 个拥有独立文件名、独立 `File` 引用的 MP4 文件及配对字幕文件；交替 ASS 与 SubRip/SRT，批量选择一份有效的外部字体。
- 使用**现行生产批量引擎**而非模拟 Worker／伪造 MKV。正确识别 20 条无歧义配对，得到 20 条冻结计划，真正顺序执行 20 次 FFmpeg/Wasm，并提供 20 份实际 MKV 与 20 份实际 JSON 报告下载。
- 原生 `ffprobe`、`ffmpeg -c copy -f hash`、最终 MKV 字节 SHA-256 与报告 `output.sha256` 验证每件成品；比较每项视频/音频原始压缩数据的 **SHA256 streamhash**，证明流拷贝内容不改变。
- 每件成品都检查单条字幕实际编码、至少一个字体附件、相应 `audit.ok===true`；SRT 用原生 `ffmpeg -copyts` 解复用，验证 **毫秒级 cue 时间、文本和顺序**与输入一致；ASS 用产品实际成品回读 `assEventAudit.status=pass`，验证 Dialogue。
- 冻结计划 `Job ID` 和输出名两两唯一。20 件均为 `awaitingSave`，因为没有选择本地输出目录：**已生成并经审计不等于已写入用户磁盘**；两份独立来源媒体和字幕在执行前后 SHA-256 不变；20 任务不覆盖已打开的单工程草稿。
- 精确提交 CI 日志连续记录 `S10 BATCH20 verified 1/20` 至 `20/20`，每个均 `subtitle=pass`，最终 `S10 BATCH20: 20 real jobs / 20 independent MKVs ... PASS`。同一提交的 **632/632 Node** 及原有整个浏览器 E2E（`All browser E2E scenarios PASS`）均为绿色。
- 失败时测试保留机读 `softmux-s10-twenty-real-mkvs-evidence.json` 记录截至失败前逐项状态；CI `always()` 上传基准清单。成功时附带第 1、10、20 件实际 MKV 样本，供额外独立抽查。

## 证据的严格边界

本基准的 20 个来源**从两份真实、仅约 2 秒的独立媒体测试夹具重新复制并命名**。它证明同一会话内 20 个不同授权输入及输出身份、顺序执行、压缩字节内容保真、字幕和字体组合及稳定结果保留，**不证明**：

- 20 部不同长篇影视作品的解码/章节/复杂附件/大量样式现实多样性；
- 256 MiB／512 MiB／1 GiB／超过 1 GiB 的真实文件封装及有限内存设备压力；
- 真实 Android 平板触控、文件选择 API、OS 目录权限、多次浏览器重启和系统断电容错；
- 广义的复杂 Matroska UID/Chapter/Tag 任意编辑或任意播放器显示一致。

原 S10 中混合预期错误、仅重试保存与失败任务恢复另有 [PR #163](https://github.com/11576865/MKV-Fast-Muxer/pull/163) 的真实浏览器范围内验证；不能以这些单次夹具替代完整生产样本矩阵。

## 下一阶段阻断项（不得因此宣布 1.0）

1. **WU-03 真实单工程交付**：将现有轨道、附件、外部音频、ASS+字体、受限 Chapters/Tags 操作和可追踪保存状态按真实产品任务逐项打通及回归；不为已有功能造替代编辑器。
2. **S10 生产素材覆盖**：以真实长视频及不同比特率/字幕/字体来源扩充至少一组 20 成品持续执行、取消、保存失败/部分成功场景，并提供实际目标设备资源与最终产物证据。
3. **S12/S13**：分档真实媒体到超过 1 GB、Chromium 桌面与目标平板触控/保存验收。**1 GB 是非阻断三角警告阈值，不是 MKV 人为硬上限**；FFmpeg/Wasm 执行器支持范围与运行时内存成功率分开陈述。
4. **S14**：精确候选发布 SHA 的所有首发场景、旧功能继承、网页真实版本/部署和回滚合并验收。

此文档记录已经被完整 CI 证实的范围；不从一次成功推广到任意设备、任意输入或软封1.0 完成。
