---
description: "使用实验性的工件工作流（OPSX）启动新的变更"
---

**统一运行时入口（必须先执行）：** 使用状态输出中的 `planningHome.root`；尚未选择 Change 时使用当前资产仓根。运行时源仓自用时，源仓根没有 `.delivery-spec-runtime`，改用源仓自身的入口。
```bash
# 消费仓：<planningHome.root>/.delivery-spec-runtime/openspec/tools/runtime-entry.ts
# Runtime 源仓自用：<planningHome.root>/openspec/tools/runtime-entry.ts
node --experimental-strip-types "<runtime入口路径>" runtime-check --change-root "<planningHome.root>"
```
入口非零时立即停止。消费仓入口不得绕过父仓 gitlink、runtime submodule commit、manifest、dirty 状态或相对软链检查；Runtime 源仓入口执行源仓 manifest、源码路径、版本和 bootstrap 状态检查。
选择、列出或报告 active Change 时，必须对每个候选运行 `runtime-entry.ts inspect --change-root "<changeRoot>"`，显示 `displayName (slug)`；sidecar 缺失或无效时停止，机器选择键与 OpenSpec 参数只能使用slug。

以实验性的工件驱动方式启动新的变更。

**存储库选择：** 如果用户指定了存储库（存储库是指在此机器上注册的独立 OpenSpec 存储库），或者当前工作位于某个存储库中，请运行 `openspec store list --json`，以发现已注册的存储库 ID；然后在读取或写入规范和变更的命令（`new change`、`status`、`instructions`、`list`、`show`、`validate`、`archive`、`doctor`、`context`、`schemas`、`view`）中传入 `--store <id>`。一旦选定存储库，就必须将 `--store <id>` 作为剩余工作流中的固定参数。下面命令中所有未指定存储库的示例都只是简写：运行前请追加该标志。例如，应运行 `openspec status --change "<name>" --json --store "<id>"`，而不是下面显示的未指定存储库形式。其他命令不接受此标志。命令输出中的提示已包含该标志；后续操作也必须保留它。如果没有存储库，命令将在最近的本地 `openspec/` 根目录上执行。

**输入：** `/opsx-new` 后的参数可以是变更名称（kebab-case），也可以是用户希望构建内容的描述。  
**提供的参数：** $@

**步骤**

1. **如果未提供输入，请询问用户想要构建什么**

   向用户提出开放式问题，不提供预设选项：
   > “你想处理什么变更？请描述你想要构建或修复的内容。”

   根据用户的描述推导出一个短横线命名的名称（例如，“增加用户认证” → `add-user-auth`）。

   **重要：** 在理解用户想要构建的内容之前，不得继续。

2. **确定工作流架构**

   除非用户明确请求使用其他工作流，否则使用默认架构（省略 `--schema`）。

   **仅在用户提到以下内容时使用不同的架构：**
   - 特定的架构名称：使用 `--schema <name>`
   - 用户要求“显示工作流”或询问“有哪些工作流”：运行 `openspec schemas --json`，然后让用户选择

   **否则：** 省略 `--schema`，使用默认架构。

3. **创建变更目录**
   ```bash
   openspec new change "<name>"
   ```
   仅当用户请求了特定工作流时，才添加 `--schema <name>`。  
   此命令会在命令行界面解析出的规划主目录中创建一个带脚手架的变更。

4. **显示工件状态**
   ```bash
   openspec status --change "<name>" --json
   ```
   使用返回的 `planningHome`、`changeRoot`、`artifactPaths` 和 `nextSteps`，不要假定存储库的本地路径。

   如果选定的架构是 `delivery-change`，必须初始化机器合同。`displayName` 使用用户确认的中文展示名；
   模式默认为 `delivery`，只有用户明确要求流程演练并提供原因、批准人和时间时使用 `rehearsal`：
   ```bash
   node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" init \
     --change-root "<changeRoot>" --slug "<name>" --display-name "<中文展示名>" --mode delivery
   ```
   rehearsal 改用 `--mode rehearsal --reason "<原因>" --approved-by "<批准人>" --approved-at "<ISO时间>"`。
   初始化后运行 `runtime-entry.ts inspect --change-root "<changeRoot>"`。不得在 `change-info.json` 重复保存slug或模式；
   不得因为缺少实现输入推断为 rehearsal；机器合同初始化失败时删除本次新建的空 Change 并停止。

5. **获取第一个工件的说明**

   第一个工件取决于架构。检查状态输出，找到状态为 `ready` 的第一个工件。
   ```bash
   openspec instructions <first-artifact-id> --change "<name>"
   ```
   此命令会输出用于创建第一个工件的模板和上下文。

6. **停止并等待用户指示**

**输出**

完成这些步骤后，进行总结：
- 变更名称和位置
- 使用的架构或工作流，以及工件顺序
- 当前状态（已完成 0/N 个工件）
- 有效模式来自严格 `change-mode.json`（缺失即delivery）；展示名只来自 `change-info.json`，机器slug只来自目录名
- 第一个工件的模板
- 提示：“准备好创建第一个工件了吗？运行 `/opsx-continue`，或者直接描述此变更的内容，我会为你起草。”

**防护规则**
- 不得创建任何工件，只显示说明
- 不得超出显示第一个工件模板这一步
- 如果名称无效（不是 kebab-case），请用户提供有效名称
- 如果已存在同名变更，建议改用 `/opsx-continue`
- 如果使用非默认工作流，传入 `--schema`
- 对于 `delivery-change`，不得将未知模式字段写入 `.openspec.yaml`；模式和双名称只使用严格机器合同。
