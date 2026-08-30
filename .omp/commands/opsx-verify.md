---
description: "在归档前验证实现是否与变更工件匹配"
---

**统一运行时入口（必须先执行）：** 使用状态输出中的 `planningHome.root`；尚未选择 Change 时使用当前资产仓根。
```bash
node --experimental-strip-types "<planningHome.root>/.delivery-spec-runtime/openspec/tools/runtime-entry.ts" runtime-check --change-root "<planningHome.root>"
```
入口非零时立即停止；不得绕过父仓 gitlink、runtime submodule commit、manifest、dirty 状态或相对软链检查。
选择、列出或报告 active Change 时，必须对每个候选运行 `runtime-entry.ts inspect --change-root "<changeRoot>"`，显示 `displayName (slug)`；sidecar 缺失或无效时停止，机器选择键与 OpenSpec 参数只能使用slug。

验证实现是否与变更工件（规范、任务、设计）匹配。

**存储选择：** 如果用户指定了一个存储（存储是指在此机器上注册的独立 OpenSpec 仓库），或者当前工作位于某个存储中，请运行 `openspec store list --json`，以发现已注册的存储 ID；然后在读取或写入规范和变更的命令（`new change`、`status`、`instructions`、`list`、`show`、`validate`、`archive`、`doctor`、`context`、`schemas`、`view`）中传入 `--store <id>`。一旦选定存储，在工作流的其余部分都将 `--store <id>` 视为固定参数。下面这些命令的所有未指定作用域的示例都是简写形式：运行前请追加该标志。例如，应运行 `openspec status --change "<name>" --json --store "<id>"`，而不是下面显示的未指定作用域形式。其他命令不接受此标志。命令打印的提示已经带有该标志；后续操作中保留它。没有存储时，命令作用于最近的本地 `openspec/` 根目录。

**输入：** 可以选择在 `/opsx-verify` 后指定变更名称（例如 `/opsx-verify add-auth`）。如果省略，请检查是否可以从对话上下文中推断。如果模糊或存在歧义，你 MUST 提示用户选择可用的变更。

**提供的参数：** `$@`

**步骤**

1. **选择变更**

   如果提供了名称，则使用该名称。否则：

   - 如果用户在对话中提到了某个变更，则从对话上下文中推断。
   - 如果只有一个活动变更，则自动选择。
   - 如果存在歧义，则运行 `openspec list --json` 获取可用变更，并要求用户选择一个。

   提示时，显示具有实现任务的变更（存在 `tasks` 工件）。

   如果可用，则包含每个变更所使用的架构。

   将任务未完成的变更标记为“（进行中）”。

   始终宣布：“使用变更：<name>”，并说明如何覆盖（例如 `/opsx-verify <other>`）。

2. **检查状态以了解架构**

   ```bash
   openspec status --change "<name>" --json
   ```

   解析 JSON 以了解：

   - `schemaName`：正在使用的工作流（例如 `"spec-driven"`）。
   - `planningHome`、`changeRoot`、`artifactPaths` 和 `actionContext`：路径和作用域上下文。
   - 此变更存在哪些工件。

   在加载验证输入前强制执行变更模式：

   ```bash
   node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" guard \
     --change-root "<changeRoot>" --operation verify
   ```

   对于演练，这要求存在 NO-GO 09 且没有 `release-id`。非零结果具有权威性。

3. **获取规划上下文并加载工件**

   ```bash
   openspec instructions apply --change "<name>" --json
   ```

   这会返回变更目录和 `contextFiles`（工件 ID -> 具体文件路径数组）。读取 `contextFiles` 中的所有可用工件。

4. **初始化验证报告结构**

   创建一个包含三个维度的报告结构：

   - **完整性**：跟踪任务和规范覆盖情况。
   - **正确性**：跟踪需求实现和场景覆盖情况。
   - **一致性**：跟踪设计遵循情况和模式一致性。

   每个维度都可以包含 CRITICAL、WARNING 或 SUGGESTION 问题。

5. **验证完整性**

   **任务完成情况：**

   - 运行 `runtime-entry.ts task inspect --change-root "<changeRoot>"` 读取机器真源。
   - 统计 `verified` 与任务总数；Markdown 任务文件仅用于人工审阅，不解析复选框。
   - 每个非 `verified` 任务均为 CRITICAL；报告 task id、状态、验证方式、evidence 或 blocker。

   **规范覆盖情况：**

   - 如果 `contextFiles.specs` 中存在增量规范：
     - 提取所有需求（以 `"### Requirement:"` 标记）。
     - 对于每个需求：
       - 在代码库中搜索与该需求相关的关键词。
       - 评估实现是否可能存在。
     - 如果需求看起来未实现：
       - 添加 `CRITICAL` 问题：“未找到需求：<需求名称>”。
       - 建议：“实现需求 X：<description>”。

