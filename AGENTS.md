# 共享Spec运行时仓规则

- 本仓只保存 OpenSpec `delivery-change` schema、九个 OMP Commands、TypeScript 工具、合同测试和明确允许的合成或审查后脱敏示例。
- 禁止保存工作或私人 Change、业务 capability specs、账号、凭据、环境、请求响应、trace、run-id、release-id、Speckit、`.specify` 或同义兼容资产。
- TypeScript 通过 `node --experimental-strip-types` 执行；测试使用 Node 内置 `node:test`，不得新增 shell runner。
- 安装投影和公开候选默认拒绝未知路径；更改公开允许清单必须同时更新合同测试。
- 不创建 Git remote 或 push，除非维护者当轮明确授权。
