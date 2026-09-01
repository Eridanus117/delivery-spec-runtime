## Purpose

将 `openspec/intake/` 从人工目录约定提升为 Runtime 管理的前置工作流，并使其同时承担两个侧面：一是承载需求是否值得投入的事实、未知、证据、候选处置与人工判断；二是提供一个只读的条目清单，使维护者与 Runtime 能看到当前输入池的文件、身份、格式缺口与重复身份，而不把历史记录静默当成当前事项、也不替维护者作归属决定。只有明确承诺实施、且通过按改动对象查表的 fail-closed 立项门后，条目才进入正式 Change。

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

只有处置决定为 `promote` 时，Runtime SHALL 允许将 Intake 关联到一个已存在的 Change。Promote SHALL 是分析线的 fail-closed 立项门：Runtime SHALL 先按路由表判定该条目的改动对象是否允许立项、是否豁免分析线；不豁免时 SHALL 校验分析线产物（该条目的 workflow 绑定记录与分析结果）存在、可解析、由路由表指定的分析 profile 产出、归属于本条目，且分析结论为建造，任一不满足即 SHALL 拒绝 promote 并保持 Intake 与目标 Change 逐字节不变。Promote SHALL 写入 `state: promoted` 和 `promotedTo`，SHALL 把判定出的交付档位与改动对象记入条目历史，并 SHALL 要求目标 Change 的原始需求索引引用该 Intake。Promoted Intake SHALL 成为只读来源索引，Change SHALL 成为后续正式 Requirement、方案、任务和证据的工作真源。

#### Scenario: 成功 Promote

- **WHEN** 人工选择 `promote`、提供有效的 Change slug，且分析线产物齐备或条目按路由表豁免
- **THEN** Runtime SHALL 验证目标 Change 存在、建立双向来源引用，并 SHALL 保留 Intake 的原始问题和转化摘要

#### Scenario: 缺少分析线产物

- **WHEN** 条目按路由表不豁免分析线，但不存在可解析的 workflow 绑定记录或分析结果
- **THEN** Runtime SHALL 拒绝 Promote，SHALL 返回缺失的分析线产物名称，并 SHALL NOT 修改 Intake 状态或目标 Change

#### Scenario: 分析结论未完成或不是建造

- **WHEN** 分析结果存在但未跑到完成态，或其处置结论不是建造
- **THEN** Runtime SHALL 拒绝 Promote 并报告实际状态与实际结论，SHALL NOT 以「产物存在」本身作为放行依据

#### Scenario: 分析由非指定 profile 产出

- **WHEN** 分析线产物的 workflow 绑定记录所用 profile 与路由表为该改动对象指定的分析 profile 不一致
- **THEN** Runtime SHALL 拒绝 Promote，SHALL NOT 接受任意 profile 跑出的结果充当分析线产物

#### Scenario: 豁免必须来自路由表而非调用方声明

- **WHEN** 调用方在请求中直接声明本条目豁免分析线，但路由表未给出对应豁免
- **THEN** Runtime SHALL 拒绝该豁免声明并按不豁免处理，SHALL NOT 接受调用方自述的豁免

#### Scenario: 改动对象自述不产生 Change

- **WHEN** 条目声明的改动对象在路由表中被标记为不可立项（其定义即不产生任何 Change 目录）
- **THEN** Runtime SHALL 拒绝 Promote 并说明该条目只能 hold 或 close，SHALL NOT 允许它借最轻档位绕过分析线

#### Scenario: 没有人工决定时 Promote

- **WHEN** Intake 只有候选方案但没有处置决定
- **THEN** Runtime SHALL 拒绝 Promote，并 SHALL 不创建 Change、不修改 Intake 状态

#### Scenario: Promote 目标不存在

- **WHEN** 请求 Promote 到不存在或越界的 Change 路径
- **THEN** Runtime SHALL fail closed，并 SHALL 不写入 Intake、目标 Change 或 Runtime submodule

### Requirement: Legacy Intake records SHALL have a controlled migration path

现有只有 frontmatter/status、没有 `phase` 和完整章节的 Intake 记录 SHALL 被识别为 legacy。清单与 `inspect` SHALL 把这类记录标为 `legacy`，返回缺失字段、原始文件路径和建议迁移动作；Runtime SHALL NOT 把 legacy 记录静默视为已完成阶段、自动 Promote 或修改原文件。清单中 legacy 与当前合同记录 SHALL 被分别标记，SHALL NOT 相互覆盖或被合并为同一个状态。

