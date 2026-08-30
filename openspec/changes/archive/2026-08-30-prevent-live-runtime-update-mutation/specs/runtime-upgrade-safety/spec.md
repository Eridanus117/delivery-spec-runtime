## Purpose

保护所有消费仓和 Runtime submodule 不被 OpenSpec 的客户端命令生成器原地改写。Runtime 维护者需要可证明的 fail-closed 边界：实时仓只执行已锁定的生命周期，升级行为只能在 Runtime 自身的独立 Change 中评审。

## ADDED Requirements

### Requirement: 实时仓禁止执行 OpenSpec Update

Runtime 入口 MUST 拒绝从资产仓或项目仓执行 `runtime-update`，且 MUST NOT 启动 `openspec update` 或任何等价的客户端命令重生成操作。失败信息 MUST 指向 Runtime 仓内独立升级 Change，而不是提供绕过入口。

#### Scenario: 资产仓请求 Runtime Update

- **WHEN** 已正确初始化、gitlink 与软链均有效的消费仓调用 `runtime-entry.ts runtime-update`
- **THEN** 命令以非零状态退出，明确说明实时仓禁止更新，并且不执行官方 `openspec update`

### Requirement: 拒绝路径不得修改 Runtime Submodule

拒绝 `runtime-update` 前后，系统 MUST 保持父仓 gitlink、Runtime submodule 工作树以及三个 manifest 托管软链的内容和状态不变。

#### Scenario: Commands 通过目录软链暴露

- **WHEN** 消费仓的 `.omp/commands` 指向 `.delivery-spec-runtime/.omp/commands`，并请求 `runtime-update`
- **THEN** submodule 内九个 `opsx-*.md` 的内容摘要保持不变，父仓 `git status --porcelain -- .delivery-spec-runtime` 为空

#### Scenario: 官方生成器可用

- **WHEN** 环境中的 OpenSpec CLI 可以成功执行 `openspec update`
- **THEN** Runtime 仍在启动生成器之前拒绝请求，不能以生成器可用为由修改实时仓

### Requirement: 命令说明必须匹配失败语义

`/opsx-update` 的人工说明 MUST 明确区分“修订现有 Change 产物”和“升级 OpenSpec Runtime”。说明 MUST 禁止在实时仓直接执行 `openspec update` 或 `runtime-update`，并指向 Runtime 仓内受控升级流程。

#### Scenario: 维护者阅读 Update Command

- **WHEN** 维护者查看 `.omp/commands/opsx-update.md`
- **THEN** 文档不会声称软链恢复可以回滚官方 update，也不会给出可修改实时仓的 wrapper 命令
