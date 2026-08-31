# delivery-spec-runtime

这个仓库提供一套可版本锁定的 `/opsx-*` 交付工作流。项目仓通过 Git submodule 接入后，可以直接使用统一的 Commands、`delivery-change` schema 和治理工具，不需要复制 Runtime 源码。

## 什么时候使用

当一个项目需要可审计的需求、方案、实施、验收和归档流程时，使用本 Runtime。每个项目仍然保存自己的 Change、长期 spec 和交付证据；本仓只维护公共工作流及其版本。

接入后，项目仓获得：

- `/opsx-new` 到 `/opsx-archive` 的统一工作流；
- 九层 `delivery-change` schema；
- 执行前的 gitlink、受管投影、版本和工作树完整性检查；
- 由项目仓 commit 精确锁定的 Runtime 版本。

## 它怎么工作

```mermaid
flowchart LR
    User[用户执行 /opsx-*]
    Links[项目仓受管投影入口]
    Runtime[固定 commit 的 Runtime]
    Change[项目仓自己的 OpenSpec Change]

    User --> Links
    Links --> Runtime
    Runtime --> Change
```

项目仓的 `.delivery-spec-runtime` gitlink 是唯一版本锁；`.omp/commands`、`openspec/schemas/delivery-change`、`openspec/tools/runtime-entry.ts` 和 `.claude/skills/delivery-pilot`（Claude Code 交互指引）是从该固定 Runtime 复制并受哈希校验的受管投影（普通文件副本）。执行命令前，Runtime 会核对父仓 `HEAD`、submodule、工具版本、受管投影和工作树状态；状态不确定时直接拒绝执行。

## 快速开始

要求：Git、满足 `runtime-manifest.json` 的 Node 最低版本，以及其中锁定的 OpenSpec 精确版本。

### 1. 添加 Runtime 和受管投影

在项目仓根目录执行：

```bash
git submodule add https://github.com/Eridanus117/delivery-spec-runtime.git .delivery-spec-runtime
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-link.ts apply --asset-root .
```

### 2. 提交 Runtime 绑定

`runtime-check` 以父仓 `HEAD` 和 clean 状态为准，因此必须先在功能分支提交 gitlink 和四条受管投影：

```bash
git add .gitmodules .delivery-spec-runtime \
  .omp/commands \
  openspec/schemas/delivery-change \
  openspec/tools/runtime-entry.ts \
  .claude/skills/delivery-pilot
git commit -m "chore: adopt delivery spec runtime"
```

### 3. 验证接入结果

```bash
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-entry.ts \
  runtime-check --change-root .
```

通过标准：命令退出码为 0；父仓 gitlink、Runtime submodule、Node/OpenSpec 版本和四条受管投影全部满足合同（副本与 pinned submodule 逐文件哈希一致）。

接入后，Claude Code 会话可通过 `delivery-pilot` skill 自动获得交付流水线的驾驶指引：人用自然语言发起事项、在判断门以「同意 / 纠正 / 驳回」表态，其余由 agent 驱动底层 CLI 完成，无需记忆任何命令。

## 需求进入后的处理边界

需求尚未承诺实施时，先在项目自己的 Intake、Issue 或分析记录中澄清问题、来源、影响、边界和候选方向；可使用 `/opsx-explore` 调查代码与现有 spec，但不修改项目实现。决定进入正式交付后，再使用 `/opsx-new` 或 `/opsx-propose` 建立 Change。

Change 是正式交付的审计对象，不是聊天记录的替代品，也不要求另造一个统一的“需求分析.md”。它应按工件记录原始需求索引、正式 Requirement、业务/技术现状、方案决策、测试方案和实施任务；实现开始后，再追加任务状态、验证、Review、Acceptance、Spec Sync 和归档证据。具体边界和工件映射见[从需求到归档](docs/workflow-guide.md)。

## 开始第一个 Change

接入检查通过后，在 OMP 中创建项目自己的 Change：

```text
/opsx-new add-order-export
```

随后使用 `/opsx-continue` 生成下一项规划工件；方案批准后由 `/opsx-apply` 实施，完成后使用 `/opsx-verify` 进入 Review 与验收，并由 `/opsx-archive` 完成长期 spec 同步和归档门禁。

Workflow System 支持同一仓库的多套 profile。先执行 `runtime-entry.ts workflow list-profiles` 获取机器 JSON，或执行 `workflow catalog` 查看所有 Profile 的用途、适用范围、阶段和交接；需要单个版本时使用 `workflow describe --profile-id <id> --profile-version <version>`。之后在 Change 根执行 `workflow bind --profile-id <id> --profile-version <version>`；`workflow run` 必须同时指定该 Change 根和 request 文件，并校验 request 中的绑定与 Change 持久绑定一致。未绑定、版本不存在、请求不匹配、阶段越序、缺少阶段输入、输入结构不符或缺少人工判断时，Runtime 返回机器可读的拒绝或阻塞结果，不自动回退到其他 profile。

没有完整外部需求分析输入的事项可使用 `requirement-analysis@v1.0.0`：`capture → clarify ↺ → discover ↺ → evaluate ↺ → decision`。它要求结构完整的问题框架、现有能力核验、候选方案比较、决策报告和至少一项 `analysisRounds`；每轮记录 `round`、`stage`、`known`、`unknown`、`evidence`、`confidence`、`judgment` 和 `decision`。门 B 输出 `build`、`use-existing`、`defer` 或 `reject`。`build` 不会自动创建 Change，Desk 仍负责个人分析策略和事项归属。

## 三条安全边界

1. **不要在项目仓运行 `openspec update` 或 `runtime-update`。** OpenSpec 升级只能在 Runtime 仓的独立 Change 中评估。
2. **不要直接编辑 `.omp/commands/opsx-*.md`。** 它们是 Runtime 的确定性渲染物。
3. **不要绕过 apply 手工改动受管投影，或建立第二份 lock。** 更新版本时，在项目仓 Change 中提交新的 `.delivery-spec-runtime` gitlink，并在提交后重新运行 `runtime-check`。

## 进一步阅读

| 任务 | 文档 |
|---|---|
| 了解每条 `/opsx-*` 会做什么以及最终得到什么 | [从需求到归档](docs/workflow-guide.md) |
| 理解 gitlink、受管投影和 fail-closed 边界 | [架构与安全边界](docs/architecture.md) |
| 克隆、更新或修复项目仓 Runtime | [消费仓使用指南](docs/consumer-guide.md) |
| 修改 Commands、schema、contracts 或 Runtime 源码 | [Runtime 维护指南](docs/maintainer-guide.md) |
| 评估并提升 OpenSpec 版本 | [受控 OpenSpec 升级](docs/openspec-upgrade.md) |
| 创建、审查、验收和归档 Runtime 自身 Change | [Runtime 自治理](docs/governance.md) |

当前操作方法以 `docs/` 为入口；规范性行为以 `openspec/specs/` 和机器合同为准；`openspec/changes/archive/` 只保存历史证据；`AGENTS.md` 只约束 Agent 会话。