#### Scenario: 检查 legacy 记录

- **WHEN** inspect 读取缺少新合同字段的现有 Intake
- **THEN** Runtime SHALL 返回 `legacy` 状态、缺失字段和建议迁移动作，并 SHALL 保持原文件不变

#### Scenario: 当前 Intake 与 legacy 共存

- **WHEN** 清单同时包含当前合同 Intake 和 legacy Intake
- **THEN** Runtime SHALL 分别标记两者，SHALL NOT 用 legacy 条目覆盖当前条目或将二者合并为一个状态

## ADDED Requirements

### Requirement: Runtime SHALL report a deterministic intake inventory

Runtime SHALL 提供 intake 清单能力，且 SHALL 只扫描调用方指定项目根下 `openspec/intake/` 中匹配 `INT-*.md` 的文件，SHALL NOT 读取该目录之外的任何业务资产。清单 SHALL 按稳定的字节序返回每个条目的相对路径、`id`、合同分类（`current` / `legacy` / `invalid`）、缺失字段与当前状态，并 SHALL 使用固定的机器可读字段与枚举。清单 SHALL 即时计算、SHALL NOT 落盘为第二份状态。重复 `id` SHALL 被分组报告并列出其全部文件，Runtime SHALL NOT 静默选择、删除、重命名或合并任何文件，SHALL 要求人工决定归属。解析失败、非法路径或身份缺失 SHALL 产生明确的非当前分类，SHALL NOT 通过默认值伪造身份、状态或迁移结果。

#### Scenario: 确定性排序

- **WHEN** 调用方在同一目录内容上重复执行清单命令
- **THEN** 结果条目顺序与内容 SHALL 逐字节一致，SHALL NOT 依赖文件系统返回顺序，且 SHALL 不修改任何文件或 Runtime submodule

#### Scenario: 没有受控 Intake 目录

- **WHEN** 调用方执行清单命令但 `openspec/intake/` 不存在
- **THEN** Runtime SHALL 返回空清单和明确的目录状态，SHALL NOT 扫描项目根或隐式创建目录

#### Scenario: 重复 id 分组报告

- **WHEN** 两个不同文件声明同一个 `id`
- **THEN** 清单 SHALL 在重复分组中列出该 `id` 及其全部文件，SHALL NOT 只保留其中一个，并 SHALL 保持文件内容与生命周期状态不变

#### Scenario: 条目无法解析

- **WHEN** 受控 Intake 文件的 frontmatter 无法解析或身份缺失
- **THEN** Runtime SHALL 将其报告为 `invalid` 或含明确缺口的非当前分类，SHALL NOT 修改文件或猜测身份

#### Scenario: 清单不写盘

- **WHEN** 清单命令执行完毕
- **THEN** 项目仓 SHALL 不出现任何新增的清单状态文件，Runtime submodule SHALL 保持不变

### Requirement: Intake routing SHALL be table-driven and fail closed

Runtime SHALL 维护一张版本化的路由表，为每类改动对象声明其交付档位（`delivery-change` / `light-change`）、是否必须先走分析线、必走时分析须由哪个 profile 产出、是否允许立项，以及该改动对象对应的仓库内路径前缀与档位序。路由表 SHALL 是立项门的唯一真源；未在表中匹配到的改动对象 SHALL 默认走最重档位并要求分析线，SHALL NOT 默认豁免。运行中允许升档，SHALL NOT 因门禁失败而降档。改动对象是条目自报的声明，因此 Runtime SHALL 在实施验证门按实际改动触碰的路径归类，与登记时声明的改动对象对照；声明低档而实际触碰更重档位的路径时 SHALL fail closed。

#### Scenario: 未匹配事项取最重默认

- **WHEN** 条目的改动对象不匹配路由表任何一行
- **THEN** Runtime SHALL 判定为 `delivery-change` 档位且不豁免分析线

#### Scenario: 禁止为绕过失败而降档

- **WHEN** 事项在重档位的门禁上失败，调用方请求改判为轻档位
- **THEN** Runtime SHALL 拒绝该降档请求，并 SHALL 保留原档位与失败原因

#### Scenario: 声明与实际触碰路径不符

- **WHEN** 条目声明的改动对象属于轻档位，但该 Change 实际触碰了属于更重档位的路径
- **THEN** Runtime SHALL 在验证门 fail closed，SHALL 列出越档的路径及其归类，并 SHALL 指向修正声明与补走对应档位分析线，SHALL NOT 接受缩小改动面以迁就声明
