---
schemaVersion: 1
id: INT-20260831-019-three-item-retrospective
state: promoted
phase: disposition
source: calibration-checkpoint
capturedAt: 2026-08-31
promotedTo: enforce-analysis-line-and-prune-pipeline
---

# Intake

## 原始问题

3 单真实事项凑满，按校准期条款触发复盘

## Triage

范围：AGENTS.md 校准期条款（2026-08-31 起）约定的 3 事项复盘检查点，三块内容——①逐站裁 17 个机器站位「留/修/杀」；②按下游消费实况裁资产写盘清单；③按维护者不耐烦信号裁人工审阅面。附带处置 `openspec/changes/` 下三个早于归档纪律的未归档目录。不含流水线内容合同的重写、不含新功能。复盘的定义与原始意图见 INT-20260831-007（已 promote 至 establish-human-interaction-layer）。

影响：裁剪结果直接改动 delivery-change / requirement-analysis / intake 三套 profile 的站位与写盘合同、`.claude/skills/delivery-pilot` 的摆盘约定，以及 AGENTS.md 校准条款本身（校准期在复盘后终止或续期）。裁错的代价不对称：杀掉真被消费的站位会丢审计链，留下零消费站位只是持续摩擦，故本条目只做取证不做裁决。

判断：continue（证据已备齐，等维护者逐块裁决）。本条目是调查卷宗，不自行裁决；Options 段列出的候选一律由维护者裁决。三单真实事项为：①establish-human-interaction-layer（PR #15）②replace-symlinks-with-verified-copies（PR #16）③INT-20260831-015 消费仓 agent-system 升级（intake 台账内 close，无 Change 目录）。

## Evidence

> 本段是复盘卷宗本体，故篇幅超出一般 intake 条目。所有裁剪候选一律列在 Options 段，**由维护者裁决**；本段只陈述取证结果。

### 已知事实

#### 一、17 个机器站位的权威枚举

仓内唯一一处精确枚举在 `openspec/intake/INT-20260831-007-workflow-usability-and-review-surface.md:76`（2026-08-31 维护者确认记录）：

> 机器站位全景：登记 5（capture/triage/evidence/options/disposition）＋分析 5（capture/clarify↺/discover↺/evaluate↺/decision◆）＋交付 7（proposal/decision◆/implementation/review/acceptance◆/sync/archive◆）

5＋5＋7＝17，与「17 个机器站位」吻合。另两处提到「17」但不枚举：同文件第 37 行（存疑与复盘约定的出处）、`openspec/changes/archive/2026-08-31-establish-human-interaction-layer/01-原始需求/原始需求索引.md:8`。

三份 profile 定义与该枚举逐字对齐，可作独立佐证：

- `openspec/intake/stages.json` → `capture/triage/evidence/options/disposition`（5）
- `openspec/profiles/requirement-analysis-v1.json` → `capture/clarify/discover/evaluate/decision`（5，后四站 `humanJudgment` 为 clarify/discover/evaluate 的 continue-analysis 循环 + decision◆）
- `openspec/profiles/delivery-change-v1.json` → `proposal/decision◆/implementation/review/acceptance◆/sync/archive◆`（7，◆＝`humanJudgment: true`）

不计入 17 的：快车道 `light-change-v1.json` 的 3 站（intake/implementation/verification◆）、随时可用的只读侧路 `opsx-explore`。

#### 二、逐站消费实况（跨三单取证）

三单：①`establish-human-interaction-layer`（PR #15，archive 目录同名）②`replace-symlinks-with-verified-copies`（PR #16）③`INT-20260831-015` 消费仓 agent-system 升级（intake 台账内 close，无 Change 目录）。

**登记 5 站（intake）**

| # | 站位 | 三单执行 | 消费评级 | 证据指针 |
|---|---|---|---|---|
| 1 | capture | ①②③ 全执行 | 高频消费 | 三单的源头条目 INT-007/008、INT-013、INT-015 均由此站创建；被 Change 的 `change-sources.json` 以 `locator` 逐条引用（如 archive/…-replace-symlinks…/change-sources.json RAW-001 → INT-20260831-013），并在 `01-原始需求/原始需求索引.md` 表格中复引 |
| 2 | triage | ①②③ 全执行 | 偶被消费 | INT-013 triage 的边界「不含 opsx 命令内容、workflow/intake 合同本身」被 Change 的非目标原样继承；但 19 条 intake 中 8 条（INT-009/010/011/012/014/016/017/018）永久停在 capture，从未到达本站 |
| 3 | evidence | ①②③ 全执行 | 高频消费 | 本站是三单里真正干活的位置。INT-013 Evidence 的耦合面 grep 实测（5 工具/6 测试/5 docs/2 命令源）直接成为 `04-技术现状` 与 `05-改造方案/方案提案.md` 候选 A 的成本估算依据；INT-015 的 Evidence 段（坑 1–4）本身就是该单交付物，直接派生 INT-016/017/018 三条新条目并向 INT-009 增补证据 |
| 4 | options | ①②③ 全执行 | 高频消费 | INT-013 的候选 C（保留 gitlink、软链改复制校验）被 `05-改造方案/方案提案.md` 继承为候选 A 并最终选中；INT-007 的四条使用路线是交互设计收敛为「一次发起＋自动行进＋门口停靠」的直接依据 |
| 5 | disposition | ①②③ 全执行 | 高频消费 | promote 写回 frontmatter `promotedTo`，与 Change 目录名互为闭环（INT-007→establish-human-interaction-layer、INT-013→replace-symlinks-with-verified-copies）；INT-015 的 close 记录承载了三条衍生条目的转出，防止坏账随条目关闭而丢失 |

登记 5 站的共同缺陷（硬证据）：站间推进是仪式性的。`## History` 时间戳显示 triage→evidence→options 三次 advance 在 **0.5–1.0 秒**内连续发生——INT-007（17:09:57.9 / 17:09:58.4 / 17:09:58.8）、INT-008（17:16:10.6 / 17:16:11.1 / 17:16:11.6）、INT-013（19:36:17.5 / 19:36:18.2 / 19:36:19.0）、INT-005（01:40:55.7 / 01:40:55.9 / 01:40:56.1）。即：内容一次性写完，再机械连点 advance。唯一例外是 INT-015（evidence 21:52:01 → options 22:09:54，中间 18 分钟是真实调查）。结论：这 5 个「站位」在实践中是**一个文件的 5 个小节**，不是 5 个决策点；有价值的是小节结构（尤其 Evidence 与 Options），无价值的是分站推进的状态机。

**分析 5 站（requirement-analysis profile）：三单全部零执行**

