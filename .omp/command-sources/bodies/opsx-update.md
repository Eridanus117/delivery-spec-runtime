修订现有变更的规划产物并保持其一致性。绝不编辑代码。

若用户明确要求执行 OpenSpec 自身的 `openspec update`（而不是修订 Change 产物），不得在实时资产仓调用 `openspec update` 或 `runtime-update`。Runtime 升级必须在 `delivery-spec-runtime` 仓建立独立的受控升级 Change，在隔离目录生成并验证候选资产；不得让生成器沿 `.omp/commands` 受管投影反向写入 Runtime submodule。

**存储库选择：** 如果用户指定了一个存储库（存储库是一个在本机注册的独立 OpenSpec 存储库），或当前工作位于某个存储库中，请运行 `openspec store list --json` 以发现已注册的存储库 ID，然后在读取或写入规范和变更的命令（`new change`、`status`、`instructions`、`list`、`show`、`validate`、`archive`、`doctor`、`context`、`schemas`、`view`）中传递 `--store <id>`。一旦选定，就将 `--store <id>` 视为后续整个工作流中的固定选项。以下命令中每个未限定范围的示例都只是简写：运行前，请追加该标志。例如，应运行 `openspec status --change "<name>" --json --store "<id>"`，而不是下面显示的未限定范围形式。其他命令不接受此标志。命令打印的提示中已经带有该标志；后续操作中请保留它。如果没有指定存储库，命令将作用于最近的本地 `openspec/` 根目录。

**输入：** 可以在 `/opsx-update` 后指定变更名称（例如 `/opsx-update add-auth`）。如果省略，请检查是否可以从对话上下文中推断出来。如果名称含糊或存在歧义，你必须提示用户从可用变更中选择。

**提供的参数：** $@

`/opsx-continue` 是可选工作流，可能尚未安装。在下面任何地方建议使用它之前，请先验证它是否可用。如果不可用，`openspec status --change "<name>" --json` 会显示下一个产物，而 `openspec instructions "<artifact-id>" --change "<name>" --json` 会说明如何创建该产物。

**步骤**

1. **选择变更**

   如果提供了名称，则使用该名称。否则：
   - 如果用户提到过某个变更，则从对话上下文中推断
   - 如果只有一个活动变更，则自动选择
   - 如果存在歧义，则运行 `openspec list --json`，获取按最近修改时间排序的可用变更，并要求用户选择一个

   提示用户时，将最近修改的 3-4 个变更作为选项展示，并显示：
   - 变更名称
   - 架构（如果存在 `schema` 字段，则使用该字段；否则显示 "spec-driven"）
   - 状态（例如 "0/5 个任务"、"已完成"、"无任务"）
   - 最近修改时间（取自 `lastModified` 字段）

   将最近修改的变更标记为“（推荐）”，因为这很可能是用户想要更新的变更。

   始终宣布：“使用变更：<name>”，并说明如何覆盖选择（例如 `/opsx-update <other>`）。

2. **获取变更的产物**
   ```bash
   openspec status --change "<name>" --json
   ```
   解析 JSON 以了解当前状态。响应包含：
   - `schemaName`：所使用的工作流架构（例如 "spec-driven"）
   - `artifacts`：包含各个产物及其状态（"done"、"skipped"、"ready"、"blocked"）的数组
   - `isPlanningComplete`：一个布尔值，表示所有规划产物是否已完成。较旧的命令行工具版本将相同的值公开为 `isComplete`
   - `planningHome`、`changeRoot`、`artifactPaths` 和 `actionContext`：路径和范围上下文。请使用这些信息，不要假定存储库本地路径。

   产物 ID 和路径来自当前活动架构——不得假定它们，也不得依据硬编码的产物名称进行分支处理。自定义架构必须无需修改即可正常工作。

   要编辑的文件是 `artifactPaths.<id>.existingOutputPaths`——磁盘上实际存在的具体文件；对于通配产物，这些路径已经展开为具体文件（例如 `specs/**/*.md`）。不要写入 `resolvedOutputPath`：对于通配产物，它仍然是通配模式，而不是实际文件。

   将所有待修改的 `existingOutputPaths` 写成 Change 根相对路径 JSON 数组，再在写入前冻结摘要：
   ```bash
   node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" update snapshot \
     --change-root "<changeRoot>" --paths-file "<changeRoot>/.delivery-update-paths.json"
   ```
   路径越界、缺失或合同失败时停止。

