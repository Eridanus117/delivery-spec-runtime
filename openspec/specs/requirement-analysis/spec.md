## Purpose

提供一个独立、可复用的需求分析 workflow profile，用于在决定创建项目 Change 之前整理需求陈述、核验现有能力、沉淀已知与未知证据，并由资源持有人决定是否投入建设。该 profile 服务于没有完整外部需求分析输入的事项，同时不把 Desk 的个人策略、内容或存储实现带入公共 Runtime。

## Requirements

### Requirement: Runtime SHALL expose a versioned requirement-analysis profile

Runtime SHALL 在 profile registry 中暴露稳定的 `requirement-analysis` 身份和版本，并通过 `workflow list-profiles` 返回其阶段、必需输入和人工判断合同。该 profile SHALL 与既有 `delivery-change`、`light-change` 独立，不能改变既有 profile 的阶段或执行结果。

#### Scenario: 查看当前 profile 与阶段

- **WHEN** 调用方执行 `workflow list-profiles`
- **THEN** 结果 SHALL 包含 `requirement-analysis@v1.0.0` 及其阶段定义，并同时保留已有 profile

### Requirement: Requirement analysis SHALL preserve an auditable analysis loop

需求分析 profile SHALL 按 `capture → clarify → discover → evaluate → decision` 顺序运行。`clarify` 必须形成问题、目标、范围与约束；`discover` 必须核验现有能力并区分已知、未知、证据状态和置信度；`evaluate` 必须比较候选方案、投入、风险和可逆性。三个分析阶段都 SHALL 支持累积输入的多轮分析：人工判断为 `continue-analysis` 时保持当前阶段并返回 `in_progress`，不得由 Workflow System 自行宣布阶段完成；只有人工判断为 `sufficient` 时才进入下一阶段。

#### Scenario: 澄清、现状核验和方案比较分别形成证据

- **WHEN** 调用方依次提交 `problemFrame`、`capabilityReport` 和 `optionReport`，并在每个阶段提供 `sufficient`
- **THEN** 结果 SHALL 按顺序推进到下一个阶段；任何阶段缺少对应输入时 SHALL 返回 `blocked`

#### Scenario: 任一分析阶段证据不足时继续

- **WHEN** 当前 `clarify`、`discover` 或 `evaluate` 阶段存在未解决缺口，且人工判断为 `continue-analysis`
- **THEN** 结果 SHALL 为 `in_progress`，当前阶段和下一阶段均为当前阶段，已完成阶段不得包含当前阶段

#### Scenario: 分析完成后进入门 B

- **WHEN** `problemFrame`、`capabilityReport` 和 `optionReport` 均已提交，且三个分析阶段人工判断均为 `sufficient`
- **THEN** 结果 SHALL 将 `decision` 作为下一阶段，并在决策完成时回显三份分析产物

### Requirement: Gate B SHALL return an explicit disposition without auto-creating a Change

决策阶段 SHALL 要求人工判断，并支持 `build`、`use-existing`、`defer`、`reject` 四类处置。结果 SHALL 输出决策报告、处置结果和可选候选 profile；Workflow System SHALL NOT 自动创建 Change、自动修改 Desk 或自动选择并绑定执行 profile。

#### Scenario: 主人决定建设

- **WHEN** 决策阶段提交包含验收标准、投入上限和流程重量的决策报告，人工判断为 `build`
- **THEN** 结果 SHALL 为 `completed`，输出 `disposition=build`，并保留调用方提供的候选 profile；后续 Change 创建由调用方执行

#### Scenario: 主人决定不建、暂缓或使用现成能力

- **WHEN** 决策阶段人工判断为 `use-existing`、`defer` 或 `reject`
- **THEN** 结果 SHALL 为 `completed`，输出对应处置，且 SHALL NOT 创建或修改任何 Change

### Requirement: Requirement analysis SHALL run independently of Desk

该 profile SHALL 通过显式 `matterId`、binding、inputs 和 judgments 独立执行。它 SHALL NOT 读取 Desk、扫描其他仓库或向 Desk 写回；调用方负责保存分析报告、决策报告和后续事项归属。

#### Scenario: 无 Desk 环境独立执行

- **WHEN** 调用方仅提供显式需求分析请求和 profile binding
- **THEN** Workflow System SHALL 返回机器可读阶段状态和输出，且调用方仓库以外的资产保持不变

### Requirement: Existing workflow profiles SHALL remain compatible

新增需求分析 profile SHALL 保持现有 `delivery-change` 和 `light-change` 的 registry、binding、阶段顺序、状态和 fail-closed 行为不变。

#### Scenario: 既有 profile 回归

- **WHEN** 使用既有 profile 的原有 fixture 和 workflow CLI 执行合同测试
- **THEN** 原有结果 SHALL 与新增 profile 前一致

### Requirement: 分析线的调用说明 SHALL 给出可直接照抄的完整命令

说明文档描述分析线调用方式时，SHALL 给出参数的确切名字与一条可直接照抄的完整命令，SHALL NOT 只用散文描述「必须同时指定某某和某某」（理由：分析线被写进机器检查之后，本仓一共跑过两单，两单各撞到一次因此调错参数。（另有「三单零执行」的旧账，说的是更早的另一段时间：那时这条要求只写在文档里、没写进机器检查，于是连着三个事项一次都没跑。两组数字讲的不是同一批事项。）错误文案点名了正确参数所以一次改对，但这属于运气好——说明文档的职责就是让人不必靠错误文案学参数名）。

#### Scenario: 说明文档与实际参数名一致

- **WHEN** 校验说明文档中的分析线调用示例
- **THEN** 示例中出现的参数名 SHALL 与工具实际接受的参数名一致