| # | 站位 | 三单执行 | 消费评级 | 证据指针 |
|---|---|---|---|---|
| 6–10 | capture / clarify↺ / discover↺ / evaluate↺ / decision◆ | ①②③ 均**未执行** | 零消费 | 硬证据一：`workflow bind` 会向 Change 根写 `workflow-binding.json`（docs/workflow-guide.md 该节明述），而 `git log --all --diff-filter=A --name-only` 全历史检索显示本仓**从未提交过任何 `workflow-binding.json`**（唯一命中是合同 schema `openspec/contracts/workflow-binding.schema.json`）。硬证据二：两个已归档 Change 目录内无 binding / request / result 任何工件（`find openspec/changes -name "workflow-binding.json"` 空）。硬证据三：`grep -rn "requirement-analysis\|workflow bind\|workflow run"` 在两单工件中仅命中三处**叙述性提及**，无一处是执行记录 |

补充：该 profile 唯一一次真实运行是 2026-08-31 的 dogfooding（INT-007:27 记「跑通 bind → capture → clarify → 多轮 continue-analysis 循环」），发生在三单**之前**，且未在仓内留下任何工件。三单中，这 5 站的功能被登记 5 站的 evidence/options/disposition 三站**完整吸收**——INT-013 的 Evidence 就是 discover 的 capabilityReport、Options 就是 evaluate 的 optionReport、Disposition 就是 decision。两套站位在做同一件事，只是一套写 Markdown 小节、一套写 JSON。

**交付 7 站（delivery-change）**

| # | 站位 | 三单执行 | 消费评级 | 证据指针 |
|---|---|---|---|---|
| 11 | proposal | ①② 执行（③ 无 Change 目录） | 高频消费 | `05-改造方案/方案提案.md` 被 `openspec/tools/delivery-control.ts:31` 逐字读取并结构校验（≥2 候选、`## Trade-off 矩阵`、`## 推荐`、`## 未决问题` 缺一即 fail）；其「未决问题」被 `改造方案.md` 逐条闭环（PLAN-002「方案提案未决问题 1」、PLAN-003「未决问题 3」） |
| 12 | decision ◆ | ①② 执行 | 高频消费（真门） | `方案决策.md` 被 `delivery-control.ts:32` 读取并校验六项（`状态：APPROVED`、`选择：`、`决策人：`、`决策时间：`、`## 接受的后果`、`## 拒绝方案`）；两单门2 均有真实维护者表态时间戳（①18:07:23.402Z ②20:15:27.254Z，见各自 `artifact-approvals.json`） |
| 13 | implementation | ①② 执行 | 高频消费 | `task-state.json` 是任务状态真源，`07-实施任务/实施任务.md` 由 `task render` 单向投影，`verifyTaskProjection` 反查一致性（`delivery-control.ts:166`）；acceptance guard 要求全部 `verified`（`delivery-control.ts:196`） |
| 14 | review | ①② 执行 | 高频消费，且是三单中唯一真正拦下东西的机器站 | ② 的独立 fresh reviewer 产出 5 条 finding（2 HIGH：`runtime-link.ts:60` ignore 隐藏改动被误判干净会静默销毁本地改动；`runtime-entry.ts:99` 跨仓行尾差异永久误报漂移），全部 RESOLVED 并回写 spec 场景 + 补测试（commit bad6b8e）；① 产出 2 条 LOW（证据卫生）。`implementation-review.json` 被 acceptance / archive guard 读取（`delivery-lifecycle.ts:212`），且 finding 的 `path` 必须落在 `reviewedPaths` 内（`:173`） |
| 15 | acceptance ◆ | ①②③ 均执行（③ 在 intake 门口执行，见其 Disposition） | 高频消费（真门） | `acceptance-state.json` 由 `delivery-lifecycle.ts:228-233` 校验四个 digest 的新鲜度（review / task-state / 验收记录 / implementationCommit），任一工件事后改动即 stale 失败；`08-验收/验收记录.md` 被 `^- 结论：PASS\s*$` 正则读取（`delivery-lifecycle.ts:90`）；两单验收结论均由维护者当轮明确表态（`acceptedBy` 字段） |
| 16 | sync | ①② 执行 | 高频消费 | `archive-readiness.json.specSync` 记录 delta→main 的双向 sha256；② 同步两个 spec（`runtime-distribution` 新增 + `runtime-upgrade-safety` MODIFIED），strict 12/12 通过（`09-发布/发布计划.md` Spec Sync 表） |
| 17 | archive ◆ | ①② 执行 | 偶被消费（机器有用、人的门是橡皮图章） | 机器侧真有约束：archive guard = release guard + `requireReadiness`（`delivery-control.ts:198`），readiness 又校验 releasePlan digest（`delivery-lifecycle.ts:245`）。但人的一侧，AGENTS/skill 已明写「验收之同意授权 archive 的机械确认」（INT-007:76、SKILL.md:29），即 17 站中标 ◆ 的四个门里，archive 这个门对人**从设计上就不是门** |

站位小结：17 站中，**5 站零执行**（分析 5 站），**5 站是同一文件的小节而非决策点**（登记 5 站），**7 站真在跑**（交付 7 站，其中 review 与 acceptance 是唯二产生过真实拦截或返工的站）。人实际出面 3 次（门1 立项 / 门2 方案 / 门3 验收），与 skill 的折叠视图一致。

#### 三、资产写盘清单与下游消费实况

以代码为准（`delivery-control.ts` / `delivery-lifecycle.ts` / `intake-control.ts` / `workflow-*.ts`）。「机器消费」指有代码 readFile/readJson 并据以放行或拒绝；「人类消费」指有工件互相引用或维护者行为证据。

