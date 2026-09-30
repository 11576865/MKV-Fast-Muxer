# 0.8.2 Release Checklist

状态基线：`main`，版本 `0.8.2`。

## Automated gates

- [ ] `npm test` 全部通过
- [ ] `npm run build` 通过
- [ ] Chromium Browser E2E 全部通过
- [ ] GitHub Pages 主分支部署成功
- [ ] repository identity test 通过
- [ ] README / canonical / robots / sitemap 不包含旧仓库 slug `MKV-Fast-Muxer-v3`

## Release identity

- [ ] `package.json` version = `0.8.2`
- [ ] mux report `application.version` = `0.8.2`
- [ ] README Package version = `0.8.2`
- [ ] Pages URL = `https://11576865.github.io/MKV-Fast-Muxer/`
- [ ] repository URL = `https://github.com/11576865/MKV-Fast-Muxer`
- [ ] 产品名保持 `MKV Fast Muxer v3`

## Manual smoke test

建议至少在一个桌面 Chromium 与一个真实移动设备上验证：

- [ ] MP4 + ASS + 字体可以完成封装并下载
- [ ] MKV 扫描后可保留 / 编辑原音频、字幕与附件
- [ ] UTF-16 ASS 正常
- [ ] 多字幕与外部音频顺序、language、title、Default / Forced 正确
- [ ] 原附件默认折叠，展开后操作正常
- [ ] 取消当前任务后下一任务可正常运行
- [ ] 错误输入不会留下可误认的旧下载结果
- [ ] 夜间 / 白天 / 跟随系统正常
- [ ] 360–430px 窄屏无关键横向溢出
- [ ] 560–760px 小平板 / 横屏手机保持两列输入密度
- [ ] 桌面宽屏布局正常
- [ ] 最终 MKV 用桌面 ffprobe / MediaInfo 抽查轨道、附件、Chapter 与 metadata

## Release decision

只有自动化 gate 全绿且手工 smoke test 没有阻断问题时，再创建 `v0.8.2` tag / GitHub Release。

如果手工测试发现仅视觉性问题，可记录后进入 0.8.3；如果发现输出结构、轨道、附件、字幕编码或任务隔离错误，应阻止 0.8.2 发布。
