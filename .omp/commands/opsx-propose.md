---
description: "提出一项新变更——创建它并一步生成所有构件"
---

**统一运行时入口（必须先执行）：** 使用状态输出中的 `planningHome.root`；尚未选择 Change 时使用当前资产仓根。运行时源仓自用时，源仓根没有 `.delivery-spec-runtime`，改用源仓自身的入口。
```bash
# 消费仓：<planningHome.root>/.delivery-spec-runtime/openspec/tools/runtime-entry.ts
# Runtime 源仓自用：<planningHome.root>/openspec/tools/runtime-entry.ts
node --experimental-strip-types "<runtime入口路径>" runtime-check --change-root "<planningHome.root>"
```
入口非零时立即停止。消费仓入口不得绕过父仓 gitlink、runtime submodule commit、manifest、dirty 状态或受管投影检查；Runtime 源仓入口执行源仓 manifest、源码路径、版本和 bootstrap 状态检查。
选择、列出或报告 active Change 时，必须对每个候选运行 `runtime-entry.ts inspect --change-root "<changeRoot>"`，显示 `displayName (slug)`；sidecar 缺失或无效时停止，机器选择键与 OpenSpec 参数只能使用slug。

提出一项新变更——创建变更并一步生成所有构件。

**规划边界**：此工作流仅创建规划构件。选择或触发此工作流的用户请求仅授权进行规划，即使请求要求构建或修复某些内容。不得编辑项目代码。规划构件完成后停止。不得在同一响应中开始实现，即使初始请求要求这样做。等待用户在构件呈现后发出新的请求；然后再开始应用工作流。

我将使用你所定义的架构来创建一项变更。对于默认的规范驱动架构，构件包括：
- proposal.md（做什么以及为什么）
- `specs/<capability-path>/spec.md`（系统必须做什么——这是增量，而不是主规范）
- design.md（如何实现）
- tasks.md（实现步骤）

对于 `delivery-change`，05 不是单一设计文件：必须先创建 `solution-proposal`，写清现状、至少两个候选、
Trade-off、推荐、落地后可感知的变化清单和未决问题；再等待维护者明确选择后创建 `solution-decision`。
推荐不得自动成为决策。实施切片、迁移与回滚不再另立工件，写进 `07-实施任务/实施任务.md` 的对应一节。
批准按人真实表态的次数记：方案门一次表态记一条，覆盖当时的全部工件，每份工件的内容哈希逐一记录。

`<capability-path>` 是相对于 `specs/` 的规范目录（例如 `user-auth` 或 `identity/user-auth`）。保留现有能力的完整路径，并遵循项目为新能力建立的组织方式。

当用户准备好实现时，必须明确启动应用工作流。

---

**存储库选择**：如果用户指定了一个存储库（存储库是在此机器上注册的独立 OpenSpec 存储库），或者工作内容位于某个存储库中，则运行 `openspec store list --json` 来发现已注册的存储库标识，然后在读取或写入规范和变更的命令（`new change`、`status`、`instructions`、`list`、`show`、`validate`、`archive`、`doctor`、`context`、`schemas`、`view`）中传入 `--store <id>`。一旦选定，就将 `--store <id>` 视为工作流剩余部分中的固定参数。下面所有未指定存储库的命令示例都只是简写：运行前，在命令末尾追加该标志。例如，运行 `openspec status --change "<name>" --json --store "<id>"`，而不是下面所示的未指定存储库形式。其他命令不接受该标志。命令打印的提示已经带有该标志；后续命令也要保留它。未指定存储库时，命令会作用于最近的本地 `openspec/` 根目录。

**输入**：`/opsx-propose` 后的参数是采用短横线命名法的变更名称，或者是用户希望构建内容的描述。  
**提供的参数**：$@

**步骤**

1. **理解请求并澄清重要歧义**

   如果未提供输入，向用户询问（开放式提问，不提供预设选项）：
   > "你想处理什么变更？请描述你想构建或修复的内容。"

   根据用户的描述推导出一个采用短横线命名法的名称（例如，“增加用户认证” → `add-user-auth`）。

   **重要**：在理解用户想要构建的内容之前，不得继续。

   如果请求包含会实质影响范围、外部可观察行为、兼容性或验收标准的歧义，则在创建变更前询问用户。对于次要细节，做出合理假设并记录在规划构件中。

