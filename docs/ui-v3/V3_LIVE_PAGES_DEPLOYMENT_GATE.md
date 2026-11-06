# V3 默认界面：线上部署后的真实浏览器验收

本检查的目标是回答一个此前无法仅凭 PR 构建和主干合并回答的问题：**GitHub Pages 当前服务的网页，是否确实来自本次 `main` 提交，并实际加载默认 V3，而不是旧版页面或缓存？**

## 验收执行顺序

在 [`deploy-pages.yml`](../../.github/workflows/deploy-pages.yml) 的 **main push / workflow_dispatch** 路径中执行：

1. `build` 使用 `VITE_GIT_SHA=${{ github.sha }}` 构建。Vite 在 HTML 中写入 `meta[name="softmux-deployment-sha"]`。这仅是追溯标识，**不是媒体 File 权限或服务端认证令牌**。
2. `deploy` 使用 GitHub Pages deployment 结果发布构建产物。
3. 仅在实际部署完成后，`live-v3-acceptance` 使用 Ubuntu Chromium 访问真实 HTTPS `https://11576865.github.io/MKV-Fast-Muxer/`，要求 HTTP 200、同源以及与 `github.sha` **完全一致**的 HTML 标识。部署 CDN 更新允许有界重试（最多 10 次；不是静默无限等待）。
4. 等待实际 V3 DOM 载入，检查来源态、尚未确认目标时 `#muxBtn` disabled；再验证 `?ui=v3`、V3 菜单中的 `?ui=workbench`、`?ui=legacy`、未知模式的默认安全回退。
5. 记录默认首页及旧版工作台的真实 Chromium PNG 和 `.e2e/v3-live-pages/evidence.json`；若任一检查失败，上传失败截图，并让部署后验收 job 红灯，**不把“deploy 成功”谎报为“线上验收成功”**。

工作流在 **PR 分支** 只执行 `build`，部署与验收均跳过，因此 PR 的绿色构建**不能**证明线上已完成发布。必须在合并后的 `main` 上读取 `live-v3-acceptance` 的精确运行记录。

## 证据范围与限制

- 验证：发布代码的准确 SHA；实际 Pages HTTP/脚本加载；默认 V3；无目标禁写；旧工作台与原始诊断版回退；JavaScript 未捕获错误。
- 不验证：任意本地 File 上传、真实大媒体操作、任意 MKV/EBML 保真、所有设备的触摸/旋转/软键盘、屏幕阅读器、11 个 Figma 状态的同素材像素签核，以及软封 1.0 整体发布。
- **部署故障处置：** `deploy` 成功但 `live-v3-acceptance` 失败时，直接将线上状态标为 **DEPLOYED_NOT_ACCEPTED**。检查 `evidence.json` 的期望 SHA、实际页面错误和截图；不得把标识不符解释为“可能只是缓存”后无证据通过。
- **用户回退：** V3 内置“保留的旧工具 → 切换至上一版工作台”或地址 `?ui=workbench`；诊断入口 `?ui=legacy`。页面刷新前先下载未保存的 MKV、报告和工程草稿。

此工作流是已合并默认 V3 的**部署证据收口**，不修改 Figma 设计 Canonical，也不替代 [Issue #256](https://github.com/11576865/MKV-Fast-Muxer/issues/256) 的设备与辅助技术签核。
