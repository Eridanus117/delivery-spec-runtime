---
schemaVersion: 1
id: INT-20260901-024-entry-guard-symlink-fragility
state: captured
phase: capture
source: implementation-review-findings
capturedAt: 2026-09-01
promotedTo: null
changeObject: tool-code
---

# Intake

## 原始问题

复审 REV-008 在处置过程中发现：openspec-upgrade.ts、render-commands.ts、delivery-lifecycle.ts 三处于基线即存在同一形态的模块入口守卫（按 process.argv[1] 与 import.meta.filename / import.meta.url 的路径比较决定是否执行 main），该判据在路径含软链或 junction 时必然为假，此时 main 不执行、进程以退出码 0 零输出结束。本批不修，登记备查。

> **裁定已于同日变更，三处拆成两段处置。** 首次登记时的裁定是「三处全部本批不修」；
> 本条目在登记过程中实跑得出的爆炸半径订正（见影响节）被维护者采纳后，裁定变更为：
>
> - **`delivery-lifecycle.ts` 与 `render-commands.ts` 提前到本批修**——消费仓治理链与 CI 检查
>   不容许已知的静默哑炮。两处已在 `fix-thorn-batch` 完成修复，见下方「已处置」节。
> - **`openspec-upgrade.ts` 维持登记不修**——它是三处里唯一确属维护者侧内部工具的，
>   仅由维护者手动发起，留待工作流重设计（`INT-20260901-023`）或后续批次。
>
> 本条目因此从「登记备查」转为「部分已处置、余一处待办」，但仍保持 `captured`：
> 剩余的那一处尚未处置完，不满足任何终态出口的条件。

## Triage

范围：`openspec/tools/` 下三处模块入口守卫——`openspec-upgrade.ts:427`、`render-commands.ts:85`
（判据 `resolve(process.argv[1]) === resolve(import.meta.filename)`）与 `delivery-lifecycle.ts:327`
（判据是「把 argv[1] 拼成 file 协议 URL 后与 import.meta.url 比较」）。不含
`openspec/tools/runtime-entry.ts`——它的同形守卫是 `fix-thorn-batch` 返工时新引入的，
已按复审 REV-008（CRITICAL）当批删除，并由 `VC-042` 与 `REV-008` 两条断言钉死不得回潮。

影响：**比复审最初的评估要大一档。** 复审把这三处归为「维护者侧内部工具，不是消费仓闸门」，
登记时逐条实跑后发现至少两处不止于此（见证据节）：

- `delivery-lifecycle.ts` **在消费仓路径上**：`runtime-entry.ts` 的 `lifecycle` 子命令会把它
  以 `join(runtimeRoot, "openspec/tools/delivery-lifecycle.ts")` 拼出的路径 spawn 出去，而
  `runtimeRoot` 源自 `findConsumerRoot()` 的结果，**未经 realpath**。消费仓路径上只要有一段软链
  或 junction，`lifecycle review/acceptance/readiness` 全族就会以退出码 0、零输出静默跳过。
- `render-commands.ts` 是 CI 的「Check rendered Commands」步骤直接调用的命令。同样条件下该步骤
  会静默通过而实际没有做任何比对。
- `openspec-upgrade.ts` 只由维护者手动发起，是三处里唯一确实属于「内部工具」的。

判断：机理与 REV-008 完全同源，只是爆炸半径不同。**不是本批次的刺，但也不是无害的旧账**。
爆炸半径订正被采纳后裁定变更：前两处按「消费仓治理链与 CI 检查不容许已知静默哑炮」提前到本批修，
第三处（纯内部工具）维持登记，随 `INT-20260901-023` 的重设计或后续批次消费。

## Evidence

### 已知事实

- 三处守卫在基线 `cd6d2f0` 即存在，非本批次引入。
- 失效机理：Node 的 ESM 加载器对主模块会解析软链与 junction，`import.meta.filename` /
  `import.meta.url` 给出的是 realpath，而 `process.argv[1]` 保留调用方写下的路径；
  路径中任意一段是软链或 junction 时两者必然不等，守卫为假，`main()` 不执行。
