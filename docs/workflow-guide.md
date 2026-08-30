# 从需求到归档：Runtime 会做什么

本文面向准备在项目仓使用 `/opsx-*` 的维护者。它回答三个问题：每条命令会做什么、仓库会发生什么变化、完整流程结束后会得到什么。

首次接入 Runtime 请先阅读 [README](../README.md)；gitlink、软链和故障恢复见[消费仓使用指南](consumer-guide.md)。

## 使用前后有什么不同

开始前，你通常只有一段需求、一个问题或一个想法。完成工作流后，项目仓会同时保存：

- 可追溯的原始需求和正式 Requirement；
- 候选方案、维护者决策和实施计划；
- 代码、配置或文档实现；
- 测试、Review、验收和清理证据；
- 同步后的长期 spec；
- 完整的归档 Change。

```mermaid
flowchart LR
    Input[需求或问题]
    Explore[可选调查]
    Change[建立 Change]
    Plan[需求、方案与任务]
    Apply[修改项目实现]
    Verify[Review 与验收]
    Spec[同步长期 spec]
    Archive[归档证据]

    Input --> Explore
    Explore --> Change
    Change --> Plan
    Plan --> Apply
    Apply --> Verify
    Verify --> Spec
    Spec --> Archive
```

Runtime 不会只生成一份静态方案。它把“为什么改、决定怎么改、实际改了什么、如何证明正确”保存在同一条可审计链中。

## 多 Profile Workflow System

Runtime 同一仓库可以注册多套 workflow profile。Profile 是可版本化的阶段合同；它定义阶段顺序、必需输入和需要人工判断的节点。每个 Change 必须显式绑定 `profileId` 与 `profileVersion`，执行时只解析该精确版本，不自动选择最新版本，也不跨仓扫描其他 profile。

```text
node --experimental-strip-types \
  openspec/tools/runtime-entry.ts workflow list-profiles
node --experimental-strip-types \
  openspec/tools/runtime-entry.ts workflow bind \
  --change-root openspec/changes/add-order-export \
  --profile-id delivery-change --profile-version v1.0.0
node --experimental-strip-types \
  openspec/tools/runtime-entry.ts workflow run \
  --request-file request.json
```

`workflow-binding.json` 保存在 Change 根；重复绑定不同 profile 或版本会被拒绝。`workflow request` 必须携带同一绑定、事项身份、输入和人工判断；结果使用稳定的 `status`、当前/下一阶段和输出字段返回。缺少输入返回 `blocked`，缺少人工判断返回 `waiting_human_judgment`，不允许用默认 profile 或隐式迁移继续执行。

## 一个完整例子

假设需求是“增加订单导出”。

### 1. 可选：先调查，不创建 Change

```text
/opsx-explore 订单导出的现状、调用方和风险
```

效果：Agent 读取代码、资料和现有规格，帮助澄清问题；默认不创建 Change，也不修改项目实现。

适合：需求仍然模糊、需要比较方向，或者还不确定是否值得立项。

### 2. 创建 Change

```text
/opsx-new add-order-export
```

效果：在项目仓的 `openspec/changes/` 下建立新的 Change 和机器状态；命令显示第一项可创建工件，但不会假装需求已经理解完成。

```text
openspec/changes/add-order-export/
├── .openspec.yaml
├── change-info.json
└── artifact-approvals.json
```

如果需求已经足够明确，也可以使用：

```text
/opsx-propose add-order-export
```

`/opsx-propose` 会按依赖顺序生成实施前所需的完整规划工件；遇到重要歧义或必须由维护者决定的方案时仍会停下来询问，不会代替维护者批准。

### 3. 逐步形成需求、方案和任务

```text
/opsx-continue add-order-export
```

每次 `/opsx-continue` 只创建当前依赖已经满足的下一项工件。反复执行后，Change 会形成：

| 阶段 | 主要产物 | 回答的问题 |
|---|---|---|
| 01 原始需求 | `原始需求索引.md`、来源合同 | 用户原本说了什么，证据来自哪里？ |
| 02 需求理解 | delta specs、术语和边界 | 系统必须表现出什么可观察行为？ |
| 03 业务现状 | 角色、对象、当前流程 | 改造前业务如何运作？ |
| 04 技术现状 | 入口、依赖、数据和失败语义 | 当前代码实际上如何实现？ |
| 05 改造方案 | 方案提案、方案决策、改造计划 | 有哪些候选，维护者选择了什么？ |
| 06 测试方案 | 场景、断言、fixture 和清理 | 怎样证明改造正确？ |
| 07 实施任务 | `task-state.json` 和人工视图 | 具体修改什么，如何验证每项任务？ |

