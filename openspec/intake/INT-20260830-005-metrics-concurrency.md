---
schemaVersion: 1
id: INT-20260830-005-metrics-concurrency
state: promoted
phase: disposition
source: runtime-maintainer-session
capturedAt: 2026-08-30
promotedTo: establish-runtime-metrics-baseline
---

# Intake

## 原始问题

建立并发效率指标基线后再提升 Agent 并发度

## 维护者审阅入口

本 Intake 是当前并发指标工作的唯一审阅入口；其他 Intake 和 `establish-intake-inventory` Change 只提供背景或基础设施，不需要在本轮逐份审阅。

### 本轮只需确认三件事

1. **标准化优先**：先固定事件字段、枚举、时间和指标公式，再采集当前并发 `C`；“脱敏”只表示隐私和仓库边界。
2. **本地存储**：原始事件只写运行者本地私有 state 目录，不写项目仓库、Runtime submodule 或远程 telemetry。
3. **实验顺序**：先记录 `C`，再只改变一个变量到 `C+1`；主指标、护栏指标、停止条件和回滚条件必须预先固定。

### 审阅范围

- 本文件的“首版标准化协议”；
- 本文件的“当前并发基线的记录方式”；
- 本文件的“增加一个并发槽位的对照”。

### 本轮无需审阅

- `INT-20260830-001`、`002`、`003`、`004`、`006`：历史或其他待处理事项；
- `establish-intake-inventory` Change：已完成的 Intake 盘点基础设施；
- Runtime 源码：本轮尚未提出并发采集器或并发调度代码变更。

## Triage

范围：Runtime 仓库的本地脱敏指标、Agent 并发度和交付效率
影响：没有基线时提高并发无法区分吞吐收益、排队、冲突、返工和 CI 成本
判断：continue

## Evidence

### 已知事实

- `INT-20260830-004` 已定义决策价值、采用漏斗、首次价值时间、阶段耗时、WIP、冲突、返工和审计可信度等指标。
- 第一版边界限定为脱敏元数据，不建设远程 telemetry。
- 当前没有一般 workflow 采集器、统一基线、看板或并发阈值。
- CI 只验证 Runtime 完整性和测试结果，不衡量有效决策率或 Agent 冲突率。

## 初始分析结论（2026-08-30）

- 当前实际并发度、各阶段 WIP 和排队等待时间未知。
- 首次有用产出、决策完成率、冲突率和返工率尚无统计基线。
- 增加一个并发槽位是否改善吞吐且不提高返工，尚未验证。
- 指标存储应留在本地私有工作区，不能写入公共 Runtime 业务资产。

### 证据

- `openspec/intake/INT-20260830-004-runtime-metrics-and-options.md`
- `openspec/intake/README.md`
- `openspec/specs/intake-workflow/spec.md`
- `docs/maintainer-guide.md`

## Options

### 候选处置

以下内容记录标准化前盘点出的缺口；2.1 已补齐首版标准化协议，但样本数据仍未采集：

- 建立本地低频脱敏事件协议，先记录当前并发基线，再增加一个并发槽位做对照。
- 关键前置是事件和指标的标准化；脱敏是数据边界与安全要求，不是基线可比性的主要原因。
- 直接提高并发：实施最快，但无法判断收益，也无法及时发现冲突和返工。
- 建设远程 telemetry：信息更完整，但隐私、账号安全和维护成本过高，当前不选。

## 当前推进结论（2026-08-30）

本轮已完成资料盘点、Intake 规范化、首版事件/存储/指标标准化和基线执行卡；没有采集真实指标、调整并发度，也没有改变本 Intake 的 `state: captured`、`phase: capture`。`Disposition` 仍为空。

### 已完成和剩余待办

已完成：

- 已确认当前有效记录是本文件，`INT-20260830-004` 仅作为 legacy 背景证据；
- 已固定事件字段、枚举、存储边界、指标公式、缺失数据处理和首轮实验门槛；
- 已记录当前基线执行方式和 `C+1` 的单变量对照方式。

仍未完成：

- 在本地私有 state 目录采集真实 `C` 基线；
- 满足样本条件后再决定是否执行 `C+1`；
- 根据实验结果决定是否提升为正式 Runtime Change。

### 首版标准化协议（2026-08-30）

#### 事件字段

必填字段：

