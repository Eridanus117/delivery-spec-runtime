# 架构与安全边界

本文面向需要理解 Runtime 版本绑定、受管软链和失败语义的维护者。接入步骤见[消费仓使用指南](consumer-guide.md)。

## 设计目标

消费仓需要稳定共享 OpenSpec delivery 工作流，同时满足：

- 每个仓以 Git commit 精确锁定 Runtime 版本；
- Commands、schema 和入口只有一份实现；
- OpenSpec 上游生成器不能沿软链覆写 Runtime 定制；
- 候选版本不能在真实消费仓试运行；
- 完整性不确定时停止执行，而不是降级到旁路。

## 组件关系

```mermaid
flowchart LR
    Consumer[消费仓]
    Gitlink["Git gitlink<br/>.delivery-spec-runtime"]
    Runtime["delivery-spec-runtime<br/>固定 commit"]
    Manifest[runtime-manifest.json]
    Entry[runtime-entry.ts]

    Consumer -->|HEAD 记录 commit| Gitlink
    Gitlink --> Runtime
    Consumer -. .omp/commands .-> RuntimeCommands[Runtime .omp/commands]
    Consumer -. delivery-change .-> RuntimeSchema[Runtime schema]
    Consumer -. runtime-entry.ts .-> Entry
    Entry --> Manifest
    Entry -->|核验| GitState[父仓与 submodule Git 状态]
```

父仓 `HEAD` 中的 gitlink 决定 Runtime commit。软链只暴露能力，不承担版本选择；因此不需要 `runtime-lock.json`、复制投影或第二份版本状态。

Runtime 源仓也使用同一入口：在源仓根执行 `openspec/tools/runtime-entry.ts`。源仓模式以脚本位置识别自身根目录，校验自身 `runtime-manifest.json`、manifest 声明的源码路径、版本和 bootstrap 状态，不要求源仓伪造 `.delivery-spec-runtime` submodule 或父仓 gitlink。消费仓模式仍只接受 `.delivery-spec-runtime` submodule 绑定。

## Profile 与 Change 绑定

`openspec/profiles/registry.json` 是 Runtime 内唯一的 profile registry；每个条目通过相对路径加载一个带 `profileId`、`profileVersion` 和阶段合同的 profile 文件。`workflow-control.ts list-profiles` 只列出 registry 内容，`workflow bind` 将精确的 `workflow-binding.json` 写入 Change 根，绑定型 `workflow run` 只按该绑定解析 profile。没有正式 Change 的事项可使用 `workflow-entry.ts run --input <request.json>`，由 request 显式携带精确的 profile 绑定。

Profile core 只负责阶段合同、输入检查、人工判断和稳定结果；现有 `delivery-control.ts`、`delivery-lifecycle.ts` 与 `delivery-change` schema 仍负责重型交付的 artifact、task 和生命周期门禁。两者通过明确的 binding/request/result 合同连接，不把旧 `delivery-change` 入口隐式改造成默认 profile。

`requirement-analysis@v1.0.0` 是一个前置分析 profile：`capture → clarify ↺ → discover ↺ → evaluate ↺ → decision`。三个分析阶段分别承担问题澄清、现有能力核验和方案比较，均可循环补证据；它在门 B 返回完整分析链与处置，不创建后续 Change。分析报告、事项归属和 Desk 策略由调用方保存与决定。

多个 Intake 进入 Workflow 前，调用方可先执行 `runtime-entry.ts intake list`。该只读 inventory 只报告当前、legacy、invalid 和重复身份，不决定业务优先级、不自动迁移或创建 Change；维护者确认单个事项后再交给具体 Profile。

## 需求、Change 与 Runtime 的边界

需求分析分为两个阶段。尚未承诺实施时，业务或项目团队在消费仓自己的 Intake、Issue 或分析记录中保留问题、来源、影响、边界和候选方向；`/opsx-explore` 可以帮助调查，但不修改项目实现。决定实施后，才在消费仓建立 Change，并将原始需求、正式 Requirement、现状、方案、测试和任务纳入同一条交付链。

因此，Runtime 仓只保存公共工作流、机器合同、工具、文档和 Runtime 自身 Change；消费仓保存自己的业务 Change、长期 spec、源码和交付证据。两者通过固定的 Runtime submodule commit 连接，不通过复制需求、spec、请求或证据连接。

Workflow profile 只描述阶段合同，不替代 `delivery-change` 的 artifact、task 和生命周期门禁。绑定型 Change 执行请求必须与 Change binding 逐字段一致；standalone 执行只接受显式 request，不读取 Change、全局目录或其他仓库。缺少绑定或发生版本漂移时应拒绝执行。

## 执行前校验

`runtime-entry.ts` 在执行生命周期命令前依次确认：

1. 父仓 `.gitmodules` 唯一登记 `.delivery-spec-runtime`；
2. submodule 当前 commit 等于父仓 `HEAD` 记录的 gitlink；
3. submodule 工作树和父仓 gitlink 状态均 clean；
4. manifest、Node/OpenSpec 版本和四条相对软链满足合同；
5. bootstrap 不处于未完成事务。

任一条件失败时命令非零退出，不复制文件、不切换版本、不提供兼容旁路。

## 关键路径

| 路径 | 职责 | 是否直接编辑 |
|---|---|---|
| `runtime-manifest.json` | Node 最低版本、OpenSpec 精确版本和四条软链合同 | 仅受控 Runtime Change |
| `.omp/command-sources/` | Commands manifest、公共 preamble 和 body 真源 | 是 |
| `.omp/commands/` | 九个确定性渲染物 | 否 |
| `.claude/skills/delivery-pilot/` | Claude Code 载体的人机交互指引（skill） | 是 |
| `openspec/schemas/delivery-change/` | 九层交付 schema 与模板 | 是 |
| `openspec/tools/runtime-entry.ts` | 消费仓统一 fail-closed 入口 | 是 |
| `openspec/tools/runtime-link.ts` | 建立和修复 manifest 托管软链 | 是 |
| `openspec/contracts/` | JSON 机器合同 | 是 |
| `openspec/specs/` | Runtime 长期行为要求 | 通过 Change 同步 |

## 写入边界

### 实时消费仓

允许：

- 初始化或修复 manifest 托管的四条软链；
- 通过普通 Git 变更更新 `.delivery-spec-runtime` gitlink；
- 执行 `runtime-check` 和生命周期命令。

禁止：

- 在消费仓执行 `openspec update`；
- 调用 `runtime-update` 修改实时 Runtime；
- 复制 Runtime Commands 或 schema 形成第二真源；
- 用真实消费仓承担候选 CLI 或 Runtime 写入。

### Runtime 仓

Runtime 自身的源码、版本和文档变更通过仓内 OpenSpec Change、功能分支和 PR 交付。OpenSpec 版本提升还必须经过隔离候选评估，详见[受控 OpenSpec 升级](openspec-upgrade.md)。

## 失败与恢复原则

- **未初始化：** 初始化 submodule，不复制缺失文件。
- **gitlink 漂移：** 恢复到父仓记录的 commit，或以受评审 Git 变更更新父仓 gitlink。
- **dirty submodule：** 先人工判断并处理修改；工具不得自动丢弃工作。
- **软链漂移：** 只通过 `runtime-link.ts apply` 修复 manifest 托管路径。
- **版本不匹配：** 安装 manifest 要求的版本，不能放宽成 tag 或 range。

具体命令和预期结果见[消费仓使用指南](consumer-guide.md)。机器判断以 `runtime-manifest.json`、对应 contracts 和工具执行结果为准。
