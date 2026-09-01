# Runtime 维护指南

本文面向修改 Runtime 仓源码、Commands、schema 或机器合同的维护者。Runtime Change 的完整治理顺序见 [Runtime 自治理](governance.md)。

## 修改前

1. 从最新默认分支建立功能分支。
2. 在 `openspec/changes/` 建立 Runtime 自身 Change。
3. 完成需求、方案提案和维护者决策。
4. 仅修改已批准方案范围内的文件。

所有 Runtime 变更通过 PR 交付，不直接推送默认分支。

## 需求分析与 Runtime Change

Runtime 自身的需求也遵循“先分析、后立项”的边界。尚未承诺实施时，先在维护者使用的 Intake、Issue 或提案记录中澄清问题、影响、范围和候选方向；确认要修改 Runtime 后，再在 `openspec/changes/<change>/` 建立正式 Change。

Runtime Change 的 `01`～`07` 工件分别承载原始需求索引、正式 Requirement、现状（v6 起合并为一份）、方案与决策、测试方案和实施任务，不需要另造一个游离的需求分析文件。`/opsx-explore` 可以调查和形成工件，但不能修改 Runtime 源码；只有通过规划批准并进入 `/opsx-apply` 后，才允许实施。

消费仓的真实业务需求、账号、凭据、请求响应和交付证据不得写入 Runtime 仓。Runtime Change 只描述公共工作流和 Runtime 自身演进，消费仓通过 submodule gitlink 独立管理自己的 Change。

## 仓库职责

| 路径 | 职责 | 维护方式 |
|---|---|---|
| `runtime-manifest.json` | Node 最低版本、OpenSpec 精确版本和受管投影合同 | 受控 Change 修改 |
| `.omp/command-sources/manifest.json` | 九个 Commands 的声明真源 | 直接修改 |
| `.omp/command-sources/runtime-preamble.md` | 公共 Runtime 前置说明 | 直接修改 |
| `.omp/command-sources/bodies/` | 各 Command body | 直接修改 |
| `.omp/commands/` | 确定性渲染结果 | 只由 renderer 写入 |
| `openspec/schemas/delivery-change/` | 交付 schema（v6）和模板 | 与生命周期合同同步修改 |
| `openspec/contracts/` | JSON 机器合同 | 与解析、测试同步修改 |
| `openspec/profiles/` | profile registry 和版本化阶段合同 | 与 binding、request、result 合同同步修改 |
| `openspec/tools/` | Runtime 工具 | 保持 fail-closed 和确定性 |
| `test/` | 合同和 Git fixture 测试 | 防守可观察行为 |

源仓自用时直接执行源仓入口，不建立伪造的 submodule：

```bash
node --experimental-strip-types \
  openspec/tools/runtime-entry.ts runtime-check --change-root .
```

消费仓仍通过 `.delivery-spec-runtime/openspec/tools/runtime-entry.ts` 执行；两种入口都必须先通过 `runtime-check`。

## 本地效率指标基线

指标记录器只用于维护者明确指定的本地私有 state 目录，不把原始事件写入 Runtime 仓库、消费仓或远程服务：

```bash
node --experimental-strip-types \
  openspec/tools/metrics-control.ts append \
  --state-root <private-state-root> \
  --event-file <redacted-event.json>

node --experimental-strip-types \
  openspec/tools/metrics-control.ts summary \
  --state-root <private-state-root> \
  --profile-id <profile-id> \
  --profile-version <profile-version> \
  --window-start <UTC-start> \
  --window-end <UTC-end>
```

完成两轮汇总后，用 `compare` 生成 C/C+1 对照；它只接受候选 `slotCount` 比基线大 1 的报告：

```bash
node --experimental-strip-types \
  openspec/tools/metrics-control.ts compare \
  --baseline-file <c-summary.json> \
  --candidate-file <c-plus-one-summary.json>
```

按保留规则清理过期事件；`--before` 为不包含当天的 UTC 日期：

```bash
node --experimental-strip-types \
  openspec/tools/metrics-control.ts cleanup \
  --state-root <private-state-root> \
  --before <YYYY-MM-DD>
```

先记录当前并发 `C`，再考虑 `C+1`。对照只能改变 `slotCount`；不得把 `slotCount` 当作不可观测时的 `activeCount`，不得由记录器自动修改调度配置。原始事件应按本地保留规则清理，公共仓只保留合同、工具和合成测试。

## 修改 Commands

只修改 `.omp/command-sources/`。完成后执行：

```bash
node --experimental-strip-types \
  openspec/tools/render-commands.ts write --runtime-root .
node --experimental-strip-types \
  openspec/tools/render-commands.ts check --runtime-root .
```

### 预期结果

- `write` 只更新 manifest 管理的九个 `.omp/commands/opsx-*.md`；
- `check` 返回 `files: 9` 和 `changed: []`；
- missing、extra 或 modified 任一漂移都会非零退出。

不要直接编辑 `.omp/commands/`。需要 Mermaid 的 Command 使用标准 `mermaid` fenced block；只有目标表面不能渲染时才降级为简洁 ASCII。

## 修改 schema、contracts 或工具

- schema Artifact DAG、模板和批准门禁必须同步；
- JSON contract 字段变化必须同步解析器和可观察行为测试；
- 路径、摘要、Git 边界和临时目录校验必须 fail closed；
- 不为兼容旧输入添加隐式旁路；需要迁移时通过明确 Change 完成 clean cutover；
- 长期行为变化必须提供 delta spec，并在归档前同步到 `openspec/specs/`。

精确字段以对应 schema/contract 文件为准，文档不复制完整 JSON 结构。

## 聚焦验证

根据变更先运行最小聚焦测试，再执行最终验证：

```bash
node --experimental-strip-types \
  openspec/tools/render-commands.ts check --runtime-root .
node --experimental-strip-types --test test/*.test.ts
openspec validate --all --strict
```

### 完成标准

- Commands 无漂移；
- Node 合同测试 0 failed；
- 所有 active Change 和长期 specs 严格校验通过；
- 实际升级 Change 还保存完整升级 run、空白 fixture、消费仓隔离 smoke、public candidate 和清理证据。

## CI 门禁

仓库提供 `.github/workflows/ci.yml` 作为低频率 PR/main 验证：每个指向 `main` 的 Pull Request、`main` push 和手动触发各运行一次。它固定 Node `22.6.0`，通过 `npm exec --package=@fission-ai/openspec@1.11.0` 调用精确版本的 OpenSpec，并执行 `runtime-check`、Command drift check、全量合同测试和 strict validation。

CI 不使用定时任务、矩阵或外部消费仓；并启用同一 PR 的旧运行取消和 `contents: read` 最小权限，以减少无必要运行和网络访问。CI 只验证，不执行 renderer write、OpenSpec update、Runtime update、Change archive、PR 操作或部署。

## 失败处理

| 失败 | 处理 |
|---|---|
| renderer 报 missing/extra/modified | 修正 command sources 或重新 `write`，不要手修渲染物 |
| 合同测试失败 | 修复行为或合同真源，不降低断言或吞掉错误 |
| strict validation 失败 | 修复 delta/长期 spec 结构和 Scenario，不跳过校验 |
| Review 后文件变化 | 旧 Review stale；修复后重新派 fresh reviewer session |
| PR 反馈改变实现或规格 | 受控 reopen，重新执行 Review→Acceptance→Sync→Archive |

## 发布边界

最终 PR 只能在功能分支完成 Review、Acceptance、Spec Sync、Readiness、Archive 和 final validation 后创建。消费仓采用新 Runtime commit 由各消费仓独立 Change 处理，不阻塞 Runtime Archive。
