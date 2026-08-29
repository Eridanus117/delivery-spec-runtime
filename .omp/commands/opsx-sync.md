---
description: "将变更中的增量规范同步到主规范"
---

**统一运行时入口（必须先执行）：** 使用状态输出中的 `planningHome.root`；尚未选择 Change 时使用当前资产仓根。
```bash
node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" runtime-check --change-root "<planningHome.root>"
```
入口非零时立即停止；不得绕过 runtime lock、commit、manifest 或投影摘要检查。

将变更中的增量规范同步到主规范。

这是一个由**代理驱动**的操作——你将读取增量规范，并直接编辑主规范以应用变更。这样可以进行智能合并（例如，添加一个场景，而不是复制整个需求）。

**存储库选择：**如果用户指定了一个存储库（存储库是注册在此机器上的独立 OpenSpec 仓库），或工作内容位于某个存储库中，请运行 `openspec store list --json` 来发现已注册的存储库标识符，然后在读取或写入规范和变更的命令（`new change`、`status`、`instructions`、`list`、`show`、`validate`、`archive`、`doctor`、`context`、`schemas`、`view`）中传递 `--store <id>`。一旦选定，就将 `--store <id>` 视为工作流其余部分中的固定标志。下面所有未限定范围的命令示例都只是简写：运行前请追加该标志。例如，应运行 `openspec status --change "<name>" --json --store "<id>"`，而不是下面展示的未限定范围形式。其他命令不接受此标志。命令打印的提示已经带有该标志；后续操作请保留它。未指定存储库时，命令作用于最近的本地 `openspec/` 根目录。

`<capability-path>` 是相对于 `specs/` 的规范目录（例如 `user-auth` 或 `identity/user-auth`）。解析其主规范时，保留每个增量规范的完整路径。

**输入**：可以在 `/opsx-sync` 后指定变更名称（例如 `/opsx-sync add-auth`）。如果省略，请检查是否可以从对话上下文中推断。如果不明确或存在歧义，你**必须**提示用户从可用变更中选择。  
**提供的参数**：$@

**步骤**

1. **选择变更**

   如果提供了名称，则使用该名称。否则：
   - 如果用户提到过某个变更，则从对话上下文中推断
   - 如果只有一个活动变更，则自动选择
   - 如果存在歧义，则运行 `openspec list --json` 获取可用变更，并要求用户选择其中一个

   提示时，显示具有增量规范的变更（位于 `specs/` 目录下）。

   始终宣布：“正在使用变更：<name>”，并说明如何覆盖（例如 `/opsx-sync <other>`）。

2. **解析变更上下文**

   运行：
   ```bash
   openspec status --change "<name>" --json
   ```

   JSON 包含 `planningHome.root`。主规范位于 `<planningHome.root>/openspec/specs/` 下——下面所有主规范路径都使用这个（支持存储库的）根目录，而不是硬编码的仓库路径。选定存储库时，它指向该存储库，而不是当前仓库。

   读取或写入任何主规范之前，执行模式守卫：
   ```bash
   node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" guard \
     --change-root "<changeRoot>" --operation sync
   ```

   非零结果具有权威性。演练变更必须停止，不得比较或修改长期规范。

3. **查找增量规范**

   将状态 JSON 中的 `artifactPaths.specs.existingOutputPaths` 作为增量规范路径的**唯一**来源。如果缺少 `specs` 条目或 `existingOutputPaths` 为空，则报告没有要同步的增量规范，不得从其他构件中推断路径，并停止，不得请求构件说明或写入主规范。

   除非调用方缩小了范围，否则同步 `existingOutputPaths` 中的每条路径。  
   调用方可以通过指定 `existingOutputPaths` 中完整条目的显式列表来缩小范围——逐字复制这些绝对路径。归档会内联执行此操作，用户也可以这样做（例如，选择以 `/specs/billing/invoices/spec.md` 结尾的条目）。  
   然后仅同步指定的路径，并保持其余增量规范不变：  
   批量归档会排除无法找到其实现的增量规范，而无论如何同步它都会写入调用方有意保留的主规范。  
   将这一缩小后的选择延续到第 4 步；绝不能再扩大回完整列表。  
   如果指定的路径不在 `existingOutputPaths` 中，则不要同步它——报告该情况并停止，而不是静默丢弃。  
   如果指定的列表为空，则报告没有要同步的内容并停止，不得写入主规范。

   每个增量规范文件包含如下章节：
   - `## ADDED Requirements` - 要添加的新需求
   - `## MODIFIED Requirements` - 对现有需求的修改
   - `## REMOVED Requirements` - 要移除的需求
   - `## RENAMED Requirements` - 要重命名的需求（FROM:/TO: 格式）

   如果没有找到增量规范，则通知用户并停止。

