# Requirement 覆盖追踪

| Requirement / Scenario | 证据 | 结果 |
|---|---|---|
| plain-file copies verified / 无 symlink 环境接入 | 全量验证在未启用 core.symlinks 的 LF 克隆完成；submodule 测试断言四条投影 `isSymbolicLink()===false` 且内容与源逐字节一致 | PASS |
| 副本漂移被拒绝 | submodule 测试：改文件（tamper）、整体替换为普通文件、删除投影，runtime-check 均非零且指名路径 | PASS |
| gitlink 唯一锁 / 升级后旧副本刷新 | openspec-upgrade 消费仓 smoke：注入候选 runtime 后旧投影由 apply 自动刷新、runtime-check 通过；全仓无固化哈希清单 | PASS |
| 升级刷新与本地改动的区分 | submodule 测试：未提交 drift 内容 apply 拒绝、`--replace-managed` 修复；smoke 验证已提交旧版自动刷新 | PASS |
| legacy migration | submodule 测试：受管路径手工造旧软链 → check 给出迁移指引、apply 静默替换为副本 → check 通过 | PASS |
| existing contracts unchanged | `outputs/full-tests.log` 52/52；`outputs/render-check.log` 0 漂移；`outputs/validate.log` strict 全过（含 runtime-upgrade-safety MODIFIED delta） | PASS |

## 偏差记录

- 实施期发现方案盲点（升级场景：旧版投影与新 submodule 合法不一致），按「已提交干净=自动刷新、未提交改动=显式确认」补定迁移矩阵，spec delta 同步增补场景并重批准相关工件；该缺口由 openspec-upgrade 消费仓 smoke 首先暴露，修复后该测试通过。
- 无其他偏差；本轮全量运行未触发已知 Windows 环境偶发（INT-010/012）。
