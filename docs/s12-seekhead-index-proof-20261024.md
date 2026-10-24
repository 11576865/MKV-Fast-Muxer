# S12 SeekHead 索引证据：只读、有限读取、禁止写入

日期：2026-10-24

本实现是下一阶段大型原附件写入路径所需的**独立结构证明**，不修改任何 EBML 字节，也不开放研究级 Blob 重新附加路径。

## 已实现范围

`inspectS12SeekHeadIndex(file)` 对真实 File/Blob 执行有限读取（单次最多 32 字节），逐层定位 EBML DocType、精确有限长度的 Segment、其顶层元素，以及一至两个 SeekHead：

- `SeekID (0x53AB)` 必须为四字节真实 EBML ID；`SeekPosition (0x53AC)` 为最长 8 字节的安全整数；
- 每个 SeekPosition 相对于 **Segment 内容开始位置** 定位，而非文件起点；要求它恰好指向顶层元素头，并且元素 ID 符合 SeekID；
- 拒绝重复索引、悬空/错位目标、缺少其他应被索引的顶层元素；
- 第一个 SeekHead 必须为 Segment 的首个非 CRC 元素；如有第二个，它必须由第一个 SeekHead 指向，且第二个只引用 Cluster；
- 允许无 SeekHead 的来源返回 `NO_SEEKHEAD`，而不是误报“引用已校验”；有界解析异常保守返回 `INDEX_UNVERIFIED`；
- 全部结果始终返回 `writerAuthorized=false` 和 `publicationAuthorized=false`。

该模块只证明**原来源 SeekHead 指针与当前静态顶层元素位置匹配**。它不证明 SeekHead 在未来写出后的指针还能保持有效；不检查 Cues 子结构、Cluster packet、嵌套 CRC、其他 UID/Tags，不能代替文件写入后验证或用户保存证据。真实 Matroska 还可能使用未知大小 Segment；在本初始证明器中这种输入会保守拒绝，而不是声称文件非法。

## 测试与后续

`tests/s12-seekhead-index-proof.test.mjs` 构造真实有限 EBML Blob，包含大 Cluster 负载而只读取元素头，覆盖单 SeekHead 完整图、位置错位、ID 不一致、索引缺项与重复、首元素顺序、双 SeekHead 有效与无效引用、未知尺寸拒绝、缺失 SeekHead、未识别顶层四字节元素。通过 Node 和完整现有项目 CI 后才能合并。

后续独立工程阶段还需对实际 `mkvmerge` 大型样本及 FFmpeg/Wasm 输出运行前后索引校验；证明 SeekHead 与 Cues/CRC 修改后的重定位/校验和一致，再讨论授权写入。没有这些证据，不得将本模块的 `INDEX_REFERENCES_VERIFIED` 理解成可安全重封装。

依据：[RFC 9559 §5.1.1.1、§6.3](https://www.rfc-editor.org/rfc/rfc9559.html#section-6.3)。
