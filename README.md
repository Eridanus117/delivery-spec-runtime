# delivery-spec-runtime

工作 Spec、私人 Spec 与公开项目仓共用的公共 OpenSpec delivery 生命周期运行时。

## 内容

- `openspec/schemas/delivery-change/`：九层交付 schema 与模板
- `.omp/commands/`：九个 `/opsx-*` 生命周期命令
- `openspec/tools/`：入口、合同控制、相对软链、迁移和候选审查工具
- `openspec/contracts/`：机器可校验的状态合同
- `test/`：Node 合同测试

## 边界

本仓不保存任何真实 Change、长期业务规范或真实执行证据。资产仓通过 `.delivery-spec-runtime` Git submodule 的 gitlink 锁定运行时 commit，并以 `runtime-manifest.json` 声明的三个相对软链暴露 Commands、schema 与入口。`runtime-entry.ts` 对 gitlink、submodule commit、dirty 状态、manifest 和软链 fail closed；不维护第二份 lock 或复制投影。

## Runtime 自治理

本仓使用仓内 `openspec/changes/`、`openspec/specs/` 和 `delivery-change` schema 管理 Runtime 自身演进。每项演进必须形成独立 Change，通过功能分支、合同验证和 PR 交付；上游 OpenSpec 的文档与生成结果只是待审输入，不能自动覆盖本仓定制。

消费仓中的 `.omp/commands` 是指向 Runtime submodule 的相对目录软链。实时消费仓严禁执行 `openspec update`；`runtime-entry.ts runtime-update` 会在启动官方生成器前直接拒绝。OpenSpec 升级必须在 `delivery-spec-runtime` 的独立受控升级 Change 中使用隔离目录生成候选资产，比较上游与本地差异并完成多消费仓验证后再交付。

## 接入

```bash
git submodule add https://github.com/Eridanus117/delivery-spec-runtime.git .delivery-spec-runtime
node --experimental-strip-types .delivery-spec-runtime/openspec/tools/runtime-link.ts apply --asset-root .
git add .gitmodules .delivery-spec-runtime .omp/commands openspec/schemas/delivery-change openspec/tools/runtime-entry.ts
```

克隆资产仓或项目仓时必须初始化 runtime submodule：

```bash
git clone --recurse-submodules <asset-repository>
```

## 验证

```bash
node --experimental-strip-types --test test/*.test.ts
```
