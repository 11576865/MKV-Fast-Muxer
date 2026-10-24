# S12：原始大附件路径的来源资格门槛（只读 v0）

日期：2026-10-23

状态：**仅来源结构候选 / Writer NOT AUTHORIZED**。本实现不调用 FFmpeg、不创建新 MKV、不调用研究 SeekHead 修复器、不生成可下载 Blob，不为生产启用任意大附件重附加。

## 解决的问题

已验收的正式代码能够采用预算受限的分块比较，证明已生成 MKV 中保留的原附件 FileData 是否与源文件完全一致；研究分支在指定的真实浏览器场景中，借临时媒体-only 输入与原始 Attachments 主元素 Blob 视图重附加成功。但**源结构被扫描到**、**编辑意图没有修改原附件**、**允许执行某个 EBML 写入器**是三个不同判定，不能以“扩展名为 mkv、有一个 Attachments master、ffmpeg 返回零”直接合并。

本阶段仅实现第一个必要条件：`inspectS12OriginalAttachmentSource({reader,source,intent})`。其 `SOURCE_CLASS_CANDIDATE` 不等于可写入。返回的 `writerAuthorized` 与 `publicationAuthorized` 始终为 `false`。

## 源与身份

- 必须持有已经建立的 `createMatroskaAttachmentReader(source)`，并以 reader 内部的精确浏览器 `File` 引用核验当前 `source`。相同名字、大小、修改时间不构成授权。
- 重新执行只读附件库存和已有 S08 `inspectMatroskaPreservation`，不复用用户提交的旧 JSON 收据。扫描中途来源引用失效即拒绝。
- 库存只读取 EBML 元素头、名称、MIME、UID 等短文本；`FileData` 大块由偏移跳过，不进入 JS 内存。该检查不生成 FileData 哈希，也不声称任何 UID 引用图保真。

## 严格初始来源子集

来源必须含一个**长度已知且恰好到文件结尾的 Segment**，正好一个 Info、Tracks、Attachments 主元素，以及至少一个 Cluster；Attachment 对象非空、FileUID 唯一，文件名经大小写折叠后唯一，FileData 长度必须为正。

初始白名单仅允许顶层 `Info`、`Tracks`、`Cluster`、`Attachments`、`Void`。显式拒绝所有 `Tags`、`Chapters`、`Cues`、`SeekHead`、顶层 `CRC-32` 和未知顶层元素；这是一条严于当前普通 FFmpeg 路径的**候选识别白名单**。尤其是实际常见的 SeekHead/Cues，即使结构看似合理，也要等待独立索引/CRC/Cues 证明后才可能扩充允许子集。不得将“目前不可识别为候选”误读成“不合法 MKV”。

## 编辑意图

调用方必须给出与来源附加文件一一对应、顺序完全一致的显式意图，要求每个 `ordinal`、`FileUID`、`filename`、`mimeType`、`description` 与实际扫描一致，`include === true`，且不接受未识别的附件编辑字段。删除、改名、改 MIME、重新排序、少报或重复引用均拒绝。此条件只表达“没有要求修改原始附加对象”，而不是证明 FFmpeg 输出或 UID 图必然保留。

## 负例和后续验收门槛

Node 测试覆盖真正由 EBML 元素组成的最小候选来源、相同元数据不同 File、增删改排意图、Tags/Chapters/Cues/SeekHead/CRC 和未知元素、Segment 尾随字节、缺 Tracks/Cluster、名称碰撞，以及候选状态从不授权 writer。

在将研究级 Blob 重附加路径接入正式执行器之前，仍须独立完成：真实 FFmpeg 产生的目标 SeekHead 与有效 CRC、Segment VINT 和 Void 容量检查；来源 SeekHead/Cues/索引及嵌套 CRC 独立证明；来源 File 变化/取消/批量/工程恢复生命周期；高内存场景下真实 Browser + 目标平板持续执行；逐附件 FileData、UID、TagTarget、音视频包与用户端持久保存的分离审计。未来任何写入操作必须在执行边界重新获取来源与意图并重新校验，而不是相信本只读快照。

## 关联

- [软封 1.0 可执行验收规格](softmux-1.0-product-acceptance-contract-20261020.md)
- [S12 研究边界](https://github.com/11576865/MKV-Fast-Muxer/blob/softmux-s12-wasm-reattach-128-256m/docs/s12-original-attachments-browser-byte-lane-research-gates-20261023.md)
- [UIGS-Foundry S12 Candidate](https://github.com/11576865/UIGS-Foundry/blob/main/inbox/candidates/2026-10-22-softmux-large-original-attachments-media-only-wasm-byte-lane.md)