3. **理解请求**
   - 如果用户要求进行特定修订（“设计现在使用 X”），则以此作为开始编辑的内容。
   - 如果用户只说“更新”或“使其一致”，则将其视为一致性审查：阅读现有产物，并相互检查是否存在矛盾、缺漏和重复。

4. **阅读并协调**
   - 阅读请求涉及的产物以及该变更的其他现有产物。
   - 应用请求的编辑。然后从任意方向检查每个其他现有产物：对后续产物的编辑可能要求修订较早的产物，而不仅仅是反过来。构建顺序是有用的阅读顺序，但不是限制哪些产物可以被修订的约束。
   - 记录现在不一致、缺失或相互矛盾的所有内容。
   - 仅修订已经存在的文件（`existingOutputPaths`）。不要创建尚不存在的产物，也不要在通配产物下臆造新文件——请记录这些情况，并指引用户使用 `/opsx-continue` 来创建它们。
   - 如果变更已经保持一致，请说明这一点，并且不要进行任何编辑。

5. **逐个产物确认并应用**
   - 展示每项拟议修订及其原因。只有在用户确认后才写入。
   - 如果用户拒绝某项修订，则不要写入；保持该产物不变。
   - 如果需要进行实质性重写，请先获取该产物的规则和模板：
     ```bash
     openspec instructions "<artifact-id>" --change "<name>" --json
     ```

   每项已确认编辑完成后运行文件级 delta 诊断：
   ```bash
   node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" update diagnose \
     --change-root "<changeRoot>"
   ```
   输出必须只包含用户确认的路径；任何额外 delta 立即回滚本轮编辑。需求理解、改造方案或测试方案内容变化后，
   其摘要批准会自动转为 `pending`；重新批准前不得 apply。

6. **指向下一步（仅提供指导——绝不执行）**
   - 仍有缺失的产物 -> 建议使用 `/opsx-continue` 来创建它们。
   - 变更已经实现（任务已勾选或已经应用） -> 代码可能不再匹配修订后的计划；建议使用 `/opsx-apply` 将差异落实到代码中。
   - 所有内容都已完成并实现 -> 建议使用 `/opsx-archive`。

**输出**

每次调用后，显示：
- 哪些产物已修订（以及哪些拟议修订被拒绝）
- 延后交由 `/opsx-continue` 处理的内容（尚未创建的产物或文件）
- 变更目前所处的状态以及建议执行的下一条命令

**防护规则**
- 仅处理规划产物——绝不编辑实现代码。如果修订后的计划意味着需要修改代码，请停止并指向 `/opsx-apply`。
- 使用 `openspec status` 报告的产物 ID 和路径；绝不得依据硬编码的产物名称进行分支处理。
- 仅编辑 `existingOutputPaths` 中的具体文件；绝不写入通配模式的 `resolvedOutputPath`。
- 不要推进构建前沿：不得创建新产物，也不得在通配产物下创建新文件——这是 `/opsx-continue` 的工作。
- 每次编辑都必须先获得用户确认，然后才能写入。
- 写入前必须 snapshot，写入后必须 diagnose；不得以 Git 整仓 diff 代替 Change 内文件级诊断
- 如果请求改变的是变更的*意图*而不是对其进行细化，请先确认可选的 `/opsx-new` 工作流是否可用。如果可用，建议使用 `/opsx-new` 重新开始（“更新还是重新开始”启发式）。如果不可用，请要求用户提供一个独立且未使用的变更名称，并建议改为运行 `openspec new change "<new-change-name>"`。
