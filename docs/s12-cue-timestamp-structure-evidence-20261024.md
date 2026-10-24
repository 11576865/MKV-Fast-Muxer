# S12 CueTime ↔ Cluster Timestamp + Block 相对时间证明

日期：2026-10-24。状态：代码及真实媒体专项验证候选，**只读、不授权 writer**。

## 证明缺口

PR #195 已验证 Cues 中的 CueTrack 确实存在于 Tracks，且引用的 Cluster 具有对应轨道的 SimpleBlock / BlockGroup.Block。但仅因 Cluster 里某处存在该轨道 Block，并不能证明 CueTime 对应正确播放位置：例如同一轨道在一个 Cluster 有多个不同时间的 Block，甚至 CueTime 被篡改，原验证依然可以报告 Block 头部存在。

依据 RFC 9559 §11.2，Block/SimpleBlock 内的 signed 16-bit 时间偏移是相对于 Cluster Timestamp 的 Track Ticks。默认 TrackTimestampScale=1.0 且没有 CodecDelay 的受限子集里，`CueTime === Cluster Timestamp + Block signed time offset` 可以由真实 EBML 字节独立验证。

## 实现边界

现有 `src/s12-cue-track-block-evidence.js` 保持通过/拒绝 Track/Block 存在性的原有证据状态，另增加独立的 `cueTimestampStatus`、`cueTimestampCheckedReferences` 和限量原因。遍历每个实际 Cue 引用的 Cluster 时，按元素边界读取 Cluster Timestamp，解析 SimpleBlock/BlockGroup.Block 的轨道 VINT 及 signed 16-bit 时间；不解码媒体负载。对具有 CueRelativePosition 的引用，只有真实 Cluster 子元素边界处对应的同轨道 Block 且时间匹配才可获得时间证明。没有 CueRelativePosition 时，必须在该 Cluster 内实际找到同轨道且时间相等的 Block，不能仅凭同轨道出现即宣告 CueTime 正确。

非默认 TrackTimestampScale 与非零 CodecDelay 仍可获得独立的轨道/Block 头部证明，但不得获得严格时间相等证明：目前尚未覆盖浮点 Track Ticks 换算、纳秒舍入与 CodecDelay，因此保守报告 `CUE_BLOCK_TIMESTAMP_UNVERIFIED`。

超过原有 Cluster 子元素预算时，独立时间证明返回未验证，不会错误提升其他结构证据。单次 Blob.slice 最多 12 字节，不读取完整 Block/Cluster 负载。该结果也不涉及关键帧标志、Cue 引用确实指向首帧、重封装前后媒体 packet 字节一致、加密编码、UID/Tag 关系或用户设备持久保存。

## 验收方法

Node 测试扩展到真实 EBML Blob：默认同轨道同时间、正负 signed 16-bit 时间、故意篡改 CueTime、位于媒体负载中而非真实子元素边界的相对位置、BlockGroup、非默认 TrackTimestampScale 与 CodecDelay。

S12 真实来源三档（128 MiB 原附件、512 MiB PCM、1000 MiB PCM）及实际浏览器下载成品分别运行独立时间证明，在本受限正例范围内要求全部 Cue 引用由真实 Block 时间支持。UI、writer 权限保持不变，不把旧的 Block 存在性验证伪装为已证明完整时间语义。

标准：[RFC 9559 §11.2 Block Timestamps](https://www.rfc-editor.org/rfc/rfc9559.html#section-11.2)。
