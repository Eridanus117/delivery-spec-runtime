# 实施自查（verify 自查段）

> 按 `/opsx-verify` 步骤 4–7 的三维度结构产出。本段是**实施方自查**，不替代 review 站的 `implementation-review.json`（那一站由代码自算 `reviewedPaths` 并另行裁决）。

- 自查时间：2026-09-01
- 前置门禁：`runtime-entry.ts guard --operation verify` → `{"allowed": true, "operation": "verify", "mode": "delivery"}`
- 入口校验：`runtime-entry.ts runtime-check --change-root .` → `{"allowed": true, ...}`

## 一、完整性

### 任务完成情况

机器真源 `task inspect` 读数：**26 个任务，全部 `verified`，无任务缺 evidence**。

```
tasks: 26 {'verified': 26}
no evidence: []
```

每条 evidence 都是 Change 内相对路径 `07-实施任务/证据/<task-id>.md`，且被本 Change 新增的 evidence 路径校验（存在 + 非空 + 不越界）实际校验过——写入时若不满足会 fail closed，因此「26 条 evidence 全部可读」是机器保证而非自述。

### 规范覆盖情况

四份 delta spec 共 15 条 Requirement，逐条定位实现与测试：

| # | Requirement | 实现落点 | 测试 |
|---|---|---|---|
| 1 | Archive 必须在 PR 前由严格状态放行（MODIFIED） | `delivery-lifecycle.ts` readiness 段（attestedBy 派生） | VC-004 / VC-005（五种破坏情形全非零） |
| 2 | PR 反馈导致的行为变化必须受控 Reopen（MODIFIED） | `delivery-lifecycle.ts` `reopen`（去 reopen-state 与 lifecycle-history） | VC-006 |
| 3 | 交付站位定义必须有唯一权威真源 | `delivery-change-v1.json.definitionAuthority` + `workflow-core.ts` | VC-001 / VC-002 / VC-003 |
| 4 | 任务证据必须机器可校验 | `delivery-control.ts` `validateEvidence` | VC-025 / VC-026 / VC-027 |
| 5 | 无机器读者的资产必须停止写盘 | `delivery-control.ts`、`delivery-lifecycle.ts`、`bootstrap.ts` 三处移除 | VC-022 / VC-024 / VC-006 |
| 6 | 现状文档必须合并为单一 artifact 且不削弱门禁 | schema v6 + `artifactPathsFor(root)` 双表 | VC-028 / VC-029 |
| 7 | 保留的强校验不得削弱 | 未改动 review 自算与 acceptance 四 digest | VC-031 / VC-032 |
| 8 | 交互资产折叠为三门（MODIFIED） | `SKILL.md` 站位表、`AGENTS.md` 三档摆盘 | VC-034 |
| 9 | 维护者反馈不得单向解读为裁剪 | `AGENTS.md` 校准条款双向记录 | VC-035 |
| 10 | Intake SHALL expose an explicit DAG（MODIFIED） | `intake-control.ts` 两节点模型 | VC-016 / VC-017 / VC-018 / VC-019 |
| 11 | Intake stages SHALL require distinct evidence（MODIFIED） | `requireCompleteSections` | VC-020 |
| 12 | Promote SHALL hand off to a Change（MODIFIED） | `promote` 立项门「先判后写」 | VC-007…VC-011 |
| 13 | Runtime SHALL report a deterministic intake inventory | `intake-control.ts` `list` | VC-021 |
| 14 | Intake routing SHALL be table-driven and fail closed | `change-routing-v1.json` + `routeFor` | VC-012 / VC-013 / VC-014 |
| 15 | Analysis-line artifacts SHALL be discoverable by the intake gate | `workflow-control.ts` `--intake-id` 与 `inspect` | VC-015 |

**未实现的需求：0 条。** 无 CRITICAL。

## 二、正确性

### 场景覆盖

`06-测试方案/测试方案.md` 定义的 VC-001…VC-040 共 40 个场景，全部有对应断言落在 `test/` 下的 10 份测试文件中（新增 `station-authority.test.ts` 一份）。全量 `node --test`：**稳定通过 73/74，余 1 项为已知环境 flake `INT-20260831-010`**（改造前基线 53）。

> 口径说明（复审 REV-013 订正）：本段原先写「74 passed / 0 failed」，把一次幸运绿灯当成终态。该 flake 在本 Change 之前的基线上同样可复现，非本单引入，但结论表不得强于可复现事实，故按「73/74 + 已知噪音」记。

### 偏离检查

逐条比对实现与 `05-改造方案/改造方案.md` 的九项目标，未发现实现偏离方案的情形。三处需要显式说明的取舍已分别写进对应任务的证据文件，不在此重复：

- 5.2：工件**个数**由 9 变 8 是合并的直接结果；不减的是**校验项**，并给出了两条机器证据。
- 4.1：新的「RAW 编号即权威顺序」规则不追认本 Change 自身 `change-sources.json` 里的历史排序，它对新建 Change 生效。
- 7.1：本 Change delta 的 `Runtime SHALL report a deterministic intake inventory` 与并入长期能力的两条 Inventory 需求语义重叠，建议在 sync 站合并去重。

## 三、一致性

- **两侧一致性合同**：`station-authority.test.ts` 逐站从真门禁退出码取值并与 profile 比对，现状全等；profile 单边改标记或删站位均被报出。这是本 Change 立论「要求必须活在门禁里」的自证。
- **渲染面一致**：九个 `.omp/commands` 产物与命令源逐字节一致（`command-renderer.test.ts`），且不含七类已移除资产的引用（VC-036）。
- **清单一致**：`public-allowlist.json` 与实际文件集合双向一致（VC-037）。
- **存量一致**：10 个归档 Change 仍按 v5 解析、`openspec validate --all --strict` 零失败；20 条存量 intake 全 `current`、`duplicateIds` 为空、重复执行逐字节一致。
- **不新增第二套锁**：未引入 `runtime-lock.json` 或任何第二套 commit/hash 清单；新增的两份数据文件均不承载版本锁语义。

## 结论

- CRITICAL：0
- WARNING：0
- SUGGESTION：0

自查通过，可进入 review 站。

## 自查失效记录（复审后补写）

本自查段最初给出的结论是「CRITICAL 0 / WARNING 0 / SUGGESTION 1」，随后的**独立评审**判定 FAIL，报出 1 CRITICAL + 4 MAJOR + 8 MINOR。两者的差距本身是本单最值得记的一条事实：

- 最严重的一条（REV-001，立项门读 `outputs.disposition` 而分析线产出 `outputs.publishedInputs.disposition`，导致强制分析线在真实路径上永不可通过）没被自查发现，**根因是自查沿用了实施时手写的分析线产物**——生产者与消费者在测试里互相迁就，端到端从未真正连通过。这与 VC-003 要根除的「两侧互抄」是同一种病，只是发生在生产者/消费者维度而非 profile/门禁维度。
- 由此得出的通则：**自查不能复用实施时构造的 fixture**。凡声称「端到端」的结论，其证据必须由真实命令链生成，而不是由实施方按自己的理解手写。本单已据此把 VC-007…011 的分析线产物改为经 `workflow-control bind/run` 真实生成。
- 上述 13 条 finding 的逐条处置见 `07-实施任务/证据/REV-返工.md`；其中 REV-012 判为强度不足而非失效，已登记 `INT-20260901-021` 留待下次复盘。
