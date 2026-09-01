# Runtime 自治理

本文面向修改 `delivery-spec-runtime` 自身的 Change 维护者。它说明阶段顺序和责任边界；机器状态以 `delivery-control.ts`、`delivery-lifecycle.ts` 及对应 JSON contracts 为准。

## 真源分层

| 内容 | 权威位置 | 规则 |
|---|---|---|
| 当前操作方法 | `README.md`、`docs/` | 帮助读者执行任务，不复制机器合同 |
| 长期行为要求 | `openspec/specs/` | 规范性 MUST/SHOULD 和 Scenario |
| active Change | `openspec/changes/<change>/` | 当前需求、决策、任务和证据 |
| 历史 Change | `openspec/changes/archive/` | 审计证据，不作为当前 runbook |
| Artifact 批准 | `artifact-approvals.json` | 批准状态真源。第 2 版按「人真实表态一次记一条」记：一条门批准覆盖那一刻的全部工件，但每份工件的内容哈希仍逐一记录，改了哪一份就失效并点名。门的清单由站位定义里 `humanJudgment` 为真的站推导，不另立第二份清单。 |
| 实现任务 | `task-state.json` | 任务状态真源；07 Markdown 仅是投影 |
| Review/Acceptance/Readiness | `implementation-review.json`、`acceptance-state.json`、`archive-readiness.json` | 生命周期门禁真源 |
| Runtime 执行合同 | manifest、schema、contracts、tools | 程序校验权威 |
| Agent 规则 | `AGENTS.md` | 只约束 Agent 会话 |

## 生命周期

```mermaid
flowchart LR
    Proposal[Proposal] --> Decision[Decision]
    Decision --> Implementation[Implementation]
    Implementation --> Review[Fresh Review]
    Review --> Acceptance[Acceptance]
    Acceptance --> Sync[Spec Sync]
    Sync --> Readiness[Readiness]
    Readiness --> Archive[Archive]
    Archive --> Validation[Final Validation]
    Validation --> PR[PR]
```

顺序不可交换。最终 PR 只能在功能分支完成归档和 final validation 后创建。

## 需求分析与立项边界

需求分析不自动等于 Runtime Change。尚未决定实施时，先记录原始问题、来源、可核验观察、影响、边界和候选方向；可以调查仓库和比较方案，但不修改实现。只有维护者明确决定交付，才创建 `openspec/changes/<change>/` 并进入下表的 Proposal 阶段。

一旦建立 Change，分析内容必须分散落到其语义工件，而不是另造一个统一的“需求分析.md”：`01` 保留原始需求与来源，`specs/` 归一化 Requirement 和 Scenario，`05-改造方案/方案提案.md` 记录现状与候选方案（v7 起现状并入这里），`05-改造方案/方案决策.md` 记录维护者的选择，`06` 记录测试方案，`07-实施任务/实施任务.md` 记录实施切片与任务清单（v7 起改造方案并入这里）。这样，需求结论才会被批准、实施、Review、验收和归档门禁实际消费。

Runtime 自治理只处理 Runtime 公共资产及自身 Change；消费仓业务需求和交付证据必须留在消费仓，不得写入 Runtime 仓。

## 建立 Change

```bash
openspec new change <ascii-kebab-slug>
openspec status --change <change> --json
node --experimental-strip-types openspec/tools/delivery-control.ts init \
  --change-root openspec/changes/<change> \
  --slug <change> \
  --display-name "<中文展示名>" \
  --mode delivery
node --experimental-strip-types openspec/tools/delivery-control.ts inspect \
  --change-root openspec/changes/<change>
```

`delivery-control.ts init` 创建 `change-info.json`（显式声明当前工件结构版本）和空的 `artifact-approvals.json`。批准用 `approval set --gate <站位id> --decision approved --approved-by <表态形态>` 一次写入，覆盖当时的全部工件；缺任何一份即拒绝并点名缺哪一份。原始需求的来源全序由 `01-原始需求索引.md` 材料索引表的 RAW 编号顺序承载（RAW-001 权威最高），不再另建 `change-sources.json`。每个 Artifact 写入前先读取对应 `openspec instructions`，写入后用摘要批准，并执行聚焦校验：

```bash
openspec validate <change> --strict
```

## Proposal 与 Decision

05 中依次形成：

1. `方案提案.md`：至少两个真实候选、约束、成本、风险、可逆性和 Trade-off，并明确填写 `## 推荐`、`## 未决问题`；
2. `方案决策.md`：必须记录 `状态：APPROVED`、选择、决策人、决策时间、权威来源、选择依据、拒绝方案、接受后果和重新决策触发条件；
3. `07-实施任务/实施任务.md` 的「实施切片、迁移与回滚」一节：只把已批准候选转成实施切片、迁移和回滚计划。该文件以 `## 任务清单` 这一行为界，界线以上人写、渲染不动，界线以下由机器状态渲染。