| 资产 | 路径模式 | 写盘站 | 机器消费 | 人类消费 | 三单实况 |
|---|---|---|---|---|---|
| intake 条目 | `openspec/intake/INT-*.md` | 登记 1–5 | `intake-control.ts inspect/list/advance/promote` 读取 | **有**：维护者主动追问台账完成度（信号5）；被 `change-sources.json` 引用 | 三单全部；**保留证据最强的一项** |
| intake 清单（inventory） | 无——`inventoryEntry()` 由 `intake-control.ts:60` 即时计算，不落盘 | — | 命令内即时 | 偶尔 | 无写盘负担，不在裁剪范围 |
| `change-info.json` | `<change>/change-info.json` | proposal(init) | 是（`parseInfo` 在 init/inspect/guard 全路径调用） | 无（内容仅一个 displayName） | 两单各 1 行有效内容 |
| `change-sources.json` | `<change>/change-sources.json` | proposal | **弱**：仅被人工命令 `sources inspect` 读取，**无任何 guard 读取** | 弱：内容与 `01-原始需求索引.md` 的 RAW 表格重复 | 两单均写，无下游 |
| `01-原始需求/原始需求索引.md` | 同左 | proposal | 是（approvals digest 门禁，`requiredBeforeAcceptance`） | 是（RAW→intake 溯源链） | 两单均写并被引 |
| `03-业务现状/业务现状.md` | 同左 | proposal | **仅 digest**（内容无任何代码读取） | **无**：grep 全档，无任何下游工件引用其内容；文末自陈「本文件只陈述当前业务事实；目标状态进入 `05-改造方案/`」 | 两单均写，**内容零消费** |
| `04-技术现状/技术现状.md` | 同左 | proposal | **仅 digest** | **有**：② 的 `方案提案.md` 候选 A 成本估算「改 runtime-link/verifyLinks、6 个测试文件断言」直接来自 04 的核验表 | 两单均写，内容被用 |
| `05-改造方案/方案提案.md` | 同左 | proposal | **是（内容级）**：`delivery-control.ts:31` 结构正则 | 是（门1 材料、未决问题被 03 闭环） | 两单均写 |
| `05-改造方案/方案决策.md` | 同左 | decision◆ | **是（内容级）**：`delivery-control.ts:32` 六项正则 | 是（门2 记录） | 两单均写 |
| `05-改造方案/改造方案.md` | 同左 | decision | 仅 digest | 是（PLAN-00x 决策台账闭环 02 的未决问题） | 两单均写 |
| `06-测试方案/测试方案.md` | 同左 | decision | 仅 digest | **是**：② 的 VC-001…007 编号被 `07-实施任务.md` 的验证栏与 `08-验收/…/traces/requirement-coverage.md` 逐条回引 | 两单均写，链路完整 |
| `artifact-approvals.json` | `<change>/artifact-approvals.json` | 各站 approval set | **是（强）**：`requireApproved` + `artifactDigest` 重算，工件事后改动即 stale，apply/verify/acceptance 全部拒绝 | 是（门1/门2 表态的落点） | 两单各 9 个工件；② 有两次「Review 补定后重批准」的真实 stale 修复 |
| `task-state.json` | `<change>/task-state.json` | implementation | **是（强）**：状态真源；acceptance guard 要求全 verified | 间接 | 两单均写 |
| `07-实施任务/实施任务.md` | 同左 | implementation | **是**：`verifyTaskProjection` 校验投影一致，且 `delivery-lifecycle.ts:309` 会反写降级复选框 | 是（人读版） | 两单均写；文件头自带「禁止反向解析复选框」 |
| `implementation-review.json` | `<change>/implementation-review.json` | review | **是（强）**：acceptance/archive guard 读取；findings 路径须在 reviewedPaths 内 | 是（② 的 5 条 finding 全流程） | 两单均写；**三单中唯一挡下过东西的资产** |
| `08-验收/验收记录.md` | 同左 | acceptance◆ | **是（内容级）**：`^- 结论：PASS$` 正则 | 是（门3 材料） | 两单均写 |
| `08-验收/runs/<run-id>/{metadata,inputs,outputs,traces,cleanup,conclusion}` | 同左 | acceptance◆ | 部分：`conclusion.md` 走 `结论：PASS` 正则；`cleanup-pass.md` 被 readiness 以 digest 钉住 | 是（requirement-coverage 被验收记录引用） | 两单均全套；**注意 ① 因证据日志文件名过长触发 Windows 路径预算问题，已登记 INT-011** |
| `acceptance-state.json` | `<change>/acceptance-state.json` | acceptance◆ | **是（强）**：四 digest 新鲜度校验 | 是（`acceptedBy` 记录维护者表态） | 两单均写 |
| `09-发布/发布计划.md` | 同左 | sync | 是（存在性 + readiness 的 releasePlanDigest） | **部分**：本仓无生产部署，「现场快速资产」「日志、指标与观察窗口」「配置开关」三节两单**均为「无」**；有效内容只有 Spec Sync 表与门禁勾选 | 两单均写，约半数小节空转 |
| `archive-readiness.json` | `<change>/archive-readiness.json` | archive◆ | **是（强）**：archive guard 必读；含 specSync 双向哈希与 cleanup digest | 弱 | 两单均写 |
| `specs/<capability>/spec.md`（delta） | `<change>/specs/…` | proposal/sync | 是（approvals digest + readiness specSync + `openspec validate --strict`） | 是（长期生效行为要求） | 两单均写 |
| `change-mode.json` | `<change>/change-mode.json` | init（仅 rehearsal 模式） | 有读取路径（`parseMode`），但缺失即默认 delivery | 无 | **三单零写盘**；两单验收记录均记「缺少 `change-mode.json`，默认 delivery」 |
| `.delivery-update-snapshot.json` | `<change>/.delivery-update-snapshot.json` | `update snapshot` 命令 | 有读取路径（`updateDiagnose`） | 无 | **三单零写盘；全仓无任何实例** |
| `workflow-binding.json` / workflow request / result | `<change>/workflow-binding.json` 等 | 分析 5 站 | 有完整读写实现（`workflow-core.ts` 376 行 + `workflow-control.ts` 144 行 + `workflow-entry.ts` 75 行 + 4 份 schema + 3 份 profile） | 无 | **全仓 git 全历史零实例** |
| 指标事件 / summary / compare | 强制仓外 state root（`metrics-control.ts` 拒绝仓内根） | 各站可选 | 有完整实现（315 行 + `metrics-event.schema.json` + `metrics.test.ts`） | 无 | **三单零事件**；仓内无任何 metrics 数据，`docs/maintainer-guide.md:52-78` 是唯一使用说明 |

零消费资产名单（三单内既无机器 guard 读取、也无人类引用）：`change-mode.json`、`.delivery-update-snapshot.json`、`workflow-binding.json` 及 workflow request/result 全族、metrics 事件全族、`03-业务现状/业务现状.md` 的**内容**（digest 门禁仍在，故不是完全零消费）、`change-sources.json`（仅人工命令可读，无 guard）、`09-发布/发布计划.md` 的三个恒为「无」的小节。

代码级复核补充（全仓 grep reader）——以下资产**在代码里根本没有下游读者**，比「三单内没被消费」更强：

- `change-sources.json`：唯一读者是它自己的人工回显命令 `sources inspect`（`delivery-control.ts:204`）。**无任何 guard / digest / lifecycle 读取**。而 `01-原始需求索引.md` 里那几行 `- Intake 来源：…` 是 `intake promote` 跨文件追加的（`intake-control.ts:133`，实测存在于两单及 establish-runtime-metrics-baseline），与 `change-sources.json` 的 RAW 表**信息完全重复**，且后者不受机器保护。
- `reopen-state.json`（`delivery-lifecycle.ts:322` 写）：全仓 grep 仅此一处，**无 reader**。
- `lifecycle-history/<stamp>/**`（reopen 时复制的 review/acceptance/readiness/08/09 快照，`delivery-lifecycle.ts:317-319`）：纯留痕，**无 reader**。三单未触发 reopen。
- `task-state.json` 里 `evidence` 数组指向的证据文件：`parseTask`（`delivery-control.ts:111-114`）只校验数组非空、字符串非空，**从不打开该路径**。即三单里所有任务证据串（「LF 克隆全量 52/52…」）是纯人读文本，机器一个字节都没验过。全流水线唯一被真正打开验证的证据文件是 readiness 的 `cleanupEvidence`（`delivery-lifecycle.ts:247-248` 算 digest + 查 `结论：PASS`）。
- `review-input.json` / `acceptance-input.json` / `readiness-input.json`：一次性输入，agent 写到 OS 临时目录，读完即弃，**不是仓内资产**（`delivery-lifecycle.ts:260,273,283`）。

