# Softmux 分支整理 · 2026-11-03

远端清理前共124个分支，已与216个PR记录逐项比对，并对81个候选另取完整合并详情，核对分支现有SHA、PR最终head SHA及合并提交在main祖先中。只有准确匹配且没有后续提交的已合并分支进入清理清单。

| 分类 | 数量 | 处理 |
| --- | ---: | --- |
| 已合并且head准确匹配 | 81 | 先归档标签，再按SHA lease删除 |
| 未关闭PR工作分支 | 12 | 保留 |
| 未确认提交或无准确合并证据 | 28 | 保留，待单独审查 |
| 主干/系统/维护归档分支 | 3 | 保留 |

复用仓库已有`scripts/archive_reviewed_merged_branches.py`和10项保护测试。每次删除前，必须确认main仍承接已审查基线、PR确已合并到main、分支未受保护、准确head未改变、没有开放PR将其作为head或base。先建立`archives/mkv-merged-pr-<PR号>`恢复标签并回读确认，再以`git push --force-with-lease`删除；任何冲突或证据缺失都会保留该分支。

完整清单：`branch-archive-allowlist-2026-11-03.json`；全量盘点：`branch-inventory-2026-11-03.json`。远端执行只发生在原有`maintenance/archive-reviewed-merged-pr-refs`维护分支，产品main和所有开放PR均不参与合并。工作流会保存实际结果日志；删除计数以日志为准，本记录不预先声明81项均已删除。

## 恢复

若需恢复某个已清理分支，使用清单中的原分支名，将`archives/mkv-merged-pr-<PR号>`指向的提交重新创建为分支。标签必须指向清单中的准确SHA，不能用squash合并提交替代原分支历史。

## 本地整理

本地main已快进到远端稳定主干f1c914c；6个旧本地分支已删除，其提交均核实包含在对应远端已合并head中。现在保留3个本地分支：main、当前附件交付工作分支64d42a1和维护归档分支。工作区干净。

## 验证和状态

保护测试10/10通过；81项完整合并详情、准确head及main祖先核对通过。远端清理执行待工作流确认。UIGS Intake Check：复用既有准确合并head、归档标签和lease删除规则，无新的可复用知识或Canonical变更。
