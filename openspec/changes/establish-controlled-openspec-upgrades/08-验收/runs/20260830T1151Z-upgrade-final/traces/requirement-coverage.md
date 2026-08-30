# Requirement 覆盖

| Requirement | 证据 | 结果 |
|---|---|---|
| 升级生成必须与实时仓隔离 | `upgrade-evaluation/upgrade-report.json` 的 `realRepositoriesUnchanged=true`、`temporaryRootsCleaned=true`；`outputs/runtime-tests.tap` 第 16-17 项 | PASS |
| Commands 必须使用唯一的结构化真源 | `outputs/runtime-tests.tap` 第 6-8 项；renderer check 为 9 files、0 drift | PASS |
| 升级差异必须机器可审计 | `upgrade-evaluation/upgrade-report.json` 的 `deltas.upstream/currentLocal/candidateLocal` | PASS |
| CLI JSON 合同必须跨版本验证 | `upgrade-evaluation/upgrade-report.json` 的 `probes.current/candidate` | PASS |
| 消费仓 smoke 不得写入真实仓 | 最终报告三个 consumer 均 PASS、before/after digest 相同 | PASS |
| README 必须是可执行的采用与维护入口 | `outputs/runtime-tests.tap` 第 11 项；README 两个 Mermaid 图及命令入口 | PASS |
| 候选提升必须通过完整门禁 | 最终报告 `result=PASS`、manifest pin `1.11.0`、完整合同 21/21 PASS | PASS |

偏差：无产品偏差。测试 reporter 首次因证据目录未预建退出 7；创建目录后未改代码或断言即成功，已保留在 `metadata.json.setupRetries`。
