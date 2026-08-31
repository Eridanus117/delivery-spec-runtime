## MODIFIED Requirements

### Requirement: Intake SHALL expose an explicit DAG

Runtime SHALL 实现两个机器状态的登记生命周期：`已登记`（`captured`）与`已处置`（`promoted` / `held` / `closed`）。文件内的五个小节（原始问题、Triage、Evidence、Options、Disposition）SHALL 原样保留为写作结构，但 SHALL NOT 再对应独立的机器状态或独立的推进操作。处置出口 SHALL 只有三个：`promote`、`hold` 和 `close`；`held` 与 `closed` SHALL 只能经显式 reopen 回到`已登记`。Runtime SHALL NOT 再提供 `capture → triage`、`triage → evidence`、`evidence → options` 三次中间推进操作。

#### Scenario: 按顺序推进

- **WHEN** 调用方在同一条目内写完五个小节并请求处置
- **THEN** Runtime SHALL 在一次操作内完成从`已登记`到`已处置`的状态转移，SHALL NOT 要求调用方先执行三次中间推进

#### Scenario: 跳过前置阶段

- **WHEN** 调用方请求推进到 `triage`、`evidence` 或 `options`
- **THEN** Runtime SHALL fail closed 并说明这些中间站已被合并为一次处置，SHALL NOT 修改条目内容或状态

#### Scenario: 暂缓事项重新进入分析

- **WHEN** 条目 `hold` 后再次请求处理
- **THEN** Runtime SHALL 要求显式 reopen 语义，并 SHALL 将条目回到`已登记`，保留原 hold 理由和历史

### Requirement: Intake stages SHALL require distinct evidence

Runtime SHALL 在处置时一次性执行全部小节的最小结构校验：原始问题和来源必填；Triage 要求范围、影响和继续/暂缓/关闭判断；Evidence 要求已知事实、未知事项和至少一个证据引用；Options 要求至少一个候选处置及其取舍；Disposition 要求人工决定、理由和下一步。任一小节缺失时处置 SHALL fail closed，并 SHALL 逐项返回缺失小节名，SHALL NOT 只报第一项。

#### Scenario: 事实与推断分开记录

- **WHEN** 条目提交处置
- **THEN** Runtime SHALL 分别校验已知事实、未知事项和假设三段存在，并 SHALL NOT 把未验证推断自动标记为事实

#### Scenario: 候选不等于批准

- **WHEN** 条目只写了 Options 而 Disposition 为空
- **THEN** Runtime SHALL 拒绝处置并保持条目未决，SHALL NOT 由候选推导出决定

#### Scenario: 缺失小节逐项报告

- **WHEN** 条目同时缺少 Evidence 与 Disposition 内容
- **THEN** Runtime SHALL 在一次拒绝中返回两项缺失，SHALL NOT 要求调用方逐次试错

### Requirement: Promote SHALL hand off to a Change without duplicating authority

只有处置决定为 `promote` 时，Runtime SHALL 允许将 Intake 关联到一个已存在的 Change。Promote SHALL 是分析线的 fail-closed 立项门：Runtime SHALL 先按路由表判定该条目是否豁免分析线；不豁免时 SHALL 校验分析线产物（该条目的 workflow 绑定记录与分析结果）存在且可解析，缺失即 SHALL 拒绝 promote 并保持 Intake 与目标 Change 不变。Promote SHALL 写入 `state: promoted` 和 `promotedTo`，并 SHALL 要求目标 Change 的原始需求索引引用该 Intake。Promoted Intake SHALL 成为只读来源索引，Change SHALL 成为后续正式 Requirement、方案、任务和证据的工作真源。

#### Scenario: 成功 Promote

- **WHEN** 人工选择 `promote`、提供有效的 Change slug，且分析线产物齐备或条目按路由表豁免
- **THEN** Runtime SHALL 验证目标 Change 存在、建立双向来源引用，并 SHALL 保留 Intake 的原始问题和转化摘要

#### Scenario: 缺少分析线产物

- **WHEN** 条目按路由表不豁免分析线，但不存在可解析的 workflow 绑定记录或分析结果
- **THEN** Runtime SHALL 拒绝 Promote，SHALL 返回缺失的分析线产物名称，并 SHALL NOT 修改 Intake 状态或目标 Change

#### Scenario: 豁免必须来自路由表而非调用方声明

- **WHEN** 调用方在请求中直接声明本条目豁免分析线，但路由表未给出对应豁免
- **THEN** Runtime SHALL 拒绝该豁免声明并按不豁免处理，SHALL NOT 接受调用方自述的豁免

#### Scenario: 没有人工决定时 Promote

- **WHEN** Intake 只有候选方案但没有处置决定
- **THEN** Runtime SHALL 拒绝 Promote，并 SHALL 不创建 Change、不修改 Intake 状态

#### Scenario: Promote 目标不存在

- **WHEN** 请求 Promote 到不存在或越界的 Change 路径
- **THEN** Runtime SHALL fail closed，并 SHALL 不写入 Intake、目标 Change 或 Runtime submodule

## ADDED Requirements

### Requirement: Runtime SHALL report a deterministic intake inventory

Runtime SHALL 提供 intake 清单能力：扫描项目仓 `openspec/intake/` 下的条目文件，按稳定的字节序返回条目路径、`id`、合同分类（`current` / `legacy` / `invalid`）、缺失字段与当前状态。清单 SHALL 即时计算、SHALL NOT 落盘为第二份状态。重复 `id` SHALL 被分组报告而不是静默去重。

#### Scenario: 确定性排序

- **WHEN** 调用方在同一目录内容上重复执行清单命令
- **THEN** 结果条目顺序与内容 SHALL 逐字节一致，SHALL NOT 依赖文件系统返回顺序

#### Scenario: 重复 id 分组报告

- **WHEN** 两个不同文件声明同一个 `id`
- **THEN** 清单 SHALL 在重复分组中列出该 `id` 及其全部文件，SHALL NOT 只保留其中一个

#### Scenario: 清单不写盘

- **WHEN** 清单命令执行完毕
- **THEN** 项目仓 SHALL 不出现任何新增的清单状态文件，Runtime submodule SHALL 保持不变

### Requirement: Intake routing SHALL be table-driven and fail closed

Runtime SHALL 维护一张版本化的路由表，为每类事项声明其交付档位（`delivery-change` / `light-change`）与是否必须先走分析线。路由表 SHALL 是立项门与档位选择的唯一真源；未在表中匹配到的事项 SHALL 默认走最重档位并要求分析线，SHALL NOT 默认豁免。运行中允许升档，SHALL NOT 因门禁失败而降档。

#### Scenario: 未匹配事项取最重默认

- **WHEN** 条目的类别不匹配路由表任何一行
- **THEN** Runtime SHALL 判定为 `delivery-change` 档位且不豁免分析线

#### Scenario: 禁止为绕过失败而降档

- **WHEN** 事项在重档位的门禁上失败，调用方请求改判为轻档位
- **THEN** Runtime SHALL 拒绝该降档请求，并 SHALL 保留原档位与失败原因
