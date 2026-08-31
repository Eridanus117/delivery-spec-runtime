---
schemaVersion: 1
id: INT-20260830-004-runtime-metrics-and-options
state: captured
phase: capture
source: current-user-session
capturedAt: 2026-08-30
promotedTo: null
---

# Runtime 整体指标与候选方案

## 原始问题

Runtime 当前已经具备需求分析、Profile workflow、Change、Review、Acceptance 和 Archive 等能力，但还没有整体证据说明它是否提高了有效决策完成率、哪些环节制造摩擦，以及 OpenSpec 与 Runtime 各自承担了多少成本。当前不应先决定 npm、CLI、Adapter 或脱离 OpenSpec。

## Triage

范围：Runtime 工作流的价值、采用、效率、认知负担、审计、可复现性、失败恢复、依赖归因、维护集成和安全边界。
影响：没有真实消费仓和低频脱敏运行数据，无法判断流程价值、摩擦来源或替代方案成本。
判断：continue

## Evidence

### 已知事实

- 当前 Runtime 通过 Git submodule + 三条受管相对软链接接入消费仓。
- `runtime-manifest.json` 锁定 Node `22.6.0` 和 OpenSpec `1.11.0`。
- Runtime 已有 3 个 Profile、9 个 OMP Commands 和 9 层 `delivery-change` Artifact。
- Runtime 自己实现 Profile workflow、机器合同、批准、任务、Review、Acceptance、Readiness、绑定校验和 fail-closed 入口。
- OpenSpec 仍提供 Change/Artifact 基础能力，包括 schema DAG、`new/status/instructions/validate/archive` 等 CLI 能力。
- Runtime 仓的合同测试、Git/PR 历史和升级评估可以证明 Runtime 自身行为，但不能证明真实消费仓的采用率、认知负担或主人认可度。
- 当前没有面向一般 workflow 的 telemetry；OpenSpec 升级评估器只单独记录升级运行的时间和结果。

### 未知与假设

- 真实消费仓的阶段漏斗、首次价值时间、主人认可度、OpenSpec/Runtime 失败归因、认知负担和维护成本尚未形成统计基线。
- 第一版只记录脱敏元数据，不建设远程 telemetry。
- 指标存储应留在本地私有工作区，不能写入公共 Runtime 业务资产。

### 证据

- `openspec/intake/README.md`
- `openspec/specs/intake-workflow/spec.md`
- `docs/maintainer-guide.md`
- `docs/governance.md`
- Runtime 合同测试和历史 Change

## 指标范围

1. 决策价值：问题清晰度、方案可比较性、决策帮助度、主人认可度。
2. 有效采用：进入事项数、完成事项数、重复使用率、阶段漏斗转化率。
3. 首次价值：首次有用洞察时间、首次成功运行时间。
4. 流程效率：各阶段耗时、重试次数、人工等待时间、中断阶段。
5. 认知负担：技术操作数、JSON 处理量、路径/版本错误次数。
6. 审计可信度：证据完整率、来源可追溯率、Review/Acceptance 绑定完整率。
7. 可复现性：Runtime/Profile/OpenSpec 版本完整率、同输入结果一致率。
8. 失败恢复：blocked 后恢复率、失败重试成功率、升级回滚成功率。
9. 依赖归因：OpenSpec、Runtime、调用方和环境各自导致的失败占比与耗时。
10. 维护和集成：发布、升级、接入、支持、Windows/CI/离线环境成本。
11. 安全边界：来源、完整性校验和隐式脚本风险。

流程漏斗：`eligible → capture → clarify → discover → evaluate → decision → owner-accepted`。

## 当前价值优先级

按“对真实交付结果的影响 × 当前风险/摩擦 × 改善杠杆”排序，当前优先观察：

1. 决策质量：是否帮助识别真实问题、比较选项并做出建/复用/暂缓/拒绝决定。
2. 有效采用率：真实事项是否愿意开始并走完 `capture → decision`。
3. 审计可信度：需求、判断、证据、实现和验收能否形成可追溯链。
4. 首次价值时间：从需求进入到看到有用分析结果需要多久。
5. 认知负担：用户是否被 JSON、submodule、软链接和路径细节打断。
6. 失败可恢复性、可复现性、版本治理和集成适配性。

“是否消灭软链接”不是北极星指标；npm/CLI 也只是候选的产品入口，必须用上述指标验证。

## 当前交互观察

`requirement-analysis` 当前是低层 request/response API，每轮需要传递完整 JSON、`completedStages`、`judgments` 和 `analysisRounds`。这可能增加认知负担，但目前还没有真实用户数据证明其影响大小。

## 数据保存边界

分析结果和正式决策应优先保存在当前项目仓的 `openspec/intake/`、`openspec/changes/` 或 `openspec/specs/`；业务事项不写入公共 Runtime 的代码、合同或测试资产。个人 Desk 不作为本项目分析资料的权威位置。

第一版只记录元数据：事项不可逆哈希、run 标识、stage、event、command、Runtime/Profile/OpenSpec 版本、开始/结束时间、状态、失败类别、重试次数和枚举型人工判断。禁止记录业务正文、请求响应全文、凭据、绝对路径、用户名、机器标识、trace、release-id 和可逆事项标识。第一阶段不建设远程 telemetry，不向公共 Runtime 仓写入业务事项。

## 方案评估原则

候选方案统一比较：有效决策完成率、首次价值时间、认知负担、审计可信度、可复现性、失败恢复、OpenSpec 依赖、实施成本、迁移成本、可逆性、安全风险和长期维护成本。当前只建立候选池和评估维度，不作最终路线选择。

## 候选方案池

### 交互

- 保持 JSON API，仅增加人类可读包装；
- 交互式 CLI；
- Agent 对话层；
- CLI 与 API 双入口；
- 由调用层托管 workflow state，用户只看到阶段、洞察和判断门。

### 分发

- 保持 submodule + 软链；
- npm package + CLI；
- npm package + Commands 受控适配层；
- 独立二进制 CLI；
- 混合模式：CLI npm 化，Commands 暂不迁移。

### OpenSpec 边界

- 继续完整建立在 OpenSpec 之上；
- 通过 Adapter 隔离 OpenSpec；
- 只依赖 OpenSpec 的 Change/Artifact substrate；
- 逐步自建部分基础能力；
- 完全替代 OpenSpec。

### 状态与证据

- 状态只在调用层临时保存；
- 分析结果进入当前仓 `openspec/intake/`；
- 决定实施后进入当前仓 `openspec/changes/`；
- Runtime 只返回合同结果；
- 本地 run evidence；
- 组织级脱敏汇总。

## 当前处置

阶段一只进行指标定义、现有资料盘点、真实消费仓基线准备和方案头脑风暴；不修改 Runtime 行为，不创建实施 Change。

## 后续候选

- 设计最小脱敏采集协议；
- 以少量真实消费仓取得基线；
- 用基线填充候选方案评估矩阵；
- 由维护者决定是否进入具体实验或正式 Change。

## Disposition

决定：
理由：
下一步：

## 提升或关闭条件

只有在指标基线和候选评估完成，并明确决定实施某一方向后，才提升为正式 Runtime Change；若数据表明当前模式已满足需要，则关闭本 Intake 并记录原因。

## History

- 2026-08-30T00:00:00.000Z legacy-normalized