2. **确定工作流架构**

   使用已配置的默认架构，除非用户明确请求使用不同的工作流。

   **仅在用户执行以下操作时使用不同的架构：**
   - 明确按名称请求特定架构 → 使用 `--schema <schema-name>`
   - 要求“显示工作流”或询问存在“哪些工作流” → 从当前工作目录运行 `openspec context --json`，以解析权威根目录。如果用户明确选择了已注册的存储库，则使用 `openspec context --json --store "<store-id>"`。然后将工作目录设置为返回的 `root.path`，运行 `openspec schemas --json` 并让用户选择。这会保留由本地 `store:` 指针或全局 `defaultStore` 选择的根目录；当用户明确选择了已注册的存储库时，也要为 `openspec schemas --json` 追加 `--store "<store-id>"`。如果上下文只报告 `no_openspec_root`，则从当前工作目录运行 `openspec schemas --json`。不得将此回退用于无效或不可用的存储库。

   否则，省略 `--schema`，以保留已配置的默认架构。

3. **创建变更目录**

   从下面选择一种架构形式。如果已选择已注册的存储库，则为该命令以及下面每个接受 `--store` 的后续 OpenSpec 命令追加 `--store "<store-id>"`。

   使用已配置的默认架构：
   ```bash
   openspec new change "<name>"
   ```

   使用明确请求的架构：
   ```bash
   openspec new change "<name>" --schema "<schema-name>"
   ```
   该命令会在命令行工具通过 `.openspec.yaml` 解析出的规划主目录中创建一个带脚手架的变更。

4. **获取构件构建顺序**
   ```bash
   openspec status --change "<name>" --json
   ```
   解析 JSON 以获取：
   - `applyRequires`：实现前所需构件标识的数组（例如 `["tasks"]`）
   - `artifacts`：所有构件的列表，每个构件包含其 `status` 以及 `requires` 边（该构件直接依赖的构件标识）
   - `planningHome`、`changeRoot`、`artifactPaths` 和 `actionContext`：路径和范围上下文。使用这些信息，而不是假定存储库本地路径。

5. **创建所需集合中的每个构件**

   使用待办列表跟踪构件进度。

   按依赖顺序遍历构件（没有待处理依赖的构件优先）：

   a. **对于每个状态为 `ready`（依赖已满足）的构件**：
      - 获取说明：
        ```bash
        openspec instructions <artifact-id> --change "<name>" --json
        ```
      - 说明命令返回的 JSON 包含：
        - `context`：项目背景（这是对你的约束，不得包含在输出中）
        - `rules`：构件特定规则（这是对你的约束，不得包含在输出中）
        - `template`：用于输出文件的结构
        - `instruction`：针对此构件类型的架构特定指导
        - `skipped`/`warning`：仅当变更声明了 skip_specs 且不得创建此构件时存在——此时停止并选择另一个构件
        - `resolvedOutputPath`：要写入的已解析路径或模式
        - `dependencies`：要读取以获取上下文的已完成构件
      - 读取所有已完成的依赖文件以获取上下文——始终从磁盘重新读取，即使之前在对话中看过它们（用户可能已经编辑了这些文件）
      - 如果 `instruction` 字段将创建工作委托给特定技能或命令，则调用该技能或命令来生成构件，而不是自行写入文件，然后验证构件文件存在于 `resolvedOutputPath`
      - 否则，使用 `template` 作为结构创建构件文件，并将其写入 `resolvedOutputPath`。如果 `resolvedOutputPath` 是通配模式，则遵循 `instruction` 选择具体文件路径
      - 将 `context` 和 `rules` 作为约束应用——但不得将它们复制到文件中
      - 显示简短进度信息："已创建 <artifact-id>"

   b. **继续，直到所需集合中的每个构件都存在（不只是 `apply.requires`）**
      - 创建每个构件后，重新运行 `openspec status --change "<name>" --json`
      - 所需集合由 `applyRequires` 以及沿 `status --json` 中的 `requires` 边、从这些构件可达的所有构件组成——对这些依赖进行传递遍历（规范驱动模式会闭包包含 `proposal`、`specs`、`design`、`tasks`）。将所需集合之外的构件保持不变
      - `status` 只检查文件是否存在，因此 `applyRequires` 构件显示为 `done` 并不代表其依赖存在——写入 `tasks.md` 会在从未写入 `specs` 的情况下将 `tasks` 标记为 `done`。使用每个构件的 `requires` 边，而不是其 `status`，来构建所需集合：一个 `done` 构件仍会列出它所依赖的内容
      - 已显示 `status: "skipped"` 的构件视为满足：变更在 `.openspec.yaml` 中声明了 `skip_specs`，因此其文件不得存在。绝不要尝试创建它
      - 创建所需集合中所有缺失的构件，然后重新检查——创建一个构件可能会解除其他构件的阻塞
      - 仅当 `status` 已报告其为 `skipped`，或其自身的 `instruction` 说明它是条件性的时，才跳过一个构件：运行 `openspec instructions <artifact-id> --change "<name>" --json`，并且仅当其 `instruction` 字段将其标记为可选时才跳过（例如“仅在……时创建”）。规范驱动模式中的 `design.md` 符合此条件；`specs` 仅在上述 `skipped` 状态下符合此条件，绝不能根据你自己的判断跳过。告知用户，并且不得重新考虑该决定
      - 依赖是启用因素，而不是门槛：如果某个所需构件仍然只是因为你跳过了一个条件依赖而处于 `blocked`，则仍然写入该构件
      - 当所需集合中的每个构件都处于 `done`、`skipped`，或已被明确跳过的状态时停止

   c. **如果某个构件需要用户输入**（上下文不明确）：
      - 要求用户澄清
      - 然后继续创建