- `schemaVersion`: 固定为 `1`；
- `eventId`: 本地生成的唯一事件标识；
- `runId`: 仅存在于本地私有事件文件的运行关联标识；
- `itemHash`: 使用本地密钥生成的 HMAC-SHA-256，不保存原始事项标识；
- `stage`: `capture`、`clarify`、`discover`、`evaluate`、`decision`；
- `event`: `eligible`、`started`、`useful-output`、`completed`、`blocked`、`failed`、`cancelled`、`resumed`、`conflict`、`rework`、`quality-gate`；
- `command`: 受控命令名，不记录自由文本参数；
- `runtimeVersion`、`profileId`、`profileVersion`、`openSpecVersion`；
- `occurredAt`: UTC RFC 3339 时间；
- `status`: `active`、`completed`、`blocked`、`failed`、`cancelled`；
- `failureCategory`: `none`、`input`、`contract`、`tool`、`environment`、`human-wait`、`conflict`、`quality-gate`、`timeout`；
- `retryCount`、`slotCount`、`activeCount`、`queueDepth`：非负整数；
- `qualityGate`: `pass`、`fail`、`not-run`；
- `humanOutcome`: `none`、`useful`、`not-useful`、`accepted`、`rejected`、`deferred`。

约束：

- 所有时间使用 UTC RFC 3339；事件顺序以 `occurredAt` 和 `eventId` 确定，乱序不得静默重写；
- `eventId` 重复时拒绝追加，不覆盖旧事件；
- 缺少必填字段、枚举值非法或脱敏失败时 fail closed；
- 原始请求、响应、业务正文、凭据、用户名、绝对路径、机器标识、trace 和 release-id 永不进入事件；
- `runId`、HMAC 密钥和原始事件文件只存在本地私有存储，公共仓库只能保留协议、合成示例和脱敏汇总。

#### 本地存储与清理

- 存储根由运行环境提供的本地私有 state 目录确定，默认不位于项目仓库、Runtime submodule 或同步目录；
- 事件文件使用追加式 `events-YYYYMMDD.jsonl`，汇总文件与原始事件分离；
- 写入必须是单行原子追加；发现截断或非法 JSON 时停止继续采集并报告损坏；
- 原始事件默认只保留实验所需的最短周期，实验结束后由维护者显式删除；汇总只保留到实验结论归档；
- 不提供远程上传、自动同步或跨仓复制；目录不可确认私有时拒绝写入。

#### 指标口径

- `eligible`：进入观测窗口并满足预先定义资格的事项；
- `started`：第一次进入受控 workflow 执行；
- `useful-output`：首次被人工判断为对下一步有帮助的结构化产出；
- `completed`：到达声明的终点且 `qualityGate` 已判定；
- 吞吐：窗口内 `completed` 事件数 / 窗口小时数；
- 首次有用产出时间：`useful-output.occurredAt - eligible.occurredAt`；
- 执行耗时：`completed.occurredAt - started.occurredAt`；
- 排队等待：`started.occurredAt - eligible.occurredAt`；
- WIP：任意时点已 `started` 且尚未出现终态事件的运行数；
- 冲突率：至少有一个 `conflict` 的运行数 / `started` 运行数；
- 返工率：至少有一个 `rework` 的运行数 / `completed` 运行数；
- 失败恢复率：出现 `blocked` 或 `failed` 后又 `resumed` 且最终 `completed` 的运行数 / 出现 `blocked` 或 `failed` 的运行数；
- 质量门禁失败率：`qualityGate=fail` 的已判定运行数 / 已判定运行总数；
- 实际并发：`activeCount` 的最大值和窗口均值；配置并发：`slotCount`；
- 数据完整率：具备全部必填事件和字段的运行数 / `eligible` 运行数。

缺失必填事件的运行不得静默补值；可以从主指标中排除，但必须单独报告并计入数据完整率。本轮已固定首轮观测窗口、最低样本、主指标改善门槛、护栏阈值和停止/回滚条件。

### 3. 当前并发基线的记录方式

当前实际并发度、WIP、排队、首次有用产出、冲突、返工和质量门禁数据均未知，仓内没有基线记录。基线应先固定一段观测窗口和当前槽位数 `C`，保持 Runtime/Profile/OpenSpec 版本、工作资格和环境不变，并对每个 eligible run 只记录脱敏元数据。汇总记录至少包括：

- `baselineId`、窗口起止时间、配置槽位 `C`、实际 active 的最大值/均值、WIP 和 queue wait；
- eligible/started/completed/blocked/failed 数量及吞吐；
- 首次 useful-output 时间和阶段耗时的中位数/分位数；
- 冲突、返工、恢复、CI 耗时和质量门禁结果；
- 版本、排除项、缺失字段和采集完整率。

原始事件和实际标识只能留在本地私有工作区；本公共 Runtime 仓只保留经审查的协议、汇总结论或合成示例，不能把一次真实业务运行写入 Intake。

### 4. 增加一个并发槽位的对照

