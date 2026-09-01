## MODIFIED Requirements

### Requirement: Archive 必须在 PR 前由严格状态放行

Archive Readiness MUST 绑定当前 Acceptance、Spec Sync 输入输出摘要、strict validation、cleanup PASS 证据和 `prStarted=false` 维护者声明，且 `attestedAt` MUST 晚于 `acceptedAt`。Archive guard MUST 只接受当前 `READY` 状态，不得依赖 09 Markdown 关键词或 PR URL。归档 MUST NOT 要求验收之外的第二次人工表态：验收记录中的维护者「同意」即构成归档授权，归档 MUST 是机器步骤。

#### Scenario: 归档准备完整

- **WHEN** Review、Acceptance、Spec Sync、strict validation 和 cleanup 全部当前，且维护者声明尚未创建 PR
- **THEN** Archive guard 返回 allowed
- **AND** Change 可在功能分支归档后进行 final validation

#### Scenario: 归档不再索取第二次人工表态

- **WHEN** 验收已由维护者表态通过且 readiness 为当前 `READY`
- **THEN** 归档 MUST 直接放行，MUST NOT 要求维护者再次盖章或再摆一次决策材料

#### Scenario: PR 已开始或规格未同步

- **WHEN** `prStarted=true`、delta/main spec 摘要缺失、状态 stale 或 cleanup 非 PASS
- **THEN** Archive guard 非零拒绝

### Requirement: PR 反馈导致的行为变化必须受控 Reopen

归档后的 Change 若因 PR 反馈需要修改实现或规格，MUST 通过受控 reopen 恢复 active；新生命周期 MUST 从 Review 重新开始，旧 PASS 状态 MUST NOT 继续通过门禁。Reopen MUST NOT 写出无机器读者的留痕资产：`reopen-state.json` 与 lifecycle history 快照目录 MUST 不再生成。历史证据由版本控制承载。

#### Scenario: 归档后修改行为

- **WHEN** PR 反馈要求修改代码、合同、长期 spec 或可观察行为
- **THEN** 工具恢复 active Change 并使旧 PASS 状态失效
- **AND** reopen 后 Change 目录 MUST NOT 新增 `reopen-state.json` 或历史快照目录

## ADDED Requirements

### Requirement: 交付站位定义必须有唯一权威真源

交付流水线的站位、人工判断标记与站位对应的门禁 MUST 只有一份权威定义；另一份定义 MUST 或者引用该权威、或者被移除。Runtime MUST NOT 同时保留两份互不引用的站位定义。权威定义变更时，非权威侧 MUST 在同一次变更内对齐或删除。

#### Scenario: 单侧修改被拒绝

- **WHEN** 只修改非权威侧的站位定义而未同步权威侧
- **THEN** 合同检查 MUST 非零拒绝，并报告两侧不一致的站位

#### Scenario: 人工判断标记与真门禁一致

- **WHEN** 检查任一站位的人工判断标记
- **THEN** 该标记 MUST 与真实门禁是否索取人工表态一致；标记为人工判断却无对应门禁、或有门禁却未标记，MUST 判为不一致

### Requirement: 任务证据必须机器可校验

`task-state.json` 中每条任务的 `evidence` 项 MUST 被解析为 Change 内的相对路径，并 MUST 校验该路径存在且内容非空。路径越出 Change 目录、不存在或为空文件时，任务状态写入与验收门禁 MUST 非零拒绝。Runtime MUST NOT 仅凭字符串非空即认为证据成立。

#### Scenario: 证据路径不存在

- **WHEN** 任务将 `evidence` 指向一个不存在的路径
- **THEN** 任务状态写入 MUST 非零拒绝并报告该路径

#### Scenario: 证据文件为空

- **WHEN** `evidence` 指向的文件存在但内容为空
- **THEN** 验收门禁 MUST 非零拒绝

#### Scenario: 证据越出 Change 目录

- **WHEN** `evidence` 使用绝对路径或经 `..` 越出 Change 根
- **THEN** Runtime MUST fail closed 并不写入任何状态

### Requirement: 无机器读者的资产必须停止写盘

Runtime MUST NOT 生成没有任何机器读者的状态资产。`change-sources.json` MUST 停止写盘，来源溯源链 MUST 由 `01-原始需求/原始需求索引.md` 单独承载；移除前 MUST 逐项确认该索引覆盖原 `change-sources.json` 的等价信息，包括来源排序在内的任何未被覆盖的信息 MUST 先并入索引。

#### Scenario: 来源溯源仍可回溯

- **WHEN** 查询任一已归档 Change 的需求来源
- **THEN** `01-原始需求/原始需求索引.md` MUST 给出全部来源条目及其相对权威顺序

#### Scenario: 覆盖度未确认时拒绝移除

- **WHEN** 存在只记录在 `change-sources.json` 而未进入索引的信息
- **THEN** 移除 MUST 被拒绝，直到该信息并入索引

### Requirement: 现状文档必须合并为单一 artifact 且不削弱门禁

业务现状与技术现状 MUST 合并为一份现状 artifact。合并后该 artifact MUST 承接原两份各自参与的 digest 计算与批准门禁，任一原有校验 MUST NOT 因合并而丢失。发布计划模板 MUST 移除恒为空的「现场快速资产」「日志、指标与观察窗口」「配置开关」三节，MUST 保留 Spec Sync 表与门禁勾选。

#### Scenario: 合并后门禁数量不减

- **WHEN** 对合并后的现状 artifact 执行批准与验收门禁
- **THEN** 原先由两份文档触发的全部校验 MUST 仍然被触发

#### Scenario: 存量 Change 的旧结构仍可读

- **WHEN** 读取归档中仍为两份现状文档的历史 Change
- **THEN** 校验与归档状态 MUST 保持通过，MUST NOT 因新结构而判定历史 Change 失效

### Requirement: 保留的强校验不得削弱

Implementation Review 的 `reviewedPaths` 与 `result` MUST 继续由代码自算且不接受手工缩小；Acceptance State 的四项 digest 新鲜度校验 MUST 继续生效。本轮流水线修剪 MUST NOT 放宽、绕过或删除这两处校验中的任何一项。

#### Scenario: 修剪后强校验回归

- **WHEN** 流水线修剪完成后重跑既有 Review 与 Acceptance 合同测试
- **THEN** 全部原有 fail-closed 断言 MUST 与修剪前一致通过
