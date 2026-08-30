在实验性工作流中归档已完成的变更。

**存储库选择：** 如果用户指定了一个存储库（存储库是指在此计算机上注册的独立 OpenSpec 存储库），或工作内容位于某个存储库中，请运行 `openspec store list --json` 来发现已注册的存储库标识符，然后在读取或写入规范和变更的命令（`new change`、`status`、`instructions`、`list`、`show`、`validate`、`archive`、`doctor`、`context`、`schemas`、`view`）中传入 `--store <id>`。选定后，在工作流的其余部分将 `--store <id>` 视为固定选项。下面这些命令的所有未限定范围示例都只是简写：运行前，请追加该标志。例如，应运行 `openspec status --change "<name>" --json --store "<id>"`，而不是下面显示的未限定范围形式。其他命令不接受此标志。命令打印的提示已经带有该标志；后续操作中请保留它。不指定存储库时，命令会作用于最近的本地 `openspec/` 根目录。

`<capability-path>` 是相对于 `specs/` 的规范目录（例如 `user-auth` 或 `identity/user-auth`）。解析其主规范时，请保留每个增量规范中的完整路径。

**输入**：可以在 `/opsx-archive` 后指定变更名称（例如 `/opsx-archive add-auth`）。如果省略，请检查是否可以从对话上下文中推断。如果名称模糊或存在歧义，必须提示用户从可用变更中选择。  
**提供的参数**：$@

**步骤**

1. **选择变更**

   如果提供了名称，则使用该名称。否则：
   - 如果用户在对话中提到过某个变更，则从对话上下文中推断
   - 如果只有一个活动变更，则自动选择
   - 如果存在歧义，则运行 `openspec list --json` 获取可用变更，并要求用户选择一个

   提示时，只显示活动变更（不显示已归档的变更）。  
   如果可用，请包含每个变更所使用的架构。

   始终宣布：“使用变更：<name>”，并说明如何覆盖（例如 `/opsx-archive <other>`）。

   **在现有归档检查之前加载当前归档输入：**

   解析选定的变更和规划根目录后，运行：
   ```bash
   openspec instructions archive --change "<name>" --json
   ```
   在此命令中保留相同的选定根目录标志。此查找仅提供建议且为可选操作：它只提供额外的提示输入，因此绝不能阻止归档。  
   如果该命令以非零状态退出或返回无效 JSON——例如较旧的命令行工具尚不支持此命令——则继续归档工作流，不使用上下文和操作指导。不要报告错误，也不要停止。

   成功的响应可以省略这两个可选字段。将 `context` 视为提示级别的必需输入：读取并考虑它，并应用相关的项目事实、约定和约束。将 `operationGuidance` 视为可选的附加建议：读取并考虑每一条，并遵循适用且与内置归档工作流兼容的条目。

   将这两个字段与内置步骤、明确的用户选择、已解析的路径、命令行检查和命令契约分开处理。如果上下文与这些控制性输入中的任何一项冲突，请报告冲突并保留控制性输入的值。如果指导不适用或与控制性输入冲突，则不要遵循该指导，并解释原因。不要从任一字段推断替代路径、跳过提示或标志；除非用户另行要求，否则不要将它们的文本逐字复制到规范、变更工件或归档摘要中。这些是提示级别的行为契约，而不是可强制执行的检查。

2. **检查工件完成状态**

   运行 `openspec status --change "<name>" --json` 来检查工件完成情况。

   解析 JSON 以了解：
   - `schemaName`：正在使用的工作流
   - `planningHome`、`changeRoot`、`artifactPaths` 和 `actionContext`：路径和范围上下文
   - `artifacts`：工件列表及其状态（`done`、`skipped` 或其他）

   在任务提示、规范比较、同步或归档变更之前，执行模式保护检查：
   ```bash
   node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" guard \
     --change-root "<changeRoot>" --operation archive
   ```
   非零结果具有权威性，不能被用户确认覆盖。演练变更绝不归档。

   **如果存在任何既不是 `done` 也不是 `skipped` 的工件**（跳过的工件满足要求——该变更声明了 skip_specs）：
   - 显示警告并列出未完成的工件
   - 提示用户确认是否继续
   - 如果用户确认，则继续

3. **复核机器任务状态**

   运行 `runtime-entry.ts task inspect --change-root "<changeRoot>"` 展示任务状态。archive guard 已要求全部必需任务为
   `verified`；任何非 verified 状态必须停止，不能通过人工确认或修改 Markdown checkbox 绕过。

