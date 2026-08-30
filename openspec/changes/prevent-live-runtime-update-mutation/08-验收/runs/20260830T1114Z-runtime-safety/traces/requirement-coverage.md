# Requirement 覆盖

| Requirement | 场景 | 证据 | 结果 |
|---|---|---|---|
| 实时仓升级入口必须 fail closed | `实时资产仓拒绝runtime-update且不修改Runtime` | `../outputs/runtime-tests.tap` | PASS |
| 拒绝路径不得修改 Runtime 与父仓 | Commands 摘要、submodule/父仓 status、三条软链目标断言 | `../outputs/runtime-tests.tap` | PASS |
| 官方生成器可用时仍在生成前拒绝 | fixture 使用本机 OpenSpec 1.10.0，旧实现复现后新实现非零拒绝 | `../outputs/runtime-tests.tap` | PASS |
| 命令说明与失败语义一致 | `OpenSpec升级只允许通过Runtime仓受控Change` | `../outputs/runtime-tests.tap` | PASS |
| 消费仓现有运行时无新增失败 | 三仓 `runtime-check` | `../outputs/*-runtime-check.json` | PASS |