同时也发现了几处「比想象中更强」的机器约束，裁剪时不应误伤：

- `implementation-review.json` 的 `reviewedPaths` 与 `result` **由代码自算，不接受手工缩小**：路径 = `git diff --name-only baseline..reviewed` 减去 Change 自身与 `openspec/specs/**`（`delivery-lifecycle.ts:119-125,135-140`）；写入前还硬性要求 baseline 是 reviewed 的祖先、reviewedCommit == HEAD、实现路径工作树 clean（`:263-267`）。存在任一 OPEN finding 即自动 FAIL。
- `07-实施任务/实施任务.md` **由 CLI 生成**（`task render`，`delivery-control.ts:186`），不是 agent 手写；`verifyTaskProjection` 双向卡死漂移。
- `openspec/bootstrap-state.json` 处于 `in_progress` 时全部生命周期命令停摆（`runtime-entry.ts:134`）。

以及三处「站与合同脱节」的结构事实（影响裁剪路径的选择）：

1. **`delivery-change-v1.json` 与真实交付门禁是两套互不相通的机制**：该 profile **没有 `inputContracts` 字段**，所以拿它跑 `workflow run` 只做 request JSON 的键存在性检查，全程不碰 Change 目录；真实门禁在 `delivery-control.ts guard` 与 `delivery-lifecycle.ts`。代码里没有任何一处把 `stage.id === "review"` 关联到 `lifecycle review write`。即：交付 7 站在仓内有**两份互不引用的定义**。
2. **sync 站与 archive 站的实际动作没有 Runtime 代码**：spec 合并与 Change 目录移入 `archive/` 都由 agent 或外部 `openspec` CLI 执行，Runtime 只在事后用摘要把结果钉进 `archive-readiness.json`（`delivery-lifecycle.ts` 内唯一的 `renameSync` 是反向的 `reopen`）。
3. **`intake advance` 的 `state` 三元两分支字面相同**（`intake-control.ts:130`：`target === "triage" ? "triaged" : "triaged"`）——无论推进到哪一站 `state` 恒为 `triaged`，只有 `phase` 在变。这是代码事实，可佐证「登记 5 站的状态机没有承载信息」。

#### 四、审阅面信号汇总（维护者不耐烦与关注信号）

台账在 `openspec/intake/INT-20260831-014-calibration-signals.md`，本次已按其格式追加信号 3–5（这是本条目允许修改的唯一既有文件）。

| 信号 | 日期/场景 | 观察 | 对审阅面的含义 |
|---|---|---|---|
| 1 | 2026-08-31，事项 release-package | 维护者读 RA workflow 的 request JSON：「内容挺好，但 key 不是中文，看起来吃力」 | 机器 JSON 进入人的视野即产生负担；机器文件不应出现在人审路径上 |
| 2 | 2026-08-31，release-package 门2 | 对 AGENTS.md 既有硬规则「已经忘了它是啥」并质疑可废性 | 无理由的规则数日后无法复审；已促成「硬规则须附大白话理由」元规则 |
| 3 | 2026-08-31 主会话观察 | 对三个候选方向答「三个都可以，按你推荐的来」 | **决策授权下放**，不愿逐项选择。摆「并列候选」本身即负担；非不可逆岔路应直接给单一推荐＋理由 |
| 4 | 2026-08-31 主会话观察，验收门 | 一屏材料后只回「同意」二字，零追问 | 当前验收摆盘粒度**可接受**（未触发不耐烦），但也未被消费到细节层——可解读为合格，亦可解读为**可再压缩** |
| 5 | 2026-08-31 主会话观察 | **主动**追问 intake 台账完成度与归档 | 台账整洁度是维护者少数主动来找的位置，**不宜裁剪**；同时是「intake 类资产有真实人类下游消费者」的硬证据，供第 2 块裁决直接引用 |

信号 3 与 4 合看：维护者的审阅意愿集中在**结果与授权**，不在过程细节。信号 5 是唯一的反向信号（对某类资产有主动关注）。三单中未观察到任何一次维护者要求展开机器细节、或对某站产物提出实质修改的记录——门1/门2/门3 的表态分别是「没问题」「同意候选A」「同意」。

#### 五、三个早期未归档目录的核实

`openspec/changes/` 下三个目录同出 commit `5f48c2a`（2026-08-30，早于归档纪律）。三者共同状态：`.openspec.yaml` / `change-info.json` / `change-sources.json` / `task-state.json` 齐备，但 **`artifact-approvals.json` 的 `artifacts` 全为空 `{}`**，且 `implementation-review.json` / `acceptance-state.json` / `archive-readiness.json` / `08-验收/` / `09-发布/` **全部缺失**——即治理证据链从第一环（工件批准）起就是空的。对照 10 个已归档 change 个个五件齐全。三者今天都通过 `openspec validate --all --strict`（11 passed / 0 failed），不破坏门禁，只是长期占位。

**(1) establish-intake-inventory —— 判定：已交付未归档（唯一实质缺口是 spec 未落盘）**

| 宣称交付物 | 现状 | 证据 |
|---|---|---|
| `openspec/contracts/intake-inventory.schema.json` | 存在 | `git log` 仅 5f48c2a 一条，即本 Change 所生 |
| `intake list`（扫描 / 确定性排序 / 重复 ID 分组） | 存在 | `openspec/tools/intake-control.ts:80` `list()`，`Buffer.compare` 排序 + `duplicateIds` |
| legacy `inspect` 结构化报告 | 存在 | `intake-control.ts:106` `legacyInspection()` |
| `test/intake.test.ts` | 存在且今天全绿（本轮 24 项通过） | 实跑 `node --test` |
| legacy/invalid 条目规范化、唯一 slug | 已完成且今天仍成立 | 实跑 `intake list`：19 条全 `current`、`duplicateIds: []`；5f48c2a diff 删除 `INT-20260830-003-需求咨询与实施边界.md` 并新建 ASCII slug 版 006 |
| `public-allowlist.json` 声明、`docs/workflow-guide.md:54-60` 说明 | 存在 | — |
| **spec capability `intake-inventory`** | **不存在于 `openspec/specs/`** | `grep -ri inventory openspec/specs/` 零命中 |