先记录当前槽位 `C` 的基线，再只把配置改为 `C+1`；任务资格、Profile、Runtime/Profile/OpenSpec 版本、环境、采样窗口长度和指标口径全部保持不变。优先采用交替的 A/B 窗口（A=`C`、B=`C+1`）和匹配事项；若只能采用前后窗口，必须记录时间漂移和事项组成差异这一混淆因素。两组使用完全相同的事件合同和汇总表。

实验前必须预先写下主指标（吞吐、首次有用产出时间）和护栏指标（冲突、返工、质量门禁失败、失败恢复、CI 成本、排队等待）。本轮已在 4.2 固定首轮探索性门槛；只有重复窗口达到最低样本、主指标改善且护栏没有越过门槛时，才考虑保留 `C+1`。发生隐私/完整性问题、质量门禁回归或护栏超阈值时立即停止并回到 `C`。

### 4.1 基线执行卡（首轮）

- `C` 定义为观测窗口开始时实际配置的最大并发槽位；`activeCount` 是运行时实际同时执行数，两者分别记录。
- 观测窗口采用“下一批满足资格的 10 个 eligible 事项，最长 5 个工作日”；事项不足时只报告样本不足，不延长窗口到改变业务条件。
- 只有使用同一 Profile、相同任务资格、相同 Runtime/Profile/OpenSpec 版本且未被维护者预先标记为排除的事项，才进入主指标。
- 每个事项至少记录 `eligible → started → useful-output/completed`；发生阻塞、失败、冲突或返工时追加对应事件。缺事件不补值。
- 首轮只做观测，不修改并发、不修改 Profile、不修改质量门禁、不把合成运行冒充真实基线。
- 首轮最低完成标准是至少 8 个可计算的 `completed` 事项；不足时结论为“基线不足”，不得据此决定提升并发。少于 20 个样本时只报告中位数，不报告 p95。

### 4.2 C+1 实验门

- `C+1` 只允许改变并发槽位，事项资格、Profile、版本、环境、窗口长度和指标口径保持不变。
- 预设主指标：吞吐至少提高 10%，且首次有用产出时间不得恶化超过 10%。
- 预设护栏：冲突率和返工率均不得增加超过 5 个百分点，质量门禁失败率不得增加超过 3 个百分点；数据完整率必须至少 95%。
- 任一隐私、完整性或质量门禁回归立即停止，恢复到 `C`；达到最低样本但未满足主指标时也恢复到 `C`，不继续扩大并发。
- 这些是首轮探索性门槛，不代表统计显著性；若样本不足，只能得出“无法判断”，不能得出“并发有效”或“并发无效”。

### 4.3 当前数据边界

截至本记录，仓内没有真实 `C` 基线数字，也没有 `C+1` 结果。后续真实事件文件必须由运行者在本地私有 state 目录采集；本仓只记录协议、执行卡和审查后的汇总结论。

### 5. legacy Intake 的兼容性问题

规范化前，`INT-20260830-004-runtime-metrics-and-options.md` 的 frontmatter 使用 `status` 而非新合同要求的 `state`，缺少 `phase` 和 `schemaVersion`，ID 也没有新命名中的主题 slug；正文采用旧的“观察/指标范围/当前处置”结构，没有完整的 `capture → triage → evidence → options → disposition` 阶段证据和人工出口。它当时不能证明当前指标已完成，也不能覆盖 005 的并发实验状态。

兼容处理遵循 intake spec：先由 inventory/inspect 识别 legacy，报告状态、缺失字段和迁移建议，保持原文件不变；本轮已通过人工逐文件规范化将 004 转为当前合同格式，保留原始指标范围、候选方案和历史语义。没有把 004 与 005 合并为两个真源，也没有自动 Promote；当前 005 仍是并发实验状态真源。

### 6. 下一步（标准化后）

现在进入基线采集准备：在本地私有 state 目录记录当前 `C`，不先改变并发、不改变 Profile、不改变质量门禁。完成基线并满足样本条件后，再决定是否执行 `C+1`。

## 新方向判断：先构造最小闭环（2026-08-30）

当前优先级不是先增加 Agent 并发度，也不是先建设完整 telemetry，而是先让一条最小工作链路真正跑通并可收口。指标只有在阶段语义、人工出口和失败/恢复边界稳定后才有解释价值。

这里的“最小自闭环”定义为：

`一个事项进入 → 选择一个明确 profile → 执行一个受约束阶段 → 返回结构化产出和下一步 → 在人工判断点停下 → 继续、暂缓、关闭或转入 Change → 保存可追溯结果`

“自优化”不意味着系统自行修改规则或无限加并发；第一版应是：

`运行结果 → 标准化脱敏指标 → 人工判断 → 受控调整一个变量 → 再运行`

因此当前实施顺序为：

