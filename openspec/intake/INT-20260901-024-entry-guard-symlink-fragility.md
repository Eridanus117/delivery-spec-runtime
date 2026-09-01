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

> **登记备查（capture 即止）。** 维护者 2026-09-01 裁定：本批不修——这三处于基线即存在
> （`cd6d2f0` 已有），不是 `fix-thorn-batch` 引入的，且与本批次的九类刺不同源。
> 留待工作流重设计（`INT-20260901-023`）或下一批次处置。下面各节按登记时已核实的事实写全，
> 不作处置结论。

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

判断：机理与 REV-008 完全同源，只是爆炸半径不同。**不是本批次的刺，但也不是无害的旧账**；
按登记备查处理，并在重设计时与 `INT-20260901-023` 的输入材料一并消费。

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
- `samePath` 修法（先 realpath 再比较）是否对所有调用形态都成立：登记时未逐一验证；
  尤其 `delivery-lifecycle.ts` 用的是 「把 argv[1] 直接拼进 file 协议 URL」的写法，在含空格或非 ASCII
  的路径上本身还有第二层脆弱性（未编码），需要一并核。

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

- 这三处守卫当初是为「让测试能 import 模块而不触发 main」而加的。修法若只是把判据改成先
  realpath 再比较，脆弱性降低但形态不变；是否应当换成「把纯判据抽到不执行任何副作用的模块里、
  入口一律无条件执行」这一更彻底的取向（`fix-thorn-batch` 对 `runtime-entry.ts` 走的正是这条），
  属重设计范围的取舍，本条目不预判。

## Options

### 候选处置

- **甲｜最小修**：三处判据统一改为先对两侧做 realpath 再比较（复审建议的 `samePath` 修法）。
  投入最小，形态不变；仍依赖路径比较，只是把已知的一类失配堵上。
- **乙｜换取向**：把需要被测试引用的纯判据移出入口模块（放进不执行任何副作用的库文件），
  入口一律无条件执行 `main()`。与 `fix-thorn-batch` 对 `runtime-entry.ts` 的处置一致，
  根除「入口是否执行取决于路径写法」这一整类问题，但要动三个文件的模块结构与对应测试。
- **丙｜先补断言再修**：先加一条覆盖三处的断言（经 junction 调用必须与真实路径同结果），
  让问题可复现、可回归，再择期按甲或乙落地。

三条不互斥；丙可作为甲或乙的前置。留待重设计或下一批次统一裁定。

## Disposition

决定：（未处置，登记备查）
理由：维护者 2026-09-01 裁定本批不修——基线即存在、与本批次九类刺不同源，
且 `fix-thorn-batch` 已进入收口复审阶段，此时扩范围会让本单再多一轮评审。
下一步：随 `INT-20260901-023-repo-suited-workflow` 的重设计一并消费，或在下一批次单独处置。
处置时应先读本条目影响节——复审最初「三处都是维护者侧内部工具」的判断经实跑已被推翻其中两处。

## History

- 2026-09-01T08:44:01.238Z captured
