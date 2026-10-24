# S12：Cues → Tracks → Cluster Block 头部来源与真实成品双侧验收

日期：2026-10-24。状态：新增只读证据与真实媒体专项，不授权任何写入器。

## 需要补的证明

现有 `inspectS12CuesClusterLocations` 能够证明每一条 CueClusterPosition 指向某个 Segment 内的真实 Cluster 元素头，但不能证明 `CueTrack` 在 `Tracks` 中存在、或者这个 Cluster 中真的具有该轨道的 `SimpleBlock / BlockGroup.Block`。仅靠偏移存在就宣布完整 Cues 可用，将掩盖 TrackNumber 错误、缺失实际帧以及 CueRelativePosition 指向非 Block 区域的问题。

新增 `inspectS12CueTrackBlockEvidence(file)` 以 **实际来源 Blob 或浏览器下载后的完整 MKV Blob** 为对象，先沿用已经验收的 CueClusterPosition/CRC 检查，再检查：

- 读取真实 Tracks Master、TrackEntry 与 TrackNumber；识别无轨道、重复轨道编号、编号为零及预算超限，不以 FFprobe 元数据或来源文件名替代 EBML 证据。
- 对每个被 Cues 引用的 Cluster 检查实际的 SimpleBlock 或 BlockGroup 内的 Block 头部，用 EBML 变长整数解析 Block 的 TrackNumber。**不会读取或解码整段媒体包。**
- 对包含 CueRelativePosition 的引用，必须证明给定偏移在该 Cluster **真正的直接子元素边界**，且恰好是对应轨道的 SimpleBlock / BlockGroup；不接受在任意媒体 payload 偏移处伪造的“看似 Block 的字节”。
- 对没有 CueRelativePosition 的引用，在严格子元素扫描预算内，必须找到该 Cluster 内至少一个属于 CueTrack 的真实 Block。不能证明时返回 `CUE_BLOCK_EVIDENCE_UNVERIFIED`，禁止假冒成功。
- 单次 Blob.slice 读取最多 12 字节，Cluster 子元素最多 4096 次、全局元素头访问最多 220000 次，最多 50000 Cue 引用、最多 256 条轨道；超过任一预算为未验证，不引入下载或写入权限。

仅当上述全部检查成功，才返回 `CUE_TRACK_BLOCK_HEADERS_VERIFIED`。这只证明 Track/Block **头部关联**，不自动推导 CueTime 成立。始终明确 `writerAuthorized=false`、`publicationAuthorized=false`、`actualPacketPayloadVerified=false`、`uidGraphVerified=false`、`savedFileVerified=false`。

## 独立的 CueTime → Block 时间证明

新证据字段与原头部证据严格分离：`cueTimestampStatus`、`cueTimestampCheckedReferences`、`cueTimestampReasons`；仅当每一条引用均在真实 Cluster 内找到同轨道、同 CueTime 的实际 Block，且原有头部证明也全部成立时，才返回 `CUE_BLOCK_TIMESTAMP_SCOPED_VERIFIED`。

- 时间等式为 `CueTime = Cluster Timestamp + Block signed-16-bit relative timestamp`。仅接受 `TrackTimestampScale = 1` 且 `CodecDelay = 0` 的有限子集；不猜测非默认缩放或延迟的舍入/单位行为。
- 有 `CueRelativePosition` 时，所匹配的时间与轨道还必须来自那个真实的直接 Cluster 子元素边界；否则只匹配同轨道的 Block 仍不足以证明 Cue。
- **头部扫描和时间扫描分别计费**：头部扫描仅做到每条 CueTrack / 相对位置的实际 Block 证明；时间扫描在独立的 220000 次元素头预算及每 Cluster 4096 子元素限制内完成。非默认缩放/延迟的轨道直接标为时间不可证明，不无谓扫描整个 Cluster。
- 每个 Cluster 只建立一次 `(TrackNumber, signed ticks) → Block 边界集合` 索引，以 O(B+R) 逻辑匹配该 Cluster 中的 B 个 Block 与 R 条 Cue 引用，不对每条 Cue 重扫已经读取的所有候选。
- 时间预算耗尽、缺少 Cluster Timestamp 或时间不匹配时，只令时间证据 `UNVERIFIED`，**不能撤销独立已完成的 `CUE_TRACK_BLOCK_HEADERS_VERIFIED`**；所有媒体载荷仍保持只读、跳过。时间与轨道头部证明均不能替代 packet/关键帧/音视频解码与来源输出等价性审计。

## 工程验收

本阶段在现有 S12 的真正浏览器封装、下载到磁盘、原生 FFprobe/附件 SHA 以及 SeekHead/Cues 位置审计之后，对**不同的真实来源与真实成品**再分别运行 Track/Block 只读检查。现有三档 128 MiB 原附件、512 MiB PCM、1000 MiB PCM 为明确正类，需双侧全部引用验证通过才能通过该新增专项；不能用仅命中 Cluster 的旧正类替代。

Node 真实 EBML Blob 回归包含 3 MiB 未读取 Block 载荷，以及：存在的轨道/Block、CueTrack 不在 Tracks、Tracks 有轨道但目标 Cluster 没有相应 Block、精确和错位的 CueRelativePosition、BlockGroup.Block、损坏的 Block Track VINT、扫描预算拒绝及无 Cues。

## 严格的剩余边界

仅通过上述索引与受限时间等式，**不能**推断 Block 是否可解码、关键帧位置正确、来源与输出 packet 逐字节同一、任何加密或 Header Stripping 语义正确、嵌套 CRC/附件 UID/TagTarget、重封装安全及用户设备的持久保存。不得对未检查的 MKV 类型宣称可通用重封装。

标准参考：[RFC 9559 第 5.1.5 节](https://www.rfc-editor.org/rfc/rfc9559.html#section-5.1.5)、[第 10/11 节 Cluster/Block 结构](https://www.rfc-editor.org/rfc/rfc9559.html)。
