# delivery-spec-runtime

这个仓库提供一套可版本锁定的 `/opsx-*` 交付工作流。项目仓通过 Git submodule 接入后，可以直接使用统一的 Commands、`delivery-change` schema 和治理工具，不需要复制 Runtime 源码。

## 什么时候使用

当一个项目需要可审计的需求、方案、实施、验收和归档流程时，使用本 Runtime。每个项目仍然保存自己的 Change、长期 spec 和交付证据；本仓只维护公共工作流及其版本。

接入后，项目仓获得：

- `/opsx-new` 到 `/opsx-archive` 的统一工作流；
- 九层 `delivery-change` schema；
- 执行前的 gitlink、软链、版本和工作树完整性检查；
- 由项目仓 commit 精确锁定的 Runtime 版本。

## 它怎么工作

```mermaid
flowchart LR
    User[用户执行 /opsx-*]
    Links[项目仓软链入口]
    Runtime[固定 commit 的 Runtime]
    Change[项目仓自己的 OpenSpec Change]

    User --> Links
    Links --> Runtime
    Runtime --> Change
```

项目仓的 `.delivery-spec-runtime` gitlink 是唯一版本锁；`.omp/commands`、`openspec/schemas/delivery-change` 和 `openspec/tools/runtime-entry.ts` 是指向该固定 Runtime 的相对软链。执行命令前，Runtime 会核对父仓 `HEAD`、submodule、工具版本、软链和工作树状态；状态不确定时直接拒绝执行。

## 快速开始

要求：Git、满足 `runtime-manifest.json` 的 Node 最低版本，以及其中锁定的 OpenSpec 精确版本。

### 1. 添加 Runtime 和受管软链

在项目仓根目录执行：

```bash
git submodule add https://github.com/Eridanus117/delivery-spec-runtime.git .delivery-spec-runtime
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-link.ts apply --asset-root .
```

### 2. 提交 Runtime 绑定

`runtime-check` 以父仓 `HEAD` 和 clean 状态为准，因此必须先在功能分支提交 gitlink 和三条软链：

```bash
git add .gitmodules .delivery-spec-runtime \
  .omp/commands \
  openspec/schemas/delivery-change \
  openspec/tools/runtime-entry.ts
git commit -m "chore: adopt delivery spec runtime"
```

### 3. 验证接入结果

```bash
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-entry.ts \
  runtime-check --change-root .
```

通过标准：命令退出码为 0；父仓 gitlink、Runtime submodule、Node/OpenSpec 版本和三条受管软链全部满足合同。

## 开始第一个 Change

接入检查通过后，在 OMP 中创建项目自己的 Change：

```text
/opsx-new add-order-export
```

随后使用 `/opsx-continue` 生成下一项规划工件；方案批准后由 `/opsx-apply` 实施，完成后使用 `/opsx-verify` 验收，并由 `/opsx-archive` 同步长期 spec 和归档证据。

## 三条安全边界

1. **不要在项目仓运行 `openspec update` 或 `runtime-update`。** OpenSpec 升级只能在 Runtime 仓的独立 Change 中评估。
2. **不要直接编辑 `.omp/commands/opsx-*.md`。** 它们是 Runtime 的确定性渲染物。
3. **不要复制 Runtime 文件或建立第二份 lock。** 更新版本时，在项目仓 Change 中提交新的 `.delivery-spec-runtime` gitlink，并在提交后重新运行 `runtime-check`。

## 进一步阅读

| 任务 | 文档 |
|---|---|
| 了解每条 `/opsx-*` 会做什么以及最终得到什么 | [从需求到归档](docs/workflow-guide.md) |
| 理解 gitlink、软链和 fail-closed 边界 | [架构与安全边界](docs/architecture.md) |
| 克隆、更新或修复项目仓 Runtime | [消费仓使用指南](docs/consumer-guide.md) |
| 修改 Commands、schema、contracts 或 Runtime 源码 | [Runtime 维护指南](docs/maintainer-guide.md) |
| 评估并提升 OpenSpec 版本 | [受控 OpenSpec 升级](docs/openspec-upgrade.md) |
| 创建、审查、验收和归档 Runtime 自身 Change | [Runtime 自治理](docs/governance.md) |

当前操作方法以 `docs/` 为入口；规范性行为以 `openspec/specs/` 和机器合同为准；`openspec/changes/archive/` 只保存历史证据；`AGENTS.md` 只约束 Agent 会话。
