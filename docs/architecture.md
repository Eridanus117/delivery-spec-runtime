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

## 执行前校验

`runtime-entry.ts` 在执行生命周期命令前依次确认：

1. 父仓 `.gitmodules` 唯一登记 `.delivery-spec-runtime`；
2. submodule 当前 commit 等于父仓 `HEAD` 记录的 gitlink；
3. submodule 工作树和父仓 gitlink 状态均 clean；
4. manifest、Node/OpenSpec 版本和三条相对软链满足合同；
5. bootstrap 不处于未完成事务。

任一条件失败时命令非零退出，不复制文件、不切换版本、不提供兼容旁路。

## 关键路径

| 路径 | 职责 | 是否直接编辑 |
|---|---|---|
| `runtime-manifest.json` | Node/OpenSpec 精确版本和三条软链合同 | 仅受控 Runtime Change |
| `.omp/command-sources/` | Commands manifest、公共 preamble 和 body 真源 | 是 |
| `.omp/commands/` | 九个确定性渲染物 | 否 |
| `openspec/schemas/delivery-change/` | 九层交付 schema 与模板 | 是 |
| `openspec/tools/runtime-entry.ts` | 消费仓统一 fail-closed 入口 | 是 |
| `openspec/tools/runtime-link.ts` | 建立和修复 manifest 托管软链 | 是 |
| `openspec/contracts/` | JSON 机器合同 | 是 |
| `openspec/specs/` | Runtime 长期行为要求 | 通过 Change 同步 |

## 写入边界

### 实时消费仓

允许：

- 初始化或修复 manifest 托管的三条软链；
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
