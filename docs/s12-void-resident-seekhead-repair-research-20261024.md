# S12 研究原型：在现有 Void 空间内原位补全 SeekHead（严禁生产启用）

日期：2026-10-24。状态：独立研究模块，代码中所有票据都返回 `writerAuthorized=false`、`publicationAuthorized=false`。

## 所解决的实际缺口

PR #190/192/194 的真实 MKV 测试发现某些来源与浏览器成品 `SeekHead` 的全部引用中缺少 Cluster，导致 `INDEX_UNVERIFIED`。尽管对应的 Cues/Block 引用已能在实际来源和下载成品中独立验证，原始 SeekHead 不完整不能被误称为完整符合 RFC 9559 §6.3。

仅靠追加 SeekHead、扩大文件头或重排 Cluster 会改变 Segment-relative 偏移，要求重新计算 SeekHead、Cues、相关 CRC 与可能的未知索引引用。直接扩大正式写入器权限是不可接受的。因此本原型仅研究**第一 SeekHead 后面紧跟合法 Void、且保留了足够字节**的一种狭窄情形。

## 受限、无媒体重定位的算法

`planS12VoidResidentSeekHeadRepair(blob)`：

1. 使用已验收的 `inspectS12SeekHeadIndex` 和 `inspectS12CuesClusterLocations` 对输入实际 Blob 验证：仅允许原 SeekHead **已有引用全部有效、没有其它问题，只缺部分顶层引用**；原 Cues 必须已经全部指向正确 Cluster，或明确不存在 Cues。
2. 读取有限、末端精确的 Segment 顶层元素头；要求只有一个、位于最前的 SeekHead，后面必须**立即**跟随 Void；拒绝 Segment CRC-32，因为改变其子数据会导致父 CRC 失效。暂不处理第二 SeekHead、未知长度和不可信既有索引。
3. 用真实的各个顶层元素原有**Segment-relative 位置**，构造全量 SeekHead 条目。使用有界 EBML VINT 与最短安全 uint 编码并重新计算新 SeekHead 的 IEEE CRC-32。
4. 在**原 SeekHead + 后续 Void 的精确总字节区间**内放入新 SeekHead 与残余合法 Void。严格要求字节数完全相同；若预算不足、剩余 1 字节无法表示 Void、超过元素/补丁预算，都失败封闭。
5. 使用 `Blob([原文件前缀 slice, 小型补丁, 原文件后缀 slice])` 保留后面所有 Cluster、Cues、Tracks、Attachments、Tag 数据的原始偏移与字节，不将大型媒体数据读入 ArrayBuffer。之后再用独立 SeekHead 与 Cues 扫描器确认**新 SeekHead 完整、位置正确、CRC 有效，Cues 仍指向原来完全相同的 Cluster 位置**。

每次元素头读取最多 12 字节；仅生成最多 256 KiB 的小型索引补丁，最多 1024 个顶层元素。**不得以“研究 Blob 结构检查通过”推断媒体编码包、UID/TagTarget、嵌套 CRC、所有合法 MKV、用户设备永久保存或通用写入器安全。**

## 严格测试与后续

`tests/s12-void-resident-seekhead-repair.test.mjs` 使用真实有限 EBML Blob 与 3 MiB Block 数据，构造现有有效 CRC SeekHead 但缺 Cluster 引用、紧邻预留 Void、真实 Cues 的样本。测试会对重排前后的大段 Cluster 和 Cues EOF 内容进行独立 SHA-256 对比；另检查缺少 Void、预留字节不足、旧引用损坏、旧 CRC 损坏、Segment CRC、无 Cues 等边界。

此原型没有接入生产 UI、执行器或下载入口，也没有放开任何来源资格限制。待 Node 独立回归通过后，下一步才允许在 CI 内使用真实浏览器下载成品进行**试算/观察**，尤其需确定真实 FFmpeg/MKV 成品是否保留足够的紧邻 Void 空间。空间不足时必须返回无法修补的具体预算需求，禁止默默移动大型媒体。

规范参考：[RFC 9559 §6.3](https://www.rfc-editor.org/rfc/rfc9559.html#section-6.3)。
