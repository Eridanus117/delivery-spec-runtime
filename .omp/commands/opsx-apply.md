---
description: "实现 OpenSpec 变更中的任务（实验性）"
---

**统一运行时入口（必须先执行）：** 使用状态输出中的 `planningHome.root`；尚未选择 Change 时使用当前资产仓根。
```bash
node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" runtime-check --change-root "<planningHome.root>"
```
入口非零时立即停止；不得绕过 runtime lock、commit、manifest 或投影摘要检查。
选择、列出或报告 active Change 时，必须对每个候选运行 `runtime-entry.ts inspect --change-root "<changeRoot>"`，显示 `displayName (slug)`；sidecar 缺失或无效时停止，机器选择键与 OpenSpec 参数只能使用slug。

实现 OpenSpec 变更中的任务。

**存储选择：** 如果用户指定了存储（存储是指在此机器上注册的独立 OpenSpec 仓库），或工作内容位于某个存储中，请运行 `openspec store list --json` 来发现已注册的存储 ID，然后在读取或写入规范和变更的命令（`new change`、`status`、`instructions`、`list`、`show`、`validate`、`archive`、`doctor`、`context`、`schemas`、`view`）中传入 `--store <id>`。一旦选定，就将 `--store <id>` 标志视为工作流其余部分中持续生效的选项。下面这些命令的每个未指定作用域的示例都只是简写：运行前，请为其追加该标志。例如，应运行 `openspec status --change "<name>" --json --store "<id>"`，而不是下面显示的未指定作用域形式。其他命令不接受该选项。命令打印的提示已经带有该标志；后续操作请保留它。未指定存储时，命令会作用于最近的本地 `openspec/` 根目录。

**输入**：可以选择指定变更名称（例如 `/opsx-apply add-auth`）。如果省略，请检查是否可以从对话上下文中推断。如果模糊或存在歧义，你**必须**提示用户选择可用的变更。  
**提供的参数**：$@

**步骤**

1. **选择变更**

   如果提供了名称，则使用该名称。否则：
   - 如果用户在对话中提到了某个变更，则从对话上下文中推断
   - 如果只有一个活动变更，则自动选择
   - 如果存在歧义，则运行 `openspec list --json` 获取可用变更，并要求用户选择一个

   始终宣布：“使用变更：<name>”，并说明如何覆盖（例如：`/opsx-apply <other>`）。

2. **检查状态以了解模式**
   ```bash
   openspec status --change "<name>" --json
   ```
   解析 JSON 以了解：
   - `schemaName`：正在使用的工作流（例如 `"spec-driven"`）
   - `planningHome`、`changeRoot` 和 `actionContext`：规划范围和编辑约束
   - 哪个制品包含任务（对于 `spec-driven` 通常是 `"tasks"`；其他模式请检查状态）

   在请求应用说明之前，执行模式防护：
   ```bash
   node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" guard \
     --change-root "<changeRoot>" --operation apply
   ```
   非零结果具有权威性。处于 `rehearsal` 模式的变更必须在此停止，不得实现任务或将任务标记为完成。

3. **获取应用说明**

   ```bash
   openspec instructions apply --change "<name>" --json
   ```

   这会返回 OpenSpec 的规划上下文和动态指令。任务状态必须另行读取机器真源：
   ```bash
   node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" task inspect \
     --change-root "<changeRoot>"
   ```
   使用返回的 `revision`、任务依赖和状态计算进度；不得从 Markdown 复选框反向解析状态。
   - 可选的 `context`：来自选定根目录的当前必需项目指令输入
   - 可选的 `operationGuidance`：当前关于应用操作的建议指导

   **处理状态：**
   - 如果 `state: "blocked"`（缺少制品）：显示消息，建议使用 `/opsx-continue`（如果未安装，请运行 `openspec status --change "<name>" --json` 查看下一个制品，并运行 `openspec instructions <artifact-id> --change "<name>" --json` 查看如何创建它）
   - 如果 `state: "all_done"`：表示祝贺，并建议归档
   - 否则：继续实施

   将 `context` 视为必需的提示级输入。读取并考虑它，在实施过程中应用相关的项目事实、约定和约束。  
   将 `operationGuidance` 视为可选的附加建议。读取并考虑每一条，并遵循适用且与内置工作流兼容的条目。

   将这两个字段与命令行工具返回的状态、缺失的制品、任务、进度、`contextFiles` 以及内置 `instruction` 分开处理。它们不是任务完成的证据，不会替代内置指令，也不允许绕过阻塞状态。如果 `context` 与内置指令、用户明确的选择或命令行工具控制的值冲突，请报告冲突并保留控制性值。如果指导不适用，或与这些控制性输入冲突，请不要遵循，并解释原因。这些是提示级行为约定，不是可执行的检查。

