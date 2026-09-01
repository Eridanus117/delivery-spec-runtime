# 独立评审 13 条 finding 的处置记录

评审结论 FAIL（1 CRITICAL / 4 MAJOR / 8 MINOR），evidence 见同目录 `implementation-review.json`。本文件逐条记录处置方式与验证证据。

## CRITICAL

### REV-001 立项门与分析线真实产物形状不匹配，端到端永不可通过

**事实复现**：以 `workflow-control bind/run` 真实跑完 requirement-analysis 五阶段后，产物为
`outputs = { completedStages, publishedInputs, completedStage }`，`outputs.disposition` 为 `undefined`，
`outputs.publishedInputs.disposition` 才是 `"build"`。原立项门读前者，故所有 `requiresAnalysis=true`
的改动对象都无法经合法途径立项。

**选择与理由**：采用「门去适配引擎的通用机制」而非「引擎把 disposition 提升到 outputs 顶层」。
`disposition` 是 requirement-analysis profile 在 decision 站用 `outputInputs` 声明发布的输入，
`publishedInputs` 是引擎服务所有 profile 的通用透出机制；把某个 profile 专有的输入名硬编码进通用引擎，
会让引擎替 profile 记住业务语义。**该知道 profile 细节的是门，不是引擎。**

**附带修复**：`executeWorkflow` 的幂等重跑分支（全部阶段已在 `completedStages` 中）原先只返回
`{ completedStages }`，不含 `publishedInputs`。这意味着同一份分析重跑一次就会丢掉 disposition，
下游按产物取值的门会把一份合法完成的分析判成缺字段。已改为与「本轮刚推完最后一站」产出同一形状——
这是通用修复，不涉及任何 profile 专有键。

**测试改造（评审要求的第二半）**：`test/intake.test.ts` 的 `writeAnalysis` 手写产物已删除，
改为 `runAnalysis` / `plantForeignAnalysis` / `corruptAnalysis` 三个基于真实命令链的构造器：

| 场景 | 构造方式 |
|---|---|
| VC-007 正向 | 真实 bind + run 跑完五阶段，另断言 `outputs.publishedInputs.disposition === "build"`，产物落点一旦变动立即失败 |
| VC-009 归属不符 | 用另一条目 id 真实跑一遍，再把产物搬到本条目目录 |
| VC-010 未完成 | 真实跑到 evaluate 站为止，报出的是实际状态而非占位串 |
| VC-010 非 build | 真实跑完但 `disposition=defer` |
| 不可解析 | 在真实产物之上写坏 JSON |

**验证**：`node --test test/intake.test.ts test/workflow.test.ts` → 26 passed / 0 failed。

## MAJOR

### REV-002 豁免仍可由调用方改一行 frontmatter 自选

**a) ledger-only 直接拒绝立项**：该行的定义原文即「不产生任何 Change 目录与代码改动」，
与 promote（恰恰产生 Change）自相矛盾；而它是表内最轻且豁免分析线的一档，不拦就是绕开分析线的最短路径。
路由表增 `promotable: false`，`promote` 在写盘前直接拒绝并提示只能 hold 或 close。

**b) 声明与事实的交叉校验**：路径前缀表进路由表 JSON（`pathPrefixes` + `rank`），成为可复审资产。
`guard verify` 用 `git diff`（从首次触碰该 Change 目录的提交的父提交到 HEAD，加工作树与未跟踪文件）
取实际触碰路径，按最长前缀归类取最重档，与登记时声明的改动对象的 `rank` 对照；
声明低档而实际触碰高档路径即 fail-closed，错误信息指向「修正声明并补走该档位分析线」，
并显式否定「缩小改动面以迁就声明」这条出路。

声明来源不新增状态：从 Change 的 `01-原始需求索引.md` 的 `- Intake 来源：` 行回溯条目 frontmatter。
未声明、声明表外类别、或已是最重档时跳过核对——这三种情形本就按最重档处理，不可能构成降档。

