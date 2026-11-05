# Softmux V3 — 当前交付验收台账

**更新日期：2026-11-05。状态：Draft / 未验收 / 不得自动合并。**
**当前审查代码 HEAD：** `411168923690a6848cbd940e4f96f6211aab4918`。
**最新完整交付审查和唯一优先级决议：** [V3_DELIVERY_GATE_2026-11-05.md](./V3_DELIVERY_GATE_2026-11-05.md)。
**权威设计合同：** [UI_DESIGN_CONTRACT.md](./UI_DESIGN_CONTRACT.md)。

| 交付门禁 | 当前可证明的状态 | 不可越过的边界 |
| --- | --- | --- |
| 来源观察与无隐式拟输出、目标明确选择、来源身份 | 上一已验证 HEAD `cc0c432f` 有真实 Chromium 证据 | 不是最终视觉签核 |
| A→B SubRip、ASS+内封字体、封装/下载与独立媒体检查 | `cc0c432f` 完整 Browser E2E / S12 通过 | 单独的受限媒体用例不能证明所有 MKV 结构保真 |
| 来源 ASS 预览、原轨提取、字体附件观察与标记说明 | 上一提交已通过 V3/Browser E2E；使用同一原生执行器 | 观察到附件 ≠ 证明字体闭包 |
| 拟输出主轨道与高级信息的首屏层级 | **P0 已提交实现，验收待新 HEAD CI：** 原轨道优先、恢复点后移、章节/标签默认收起；四视口真实 MKV 断言已补 | 代码提交不等于首屏截图和人工视觉签核通过 |
| 初始空态直接点击与 drag/drop 双路径 | **P0 已增加真实浏览器测试、结果待 CI**：全画布原生 `#assetDropzone`、鼠标坐标点击真实 file chooser、`DataTransfer`/drop 实际 MKV | 未声称实体 OS 文件拖动已验证；没有平行 importer |
| 最新代码 HEAD 的 CI | `411168923` 对应 V3 / Browser E2E / S12 / Pages 审查时均为 **queued** | 不继承 `cc0c432f` 的 success |
| 整体视觉 + 真实设备 + 无障碍签核 | P1 开放 | 浏览器模拟触控与不同 fixture 的视觉配对不是最终批准 |
| 合并 `main` / 取代旧版 UI | **禁止**；PR #239 仍为 Draft | 必须遵守设计合同的全局签核和独立合并审查 |

**执行顺序：** 先一次性整改 P0 首屏信息架构与空态实际导入 → 同一代码 HEAD 做完整真实任务与 CI → 对全部 Figma 状态、实体设备和无障碍集中签核。P2 局部细节不再自动成为独立交付轮次。

---

## 历史 WU-03 验收台账（保留作溯源，**不是最新状态**）

以下是较早提交 `489be3f` 时的历史记录；其中 ASS+字体能力等阶段性“BLOCKED/NOT RUN”状态已不再代表当前实现。任何冲突以本页上方当前表格与完整交付审查为准。

**Status: DRAFT / NOT ACCEPTED / NEVER AUTOMATIC MERGE.**

Design: [approved V3 in Figma](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=28-2).
Implementation: [Draft PR #239](https://github.com/11576865/MKV-Fast-Muxer/pull/239).
Latest evidence-bearing code SHA: `489be3f00b1ceec56ab895d93172395825bf779f`.
[Exact-head V3 CI #41767751720](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/41767751720): PASS (unit/build + real browser WU-01 and A→B SubRip WU-02/03). Uploaded screenshot/evidence archive: artifact `13293213307`.

| Gate | Status | Evidence or explicit blocker |
| --- | --- | --- |
| Real source MKV observation without implicit output-document construction | PASS, bounded | E2E WU-01 checks 1440 desktop source and absence of `compositionTracks` output rows |
| Exact source/target File identity, explicit target, cancellation | PASS, bounded | V3 WU-02 unit and real Chromium |
| A-with-SubRip → B target output and native `ffprobe` | PASS, bounded | Real output stream codec/metadata audited; inputs' SHA-256 unchanged |
| Source view read-only even after target authorized | PASS, bounded | Native guard + disabled affordance + Chromium blocked include-field event |
| Target removal revokes output state and mux | PASS, bounded | Chromium source-drawer removal scenario |
| V3 exact Figma SVG asset downloads and browser image load | PASS, source-first slice | 20 exported icons, local `src/v3-assets`, nonzero visible icon slots |
| Static approved visual reference captured and pinned | AVAILABLE | Five PNGs in `docs/ui-v3/reference`; mock data, not browser results |
| **Paired browser/Figma screenshot geometry and pixel diff** | NOT RUN | Need exact viewport/device scale/fixture/font; static data differs |
| Desktop icon+type hierarchy, spacing, color, contrast review | PARTIAL | SVGs in source screen; font, row grouping, adaptive density not approved |
| 1180 landscape / 820 portrait / 620 compact real adaptive parity | NOT ACCEPTED | Width smoke screenshots exist; reflow/interaction and intermediate widths need review |
| WU-04 bottom sheet, source drawer, contextual per-object actions | PARTIAL | Real source drawer; approved sheet/drag/help states not yet reproduced |
| Approved animation prototype + browser motion validation | NOT RUN | Figma V3 motion tracks not yet approved; honor reduced-motion |
| Exact real ASS + font attachments cross-container closure | BLOCKED | Separate unmerged PR #233 must be tested and explicitly approved |
| Full legacy browser E2E / S12 on final implementation SHA | VERIFY EXACT HEAD | Previous passes are not inferred for later docs-only commits |
| Release / merge to `main` | BLOCKED | All of the above must be accepted, no silent design substitution |

Do not compute a synthetic global visual-match percentage with mismatched static/dynamic text. Instead compare anchored component geometry, extracted reference palette, icon slots, text/overflow, actual functionality and matched-state screenshots, then record reviewed differences and exact commit SHA. Use a separate visual report for each viewport. A passing V3 CI cannot be promoted to full product acceptance.
