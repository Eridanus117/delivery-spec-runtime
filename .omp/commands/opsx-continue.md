---
description: "继续处理一项变更——创建下一个制品（实验性）"
---

**统一运行时入口（必须先执行）：** 使用状态输出中的 `planningHome.root`；尚未选择 Change 时使用当前资产仓根。运行时源仓自用时，源仓根没有 `.delivery-spec-runtime`，改用源仓自身的入口。
```bash
# 消费仓：<planningHome.root>/.delivery-spec-runtime/openspec/tools/runtime-entry.ts
# Runtime 源仓自用：<planningHome.root>/openspec/tools/runtime-entry.ts
node --experimental-strip-types "<runtime入口路径>" runtime-check --change-root "<planningHome.root>"
```
入口非零时立即停止。消费仓入口不得绕过父仓 gitlink、runtime submodule commit、manifest、dirty 状态或受管投影检查；Runtime 源仓入口执行源仓 manifest、源码路径、版本和 bootstrap 状态检查。
选择、列出或报告 active Change 时，必须对每个候选运行 `runtime-entry.ts inspect --change-root "<changeRoot>"`，显示 `displayName (slug)`；sidecar 缺失或无效时停止，机器选择键与 OpenSpec 参数只能使用slug。

通过创建下一个制品继续处理一项变更。

**存储库选择：** 如果用户指定了一个存储库（存储库是指在此机器上注册的独立 OpenSpec 仓库），或当前工作所在的仓库属于某个存储库，请运行 `openspec store list --json` 来发现已注册的存储库标识，然后在读取或写入规范和变更的命令（`new change`、`status`、`instructions`、`list`、`show`、`validate`、`archive`、`doctor`、`context`、`schemas`、`view`）中传递 `--store <id>`。一旦选定存储库，在工作流的剩余部分都将 `--store <id>` 视为固定选项。下面这些命令的所有未限定范围示例都只是简写：运行之前，请追加该标志。例如，应运行 `openspec status --change "<name>" --json --store "<id>"`，而不是下面所示的未限定范围形式。其他命令不接受此标志。命令打印的提示已经带有该标志；后续操作中请保留它。如果没有指定存储库，命令将作用于最近的本地 `openspec/` 根目录。

**输入**：可以在 `/opsx-continue` 后指定变更名称（例如 `/opsx-continue add-auth`）。如果省略，请检查是否可以从对话上下文中推断。如果模糊或存在歧义，你 MUST 提示用户从可用变更中进行选择。  
**提供的参数**：$@

**步骤**

1. **选择变更**

   如果提供了名称，则使用该名称。否则：
   - 如果用户提到过某项变更，则从对话上下文中推断
   - 如果只有一项活动变更，则自动选择
   - 如果存在歧义，则运行 `openspec list --json` 获取可用变更（按最近修改时间排序），并要求用户选择一项

   提示用户时，将最近修改的 3～4 项变更作为选项展示，并显示：
   - 变更名称
   - 架构（如果存在 `schema` 字段，则使用其值，否则使用 `"spec-driven"`）
   - 状态（例如 `"0/5 tasks"`、`"complete"`、`"no tasks"`）
   - 最近修改时间（来自 `lastModified` 字段）

   将最近修改的变更标记为“（推荐）”，因为这很可能是用户想要继续处理的变更。

   始终声明：“当前变更：<name>”，并说明如何改选（例如：`/opsx-continue <other>`）。

2. **检查当前状态**
   ```bash
   openspec status --change "<name>" --json
   ```
   解析返回数据以了解当前状态。响应包含：
   - `schemaName`：所使用的工作流架构（例如 `"spec-driven"`）
   - `artifacts`：包含各制品及其状态（`"done"`、`"skipped"`、`"ready"`、`"blocked"`）的数组
   - `isPlanningComplete`：布尔值，表示所有规划制品是否已完成。较旧的命令行工具版本将相同的值公开为 `isComplete`。
   - `planningHome`、`changeRoot`、`artifactPaths` 和 `actionContext`：路径和范围上下文。使用这些值，而不是假定仓库本地路径。

