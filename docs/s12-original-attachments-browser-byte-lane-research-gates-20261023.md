# S12 原始 Matroska 大附件：受限浏览器双路径的工程决策记录

Status: **Research candidate / NOT 0.1028 / NOT product executor authorization**
Evidence branch: [PR #181](https://github.com/11576865/MKV-Fast-Muxer/pull/181)
Exact accepted **individual** 256 MiB job: [CI #39892237747](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/39892237747), exact head `1073bbce96af3b510e4f1ca579c99067489551bb`
Main baseline: **软封 0.1027**. Source project contract: `docs/softmux-1.0-product-acceptance-contract-20261020.md`.

## 问题边界

旧的浏览器封装将源 MKV 原附件作为 FFmpeg.wasm 的 attachment AVStreams 映射输出，实际等总量实验中 128 MiB 通过、256 MiB 在不同对象数量下均发生 Wasm 内存故障。这个结论只适用于相应 Ubuntu/Chromium/Wasm 测试环境；不能升格为 256 MiB 普遍限制。0.1027 已使用 WORKERFS 优化来源载入，但不能解决巨型 FileData 参与 FFmpeg 输出头部的内存负担。

## 本次真实受限成功路径

1. 浏览器根据 **实际 File 对象身份** 使用 WORKERFS 为 FFmpeg.wasm 挂载原始 MKV，避免先复制整个源文件至 MEMFS。
2. FFmpeg.wasm 仅执行 `-map 0:v:0 -map 0:a:0 -map 1:s:0`，生成没有原附件流的真实音视频+新增 SRT 成品。完整实际 argv、返回码和日志留在研究收据中。映射鉴别只看 `-map` 后的轨道选择器，**不得把输出文件名中出现的 attachment 字样当成映射**。
3. 原始 MKV 中的完整 `Attachments` EBML 元素使用浏览器 `File.slice` 取得视图，重用原字节；不在 JavaScript 中整体复制 FileData。
4. 仅在新输出满足受限 FFmpeg Segment/SeekHead/CRC/紧邻 Void 的布局时，使用有界小规模补丁重写 Segment size、SeekHead 中的附件绝对相对位置和 CRC；原生 MKV 解析与附件 SHA 全量独立审计决定是否验收。
5. 2026-10-23 准确 CI 中 **256 MiB、4×64 MiB 原附件**实际浏览器 FFmpeg.wasm、Blob 重附加和下载均成功；输出 **268,479,375 字节**；原生 ffprobe/mkvmerge/mkvextract 和每个原附件 SHA/来源 SHA 通过。

## 现行 research-only 拒绝条件

| 条件 | 当前行为 | 原因 |
| --- | --- | --- |
| 原始 MKV 缺失唯一 Attachments master；目标基线已含原附件 | 拒绝 | 避免重复、错位或丢失 |
| 原始 MKV 存在 Tags 或 Chapters | 拒绝 | 不能证明 TagAttachmentUID、ChapterUID 或一般元数据对象图保真 |
| 输出 SeekHead 不在允许位置，没有有效 CRC 或缺紧邻 Void 容量 | 拒绝 | 不得凭拼接文件长度推导正确的寻址 |
| Segment 非单个有限、原始/输出 EBML 布局未知 | 拒绝 | 缺完整写入器权限 |
| 原始来源超出当前研究解析预算 | 拒绝 | 仅为研究预算，不代表产品大小限制 |
| 修改来源字节、成品缺少原轨/新字幕、独立附件提取 SHA 不一致 | FAIL | 必须验证成品，不能相信 FFmpeg 返回 0 就等价于保真 |
| 内存/超时/下载没有完成 | FAIL | 禁止将耗时、告警或部分输出标记 PASS |

该原型只处理研究页面中的单任务、2 秒合法视频/音频样本和 SRT；不声称对任意导入工程对象、批量、章节、Tag、UID、外部附件、字幕样式或平板保存生效。

## 推进到产品前必须完成

- **域模型门槛**：只允许明确选择“保留全部原附件且不编辑其 UID/元数据”的路径；更改任何来源附件的 include、name、MIME、UID、目标引用、原章节或标签时 fail closed 或退回已验收路径，不默默删除需求。
- **EBML 预检**：在开始耗时封装之前验证来源和目标布局约束；单独处理 Cues、其他 SeekHead、CRC master 和未知大小 Segment 的明确拒绝或结构保真证明。严禁仅凭“ffprobe 附件数量相同”授权写入。
- **生命周期**：每次绑定到同一个实际 File 和单次项目修订；修改输入文件/选项/工程版本则使先前扫描与产物证据失效；取消、超时与下载失联必须清理 WORKERFS/MEMFS/对象 URL。
- **真正成品验收**：至少 128/256 MiB 原附件 + 与之等效的多轨、多字幕、标签/章节拒绝和损坏 CRC 负例；增加 512 MiB 或以上、多个实际浏览器以及目标平板的内存、下载与持久保存观察。记录原完整 MKV 来源及每附件 SHA，成品必经独立解析。
- **发布决策**：完整范围可作为单独 0.1028 或更高候选 PR 提交，但当前 #181 绝不合并为生产路径，不提升 S12 总体状态为 PASS。

## 证据追溯

- [PR #174](https://github.com/11576865/MKV-Fast-Muxer/pull/174) 五组 128/256 MiB 总附件字节×对象数量，证明直接 FFmpeg.wasm 附件流封装在相同测试机上有 OOM 风险。
- [PR #175](https://github.com/11576865/MKV-Fast-Muxer/pull/175) 原生 FFmpeg 重封装+原附件 Blob 区间保留原型。
- [PR #181](https://github.com/11576865/MKV-Fast-Muxer/pull/181) 真实 Chromium FFmpeg.wasm 媒体-only + 256 MiB 原附件浏览器重附加受限成功。
- UIGS-Foundry 已有 `inbox/tests/2026-10-21-softmux-s12-original-attachments-blob-seekhead-native-browser-pending.md`，不创建重复 Canonical 规则。
