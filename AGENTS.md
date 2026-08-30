# 共享Spec运行时仓规则

- 本仓是公开共享运行时，只保存 OpenSpec `delivery-change` schema、九个 OMP Commands、TypeScript 工具、合同测试和明确允许的合成或审查后脱敏示例。
- 禁止保存工作或私人 Change、业务 capability specs、账号、凭据、环境、请求响应、trace、run-id、release-id、Speckit、`.specify` 或同义兼容资产。
- TypeScript 通过 `node --experimental-strip-types` 执行；测试使用 Node 内置 `node:test`，不得新增 shell runner。
- runtime 只通过资产仓 `.delivery-spec-runtime` Git submodule 接入；`runtime-manifest.json` 只声明三个相对软链。禁止恢复复制投影、`runtime-lock.json` 或第二套 commit/hash lock。
- 不创建 Git remote 或 push，除非维护者当轮明确授权。
