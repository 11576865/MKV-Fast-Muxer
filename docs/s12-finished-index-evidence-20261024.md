# S12：真实成品 SeekHead / Cues 独立结构审计（待验收）

日期：2026-10-24。状态：**只读来源与输出结构验证，不开放原附件写入器**。

## 为什么需要输出侧验证

原始 MKV 的 SeekHead 和 Cues 全部匹配，不意味着 FFmpeg/Wasm 重封装之后仍然匹配。重封装会重新排列 Segment 内元素与 Cluster，原始偏移值不应被当作输出的正确值复用。因此，不能以 `source SeekHead PASS + source Cues PASS` 宣称最终 MKV 的索引保真。

`auditS12FinishedIndexEvidence({source,finished})` 要求**两个不同的、可切片的真实 Blob**，分别调用原来已验收的 SeekHead 和 Cues 只读扫描器。输出必须是浏览器实际下载、已通过原生流和附件核验的磁盘文件，由 Node `openAsBlob` 惰性打开。它不会读取整段大型 PCM Cluster，也不会重建/修改任何 EBML 数据。

## 结果分级

- `FINISHED_INDEX_POINTERS_SCOPED_VERIFIED`：最终文件的 SeekHead 顶层引用完整且 Cues → Cluster 引用逐条匹配。**这只表示最终文件本身的两套位置图局部成立，不表示来源到输出的 Cue 时间/轨道/包、附件 UID、TagTarget 保真。**
- `FINISHED_INDEX_CONTRADICTION`：实际最终文件中观察到错位 SeekID/SeekPosition、明确破损的 SeekHead CRC、错误的 CueClusterPosition / CueRelativePosition 或 Cues CRC。此类**已证明错误**将直接导致当前 S12 专项 FAIL，而非在产物归档时悄悄跳过。
- `FINISHED_INDEX_UNVERIFIED`：输出缺少相关索引、未知结构或顶层索引覆盖不足；**不得显示为校验通过**，但这类现有 FFmpeg 诊断缺失不自动推断出现确切字节破坏，仍可由当前非完整索引验收范围的真实媒体测试单独判断。
- `FINISHED_INDEX_PROBE_FAILED`、`NOT_RUN_INVALID_FILE_AUTHORITY`：探测失败或输入/输出不是独立对象，不得产出真实成品索引验收。

S12 真实媒体脚本将在完整媒体/字幕/原附件 native probe、实际下载和逐附件 SHA-256 之后，以独立的 `native-finished-index-structure-audited` 阶段写入收据。为避免把百级 Cluster 未建索引等真实缺口包装为通过，收据分别保存来源/输出 SeekHead、Cues 状态、声明引用数量、匹配数量，以及实际缺陷总数和有限样例。

## 禁止扩大结论

无论最终索引扫描结果如何，`writerAuthorized=false`、`publicationAuthorized=false`、`remuxEquivalenceProven=false`、`savedFileVerified=false` 恒定。本阶段不是新的 writer、UI 功能，也不保证所有合法 MKV 都满足有限 Segment / index 覆盖子集，不声称跨文件 packet 或 Tag/UID 保真。

本 PR 以已接受的 PR #190 及在审查中的 PR #192 为代码基础；需等待 #192 完成合并、把本改动无覆盖整合到新主干后，再通过精确提交的 Node、Chromium、128/512/1000MiB 真实媒体矩阵。不可使用前置 PR 的成功作业替代当前产物验收。