6. **验证正确性**

   **需求实现映射：**

   - 对于增量规范中的每个需求：
     - 搜索实现证据。
     - 如果找到，记录文件路径和行范围。
     - 评估实现是否符合需求意图。
     - 如果发现偏差：
       - 添加 WARNING：“实现可能偏离规范：<details>”。
       - 建议：“根据需求 X 检查 <file>:<lines>”。

   **场景覆盖情况：**

   - 对于增量规范中的每个场景（以 `"#### Scenario:"` 标记）：
     - 检查代码是否处理了相关条件。
     - 检查是否存在覆盖该场景的测试。
     - 如果场景看起来未覆盖：
       - 添加 `WARNING`：“场景未覆盖：<场景名称>”。
       - 建议：“为以下场景添加测试或实现：<description>”。

7. **验证一致性**

   **设计遵循情况：**

   - 如果存在 `contextFiles.design`：
     - 提取关键决策（查找诸如 `Decision:`、`Approach:`、`Architecture:` 的章节）。
     - 验证实现是否遵循这些决策。
     - 如果检测到矛盾：
       - 添加 WARNING：“未遵循设计决策：<decision>”。
       - 建议：“更新实现，或修改 `design.md` 以匹配实际情况”。
   - 如果没有 `design.md`：跳过设计遵循检查，并记录“没有 `design.md` 可供核对”。

   **代码模式一致性：**

   - 检查新增代码是否与项目模式一致。
   - 检查文件命名、目录结构和编码风格。
   - 如果发现明显偏差：
     - 添加 SUGGESTION：“代码模式偏差：<details>”。
     - 建议：“考虑遵循项目模式：<example>”。

8. **生成验证报告**

   **摘要评分卡：**

   ```markdown
   ## Verification Report: <change-name>

   ### Summary
   | Dimension    | Status           |
   |--------------|------------------|
   | Completeness | X/Y tasks, N reqs|
   | Correctness  | M/N reqs covered |
   | Coherence    | Followed/Issues  |
   ```

   **按优先级列出问题：**

   1. **CRITICAL**（归档前必须修复）：
      - 未完成的任务。
      - 缺失的需求实现。
      - 每项问题都必须包含具体、可执行的建议。

   2. **WARNING**（应修复）：
      - 规范或设计偏差。
      - 缺失的场景覆盖。
      - 每项问题都必须包含具体建议。

   3. **SUGGESTION**（最好修复）：
      - 模式不一致。
      - 次要改进。
      - 每项问题都必须包含具体建议。

   **最终评估：**

   - 交付包含 CRITICAL 问题时：“发现 X 个严重问题。归档前修复。”
   - 交付没有严重问题时：使用现有的警告或一切正常评估，并说明是否已准备好归档。
   - 演练时：始终说明“工作流演练已验证；发布、规范同步和归档仍被禁止。”NEVER 输出“准备归档”。

**验证启发式方法**

- **完整性**：专注于机器任务状态、批准状态、Requirement 和场景覆盖。
- **正确性**：使用关键词搜索、文件路径分析和合理推断——不要求完全确定。
- **一致性**：查找明显的不一致，不要过度挑剔风格。
- **误报**：不确定时，优先使用 SUGGESTION 而不是 WARNING，优先使用 WARNING 而不是 CRITICAL。
- **可执行性**：每个问题都必须包含具体建议，并在适用时提供文件或行引用。

**优雅降级**

- 如果只有 `tasks.md`：仅验证任务完成情况，跳过规范和设计检查。
- 如果存在 `tasks` + `specs`：验证完整性和正确性，跳过设计检查。
- 如果工件齐全：验证全部三个维度。
- 始终说明跳过了哪些检查以及原因。

**输出格式**

使用清晰的 Markdown，并包含：

- 用于摘要评分卡的表格。
- 按组列出问题（CRITICAL/WARNING/SUGGESTION）。
- 格式为 `file.ts:123` 的代码引用。
- 具体、可执行的建议。
- 不要提供诸如“考虑检查”之类的模糊建议。
