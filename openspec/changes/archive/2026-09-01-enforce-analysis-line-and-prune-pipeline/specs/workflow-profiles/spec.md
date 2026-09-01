## MODIFIED Requirements

### Requirement: Existing delivery-change SHALL remain compatible as a profile

引入多 profile 能力 SHALL 保留现有 `delivery-change` 的命令、artifact、锁、fail-closed 约束、版本 pin 和消费方式。新 profile core 或 profile selection SHALL NOT 要求现有 delivery-change Change 复制私人业务材料、改写已有状态，或依赖外部工作台才能运行。`delivery-change` profile 的站位定义 SHALL 与真实交付门禁保持单一权威关系：profile 侧 SHALL NOT 声明真实门禁未实现的站位语义，真实门禁 SHALL NOT 存在 profile 侧未声明的人工判断门。

#### Scenario: 既有 delivery-change 继续执行

- **WHEN** 现有 delivery-change 消费仓按原命令执行 runtime-check、生命周期和合同测试
- **THEN** 原有行为 SHALL 继续通过，且不存在由多 profile 新入口引起的 submodule dirty、manifest 漂移或额外 lock/hash 文件

#### Scenario: profile 与门禁不一致时拒绝

- **WHEN** `delivery-change` profile 的站位集合或人工判断标记与真实门禁的索取行为不一致
- **THEN** 合同检查 SHALL 非零拒绝并列出不一致的站位，SHALL NOT 以任一侧为准静默通过

#### Scenario: 多 profile 能力失败时保持旧入口

- **WHEN** 新 profile selection 或 core 实现失败
- **THEN** 现有 `delivery-change` 入口 SHALL 仍可独立运行，系统 SHALL NOT 通过修改旧合同或放宽旧 fail-closed 检查来掩盖失败

## ADDED Requirements

### Requirement: Analysis-line artifacts SHALL be discoverable by the intake gate

`requirement-analysis` profile 的绑定记录与分析结果 SHALL 写入可被立项门读取的确定位置，并 SHALL 携带其所属 intake 条目的 `id`。立项门 SHALL 能仅凭 intake 条目 `id` 定位这些产物；产物缺失、无法解析或 `id` 不匹配时，立项门 SHALL fail closed。这些产物 SHALL 被视为流水线必经路径上的活资产，SHALL NOT 因「历史零实例」而被裁撤。

#### Scenario: 立项门定位分析产物

- **WHEN** 立项门以某条 intake 的 `id` 查询分析线产物
- **THEN** Runtime SHALL 返回该条目的绑定记录与分析结果，或明确报告缺失

#### Scenario: 产物归属不匹配

- **WHEN** 分析产物存在但其记录的 intake `id` 与被 promote 的条目不同
- **THEN** 立项门 SHALL 拒绝，SHALL NOT 接受他项的分析产物作为本项凭据