无后续 change 取代（归档的 `2026-08-30-establish-intake-workflow` 是其**前驱**）。现行 `openspec/specs/intake-workflow/spec.md` 与本 delta 部分重叠，但**无一条覆盖 inventory 的扫描/排序/重复 ID 报告**——即 `intake list` 这段活代码目前在 `openspec/specs/` 里没有规范来源。task-state 6 项中 5 verified、1 `implemented_unverified`。

**(2) establish-runtime-metrics-baseline —— 判定：代码已交付未归档，但 spec 从未落盘，且该 Change 的业务目的（C/C+1 并发实验）从未开跑**

| 宣称交付物 | 现状 | 证据 |
|---|---|---|
| `openspec/contracts/metrics-event.schema.json` | 存在 | `git log` 仅 5f48c2a |
| `metrics-control.ts` append / summary（另含未宣称的 compare / cleanup） | 存在 | `metrics-control.ts:131` / `:253` / `:279` / `:305-312` |
| `test/metrics.test.ts` | 存在且今天全绿 | 实跑通过（重复 eventId、敏感内容与仓内 state-root 拒绝、单槽位 compare、UTC cutoff cleanup） |
| `public-allowlist.json`、`docs/maintainer-guide.md:52/57/69/78` | 存在 | — |
| 「Change technical/test boundary」「C/C+1 实验前置记录」（任务 4.1/4.2） | 仅以散文存在于 `05-改造方案/改造方案.md` 的「执行前置」段，无独立工件 | — |
| **spec capability `runtime-metrics-baseline`** | **不存在于 `openspec/specs/`** | `grep -ri metric openspec/specs/` 零命中 |
| 实际 C 基线数据 | 不存在（设计上事件落仓外私有 state） | 仓内无任何 summary/baseline 产物 |

task-state 8/8 verified。额外两处缺口：① **metrics 未接入 `runtime-entry.ts` 路由**（`runtime-entry.ts:172-176` 只转发 workflow/lifecycle/intake/delivery 四路），且 `runtime-manifest.json` 四条受管投影不含 `metrics-control.ts` ⇒ **消费仓拿不到该能力**；② **悬挂引用**：`openspec/intake/INT-20260830-005-metrics-concurrency.md` frontmatter `state: promoted` / `promotedTo: establish-runtime-metrics-baseline`，是 19 条 intake 中**唯一**指向未归档 change 的 `promotedTo`。无后续 change 取代（`945036a`「harden profile metrics comparison」是加固不是取代）。

**(3) establish-workflow-v01-contract —— 判定：被后续演进取代（superseded），仅 `workflow-entry.ts` 一件实交产物**

| 宣称交付物（task-state） | 状态 | 现状 |
|---|---|---|
| `workflow-matter.schema.json` | planned | **从未存在**（git 全历史无记录） |
| `workflow-execution.schema.json` | planned | **从未存在** |
| `workflow-profile.schema.json` / `workflow-result.schema.json` | planned | 存在，但**出自 5daf1bd，非本 Change** |
| `workflow-core.ts` `executeWorkflow()` 及 blocked/waiting 语义 | planned | 存在，**出自 5daf1bd** |
| `workflow-entry.ts` standalone `run --input` | **verified** | 存在，`git log -- openspec/tools/workflow-entry.ts` **仅 5f48c2a 一条**——本 Change 唯一独占产物 |
| `test/workflow.test.ts` standalone 场景 | verified | 文件出自 5daf1bd，5f48c2a 追加（+70 行），今天 6 处 `workflow-entry.ts` 断言全绿 |
| consumer 无写入 / submodule dirty 回归断言（4.3）、实现前置验证清单（5.2） | **planned** | 无证据 |
| `docs/workflow-guide.md` + `docs/architecture.md:40` standalone 说明 | verified | 存在 |
| **spec capability `workflow-execution`** | — | **不存在于 `openspec/specs/`**（delta 仍卡在 changes 下） |

取代关系有白纸黑字的三重证据：① `5daf1bd`（PR #9）在同一 commit 里落盘了长期能力 `openspec/specs/workflow-profiles/spec.md`；② 归档的 `2026-08-30-establish-workflow-multi-profile-v01/01-原始需求/原始需求索引.md` 原文写明「既有 `establish-workflow-v01-contract` 针对『独立 core、单 profile』……**旧 Change 已暂停**，不在本 Change 内静默合并」；③ 本 Change 自己的 `05-改造方案/方案决策.md`「后续架构复核」段写明「**当前 Change 暂停，原改造方案和测试/任务规划不得作为实施依据**」（5f48c2a 后追加「恢复最小执行闭环」，但只兑现了 3.1/3.2，1.1/2.1/2.2 至今 planned）。且其 4 条 workflow-execution 需求在现行 `openspec/specs/workflow-profiles/spec.md` 中**全部有归宿**（independently callable / Change 绑定 profile / 无全局索引 / 机器可读结果），归档不会使任何需求失去规范来源。旁证：三者中唯有它**没有 `07-实施任务/` 目录**（tasks 从未 render），佐证它从未真正进入实施阶段。

**先例（影响处置路径的可行性）**：归档的 `2026-08-30-improve-profile-catalog-analysis-contracts` 的 delta 目录名是 `specs/profile-catalog-analysis/`，但 `openspec/specs/` 下无同名能力——其 5 条需求在 sync 时被并入 `workflow-profiles` 与 `requirement-analysis`。即「归档时把 delta 并入既有能力、不新建同名能力」是本仓既定做法。

### 未知与假设

- 三单样本量小且同质：全部是 Runtime 自身演进、单一维护者、单一 agent 驾驶。对多人协作或跨仓事项，review / acceptance / archive 的审计价值可能显著高于本次取证所显示。
- 分析 5 站零消费的成因有二解，本次证据不足以区分：(a) 站位本身冗余；(b) agent 图省事绕开了它（intake 的 Markdown 小节比 workflow 的 JSON 状态机好写）。若是 (b)，杀掉 profile 等于把「结构化分析」的强制力一并杀掉。建议维护者裁决时明确取哪一解。
  - **【2026-08-31 维护者裁决：取 (b) 对齐失败解，本开放问题关闭】** 原话：「我一直想让你跑，但一直无法对齐，就像你根本不听话一样」。即维护者的意图一直存在，历次由 agent 绕开，零执行是传达链路失效而非站位冗余。由此得出的通则：**要求必须活在门禁里，而非活在文字里**——写在 AGENTS.md / docs / profile 描述中的「应当走分析线」对 agent 无约束力，只有 fail-closed 的机器检查才有。据此，A1 取「先强制、后评判」：本次不裁分析线，改为把立项门 fail-closed 化强制其执行，待真跑一两单产生消费数据后再裁留/修/杀。信号已同步登记为 `INT-20260831-014` 信号7。