4. **评估增量规范同步状态**

   使用状态 JSON 中的 `artifactPaths.specs.existingOutputPaths` 作为唯一的增量规范来源。如果缺少 `specs` 条目或 `existingOutputPaths` 为空，则继续执行，不提示同步，也不要从其他工件推断增量规范。

   **如果存在增量规范：**
   - 将每个增量规范与其对应的主规范 `<planningHome.root>/openspec/specs/<capability-path>/spec.md` 进行比较（使用步骤 2 中面向存储库的 `planningHome.root`，不要硬编码仓库路径）
   - 确定将应用哪些变更（新增、修改、移除、重命名）
   - 在提示前显示合并摘要

   **提示选项：**
   - 如果需要变更：“立即同步（推荐）”、“不同步直接归档”
   - 如果已经同步：“立即归档”、“仍然同步”、“取消”

   根据回答进行处理：
   - “取消”——停止，不归档
   - “不同步直接归档”或“立即归档”——继续归档
   - “立即同步”或“仍然同步”——同步，然后进行验证（如下）
   - 任何其他回答——再次询问，而不是归档

   在选定的同步写入任何主规范之前，使用相同的选定根目录标志运行一次
   `openspec instructions specs --change "<name>" --json`。要求其以零状态退出并返回有效的工件指令 JSON。如果查找失败或返回无效 JSON，请报告错误，并在写入任何主规范或移动变更之前停止。有效响应中省略 `rules` 表示无规则情况。仅将返回的 `rules` 应用于此次合并生成的主规范的内容和形式；不要将其用作归档指导、改变命令行行为，也不要将规则文本复制到任何输出文件中。

   然后针对变更 `<name>` 内联运行 `/opsx-sync` 工作流（由代理驱动的智能合并），传入增量规范分析结果和上面获取的规范规则快照，并等待其完成。内联同步必须复用该快照，不得再次获取 `specs` 指令。不要将其委托给后台任务——步骤 5 会将 `changeRoot` 移出仍在读取它的同步任务，导致变更已归档而主规范从未更新。如果你的代理只能通过委托来运行它，则必须同步委托并等待结果。

   然后从本步骤顶部重新对 `artifactPaths.specs.existingOutputPaths` 中每个具有增量规范的能力进行比较——不仅是同步报告已处理的能力。成功同步后不应再有任何待应用内容，因此每个能力现在都必须显示为已同步：
   - ADDED Requirements 已存在
   - MODIFIED Requirements 包含增量规范中指定的场景和描述变更，同时保留其其他场景
   - `REMOVED Requirements` 已移除——如果此次同步使某个能力退役（移除了其最后一个需求，使 `## Requirements` 为空），则应删除其主规范，而不是保留空规范；如果同步明确保留了某个规范并报告了该情况，也视为匹配
   - RENAMED Requirements 以新名称存在，并且旧名称不存在

   如果同步失败，或任何能力不匹配，请报告差异并停止——不要归档。任何内容都未移动，`changeRoot` 保持不变，因此用户可以修复不匹配或重新运行同步，然后重新开始归档。

5. **执行归档**

   如果不存在，则在 `planningHome.changesDir` 下创建 `archive` 目录：
   ```bash
   mkdir -p "<planningHome.changesDir>/archive"
   ```

   生成目标名称：如果变更名称已经以 `YYYY-MM-DD-` 前缀开头，则按原样使用；否则，在变更名称前添加当前日期，格式为 `YYYY-MM-DD-<change-name>`。绝不要叠加第二个日期（与 `openspec archive` 的规则相同）。

   **检查目标是否已存在：**
   - 如果存在：失败并报错，建议重命名已有归档或使用其他日期
   - 如果不存在：将 `changeRoot` 移动到归档目录

   ```bash
   mv "<changeRoot>" "<planningHome.changesDir>/archive/<target-name>"
   ```

6. **显示摘要**

   显示归档完成摘要，包括：
   - 变更名称
   - 使用的架构
   - 归档位置
   - 规范同步状态（已同步 / 已跳过同步 / 无增量规范）
   - 关于任何警告的说明（未完成的工件/任务）

**成功时的输出**

```markdown
## 归档完成

**变更：** <change-name>
**Schema：** <schema-name>
**已归档至：** 根据 planningHome.changesDir/<target-name>/ 推导出的归档路径
**Specs：** ✓ 已同步至主 specs

所有工件均已完成。所有任务均已完成。
```

**成功时的输出（无增量 Spec）**

```markdown
## 归档完成

**变更：** <change-name>
**Schema：** <schema-name>
**已归档至：** 根据 planningHome.changesDir/<target-name>/ 推导出的归档路径
**Specs：** 无增量 spec

所有工件均已完成。所有任务均已完成。
```

**成功时的输出（带警告）**

```markdown
## 归档完成（带警告）

**变更：** <change-name>
**Schema：** <schema-name>
**已归档至：** 根据 planningHome.changesDir/<target-name>/ 推导出的归档路径
**Specs：** 已跳过同步（用户选择跳过）

**警告：**
- 归档时有 2 个未完成的工件
- 归档时有 3 个未完成的任务
- 已跳过增量 spec 同步（用户选择跳过）

如果这不是有意的，请检查归档内容。
```

**出错时的输出（归档已存在）**

```markdown
## 归档失败

**变更：** <change-name>
**目标：** 根据 planningHome.changesDir/<target-name>/ 推导出的归档路径

目标归档目录已存在。

**选项：**
1. 重命名已有归档
2. 如果已有归档是重复项，则删除它
3. 等待其他日期再进行归档
```

**保护规则**
- 宣布选定的变更；存在歧义时提示用户进行选择
- 使用工件图（`openspec status --json`）检查完成情况
- 不要因警告阻止归档——仅告知用户并请求确认
- 移动到归档时保留 .openspec.yaml（它会随目录一起移动）
- 清晰显示发生了什么的摘要
- 如果请求同步，则内联运行 `/opsx-sync` 工作流（由代理驱动）
- 绝不要在规范同步仍在进行时归档——内联运行同步，并在移动 `changeRoot` 之前验证主规范
- 如果存在增量规范，始终执行同步评估，并在提示前显示合并摘要
- 应用相关的运行时上下文并报告冲突；操作指导仍然只是建议
- 考虑每一条指导，并解释任何不适用或冲突的建议
- 现有命令行检查、已解析路径、提示和命令契约保持不变
- 工件规则仅约束正在写入的规范，绝不是操作指导
- 绝不要将运行时上下文、操作指导或工件规则文本逐字复制到输出文件中