**验证**：`test/control.test.ts` 的 REV-002 用例在真实 git 仓中构造「自称 doc-expression 的条目」：
只碰 `docs/` 时 verify 放行；顺手加一个 `openspec/tools/sneaky.ts` 即非零并报出该路径与 `tool-code` 归类；
换成 `openspec/contracts/` 则报 `governance-contract`。`test/intake.test.ts` 断言 ledger-only 立项被拒且两侧文件逐字节不变。

### REV-003 artifact-approvals 合同未随 v6 更新

`openspec/contracts/artifact-approvals.schema.json` 的 `artifacts.properties` 补入 `current-state`，
同时保留 `business-current` / `technical-current`——与 v5/v6 双表同思路：两种形态都合法，因为存量归档
按 v5 解析且不迁移。另加 `not.required: ["current-state","business-current"]`，禁止两种形态混写进同一文件。

补 `test/contracts.test.ts` 的 REV-003 用例：用该合同的形状定向校验仓内**全部** 12+ 份真实
`artifact-approvals.json`（active 与归档），逐项检查顶层键集、工件名在合同内、未混写两种形态、
每条批准的字段集与 `digest` / `decision` / `approvedBy` 取值。仓内没有 JSON Schema 引擎，
也不为一条断言引入依赖，故做定向校验而非通用求值。

### REV-004 rehearsal 移除不彻底且证据陈述与事实不符

`.omp/command-sources/bodies/` 的五处中文「演练」肯定式指令（`opsx-verify` 两处、`opsx-sync` 一处、
`opsx-continue` 两处）已全部改写为当前真实存在的停止条件，重渲染九个命令。
VC-036 的禁词表补入中文「演练」与「NO-GO」——原表只列拉丁文 `rehearsal`，等于只锁半扇门。
`证据/6.2.md` 中与事实不符的那句已加「订正」段更正，并记录教训。

### REV-005 批准记录出现 agent 代签

**治理侧立法**：`AGENTS.md` 新增两条硬规则（各附大白话理由）：
1. `approvedBy` 必须在字段本身写明表态形态（亲签／门口表态转录／证据回填后重批准），标注代笔，
   不得只把代笔信息藏进 `migrationSource`——批准链是给人复核的，人读第一眼就该分得出是谁按下的。
2. **重批准只在「机械回填、不改变工件任何语义」时合法**，且必须标注代笔；任何改变语义的改动
   都必须重新取得维护者表态，不得由 agent 重签。理由写明：digest 新鲜度机制的全部意义就是
   「内容变了就要重新过人」，若 agent 可自行判定「语义没变」再重签，该机制即退化为一句自述。

**记录侧修复**：本 Change 全部 9 项批准的 `approvedBy` 由裸「维护者」改为如实披露形态的字符串
（转录项标「门口表态，Claude 代笔转录」，`tasks` 标「证据回填后重批准，Claude 代笔」），
恢复仓内最近两个归档 Change 的既有惯例。

**验证**：`test/interaction.test.ts` 新增两条用例——一条断言治理条款存在且各带理由，
一条断言本 Change 的每项 `approvedBy` 都不是裸「维护者」且含「代笔」。

## MINOR

### REV-006 路由表 profileId 只回显不生效

路由表每行增 `analysisProfileId`（必走分析线时必填），立项门要求分析产物的
`workflow-binding.profileId` 等于该值——否则随便绑一个 profile 跑出来的 result 也算数。
交付档位 `profileId` 由 promote 写入条目 History 留痕（`promoted to <change>（交付档位 …，改动对象 …）`），
不再只出现在 stdout。合同 description 同步收窄为「逐项列出被机器强制的部分」，不再笼统自称
「立项门与档位选择的唯一真源」而其中一半没有执行力。

**验证**：`test/intake.test.ts` 的 REV-006 用例——用 light-change profile 跑出的产物被拒并报出要求的
profile 名；换回 requirement-analysis 后放行，且 History 行含交付档位与改动对象。

### REV-007 长期 spec 在实施提交中被直接改写