- metrics 子系统零使用的成因未查：可能是 state root 强制仓外造成的接入摩擦，也可能是「单人单仓无需度量」。未做归因调查。
- 「零消费」的判据本次取三单窗口。`.delivery-update-snapshot.json` 与 `change-mode.json`（rehearsal 模式）属于「为异常路径准备的资产」，正常路径不写盘是设计预期，不等于无价值——裁决时应与真正的空转资产区分。
- 本条目未评估裁剪的实施成本（删站位会牵动 profile schema、合同测试、docs 与 `.omp/commands` 渲染面）。
- 三个早期目录的「补验收」是否算伪造治理证据，取决于维护者对归档语义的定义：为一个自己方案决策里写着「不得作为实施依据」的计划补盖验收章（establish-workflow-v01-contract），与为一段已在跑、只缺规范落盘的代码补 spec（establish-intake-inventory），性质不同。本条目按此差异给出不同处置候选，但边界由维护者划。
- metrics 与 `establish-runtime-metrics-baseline` 的处置存在耦合：若判 superseded 直接归档，`metrics-event.schema.json` / `metrics-control.ts` / `test/metrics.test.ts` 会成为**第二段无 spec 支撑的活代码**（第一段是 `intake list`）。要么补 spec，要么随归档一并移除——本条目不预设哪一种。

### 证据

- 站位枚举：`openspec/intake/INT-20260831-007-workflow-usability-and-review-surface.md:37,76`；`openspec/intake/stages.json`；`openspec/profiles/{requirement-analysis-v1,delivery-change-v1,light-change-v1,registry}.json`。
- 三单工件：`openspec/changes/archive/2026-08-31-establish-human-interaction-layer/**`、`openspec/changes/archive/2026-08-31-replace-symlinks-with-verified-copies/**`、`openspec/intake/INT-20260831-015-upgrade-agent-system-consumer.md`。
- 机器消费判据（代码）：`openspec/tools/delivery-control.ts:18-32,160-200`、`openspec/tools/delivery-lifecycle.ts:90,212,228-233,240-245,305-309`、`openspec/tools/intake-control.ts:60,122,130`。
- 零执行判据：`git log --all --diff-filter=A --name-only` 全历史无 `workflow-binding.json`；`find openspec/changes -name workflow-binding.json` 空；`find … -name change-mode.json` 空。
- 仪式性推进判据：各 intake 文件 `## History` 段时间戳（INT-005/007/008/013 的三次 advance 间隔 0.5–1.0 秒）。
- 审阅面信号：`openspec/intake/INT-20260831-014-calibration-signals.md`（信号 1–2 既有；信号 3–5 为 2026-08-31 主会话观察，本次追加）。
- 三个早期目录：`openspec/changes/establish-intake-inventory/`、`establish-runtime-metrics-baseline/`、`establish-workflow-v01-contract/` 全部工件与状态文件；`git show --stat 5f48c2a`、`git log -- openspec/tools/workflow-entry.ts`（仅 5f48c2a）、`git log --oneline 5daf1bd`；`openspec/changes/archive/2026-08-30-establish-workflow-multi-profile-v01/01-原始需求/原始需求索引.md`（明写旧 Change 暂停）；`openspec/changes/establish-workflow-v01-contract/05-改造方案/方案决策.md`（暂停与恢复两段裁决）；`openspec/intake/INT-20260830-005-metrics-concurrency.md`（悬挂 promotedTo）；实跑 `openspec validate --all --strict`（11/11）、`node --test`（intake 24 项、metrics、workflow 全绿）、`intake list --intake-root .`（19 条全 current、零重复）。
- 附带实测：本次用 `runtime-entry.ts intake init` 创建本条目时，DEP0190 弃用警告**仍然复现**（INT-007:28 记录的缺陷一至今未修）。

## Options

### 候选处置

> **以下全部是调查中自然浮现的裁剪候选，不是建议、不是结论。逐条由维护者裁决。** 本条目的作者（agent）无权对流水线形状作任何裁定。
>
> **2026-08-31 维护者已逐条裁决完毕**，结果以每条候选下的「**裁定**」行为准；未标裁定的条目为本次未处置。裁定的实施载体是 Change `enforce-analysis-line-and-prune-pipeline`（本条目 promote 目标）。

**A 组：站位（对应复盘第 ① 块，17 站裁留/修/杀）**

- A1｜分析 5 站（requirement-analysis profile）：三单零执行、全历史零 binding。候选动作有三种互斥取向——(a) **杀**：删站位与 profile，承认 intake 的 evidence/options/disposition 已完整承接；(b) **修**：保留但改为「intake 的 Evidence/Options 小节即 RA 的产物」，取消独立 JSON 状态机；(c) **留**：判定零执行是 agent 图省事绕开，反而应强制走 profile。三者的分歧点在「结构化分析的强制力值不值这套 JSON」，见「未知与假设」第 2 条。
  - **裁定：取 (c) 的成因认定，但动作是「先强制、后评判」——不杀、不改形状，先把它变成必经之路。** 维护者明确零执行是对齐失败而非站位冗余。落地方式：立项门 fail-closed——台账条目 promote 为正式 Change 之前，机器检查分析线产物（workflow 绑定记录＋分析结果）是否存在，缺则拒绝 promote；同时立法豁免规则（哪类事项必须走分析线、哪类走快车道豁免），豁免规则与台账 `INT-20260830-002` 的 change-profile 路由**一并立法**。分析线真跑一两单、产生真实消费数据之后，再回头裁留/修/杀。
- A2｜登记 5 站：证据显示是**一个文件的 5 个小节**而非 5 个决策点（三次 advance 间隔 0.5–1.0 秒；`state` 字段恒为 `triaged`）。候选：保留小节结构（尤其 Evidence / Options，它们是三单里真正干活的地方），把 5 次 advance 合并为 1–2 次；或保留现状（推进成本本就近零）。
  - **裁定：并为 2 站。** 机器状态只保留「已登记」「已处置」两个真实节点，中间三次 advance 仪式移除（CLI 相应改造）；intake 文件的五个小节结构（原始问题 / Triage / Evidence / Options / Disposition）**原样保留不动**——被证明有价值的是小节结构，无价值的是分站状态机。
- A3｜交付 7 站中的 `archive`◆：机器侧真有约束（readiness + release guard 递归），但人的一侧已被 AGENTS/skill 定义为「验收之同意即授权的机械确认」。候选：把 ◆ 标记从 archive 摘掉，使 17 站的人工门从 4 个正名为 3 个（与 skill 的三门视图一致），机器门禁不动。
  - **裁定：采纳。** 归档门的单独人工盖章取消——验收「同意」即授权归档（与 `delivery-pilot` skill 既有语义对齐），归档降为机器步骤，`humanJudgment` 标记从 archive 摘掉；机器门禁（readiness + release guard 递归）一字不动。