3. **根据状态执行操作**：

   ---

   **如果所有规划制品均已完成（`isPlanningComplete: true`，或旧版的 `isComplete: true`）**：
   - 祝贺用户
   - 显示包含所用架构的最终状态
   - 建议：“规划已完成！现在可以使用 `/opsx-apply` 实现该变更。实现及所有跟踪工作完成后，使用 `/opsx-archive` 归档。”
   - 停止

   ---

   **如果有制品可以创建（状态显示制品的 `status: "ready"`）**：
   - 从状态输出中选择第一个 `status: "ready"` 的制品
   - 在请求制品说明之前解析有效的变更模式：
     ```bash
     node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" inspect --change-root "<changeRoot>"
     ```
   - 对 `delivery-change`，先运行：
     ```bash
     node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" approval inspect \
       --change-root "<changeRoot>"
     ```
     01～07 已生成依赖的有效状态必须为 `approved`，`pending`、`rejected` 或 `stale` 时停止并展示内容请求人工审阅。
     只有用户明确批准当前摘要时才记录决定；“继续”或文件存在不等于批准：
     ```bash
     node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" approval set \
       --change-root "<changeRoot>" --artifact "<artifact-id>" --decision approved \
       --approved-by "<批准人>" [--migration-source "<可审阅的旧决定来源>"]
     ```
   - 如果下一个制品是 `acceptance` 或 `release`，则在执行 `openspec instructions` 之前运行匹配的硬性守卫：
     ```bash
     node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" guard \
       --change-root "<changeRoot>" --operation "<acceptance-or-release>"
     ```
     非零的守卫结果具有权威性：停止，不创建制品。08 保留原有的完成/`PASS` 门槛。
   - 获取其说明：
     ```bash
     openspec instructions <artifact-id> --change "<name>" --json
     ```
   - 解析返回数据。关键字段包括：
     - `context`：项目背景（对你的约束——不要包含在输出中）
     - `rules`：特定于制品的规则（对你的约束——不要包含在输出中）
     - `template`：用于输出文件的结构
     - `instruction`：特定于架构的指导
     - `resolvedOutputPath`：要写入的已解析路径或模式
     - `dependencies`：需要读取以获取上下文的已完成制品（带有 `skipped: true` 的条目没有文件——不要查找这些文件）
     - 当变更声明了 `skip_specs` 且此制品不得创建时，会出现 `skipped`/`warning`：请选择另一个制品
   - **创建制品文件**：
     - 读取所有已完成的依赖文件以获取上下文——始终从磁盘重新读取，即使你之前在对话中看过这些文件（用户可能已经编辑过它们）
     - 如果 `instruction` 字段将创建工作委托给特定技能或命令，则调用它来生成制品，而不是自行写入文件；然后验证制品文件存在于 `resolvedOutputPath`
     - 否则使用 `template` 作为结构——填充其中的各个部分
     - 在写入时应用 `context` 和 `rules` 作为约束——但不要将它们复制到文件中
     - 写入说明中指定的 `resolvedOutputPath`。如果它是通配模式，则根据架构说明和变更上下文选择具体文件路径
   - 显示已创建的内容以及现在已解锁的内容
   - 创建一个制品后停止

   ---

   **如果没有制品可以创建（全部被阻塞）**：
   - 对于有效的架构，这种情况不应发生
   - 显示状态并建议检查问题

4. **创建制品后，显示进度**
   ```bash
   openspec status --change "<name>"
   ```

**输出**

每次调用后，显示：
- 创建了哪个制品
- 所使用的架构工作流
- 当前进度（N/M 已完成）
- 当前已解锁的制品
- 08 结论只有在必需场景有证据、无 critical 且清理成功时才能是 `PASS`
- 提示：“运行 `/opsx-continue` 以创建下一个制品”

**制品创建指南**

制品类型及其用途取决于架构。说明输出中的 `instruction` 字段是每个制品的权威指导——即使制品具有常见名称（`proposal.md`、`tasks.md` 等），也必须遵循该指导，因为自定义架构可能会为相同的文件名定义不同的内容或不同的流程。

如果 `instruction` 字段指示使用特定技能或命令创建制品，则调用它，而不是直接写入制品。

**防护规则**
- 每次调用创建一个制品
- 创建新制品之前始终读取依赖制品——从磁盘重新读取，而不是从对话记忆中读取（文件自上次查看后可能已经发生变化）
- 不得跳过制品或乱序创建制品
- 如果上下文不清楚，请在创建前询问用户
- 写入后验证制品文件存在，然后再标记进度
- 不得因为 `openspec status` 报告某制品已准备就绪，就绕过失败的 `runtime-entry.ts` 守卫
- 使用架构的制品顺序，不要假定特定的制品名称
- **重要**：`context` 和 `rules` 是对你的约束，而不是文件内容
  - 不要将 `<context>`、`<rules>`、`<project_context>` 块复制到制品中
  - 这些内容用于指导你的写作，但绝不应出现在输出中
