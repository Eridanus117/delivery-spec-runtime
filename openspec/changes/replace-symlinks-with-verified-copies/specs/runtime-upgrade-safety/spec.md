## MODIFIED Requirements

### Requirement: 拒绝路径不得修改 Runtime Submodule

拒绝 `runtime-update` 前后，系统 MUST 保持父仓 gitlink、Runtime submodule 工作树以及四条 manifest 受管投影（普通文件副本）的内容和状态不变。

#### Scenario: Commands 通过目录软链暴露

- **WHEN** 消费仓的 `.omp/commands` 为 `.delivery-spec-runtime/.omp/commands` 的受管副本，并请求 `runtime-update`
- **THEN** submodule 内九个 `opsx-*.md` 的内容摘要保持不变，父仓 `git status --porcelain -- .delivery-spec-runtime` 为空

#### Scenario: 官方生成器可用

- **WHEN** 环境中的 OpenSpec CLI 可以成功执行 `openspec update`
- **THEN** Runtime 仍在启动生成器之前拒绝请求，不能以生成器可用为由修改实时仓
