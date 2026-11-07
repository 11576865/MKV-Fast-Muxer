# Softmux V3.5 · 55 个可编辑设计状态索引与验收关口

**设计稿（独立 Figma 页面）：** <https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=60-2>  
**状态：DRAFT / 设计候选**。不修改原 V3-01—V3-11，不宣称生产 UI 已更新。

## 逐状态直达索引

每个链接对应一个 Figma 原生可编辑 Frame，而不是相同底图重复改标题的不可编辑 PNG。状态描述的是候选任务界面，不是已经通过 E2E 的交互结果。

| 状态 | 尺寸 | 设计场景 | 主要可见动作 | Figma |
|---|---|---|---|---|
| `A01` | 1440×900 | 来源统一载入 | 检查并选择拟输出 | [打开 A01](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=60-3) |
| `A02` | 1440×900 | 多源文件浏览 | 选择目标 | [打开 A02](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=60-89) |
| `A03` | 1440×900 | 未知来源诊断 | 重新检测 | [打开 A03](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-3) |
| `A04` | 1180×820 | 目录摄取 | 查看配对 | [打开 A04](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-87) |
| `A05` | 1440×900 | 跨容器来源/目标选择 | 选择目标 | [打开 A05](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-177) |
| `A06` | 1440×900 | 损坏 EBML 源 | 导出诊断 | [打开 A06](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-263) |
| `B01` | 1440×900 | 拟输出轨道编排 | 审核计划 | [打开 B01](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=60-175) |
| `B02` | 1440×900 | 流顺序调整 | 确认排序 | [打开 B02](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-349) |
| `B03` | 1440×900 | 轨道标记与语言 | 提交属性 | [打开 B03](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-439) |
| `B04` | 1440×900 | 外部音频 | 加入音轨 | [打开 B04](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-527) |
| `B05` | 1440×900 | 多字幕编排 | 审核字幕 | [打开 B05](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-613) |
| `B06` | 1440×900 | 追加保留策略 | 执行前检查 | [打开 B06](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-699) |
| `B07` | 820×1180 | 输出命名/元数据冲突 | 解决冲突 | [打开 B07](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-783) |
| `B08` | 1440×900 | 变更差异与冻结 | 冻结计划 | [打开 B08](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-860) |
| `B09` | 1440×900 | 多轨领域事务 | 确认批量应用 | [打开 B09](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=65-2) |
| `C01` | 1440×900 | 字幕时间导航 | 预览字幕 | [打开 C01](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-946) |
| `C02` | 820×1180 | libass 静态预览占位 | 重新渲染 | [打开 C02](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-1030) |
| `C03` | 1440×900 | 内封字幕提取 | 提取轨道 | [打开 C03](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-1107) |
| `C04` | 1440×900 | 字体依赖/字形覆盖 | 定位缺字 | [打开 C04](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-1191) |
| `C05` | 820×1180 | 缺字体诊断 | 补充字体 | [打开 C05](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-1277) |
| `C06` | 1440×900 | HarfBuzz 字体子集 | 生成预览 | [打开 C06](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-1354) |
| `C07` | 1440×900 | 指纹去重与重名 | 审核去重 | [打开 C07](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-1438) |
| `C08` | 1440×900 | 最终字体证据 | 导出交付报告 | [打开 C08](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-1522) |
| `C09` | 820×1180 | 强制统一字体 | 预览替换 | [打开 C09](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=65-76) |
| `D01` | 1440×900 | 任意附件观察 | 提取附件 | [打开 D01](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-1608) |
| `D02` | 1440×900 | 附件提取/哈希 | 保存附件 | [打开 D02](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-1694) |
| `D03` | 1440×900 | 新增外部附件 | 加入附件 | [打开 D03](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-1778) |
| `D04` | 1440×900 | 等字节附件替换 | 审核受限修改 | [打开 D04](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-1862) |
| `D05` | 1440×900 | Void 保留区变长替换 | 执行前验证 | [打开 D05](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=62-1946) |
| `D06` | 1180×820 | 章节/标签引用关系图 | 检查 UID | [打开 D06](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-3) |
| `D07` | 1440×900 | 复杂 EBML 高风险阻断 | 查看拒绝 | [打开 D07](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-89) |
| `D08` | 1440×900 | Data/Other 流保留 | 判断执行能力 | [打开 D08](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=65-146) |
| `E01` | 1440×900 | 批量配方 | 生成矩阵 | [打开 E01](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-175) |
| `E02` | 1440×900 | 字幕自动配对 | 解决缺项 | [打开 E02](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-261) |
| `E03` | 1440×900 | 匹配歧义冲突 | 确认配对 | [打开 E03](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-349) |
| `E04` | 1180×820 | 真实任务矩阵界面 | 执行已批准项 | [打开 E04](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-435) |
| `E05` | 820×1180 | 批量运行队列 | 取消当前任务 | [打开 E05](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-525) |
| `E06` | 1440×900 | 失败项独立重试 | 重试单项 | [打开 E06](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-602) |
| `E07` | 1440×900 | 仅重试保存 | 选择目录 | [打开 E07](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-688) |
| `E08` | 1180×820 | Group 字体策略 | 审核字体计划 | [打开 E08](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=65-220) |
| `F01` | 1440×900 | 封装执行预检 | 冻结执行 | [打开 F01](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-774) |
| `F02` | 1440×900 | 实际进度/取消 | 取消任务 | [打开 F02](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-860) |
| `F03` | 820×1180 | 独立多层验证结果 | 查看证据 | [打开 F03](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-946) |
| `F04` | 1440×900 | 成品保存回执 | 导出报告 | [打开 F04](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-1023) |
| `F05` | 1440×900 | 目标播放器兼容性 | 查看兼容证据 | [打开 F05](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-1107) |
| `G01` | 1440×900 | 工程草稿导出 | 导出 JSON | [打开 G01](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-1193) |
| `G02` | 820×1180 | 源身份核验后恢复 | 确认差异 | [打开 G02](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-1279) |
| `G03` | 1440×900 | 领域 Undo/Redo | 撤销变更 | [打开 G03](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-1356) |
| `G04` | 1440×900 | 就地专业帮助/诊断 | 打开说明 | [打开 G04](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-1442) |
| `H01` | 1440×900 | 完整空态载入目标 | 载入文件 | [打开 H01](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-1528) |
| `H02` | 620×900 | 紧凑对象聚焦 | 保存属性 | [打开 H02](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-1612) |
| `H03` | 1180×820 | 横屏平板工作台 | 审核封装 | [打开 H03](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-1674) |
| `H04` | 820×1180 | 竖屏上下文检查器 | 预览字幕 | [打开 H04](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-1760) |
| `H05` | 1440×900 | 不支持/配对错误 | 重新选择 | [打开 H05](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-1837) |
| `H06` | 620×900 | 1GB 非阻断警告 | 继续尝试 | [打开 H06](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=63-1923) |