- 触发条件寻常：macOS 的 `/tmp` → `/private/tmp`、`/var` → `/private/var` 恒定命中；
  Windows 上任何经 junction 访问的工作区同样命中。本仓全部测试夹具都跑在系统临时目录下。
- 失败形状是**静默成功**：进程退出码 0、stdout 与 stderr 全空。调用方无法与「跑完且无事发生」
  区分——这正是它比一般缺陷更危险的地方。

### 未知与假设

- 是否已在真实环境造成过误判：无历史证据，未做回溯排查。本仓 CI 跑在 `ubuntu-latest` 的
  runner 工作目录下，该路径通常不含软链，故 CI 上大概率一直是正常执行的。
- ~~`samePath` 修法是否对所有调用形态都成立~~：**已在本批次的两处上取证**——真实路径与 junction
  路径下 `delivery-lifecycle.ts` 与 `render-commands.ts` 的退出码与输出逐项一致（见「已处置」节）。
  尚未在 `openspec-upgrade.ts` 上验证，但它与 `render-commands.ts` 判据同形，风险很低。
- ~~`delivery-lifecycle.ts` 拼 file 协议 URL 时未做百分号编码的第二层脆弱性~~：**已随本批修复消失**
  （该写法整条被 `samePath(argv[1], import.meta.filename)` 取代）。`openspec-upgrade.ts` 不用这种写法。

### 证据

2026-09-01 登记时逐条实跑，同一个文件分别用真实路径与指向同一目录的 junction 调用：

- `delivery-lifecycle.ts`（不带参数，正常应报缺参）：真实路径 → 退出码 1，输出「缺少 --change-root」；
  经 junction → **退出码 0，零输出**。
- `render-commands.ts check --runtime-root <真实路径>`：真实路径 → 退出码 0，输出
  `{"files":9,"changed":[]}`；经 junction → **退出码 0，零输出**（即该检查根本没有执行）。
- `openspec-upgrade.ts`：同形判据，未单独复跑；机理与上两条一致。
- 对照组：`runtime-entry.ts` 删除守卫后经 junction 调用能正常 fail-closed，见
  `openspec/changes/fix-thorn-batch/07-实施任务/evidence/rework2.log` 的 A/B 记录。

### 开放问题

- 这些守卫当初是为「让测试能 import 模块而不触发 main」而加的。本批次已在两处按候选甲落地
  （判据换成 `samePath`，形态不变）。剩下的取向问题仍开着：是否应当整体换成「把纯判据抽到不执行
  任何副作用的模块里、入口一律无条件执行」（`fix-thorn-batch` 对 `runtime-entry.ts` 走的正是这条，
  因为那个文件没有任何 import 方）。属重设计范围的取舍，本条目不预判。
- 更一般的问题：本仓是否应当立一条「入口模块不得把是否执行 `main()` 系在路径比较上」的硬规则，
  而不是逐个文件打补丁。留给重设计。

## 已处置（2026-09-01，Change fix-thorn-batch）

裁定变更后，三处里的两处已在本批修完，修法为候选甲（`samePath` 比较），理由与被拒方案见
`openspec/changes/fix-thorn-batch/05-改造方案/改造方案.md` 的决策日志 D-09。要点：

- 两处的守卫**不能删**——`render-commands.ts` 的 `renderCommands` 被 `openspec-upgrade.ts` 与
  `test/command-renderer.test.ts` import，`delivery-lifecycle.ts` 的 `requireAcceptance` /
  `requireReadiness` / `requireReview` 被 `delivery-control.ts` import；无条件执行 `main()`
  会在每次 import 时跑一遍命令解析。这与 `runtime-entry.ts` 的情形不同：那个文件没有任何
  import 方，所以那里能够、也必须走「无条件执行」这条更彻底的路。
- 判据统一改为仓内既有的 `samePath()`（resolve → realpath → 小写比较）。该函数的权威定义
  已随本批次落在 `openspec/tools/runtime-lib.ts`，两个文件从那里 import。
- `delivery-lifecycle.ts` 顺带甩掉了「把 argv[1] 直接拼进 file 协议 URL」的旧写法，
  未知节里记的那条百分号编码脆弱性随之消失。