- A4｜交付 7 站中的 `proposal` 与 `decision`：commit 证据显示两站常被压进同一次提交（① 的 `51829cc` 一次到方案提案门；② 的 `adc9afd` 把方案决策/改造方案/测试方案与实施代码一并落盘）。候选：合并为一站两工件，或维持分站（`validateDecisionArtifacts` 对两份文件的内容校验不同，合并需重写）。
  - **裁定：维持分站，本次不动。** proposal 与 decision 之间隔着维护者的方案门表态，压进同一次 commit 是提交习惯问题而非站位问题；合并需重写内容校验，收益不抵风险。
- A5｜`review` 与 `acceptance` 两站：**证据上最不该动**。review 是三单中唯一真正拦下东西的机器站（② 的 2 条 HIGH finding 若放行会静默销毁消费仓本地改动 / 永久误报漂移）；acceptance 的四 digest 新鲜度校验在 ② 中真实触发过「补定后重批准」。列在此处只为完整，倾向是留。
  - **裁定：保留，且明确保护。** `implementation-review` 的自算 `reviewedPaths` / `result`（不接受手工缩小）与 `acceptance-state` 的四 digest 新鲜度校验列为本次变更的**不得削弱项**，任何裁剪动作不得波及这两处。
- A6｜结构债（不属裁剪但影响裁剪路径）：交付 7 站在仓内有**两份互不引用的定义**——`delivery-change-v1.json`（无 inputContracts，纯键存在性）与 `delivery-control.ts guard` + `delivery-lifecycle.ts`（真门禁）。若裁站位，需先裁决哪一份是权威，否则改一份不生效、改两份会分叉。
  - **裁定：本变更必须裁定权威归属并对齐或修剪另一份，作为落地范围的一部分。** 不允许把这条结构债留到下一轮：A3（archive 摘 ◆）要落到 profile，而真门禁在 `delivery-control.ts` / `delivery-lifecycle.ts`，两份定义不对齐则改动不生效或分叉。

**B 组：资产写盘清单（对应复盘第 ② 块）**

- B1｜代码里根本无 reader 的：`reopen-state.json`、`lifecycle-history/<stamp>/**`。候选：停写，或保留为纯审计留痕并在合同里明说「无机器消费」。
  - **裁定：停写、移除。** `reopen-state.json` 与 `lifecycle-history/<stamp>/**` 快照目录一并移除（代码无 reader，纯留痕）。
- B2｜仅人工命令可读、无 guard 的：`change-sources.json`（与 `01-原始需求索引.md` 的 `- Intake 来源：` 行信息重复，后者由 `intake promote` 自动追加且被 promote 前置校验）。候选：停写，溯源链只留 01 索引。
  - **裁定：移除。** 溯源链只留 `01-原始需求索引.md` 的 `- Intake 来源：` 行。**前置条件（fail-closed 式自检）**：移除前必须逐单确认该索引行覆盖 `change-sources.json` 的同等信息；若发现某类信息只在 `change-sources.json` 里有，则先把它并入 01 索引再移除。
- B3｜三单零写盘的异常路径资产：`change-mode.json`（rehearsal）、`.delivery-update-snapshot.json`（`/opsx-update`）。候选：保留（为异常路径准备、正常路径不写盘是设计预期），或降级为可选并从「强制写盘清单」中移出。
  - **裁定：核实后处置，不是无条件保留。** `change-mode.json`：若确证全历史无写盘，则把默认值（delivery）显式化并**移除该文件概念**；`.delivery-update-snapshot.json`：同样先核实全历史是否有实例，再据实处置。核实结果与处置动作都要写进本变更的工件。
- B4｜`03-业务现状/业务现状.md`：内容零下游消费（无代码读、无工件引），只有 digest 参与批准门禁。候选：杀；或压缩为 `04-技术现状` 内的一小节；或保留（论据：单人仓不需要业务视角，不代表多人仓不需要）。
  - **裁定：取中间路线——03 与 04 合并为一份「现状」文档。** 不是杀掉业务视角，而是取消它独占一个工件位；合并后**门禁摘要语义保持**（原先两份各自参与的 digest / 批准门禁，合并后由一份承接，不得因合并而丢掉任何一道校验）。
- B5｜`09-发布/发布计划.md`：本仓无生产部署，「现场快速资产」「日志、指标与观察窗口」「配置开关」三节两单**均为「无」**。候选：按 change 类型裁掉这三节，只留 Spec Sync 表与门禁勾选。
  - **裁定：从模板中删除这三个恒空小节。** 不做「按 change 类型条件渲染」的复杂化，直接删；保留 Spec Sync 表与门禁勾选。
- B6｜metrics 全族（`metrics-control.ts` 315 行 + schema + 测试 + 4 条 docs 示例）：三单零事件、未接入 `runtime-entry.ts` 路由、不在四条受管投影内（消费仓拿不到）。候选：接入并真跑一轮；或连同 C2 一起裁决去留。
  - **裁定：暂不动，挂到强制版分析线的第一单。** 指标方向将作为强制分析线的首个试验品；metrics 三件套（`metrics-control.ts` / `metrics-event.schema.json` / `test/metrics.test.ts`）的去留随该分析结论一起处置，本变更不预判。
- B7｜workflow 全族（`workflow-core.ts` 376 行 + `workflow-control.ts` + `workflow-entry.ts` + 4 份 schema + 3 份 profile）：与 A1 同一裁决，不宜分开处置。
  - **裁定：升格为活资产，保留。** 因 A1 取「先强制」，workflow request / result / binding 族从「零消费候删」翻转为流水线必经路径上的活资产，本次一律保留，且要在立项门检查中被真正读取。
- B8｜任务证据（`task-state.json` 的 `evidence` 串）：机器只校验非空、**从不打开路径**。候选：升级为可校验（存在性 + digest，比照 `cleanupEvidence` 的做法），或明确降级为「人读注记」并在合同里写清，避免「看起来被验过」的错觉。
  - **裁定：升级为可校验。** `task-state.json` 的 `evidence` 数组加机器校验——路径存在且非空，比照 `cleanupEvidence` 的做法。不取「降级为人读注记」那一支。

**C 组：审阅面（对应复盘第 ③ 块）与三个早期目录**

- C1｜审阅面：三单的三个门（门1「没问题」/ 门2「同意候选A」/ 门3「同意」）零追问；信号3 显示维护者不愿逐项选择、信号5 显示只对台账整洁度主动关注。候选：(a) 维持三门一屏（信号4 显示未触发不耐烦）；(b) 进一步压缩为「非不可逆岔路直接给单一推荐，不摆并列候选」；(c) 保留门数但缩短摆盘。**不宜裁的**：intake 台账的可读性与完成度（信号5 是唯一的主动关注证据）。
  - **裁定：三条候选都不取，改按「深度与决策分量匹配」重写 AGENTS.md 校准条款（依据信号6，见 `INT-20260831-014`）。** 具体：①例行站位产物**只写盘不摆**给维护者；②两道真门（方案门、验收门）一屏摆盘；③方向级/复盘级重裁决**展开说透、允许超一屏**。归档门的单独人工盖章取消（并入 A3）。信号4 推出的「可再压缩」结论作废——维护者在本次复盘摆盘时明确要求展开。