## 具体的视觉设计检查

- **主要产品区域**：来源、拟输出、轨道、字幕、字体、附件、批量、验证、工程九个明确命名的持续入口。应在普通状态下无需猜图标和额外深层菜单即可找到。
- **源和输出不混淆**：来源观察只读；选中真实目标/空白目标并明确确认之后才有写入权威。无目标时不得显示“已冻结计划”或“可以封装”的假状态。
- **单一检查器**：当前对象的动作和字段在同一位置，不创建第二份可写 DOM。一级导航与上下文菜单不能成为另一份编辑状态仓库。
- **专业功能**：字体子集、强制统一、ChapterUID/Tag、受限附件替换、Data/Other、Group 字体等有可定位入口；受支持条件、写入门禁、失败解释不能藏在工具提示深处。
- **批量真正可使用**：E04 有任务矩阵而非说明卡片；E05 队列不同任务状态独立；E06/E07 区分重新执行与只重试保存；所有这些还需真实浏览器动作和输出检查。
- **平板/紧凑布局**：不是桌面 UI 等比例缩放。820×1180 使用上下文区；1180×820 使用多区域；620×900 不要求一个长滚动页面显示所有参数。
- **空态与错误态**：H01 中画布自身为载入命中区；H06 的 1GB 三角为 advisory 而非阻断；D07 受限编辑必须失败封闭。
- **预览**：C02 的媒体背景和字幕是明确标注的设计占位，不是录制自真实输入的 FFmpeg/libass 截图。实现验收应替换为真实来源、真实渲染并记录 provenance。

## 验收方法（不因完成 55 张设计图而豁免）

1. 对原 44 项能力的**实际最新源码**、真实工作台入口、动作深度、是否可达、真实输出状态逐一核查，不以本图的文本代替代码核查。参见同分支 `V35_55_STATE_FUNCTION_ENTRY_LEDGER_2026-11-07.md`。
2. 先做**Figma 设计冻结/变更权威决议**。原归档 V3-01 顶部标签 vs 当前 Figma V3-01 底部标签的冲突仍阻断直接替代；本页是候选分支，不替代原有已批准视觉基线。
3. 收敛主要工作区的密度、字段分层与图标；在匹配真实媒体夹具、相同字体、DPI、屏幕尺寸的条件下拍摄真实 Chromium 产品截图。不同资源数的静态设计图不能被算作像素 PASS。
4. 为每一组至少提供来源/目标身份、可写性边界、导航/失效、撤销、取消、失败、保存回执、真实 MKV 字节与独立审计的验证链。不要将“点击按钮跳转页面”替代用户任务完整闭环。
5. 明确用户批准以下变化后再进入生产重构：**批量成为 V3 一级入口**、九种常驻任务入口的视觉密度、原 V3 冻结源与新稿的设计权威关系；不要默默修改 Canonical。
6. 真机/辅助技术另测：物理平板触控、系统软键盘、旋转、键盘焦点、屏幕阅读器、OS 拖放、reduced-motion、大型真实 MKV 与用户侧保存。

## 当前完成与待定状态

- **Figma 层：** 55/55 唯一编号 Frame 已建立；文本与图形为原生可编辑节点；并非 55 组产品可执行代码。
- **视觉抽查：** 已检查统一来源页、ASS 竖屏预览、批量矩阵与空态导入；首批生成的 AutoLayout 白色列表间隔缺陷已修正。该抽查不等于 55 张逐帧视觉签核。
- **功能实现：** 本次未改 `src/`、`index.html`、`src/style.css`、正式默认路由或用户实际产品操作。此前 V3/legacy 的功能实现及 CI 证据保持原状。
- **设计漂移：** 原 V3 权威冲突仍为 BLOCKED；新视觉稿为独立 Draft。
- **发布：** Softmux 1.0 与生产 V3 默认切换仍不能宣告完成。

## 关联

- 原批准 V3 合同：`docs/ui-v3/UI_DESIGN_CONTRACT.md`
- 11 状态旧审查：`docs/ui-v3/V3_11_STATE_VISUAL_AUDIT_2026-11-07.md`
- 设计漂移：[PR #265](https://github.com/11576865/MKV-Fast-Muxer/pull/265)
- 功能及发布未闭环：[Issue #256](https://github.com/11576865/MKV-Fast-Muxer/issues/256)