重要边界：Proposal 可以推荐方案，但 `方案决策.md` 必须记录维护者的明确选择。批准后的工件内容变化会使原批准失效，下游不能继续假装有效。

### 4. 实施任务

```text
/opsx-apply add-order-export
```

效果：Agent 按已批准的 07 任务修改项目代码、配置、测试或文档，并把任务状态从 planned 推进到 implemented/verified。只有这个阶段开始修改实际项目实现。

如果需求或方案中途改变，使用：

```text
/opsx-update add-order-export
```

它修订已有规划工件并处理受影响的下游内容；它不是 OpenSpec Runtime 升级命令，也不会在项目仓执行 `openspec update`。

### 5. Review 与验收

```text
/opsx-verify add-order-export
```

效果：核对实际实现是否覆盖 Requirement、方案和任务，运行约定验证，保存 Review finding、测试输出、验收正文和内容寻址状态。

通过条件包括：

- 实现任务全部 verified；
- Review 覆盖完整实现范围；
- 没有 OPEN finding；
- 验收正文为严格 PASS；
- 实际验证输出和清理证据已经保存。

验证失败时，Change 保持 active；修复实现或规格后重新验证，不通过修改结论文字绕过失败。

### 6. 同步长期 spec

```text
/opsx-sync add-order-export
```

效果：把 Change 中已经验收的 delta spec 合并到项目仓的长期规格：

```text
openspec/specs/<capability>/spec.md
```

长期 spec 表示当前生效的系统要求；它不保存整个交付过程，完整证据仍留在 Change 中。

### 7. 归档 Change

```text
/opsx-archive add-order-export
```

效果：重新检查 Acceptance、Spec Sync、strict validation、cleanup 和 Archive Readiness，然后将 Change 移动到：

```text
openspec/changes/archive/<date>-add-order-export/
```

归档后，项目仓同时拥有当前长期要求和当时的完整决策、实现及验收证据。

## 九个命令如何选择

| 我现在要做什么 | 命令 | 是否修改项目实现 |
|---|---|---|
| 调查想法、现状或问题 | `/opsx-explore` | 默认否 |
| 建立 Change，逐项规划 | `/opsx-new` | 否 |
| 建立 Change，并尽量生成完整实施前规划 | `/opsx-propose` | 否 |
| 创建下一项规划工件 | `/opsx-continue` | 否 |
| 修订已有规划内容 | `/opsx-update` | 不直接实施业务代码 |
| 按任务修改代码、配置、测试或文档 | `/opsx-apply` | 是 |
| 核对实现并生成 Review、测试和验收证据 | `/opsx-verify` | 否；finding 需要另行修复后重验 |
| 把 delta spec 合并到长期 spec | `/opsx-sync` | 只修改规格 |
| 完成门禁并归档 Change | `/opsx-archive` | 只修改生命周期和归档状态 |

## 最终会留下哪些内容

一个已完成的项目通常会看到：

```text
项目源码和测试                         # /opsx-apply 的实现结果
openspec/specs/                       # 当前长期生效要求
openspec/changes/archive/<change>/    # 当次需求、决策和证据
```

归档 Change 中还包含机器可检查的状态，例如 Artifact 批准、任务状态、Implementation Review、Acceptance 和 Archive Readiness。精确字段以 Runtime contracts 为准，日常使用不需要手写这些 JSON。

## Runtime 不会替你做什么

Runtime 不会：

- 自动批准方案或替维护者接受风险；
- 自动合并 PR、推送远程分支或部署应用；
- 自动升级项目仓的 Runtime gitlink；
- 在真实项目仓运行候选 OpenSpec 生成器；
- 在任务、Review 或验收失败时自动绕过门禁；
- 把其他项目的真实需求、凭据或交付证据保存到 Runtime 仓。

它提供的是一套可版本锁定、可审计、失败时停止的交付工作流；项目团队仍然负责需求决策、实现质量、发布和生产结果。
