# runtime-upgrade-safety Specification

## Purpose

保护所有消费仓和 Runtime submodule 不被 OpenSpec 的客户端命令生成器原地改写。Runtime 维护者需要可证明的 fail-closed 边界：实时仓只执行已锁定的生命周期，升级行为只能在 Runtime 自身的独立 Change 中评审。

## Requirements

### Requirement: 实时仓禁止执行 OpenSpec Update

Runtime 入口 MUST 拒绝从资产仓或项目仓执行 `runtime-update`，且 MUST NOT 启动 `openspec update` 或任何等价的客户端命令重生成操作。失败信息 MUST 指向 Runtime 仓内独立升级 Change，而不是提供绕过入口。

#### Scenario: 资产仓请求 Runtime Update

- **WHEN** 已正确初始化、gitlink 与软链均有效的消费仓调用 `runtime-entry.ts runtime-update`
- **THEN** 命令以非零状态退出，明确说明实时仓禁止更新，并且不执行官方 `openspec update`

### Requirement: 拒绝路径不得修改 Runtime Submodule

拒绝 `runtime-update` 前后，系统 MUST 保持父仓 gitlink、Runtime submodule 工作树以及四条 manifest 受管投影（普通文件副本）的内容和状态不变。

#### Scenario: Commands 通过目录软链暴露

- **WHEN** 消费仓的 `.omp/commands` 为 `.delivery-spec-runtime/.omp/commands` 的受管副本，并请求 `runtime-update`
- **THEN** submodule 内九个 `opsx-*.md` 的内容摘要保持不变，父仓 `git status --porcelain -- .delivery-spec-runtime` 为空

#### Scenario: 官方生成器可用

- **WHEN** 环境中的 OpenSpec CLI 可以成功执行 `openspec update`
- **THEN** Runtime 仍在启动生成器之前拒绝请求，不能以生成器可用为由修改实时仓

### Requirement: 命令说明必须匹配失败语义

`/opsx-update` 的人工说明 MUST 明确区分“修订现有 Change 产物”和“升级 OpenSpec Runtime”。说明 MUST 禁止在实时仓直接执行 `openspec update` 或 `runtime-update`，并指向 Runtime 仓内受控升级流程。

#### Scenario: 维护者阅读 Update Command

- **WHEN** 维护者查看 `.omp/commands/opsx-update.md`
- **THEN** 文档不会声称软链恢复可以回滚官方 update，也不会给出可修改实时仓的 wrapper 命令

### Requirement: 消费仓冒烟失败 SHALL 在报告中留下可归因的原因

升级评估报告在任一消费仓冒烟环节失败时，SHALL 记录该环节的失败原因文本，而不仅是退出码。SHALL NOT 只保留 `runtimeStatus` 这类无语义的数字（理由：只记退出码的报告无法区分「合同被正确拒绝」与「环境问题误判」，本仓已因此把一个可定位的路径越限缺陷当作偶发噪音挂了整整一天）。

#### Scenario: 冒烟失败时报告含原因

- **WHEN** 某消费仓的 `runtime-check` 在冒烟中以非零状态退出
- **THEN** 升级报告中该消费仓条目除退出码外，还包含其失败输出文本

#### Scenario: 冒烟通过时不引入噪音

- **WHEN** 全部消费仓冒烟通过
- **THEN** 报告结论仍为 PASS，且不因新增字段破坏既有报告合同校验

### Requirement: Runtime CLI 的输出 SHALL 不含运行时弃用告警

Runtime 入口及其转发的子命令 SHALL NOT 在正常执行路径上产生 Node 运行时弃用告警。外部命令的调用方式 SHALL 选择不触发此类告警的形态（理由：告警混进本应干净的 JSON 输出，既污染人的阅读面，也让下游按输出取值的自动化多一层清洗）。

#### Scenario: 入口调用输出干净

- **WHEN** 执行任一 Runtime 入口命令并捕获其标准输出与标准错误
- **THEN** 输出中不含任何 Node 运行时弃用告警行
