# 清理结果

- 升级评估临时生成根、candidate Runtime Git 仓、空白资产 fixture 和三个消费仓临时副本均由评估器 `finally` 删除。
- 最终报告记录 `temporaryRootsCleaned=true`、`realRepositoriesUnchanged=true`。
- 三个真实消费仓只计算 Git/文件摘要；before/after digest 全部一致。
- `/tmp/openspec-upgrade-request.json` 已删除。
- public candidate 仅保留脱敏 `candidate-report.json`；生成文件可由 allowlist 确定性重建。
- 未创建外部临时仓库，未直接写入默认分支。