4. **针对每个增量规范，将变更应用到主规范**

   在首次写入主规范之前，获取一次当前的规范规则快照：
   - 如果归档在内联调用此工作流时提供了来自 `openspec instructions specs --change "<name>" --json` 的有效快照，则重新使用该快照，不要再次获取相同的说明。
   - 否则现在运行一次该命令，并使用相同的已选根目录标志。
   - 如果直接获取时以非零状态退出，或返回无效的构件说明 JSON，则报告错误，并在写入任何主规范之前停止。不得将该失败视为不存在规则集。
   - 如果有效响应省略了 `rules`，则表示未配置构件规则，继续执行现有的语义合并。

   仅将返回的 `rules` 应用于此次合并所生成的主规范的内容和形式。构件规则不是操作指导，不能改变所选根目录、增量路径、命令行检查或工作流步骤。将其文本作为约束使用，但不得逐字复制到主规范或摘要中。

   对于第 3 步选定的每个能力增量规范路径——完整的 `existingOutputPaths` 列表，或调用方提供的缩小子集（这些路径可能属于选定的存储库，而不是仓库）：

   a. **读取增量规范**，了解预期变更

   b. **读取主规范**，路径为 `<planningHome.root>/openspec/specs/<capability-path>/spec.md`（可能尚不存在）

   c. **智能应用变更**：

      **ADDED Requirements：**
      - 如果主规范中不存在该需求 → 添加它
      - 如果该需求已经存在 → 更新它以匹配（视为隐式 MODIFIED）

      **MODIFIED Requirements：**
      - 在主规范中找到该需求
      - 应用变更——这可能包括：
        - 添加主规范中尚不存在的新场景
        - 修改现有场景
        - 修改需求描述
      - 保留增量规范中未提及的场景和内容

      **REMOVED Requirements：**
      - 从主规范中移除整个需求块
      - 废弃该能力。仅当以下**所有**条件均满足时，才删除整个 `spec.md`，并在目录中不再有其他内容后删除该目录：
        1. 本次运行移除需求后不再有任何需求块；
        2. 规范其余部分格式良好（仍然包含 `## Purpose`）；
        3. 在本次同步之前主规范并非已经为空——如果没有移除任何内容，则不做任何更改；
        4. 整个文件中的每一行其他非空行，都可以归属于标题、Purpose、Requirements 标题，或规范格式要求的需求的陈述、场景或围栏示例；
        5. 变更的 `.openspec.yaml` 声明了 `retire_capabilities: true`；
        6. `spec.md` 解析后位于真实的规范根目录内（不要跟随能力目录符号链接去删除外部文件）。
        如果移除选定需求后不再有任何需求块，且任一废弃条件不满足，则不要修改主规范。停止该能力的同步，报告阻止条件，并告知用户如何解决。绝不要写入或留下空的 `## Requirements` 章节。  
        如果只是缺少标记，也要说明这一点——这是用户可以添加以使废弃操作继续执行的唯一内容。  
        删除文件也会删除其中的 `## Purpose`；任何其他章节块都会阻止废弃。报告废弃情况时，指出 Purpose。仅当规范位于调用方的检出目录中时，才包含可粘贴的 `git checkout`；否则提供限定于检出目录的恢复指导。

      **RENAMED Requirements：**
      - 找到 FROM 需求，将其重命名为 TO

      **增量规范中的 `## Purpose`：**
      - 主规范已经有 Purpose，且它具有权威性——不要改动（这正是 `openspec archive` 的行为；它会发出警告并继续）。

   d. **如果能力尚不存在，则创建新的主规范**：
      - 创建 `<planningHome.root>/openspec/specs/<capability-path>/spec.md`
      - 添加 Purpose 章节：如果增量规范中有 `## Purpose`，则逐字复制其正文（这正是 `openspec archive` 的行为）；只有在没有 Purpose 时，才写入简短的 TBD 占位符
      - 添加 Requirements 章节，并包含 ADDED 需求
      - 遵循下面的**主规范格式参考**