提案作者不能代替维护者作出 Decision。任一已批准 Artifact 内容变化后，其摘要批准失效，下游门禁必须停止。

## 实现任务

`task-state.json` 是唯一状态真源。任务规划完成后，按 `openspec/contracts/task-state.schema.json` 准备 JSON，并由工具写入和渲染：

```bash
node --experimental-strip-types openspec/tools/delivery-control.ts task write \
  --change-root openspec/changes/<change> --file <task-state-input.json>
node --experimental-strip-types openspec/tools/delivery-control.ts task render \
  --change-root openspec/changes/<change>
```

`07-实施任务/实施任务.md` 只由工具渲染，不能从复选框反向解析状态。

任务只包含实现、配置、测试和验收前置。Review、Acceptance、Spec Sync、Archive 和 PR 是生命周期门禁，不写进任务状态，避免形成“任务必须 verified 才能进入自身门禁”的循环。

## Fresh Review

Implementation Review 必须由主会话派发新的 reviewer session；实施会话不能直接自签 Review。

### Reviewer 输入

fresh session 只接收：

- 仓库规则；
- 已批准的需求、Proposal、Decision 和实施计划；
- delta specs 和 task state；
- `baselineCommit` 与 `reviewedCommit`；
- baseline→reviewed 的完整实现 diff；
- 明确的只读审查要求。

不要传入实施过程的对话推理、临时尝试或主会话结论，避免 reviewer 沿用实现会话的判断惯性。

### Reviewer 责任

- 检查完整性、准确性、边界、失败语义、回归风险和规格一致性；
- 输出结构化 findings；每项严格包含 `id`（`REV-` 加至少三位数字）、`severity`、`path`、`line`、`summary`、`status` 和 `resolution`；
- `OPEN` 的 `resolution` 必须为 `null`；`RESOLVED` 或 `ACCEPTED` 必须填写非空处置说明；
- 完整输入合同以 `openspec/contracts/implementation-review.schema.json` 为准；
- 不修改实现；
- 任一 OPEN finding 都不能形成 PASS；
- 实现路径或内容变化后，旧 Review stale，必须重新派 fresh session 审查新的 commit。

fresh session 提供上下文独立性，但不等同于外部安全审计；高风险公开发布仍可增加人工 reviewer。

## Acceptance、Spec Sync 与 Readiness

Acceptance 只能绑定当前且 PASS 的 Review、全部 verified 的 task state 和严格 PASS 的验收正文。`acceptedAt` 必须晚于 `reviewedAt`。

Acceptance 后：

1. 将 delta spec 同步到 `openspec/specs/`；
2. 执行 `openspec validate --all --strict`；
3. 保存 cleanup PASS 证据；
4. 在尚未创建 PR 时写入 `archive-readiness.json`；
5. 通过 archive guard 后移动 Change 到 archive；
6. 在归档状态运行 final validation；
7. 创建中文 PR。

Runtime Change 的 Archive 不等待消费仓 gitlink 更新。消费仓采用由各仓独立 Change 管理。

## PR 反馈与 Reopen

PR 反馈如果只要求措辞说明且不改变实现或规格，可在当前交付边界内处理。若反馈改变实现、规格或受审路径，必须受控 reopen：

- 保留旧 Review、Acceptance、Readiness 和 08/09 证据到 lifecycle history；
- 使旧 PASS 状态失效；
- 将相关任务恢复为未验证；
- 从 fresh Review 重新执行 Review→Acceptance→Sync→Archive。

## Intake 与 Change

需求在尚未承诺实施前，保存在项目仓 `openspec/intake/`。登记线只有两个节点：已登记（`captured`）与已处置（`promoted` / `held` / `closed` 三出口）；五个小节（原始问题 / Triage / Evidence / Options / Disposition）在处置时被一次性校验并逐项报缺，不再有中间站。Promote 之前须先过立项门：按 `openspec/profiles/change-routing-v1.json` 判该条目的改动对象是否豁免分析线，不豁免时必须已有该条目的分析线产物且结论为 build。Promote 不隐式创建 Change，Intake 保留来源索引，Change 成为后续交付真源。

Intake 的状态与 Promote/Hold/Close/Reopen 合同由 `intake-state.schema.json` 和 `intake-control.ts` 管理；`phase` 降为只读兼容字段，不再由任何命令写入。它不替代 `delivery-change` 的 Artifact DAG。

## 最终验证

```bash
node --experimental-strip-types \
  openspec/tools/render-commands.ts check --runtime-root .
node --experimental-strip-types --test test/*.test.ts
openspec validate --all --strict
```

升级 Change 还必须满足[受控 OpenSpec 升级](openspec-upgrade.md)中的完整候选门禁。
