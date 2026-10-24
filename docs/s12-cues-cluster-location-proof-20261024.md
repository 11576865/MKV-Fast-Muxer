# S12 Cues → Cluster 只读位置证据（v0）

日期：2026-10-24

## 目的和硬性边界

现有 SeekHead 索引检查针对容器顶层元素，**不能**证明 Cues 内某个 CuePoint 是否指向真正的媒体 Cluster。依据 RFC 9559 §5.1.5，CueClusterPosition 相对于 Segment 数据区起点，并指向关联 Block 所在 Cluster。这个新检查器将两种索引证明分开。

`inspectS12CuesClusterLocations(file)` 是独立、只读、有限预算的浏览器 File/Blob 扫描器。只检查已观察到的 CueTrack/CueClusterPosition 与真实 Cluster 顶层元素头的位置一致，以及可选 CueRelativePosition 是否位于该 Cluster 数据范围之内。一次 `Blob.slice` 请求不超过 32 字节，遍历顶层元素时跳过 Cluster 媒体负载和全部原附件 FileData，不创建或修改任何输出。

- 一个 DocType=matroska、有限大小且到文件末尾的 Segment；
- 单个 Cues Master、至少一个 Cluster；没有 Cues 单独返回 `NO_CUES`，不得与成功混淆；
- CuePoint 要求非空 CueTime 和 CueTrackPositions；CueTrack 为非零正整数；CueClusterPosition 必须精确匹配 Cluster 顶层头偏移（Segment-relative）；
- 验证 Cues/CuePoint/CueTrackPositions 中所见 CRC-32，错误校验和、错位、非法载荷或者超过有界预算均 fail-closed；
- 未通过则返回 `CUES_UNVERIFIED`。只有已检查的局部指针才能返回 `CUES_CLUSTER_POINTERS_VERIFIED`，不证明整个 Matroska 的可播放性。

即使全部通过，`writerAuthorized=false`、`publicationAuthorized=false` 仍恒定。没有验证 CueTime 与实际编码包时间戳的相等性，没有确认 CueTrack 是否存在于 Tracks 或 CueRelativePosition 指向的是可解码 Block，也没有证明 FFmpeg 重封装后 Cluster 位置和 CRC 不变。

## 验收和剩余结构工作

Node 真实 EBML Blob 夹具包含多 MiB 不读取的 Cluster，验证 CueClusterPosition 正例、偏移一字节、CueRelativePosition 越界、正确或破坏的 CRC、零 Track、重复 Cues、无 Cues 和未知大小 Segment。需在独立 CI 通过后纳入生产只读证据层，**不能**由本阶段开放 Blob 原附件重附加器。

下一步还需用 native mkvmerge 创建的真实大型 Matroska 来源验证每条 Cues 引用，之后对真实输出重复检验，并另行验证轨道映射、Block/packet、SeekHead 与 Cues 重定位、各级 CRC/UID/标签图、取消和实际持久化。

规范：[RFC 9559 §5.1.5](https://www.rfc-editor.org/rfc/rfc9559.html#section-5.1.5)、[RFC 8794 §11.3.1](https://www.rfc-editor.org/rfc/rfc8794.html#section-11.3.1)。