5. **验证更新后的主规范**

   使用之前相同的已选根目录标志运行 `openspec validate --specs`。  
   如果验证失败，则报告问题，不得声称同步成功。

6. **显示摘要**

   应用所有变更后，汇总：
   - 更新了哪些能力
   - 进行了哪些变更（添加/修改/移除/重命名的需求）
   - 任何仍带有 `TBD Purpose` 占位符的新主规范，以便立即补充，而不是一直保留
   - 任何已废弃的能力，指出被删除的 `spec.md`、其 Purpose，以及可粘贴的 `git checkout` 或限定于检出目录的恢复指导

**增量规范格式参考**

```markdown
## Purpose

仅适用于引入全新能力的增量规范。用于为新的主规范提供初始内容。

## ADDED Requirements

### Requirement: 新功能
系统必须执行某项新操作。

#### Scenario: 基本情况
- **WHEN** 用户执行 X
- **THEN** 系统执行 Y

## MODIFIED Requirements

### Requirement: 现有功能
系统必须继续执行现有操作，现在还要处理 A。

#### Scenario: 主规范已有的场景
- **WHEN** 用户执行 X
- **THEN** 系统执行 Y

#### Scenario: 要添加的新场景
- **WHEN** 用户执行 A
- **THEN** 系统执行 B

## REMOVED Requirements

### Requirement: 已弃用功能

## RENAMED Requirements

- FROM: `### Requirement: 旧名称`
- TO: `### Requirement: 新名称`
```

**主规范格式参考**

主规范是增量规范要合并到的目标。主规范绝不能包含增量操作标题（`## ADDED/MODIFIED/REMOVED/RENAMED Requirements`）；同步后，每个需求都必须位于单个 `## Requirements` 章节下：

```markdown
# <capability> Specification

## Purpose
简要说明此能力的作用及其存在原因。

## Requirements

### Requirement: 新功能
系统必须执行某项新操作。

#### Scenario: 基本情况
- **WHEN** 用户执行 X
- **THEN** 系统执行 Y
```

**关键原则：智能合并**

不同于程序化合并，你要进行合并而不是覆盖：
- MODIFIED 块包含整个需求——正文以及变更后保留的每个场景。`openspec validate` 和 `openspec archive` 都会拒绝丢弃主规范中仍存在的场景的内容。
- 保留增量规范未提及的任何内容，并维持主规范中的现有顺序
- 运用判断进行合理的变更合并

**成功时的输出**

```markdown
## 规范已同步：<change-name>

已更新的主规范：

**<capability-1>**：
- 已添加需求：“新功能”
- 已修改需求：“现有功能”（添加了 1 个场景）

**<capability-2>**：
- 已创建新的规范文件
- 已添加需求：“另一个功能”

主规范现已更新。变更仍处于活动状态——实现完成后再进行归档。
```

**防护规则**
- 在进行任何变更之前读取增量规范和主规范
- 保留增量规范未提及的现有内容
- 绝不要将增量规范文件原样复制到主规范中——合并其内容，使主规范保留主规范格式参考中的结构，且不包含增量操作标题
- 如果有任何不明确之处，请求澄清
- 在操作过程中持续展示正在进行的变更
- 操作应当具有幂等性——运行两次应得到相同结果
- 仅使用 `artifactPaths.specs.existingOutputPaths`；绝不要从无关构件中推断增量规范
- 遵守调用方提供的 `existingOutputPaths` 子集；绝不能再扩大回完整列表
- 直接同步时获取一次规范说明，或在内联执行时重新使用归档提供的快照
- 如果规范说明响应为非零状态或 JSON 无效，则在每次写入主规范之前停止
- 构件规则仅约束正在写入的规范，绝不会复制到输出文件中。