4. **读取上下文文件**

   读取应用说明输出中 `contextFiles` 下列出的每个文件路径。  
   文件取决于所使用的模式：
   - **`spec-driven`**：proposal、specs、design、tasks
   - 其他模式：遵循命令行工具输出中的 `contextFiles`

   除非用户另行要求，否则不要将 `context` 或 `operationGuidance` 原样复制到实现文件或规划制品中。

5. **显示当前进度**

   显示机器状态中的模式、revision、各状态计数、可执行任务和 `blocked_external` blocker。

6. **实施任务（循环执行，直到完成或外部门禁阻塞）**

   对于每个依赖已验证的 `planned` 或 `implemented_unverified` 任务：
   - 进行所需的代码变更；源码完成后以当前 revision 标记为 `implemented_unverified`
   - 执行任务声明的验证；成功后以新 revision 标记为 `verified` 并传入可读取的 `--evidence`
   - 外部输入缺失时标记为 `blocked_external` 并传入具体 `--blocker`
   - 每次状态写入后运行 `task render` 更新 `07-实施任务/实施任务.md` 人工视图
   ```bash
   node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" task set \
     --change-root "<changeRoot>" --id "<task-id>" --status "<state>" \
     --expected-revision "<revision>" [--evidence "<path>"] [--blocker "<reason>"]
   node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" task render \
     --change-root "<changeRoot>"
   ```

   **在以下情况下暂停：**
   - 任务不明确 → 请求澄清
   - 实现暴露出设计问题 → 建议更新制品
   - 任务需要进行规范和任务描述之外的工作，或者你为了使其适配而想要删除、缩小、推迟或接受对指定行为的例外 → 说明新增范围并询问；不得默默吸收
   - 遇到错误或阻碍 → 报告并等待指导
   - 用户中断

7. **完成或暂停时显示状态**

   显示本次完成任务、机器 revision、总体进度和阻塞原因。全部完成时提示 `/opsx-continue` 进入 08；
   `rehearsal` 在 apply guard 已停止；外部门禁使用 `blocked_external`，不得伪装成完成。

**实施期间的输出**

```
## 正在实施：<change-name>（模式：<schema-name>）

正在处理任务 3/7：<task description>
[...正在进行实现...]
✓ 任务完成

正在处理任务 4/7：<task description>
[...正在进行实现...]
✓ 任务完成
```

**完成时的输出**

```
## 实施完成

**变更：** <change-name>
**模式：** <schema-name>
**进度：** 已完成 7/7 个任务 ✓

### 本次会话完成的任务
- [x] 任务 1
- [x] 任务 2
...

所有任务均已完成！你可以使用 `/opsx-archive` 归档此变更。
```

**暂停时的输出（遇到问题）**

```
## 实施已暂停

**变更：** <change-name>
**模式：** <schema-name>
**进度：** 已完成 4/7 个任务

### 遇到的问题
<问题描述>

**选项：**
1. <选项 1>
2. <选项 2>
3. 其他方法

你想怎么做？
```

**防护规则**
- 持续处理任务，直到完成或受阻
- 始终先读取上下文文件，再开始（从应用说明输出中获取）
- 如果任务存在歧义，请先暂停并询问，然后再实施
- 如果实现暴露出问题，请暂停并建议更新制品
- 保持代码更改最小，并限定在每个任务的范围内
- 每完成一个任务后立即原子更新 `task-state.json` 并重新渲染人工视图
- 遇到错误、阻碍或需求不明确时暂停——不要猜测
- 当任务需要进行规范描述之外的工作时，说明新增范围并暂停——绝不默默缩小、推迟或简化掉指定行为
- 只有在任务指定行为完整实现、验证通过且证据可读取时，才把机器状态标记为 `verified`
- 使用命令行工具输出中的 `contextFiles`，不要假定具体文件名
- 不要使用 `context` 或操作指导作为任务完成的证明
- 应用相关的项目上下文；报告与控制性工作流输入的冲突
- 考虑每一条指导；解释任何不适用或冲突的指导
- 不要将运行时上下文或操作指导复制到实现文件或规划制品中
- 保留命令行工具控制的阻塞/就绪/全部完成行为及完成标准

**流动工作流集成**

此技能支持“对变更执行操作”模型：

- **可随时调用**：在所有制品完成之前（如果存在任务）、部分实现之后，或与其他操作交错进行
- **允许更新制品**：如果实现暴露出设计问题，请建议更新制品——不受阶段锁定限制，流动执行工作。