1. 已用一个 Profile 和合成事项验证 workflow execution loop 的阶段、人工判断、阻塞/失败/恢复和终点行为；
2. 在不改变当前并发配置的前提下，使用首版事件协议记录真实 `C` 基线；
3. 汇总基线并确认样本完整率；
4. 只有满足基线条件且通过实验门，才以 `C+1` 做单变量对照，并根据结果决定是否调整 WIP 或并发。

仓内已有 workflow core、Profile 合同、结果合同和 standalone workflow 入口；当前缺口是实际运行数据，不是再扩展 workflow 结构。

本方向不把 Intake、Workflow execution、delivery-change 三者合并：Intake 负责是否值得投入，Workflow execution 负责最小阶段运行和人工注意力门，`delivery-change` 负责正式交付治理。当前第一步是采集 `C` 基线，而不是扩展全局扫描、自动路由、远程 telemetry 或并发策略。

### 当前进展（2026-08-30）

- 已在现有 `establish-workflow-v01-contract` Change 中恢复最小 Workflow execution 垂直切片；
- 新增 `openspec/tools/workflow-entry.ts run --input <request.json>`，只读取显式 request，连续推进已满足输入/判断的阶段，直到人工判断门、阻塞、拒绝或完成；
- 以显式请求文件和结果文件承载可恢复上下文，不创建数据库，不读取 Desk，不创建远程 telemetry；
- 已用合成事项验证成功、人工等待、完成、Malformed request 和缺少 `--input` 的退出码/结果行为；
- 当前仍未采集真实效率指标、未建立并发 `C` 基线、未进行 `C+1` 实验。

### 初始 Intake backlog observation（2026-08-30）

当前 Intake 不是可以直接逐条“优化”的任务清单，而是混合了当前事项、历史 legacy 记录和已完成事项的输入池。目录中已观察到：

- `INT-20260830-005-metrics-concurrency.md` 是当前指标与并发 Intake；
- 规范化前，`INT-20260830-001`、`INT-20260830-002`、`INT-20260830-003-review-scope-control.md` 和 `INT-20260830-004` 是 legacy 格式；`INT-20260830-003-需求咨询与实施边界.md` 没有合法 frontmatter，inventory 将其报告为 `invalid`；
- 规范化前，`INT-20260830-003-需求咨询与实施边界.md` 的正文包含旧格式 `id: INT-20260830-003`，而另一个文件的 frontmatter 也使用该 ID。它们当时构成需要人工确认的身份/格式歧义，不能把无 frontmatter 的正文行直接当作机器身份或静默合并。

因此，下一步不应让 Agent 对所有 Intake 同时展开，而应先让 Workflow 能够建立受控队列：识别唯一身份、报告 legacy 缺口、按影响和可执行性排序，每次只取一个事项进入 `requirement-analysis`，并明确落到 `build`、`use-existing`、`defer` 或 `reject`。只有 `build` 且经过人工确认的事项才进入正式 Change。

### Intake 规范化进展（2026-08-30）

- 已将 `INT-20260830-001`、`INT-20260830-002`、`INT-20260830-003-review-scope-control` 和 `INT-20260830-004` 规范化为带 `schemaVersion/state/phase` 的当前格式，并保留原始语义；
- 原本无合法 frontmatter 的需求咨询记录已移至 `INT-20260830-006-requirement-consultation-boundary.md`，其旧编号歧义不再占用 `INT-20260830-003`；
- 当前 inventory 已能区分规范化后的 current、仍需处理的 legacy/invalid 和重复 ID；本轮没有自动合并或删除任何事项。

## 后续待办

- [x] 定义最小标准化脱敏事件协议和事件枚举
- [x] 选择本地指标存储位置并写入保留/清理规则
- [x] 确定吞吐、时间、WIP、冲突、返工和质量门禁的计算口径
- [ ] 记录当前并发度的一轮基线
- [ ] 增加一个并发槽位并记录对照数据
- [x] 预先设置首轮 WIP、停止条件和回滚条件
- [ ] 评估是否提升为 Runtime 正式 Change

## Disposition

决定：promote
理由：维护者明确选择候选 B，将标准化事件合同、本地私有记录与汇总能力转入正式 Runtime Change；当前并发基线和 C+1 实验仍未执行。
下一步：在 `establish-runtime-metrics-baseline` Change 中实施受控本地记录器，先采集 C 基线，再决定是否执行 C+1。

## History

- 2026-08-30T23:55:34.386Z captured
- 2026-08-31T01:40:55.793Z advanced to triage
- 2026-08-31T01:40:55.974Z advanced to evidence
- 2026-08-31T01:40:56.122Z advanced to options
- 2026-08-31T01:40:56.249Z advanced to disposition
- 2026-08-31T01:41:15.138Z promoted to establish-runtime-metrics-baseline