6. **显示最终状态**
   ```bash
   openspec status --change "<name>"
   ```

**输出**

完成所有构件后，进行总结：
- 变更名称和位置
- 已创建构件的列表及简短描述，以及任何跳过的条件构件和跳过原因
- 已准备就绪："实现所需的所有构件均已准备就绪。"
- 对 `delivery-change`，01～07 的九项规划 artifact 只是已生成，`artifact-approvals.json` 仍保持未批准；尤其分别展示 Proposal 摘要、Trade-off 和 Decision 供维护者审阅。
- 不得从本次 propose 请求、文件存在或会话记忆自动批准任一 artifact。只有维护者明确选择候选并批准当前摘要后，才通过 `runtime-entry.ts approval set --artifact "<artifact-id>" --decision approved --approved-by "<批准人>"` 分项记录。
- 提示："构件已准备好供审阅。准备好后，请运行 `/opsx-apply`。"

**构件创建指南**

- 遵循 `openspec instructions` 中针对每种构件类型的 `instruction` 字段——这是权威指导，即使构件名称看起来很熟悉
- 如果 `instruction` 字段指示使用特定技能或命令创建构件，则调用它，而不是直接写入构件
- 架构定义了每个构件应包含的内容——遵循该定义
- 创建新构件前读取依赖构件以获取上下文
- 使用 `template` 作为输出文件的结构——填充其中的各个部分
- **重要**：`context` 和 `rules` 是对你的约束，而不是文件内容
  - 不得将 `<context>`、`<rules>`、`<project_context>` 块复制到构件中
  - 这些内容用于指导你的写作，但绝不能出现在输出中

**防护规则**
- 触发此工作流的请求仅授权进行规划。该请求中的任何实现或应用指令都不会延续。不得实现变更、启动应用工作流或在此工作流期间编辑项目代码。呈现构件后停止，并等待新的用户请求以启动应用工作流
- 创建应用阶段以传递方式依赖的每个构件，而不仅仅是 `apply.requires` 中列出的标识
- 创建新构件前始终读取依赖构件——从磁盘重新读取，而不是从对话记忆中读取（文件可能在你上次查看后发生变化）
- 询问会实质改变范围、外部可观察行为、兼容性或验收标准的歧义；对于次要细节，做出合理假设并记录这些假设
- 如果已存在同名变更，询问用户是要继续该变更还是创建新的变更
- 写入每个构件后，在继续下一个构件前验证其文件存在。