已撤销 S7 对 `openspec/specs/intake-workflow/spec.md` 的 46 行直接写入（该文件回到 S7 之前的 7 条需求），
4 条 Inventory 需求改挂进本 Change 的 `specs/intake-workflow/` delta，随 sync 站正常合入。
被归档 Change `establish-intake-inventory` 的处置记录同步更正，并写明这一改动的理由：
该目录从未通过验收（批准为空、无 review/acceptance/readiness），直接写入等于让未经任何门的需求
进入权威长期 spec；而 `isLifecyclePath` 把 `openspec/specs/**` 排除在 review 自算之外，
审查面对这类写入恰好是盲的。该盲区本身已随 REV-012 登记台账。

### REV-008 规范重叠不应留给 sync 站

在本 Change 内完成去重，不把裁决推给没有改写 delta 权限的下一站：

- 原 delta 的 `Runtime SHALL report a deterministic intake inventory` 与并入的第 1、2、4 条
  （扫描范围／重复身份／fail-closed 边界）合并为**该条的语义并集**：扫描范围限定、确定性排序、
  重复 id 分组、不落盘、解析失败的非当前分类，五项语义全部落在同一条内，删去孪生条款。
- 第 3 条 `Legacy Intake SHALL be visible and non-authoritative` 与长期 spec 原有的
  `Legacy Intake records SHALL have a controlled migration path` 是孪生，改以 **MODIFIED** 合并进后者。
- 被并入 delta 的 `## Purpose` 段随之并入合并稿，使长期能力的 Purpose 覆盖 inventory 只读侧面。

**验证**：`test/contracts.test.ts` 的 VC-039 用例断言长期 spec 不含被并入的需求名、delta 内无重名、
Inventory 类需求恰为 1 条、五项语义片段齐在、Legacy 条款位于 MODIFIED 段、Purpose 覆盖只读侧面。

### REV-009 测试源码含裸 NUL 字节

`test/intake.test.ts` 中作分隔符的裸 U+0000 改为 `\0` 转义。git 不再把该文件判为 binary，
唯一证明立项门行为的测试恢复逐行可 diff 审阅，并重新参与行尾归一化。

### REV-010 v5/v6 判别与文本残留

- **判别**：`change-info.json` 增可选 `deliverySchemaVersion`（`init` 对新建 Change 显式写 6，缺省视为 v5），
  `artifactPathsFor` 优先读该标记，仅在无标记时回落目录形状推断。这样新建 v6 Change 在写出
  `03-现状/现状.md` 之前不会被误判成 v5，也不会再报出已不存在的模板名。合同同步。
- **config.yaml**：`rules` 的 `business-current` / `technical-current` 两节合并为 `current-state` 一节。
- **九层→八层**：`README.md`、`schema.yaml` description、`bootstrap.ts` 迁移提示、
  `contracts.test.ts` 用例名四处更正。

### REV-011 validateEvidence 缺 realpath 校验

补 `realpathSync` 逃逸校验，与 `delivery-lifecycle.ts` 的 `safeRepoFile` 同标准：
Change 目录内一条指向仓外的软链，路径串本身完全合法，词法校验挡不住。
`test/control.test.ts` 补一条软链证据用例（在不支持 symlink 的环境自动跳过），
断言拒绝且 `task-state.json` 逐字节不变。

### REV-012 一致性测试判别力不足 + review 对长期 spec 的盲区（登记不修）

两项合并登记为 `openspec/intake/INT-20260901-021-review-blindspots-and-probe-strength.md`
（capture 即止，`source: implementation-review-findings`，`changeObject: governance-contract`），
记录：七个探针中只有三站真的抹字段、四站跑 happy path；「抹哪个字段」的手工选择本身编码了与
`humanJudgment` 等价的信息，VC-003 抓不到这种形态；以及 `isLifecyclePath` 对 `openspec/specs/**`
的审查盲区。两项均写明可能的加强方向但不在本单裁决，按 `AGENTS.md` 预置的触发点，
留待强制版分析线跑满 2 单后的复盘一并裁。

### REV-013 全量回归陈述强于可复现事实

`证据/8.2.md` 与 `verify-自查.md` 的结论表由「74 passed / 0 failed」改为
「稳定通过 73/74，余 1 项为已知环境 flake `INT-20260831-010`，按复跑判定」，
并把噪音标注直接放进结论表而非只写在文末。两处均加订正说明，写明原则：**结论表不得强于可复现事实**。