- C2｜`establish-intake-inventory`：**补 spec sync 后正常归档**（把 4 条需求并入 `openspec/specs/intake-workflow/`，本仓已有 delta 目录名≠能力名的先例）——代码/测试/文档/allowlist 100% 到位且今天在跑，唯一实质缺口是规范未落盘；若直接 superseded 归档，会永久留下一段无 spec 支撑的活代码（`intake list`）。备选：单独立一个 spec 补录 Change。
  - **裁定：采纳主选——补 spec（并入 `intake-workflow` capability）后正常归档。** 不单独立补录 Change。
- C3｜`establish-runtime-metrics-baseline`：两条路——(a) 补 spec sync + 验收后归档，并把「metrics 未接入 runtime-entry / C 基线未采集」另行落账；(b) 若并发实验方向已作废则标 superseded 归档，**但必须同时裁决 `metrics-control.ts` 三件套的去留**（见「未知与假设」第 3 条）。无论哪条，`INT-20260830-005` 的悬挂 `promotedTo` 必须同步修正。
  - **裁定：暂不动（既不归档也不裁）。** 指标方向作为强制版分析线的第一单试验品；该目录与 metrics 代码三件套的去留随该分析结论一起处置，`INT-20260830-005` 的悬挂引用届时同步修正。本变更只负责让分析线能跑起来，不预判其结论。
- C4｜`establish-workflow-v01-contract`：**直接标 superseded 归档，不补验收**——其 1.1/2.1/2.2 宣称的两份 schema 从未存在，「独立 core、单 profile」路线已被 `5daf1bd` + 多 profile 合同整体取代，且本 Change 自己的方案决策写着「不得作为实施依据」；4 条需求在现行 `workflow-profiles` spec 中全部有归宿。归档时须在处置记录写明取代关系，并**不得连带移除 `workflow-entry.ts`**（它活在 allowlist、`test/workflow.test.ts` 6 处断言与两份 docs 中）。
  - **裁定：采纳原样——直接标 superseded 归档、不补验收、保留 `workflow-entry.ts`。**
- C5｜校准期条款本身（AGENTS.md 末条）：复盘完成后是终止、续期还是改写，需一并裁决；`openspec/intake/INT-20260831-014-calibration-signals.md` 是否随之关闭亦同。
  - **裁定：改写而非终止。** 校准条款按 C1 的裁定重写为「摆盘深度与决策分量匹配」三档规则（例行只写盘 / 真门一屏 / 重裁决展开）；信号台账 `INT-20260831-014` **保持开放**继续追加——本次复盘正是靠它消费了 7 条信号，机制已被证明有效。
- C6｜顺手可清的旧账（非本次范围，仅登记）：INT-007:28 记录的 DEP0190 警告噪音在本次创建卷宗时**仍复现**；INT-007:29 的两个 run 入口推进语义不一致亦未处理。
  - **裁定：不纳入本变更范围，留在台账。** 但 DEP0190 与 run 入口语义不一致都发生在分析线路径上，A1 强制执行后会被高频触发，届时按痛感优先级另行处置。

## Disposition

决定：promote —— 维护者已于 2026-08-31 对 Options 段全部候选逐条裁决完毕（裁定结果内联在各候选下），本条目由「调查卷宗」转为「已裁决待落地」，promote 至 Change `enforce-analysis-line-and-prune-pipeline`，由该 Change 承载全部落地工作。

理由：三块复盘内容各得其解，且三者的解都指向同一条通则——**要求必须活在门禁里，而非活在文字里**（信号7）。

1. **站位（第 ① 块）**：17 站不做大规模裁撤。分析 5 站零执行经维护者认定为对齐失败而非站位冗余，故改「先强制、后评判」：把立项门 fail-closed 化逼它跑起来，真跑一两单后再用消费数据裁留/修/杀（A1）。登记 5 站并为「已登记 / 已处置」2 站，五个小节结构保留（A2）。归档门的人工 ◆ 摘除，人工门由 4 个正名为 3 个（A3）。proposal / decision 维持分站（A4）。review / acceptance 列为不得削弱项（A5）。交付 7 站的两份互不引用定义（profile JSON 与真门禁代码）须在本变更内裁定权威归属（A6）。
2. **资产（第 ② 块）**：移除三件无 reader 资产（`reopen-state.json`、`lifecycle-history` 快照、`change-sources.json`）；03 与 04 合并为一份现状文档且门禁摘要语义保持；09 发布计划模板删三个恒空小节；`task-state.json` 的 evidence 升级为可校验；`change-mode.json` 与 `.delivery-update-snapshot.json` 核实后处置。workflow 全族因 A1 翻转为活资产予以保留。
3. **审阅面（第 ③ 块）**：信号4 推出的「可再压缩」被信号6 当场证伪，改立「深度与决策分量匹配」三档规则并写入 AGENTS.md 校准条款；校准期条款改写而非终止，信号台账 `INT-20260831-014` 保持开放。
4. **三个早期目录**：`establish-intake-inventory` 补 spec 后正常归档；`establish-workflow-v01-contract` 标 superseded 直接归档；`establish-runtime-metrics-baseline` 暂不动，作为强制版分析线的第一单试验品，与 metrics 三件套、`INT-20260830-005` 悬挂引用一并随该分析结论处置。

裁剪代价不对称的原则在本次得到贯彻：唯一被真正杀掉的是**确证无 reader 的**资产与**确证恒空的**模板小节；一切「看起来没人用」但成因存疑的（分析线、metrics）都改为先强制或先挂起，不在证据不足时下杀手。

下一步：
1. 创建 Change `enforce-analysis-line-and-prune-pipeline`，01-原始需求索引同时引用本条目与 `INT-20260830-002`；
2. 本条目 promote 至该 Change；`INT-20260830-002`（change-profile 路由）解除 hold，其路由裁决与 A1 的分析线豁免规则一并立法，同样由该 Change 承载；
3. 按现行模板起草 02–07 工件（本变更自身不得抢跑用「03/04 合并后」的新模板）；
4. 落地顺序上，A6（裁定 7 站权威归属）必须先于 A3 实施，否则 profile 侧改动不生效或与真门禁分叉。

## History

- 2026-08-31T22:15:37.980Z captured
- 2026-08-31T22:16:03.134Z advanced to triage
- 2026-08-31T22:23:41.935Z advanced to evidence
- 2026-08-31T22:42:43.925Z advanced to options
- 2026-08-31T22:42:47.714Z advanced to disposition
- 2026-08-31T22:45:35.512Z promoted to enforce-analysis-line-and-prune-pipeline
