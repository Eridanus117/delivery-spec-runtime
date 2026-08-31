# Requirement 覆盖追踪

| Requirement / Scenario | 证据 | 结果 |
|---|---|---|
| versioned human-interaction asset / agent 可发现 | `test/interaction.test.ts` HI-001（frontmatter 与触发词断言）；本会话载体实际自动发现 delivery-pilot skill | PASS |
| versioned human-interaction asset / 内容完整性可校验 | `test/interaction.test.ts` HI-002 逐要素断言 | PASS |
| fold into three gates / 门口摆盘 | HI-003 断言（不替人过门、机器细节不入人审正文） | PASS |
| single active matter / 切换需声明 | HI-002/HI-003 文本断言覆盖「单事项在线」段 | PASS |
| consumer 可发现（第四条软链） | `test/submodule.test.ts`：apply 建出四条链、递归克隆后 runtime-check 通过 | PASS |
| fail-closed 覆盖第四条链 | `test/submodule.test.ts`：破坏 `.claude/skills/delivery-pilot` 后 runtime-check 非零退出且 stderr 含 delivery-pilot | PASS |
| existing contracts unchanged / 回归 | `outputs/full-tests.log`：52/52 通过；`outputs/render-check.log`：0 漂移；`outputs/validate.log`：10/10 strict 通过 | PASS |

## 偏差记录

- `outputs/full-tests-serial.log` 保存了一次失败运行：`openspec-upgrade.test.ts` 的消费仓 smoke 偶发失败（第二个合成消费仓 runtime submodule 偶现归档证据文件 M 状态）。已在**基线 commit（实现之前）重现同签名失败（5 跑 2 败）**，证明为既有 Windows git 竞态，非本 Change 回归；登记于 `openspec/intake/INT-20260831-010-upgrade-smoke-flaky-status.md`。失败日志按规保留，不覆盖。
- Fresh Review 由独立会话执行，零 OPEN finding，`implementation-review.json` result=PASS。
