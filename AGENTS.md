# 共享Spec运行时仓规则

- 本仓是公开共享运行时，只保存 OpenSpec `delivery-change` schema、九个 OMP Commands、TypeScript 工具、合同测试和明确允许的合成或审查后脱敏示例。
- 禁止保存工作或私人 Change、业务 capability specs、账号、凭据、环境、请求响应、trace、run-id、release-id、Speckit、`.specify` 或同义兼容资产。
- 本仓自己的 `openspec/changes/`、`openspec/specs/` 和交付证据只治理 Runtime 自身演进，不属于上一条禁止的工作或私人业务资产；上游 OpenSpec 升级必须经仓内 `delivery-change`、合同验证和 PR。
- TypeScript 通过 `node --experimental-strip-types` 执行；测试使用 Node 内置 `node:test`，不得新增 shell runner。
- runtime 只通过资产仓 `.delivery-spec-runtime` Git submodule 接入；`runtime-manifest.json` 声明四条受管投影（普通文件副本，由 `runtime-check` 逐文件哈希对照 pinned submodule 实时校验）。禁止无校验的副本（理由：查不出漂移的副本会让消费仓悄悄偏离锁定版本）；禁止 `runtime-lock.json` 或任何第二套 commit/hash lock（理由：版本真源只能有一个，两把锁不一致时没人知道哪个算数）。
- 本文件的硬规则须随附一句大白话理由（理由：没有理由的规则，几天后连立法者都无法复审它是否还成立）；既有条目的理由随后续 Change 增补。
- 不创建 Git remote 或 push，除非维护者当轮明确授权。
- GitHub 相关操作（查看、创建、更新、合并 PR，Issue 和 Actions）必须使用 `gh` CLI；禁止改走浏览器，除非维护者明确要求浏览器交互。
- 交付流水线校准期（2026-08-31 起，至 3 事项复盘检查点）：agent 在每站完成时把该站产物以一屏内摘要摆给维护者过目；维护者的不耐烦反馈即为「该站取消人工审阅」的裁剪信号，记录并在复盘时消费。资产写盘与人工审阅解耦：写盘服务 agent 上下文与审计，不因取消审阅而停写；复盘时另按「下游是否被消费」裁剪写盘清单。