- 回归断言 `T-GUARD-3`（`test/contracts.test.ts`）：经软链路径调用两者，行为必须与真实路径
  逐项一致——lifecycle 缺参数须报错非零、render check 须真执行并输出 `files: 9`，
  且两者都不得以「退出码 0 且零输出」这一守卫失配的特征形状结束。
- A/B 先红后绿：把旧判据临时装回后 `T-GUARD-3` 报
  「经软链调用时 main() 未执行：status=0 stdout="" stderr=""」，恢复后转绿。

相关提交：`3b8b19a`（`runtime-entry.ts` 删守卫、判据权威定义移入 `runtime-lib.ts`）之后的
本批修复提交，见 `fix-thorn-batch` 的 `07-实施任务/evidence/rework3.log`。

## Options

### 候选处置

范围已收窄到**只剩 `openspec-upgrade.ts` 一处**（判据 `resolve(argv[1]) === resolve(import.meta.filename)`）。

> **勘误（2026-09-01，据终审 REV-010 订正）**：本节原写「它 import 别人，没有别人 import 它的导出，
> 故两条路都开着」，该陈述**不成立**。`test/contracts.test.ts` 第 5 行
> `import { validateReport } from "../openspec/tools/openspec-upgrade.ts"`——而这个 import 正是
> `fix-thorn-batch` 自己在 REV-002 返工时加的（用于把真实归档报告喂进唯一的校验实现）。
> 终审按候选乙实测：临时删掉该文件的守卫后，import 即触发 `main()`，`contracts.test.ts` 整个文件
> 转红并打出「用法: openspec-upgrade.ts evaluate --request <request.json>」。
> 详见 `openspec/changes/archive/2026-09-01-fix-thorn-batch/implementation-review.json` 的 REV-010。

因此该文件**确有 import 方**，两条候选并非对等：

- **甲｜最小修**：判据改为 `samePath()`，与本批已修的两处一致。投入最小，形态不变；
  仍把「入口是否执行」系在路径比较上，只是把已知的一类失配堵上。**当前唯一无前置的选项。**
- **乙｜换取向**：删除守卫、`main()` 无条件执行，与 `runtime-entry.ts` 的处置同原则，
  根除这一整类问题。**但有前置**：必须先解决「谁来 import `validateReport`」——
  把该判据移出这个入口模块（例如挪进 `runtime-lib.ts`，与 `samePath` / `checkIgnoreIncomplete`
  同一处置），否则守卫一删测试即转红。

丙（先补断言再修）已随本批次的 `T-GUARD-3` 提前落地，可直接扩一条覆盖 `openspec-upgrade.ts`。
留待重设计或下一批次裁定。

## Disposition

决定：（部分已处置，条目保持 captured）
理由：三处中的两处（`delivery-lifecycle.ts`、`render-commands.ts`）已在 `fix-thorn-batch` 修完并有
回归断言守住——维护者采纳爆炸半径订正后裁定，消费仓治理链与 CI 检查不容许已知的静默哑炮。
第三处 `openspec-upgrade.ts` 是纯内部工具，维持不修。条目不进终态，因为剩余那一处尚未处置完。
下一步：`openspec-upgrade.ts` 一处随 `INT-20260901-023-repo-suited-workflow` 的重设计一并消费，
或在下一批次单独处置；处置时可直接把 `T-GUARD-3` 扩一条覆盖它。
处置时应先读本条目影响节——复审最初「三处都是维护者侧内部工具」的判断经实跑已被推翻其中两处。

## History

- 2026-09-01T08:44:01.238Z captured
- 2026-09-01 裁定变更（维护者采纳本条目的爆炸半径订正）：`delivery-lifecycle.ts` 与 `render-commands.ts` 两处提前到 `fix-thorn-batch` 本批修复，`openspec-upgrade.ts` 维持登记不修。条目保持 captured。
- 2026-09-01 按 `fix-thorn-batch` 终审 REV-010 勘误 Options 节：原称 `openspec-upgrade.ts` 无 import 方，实测有（`test/contracts.test.ts` 的 `validateReport`），候选乙因此带前置条件。
