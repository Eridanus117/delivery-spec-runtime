---
schemaVersion: 1
id: INT-20260901-022-thorn-batch
state: promoted
phase: capture
source: maintainer-direction
capturedAt: 2026-09-01
promotedTo: fix-thorn-batch
changeObject: governance-contract
---

# Intake

## 原始问题

维护者原话「修」——指示执行修小刺批次：把已登记但一直没动的小缺陷与清扫级死代码集中处置一轮。

## Triage

范围：本条目是**批次容器**，自身不复制被批次覆盖的台账正文，只引用条目 id。批次覆盖九类刺：

- `INT-20260831-009` CRLF 渲染漂移（含 `.gitattributes` 是否从 `*.json` 扩展到 `.md` / `.ts` 的候选）
- `INT-20260831-010` 升级冒烟偶发失败
- `INT-20260831-011` 归档证据路径长度预算
- `INT-20260831-012` Windows 临时目录 EPERM 偶发
- `INT-20260831-016` 消费仓 ignore 规则吞掉受管投影
- `INT-20260831-017` runtime-check 不查 index 软链模式坏账
- `INT-20260831-018` 投影副本 runtime-entry 不可作入口
- `INT-20260831-007` 在案未处置的 DEP0190 警告噪音（该条已 promote 至 establish-human-interaction-layer，但其 Disposition 明写「缺陷级小刺不入本 Change，留待后续顺手处理」，故本批次接手）
- 清扫级死代码：工具目录内的未用导入与零调用导出

不在范围：另有两个议题只作为**开放问题**记录，等维护者门口顺带裁，不进本批次修复面——(1) 消费仓 agent-system 内 `profiles/` 与 `tools/sk/` 两处工作树残留的去留；(2) 本仓与 agent-system 的 main 分支保护规则不一致是否统一。

影响：九类刺全部不影响已交付合同的正确性，但共同压低两件事的可用度——一是 Windows 本地「全量测试绿」这一完成标准已不可稳定达成（`INT-010` 补记实测失败为多数情形），二是受管投影分发在消费仓侧存在三个可静默带病提交的盲区（`016` / `017` / `018`）。放任的代价是完成标准长期形同虚设、坏账在他人 clone 时才暴露。

判断：批量立项。九类刺单独都够不上一个 Change 的仪式成本，但它们共享同一批测试与同一条受管投影分发链，分散处置会重复付出验收与归档开销；且 `010` 与 `011` 已实测为同源，必须同批处置才谈得上「一修两得」。

## Evidence

### 已知事实

- **`010` 的成因已实证，且不是原登记所述的 git racy 竞态，而是 Windows MAX_PATH 溢出**。本轮受控探针（在临时目录构造同名同长的归档证据路径，逐档改变仓根长度后跑 `git status --porcelain`）给出确定阈值：全路径长度 ≤ 259 时报告干净，≥ 260 时同一份未改动的文件被报为 `M`；同一路径加 `-c core.longpaths=true` 后恒为干净。即「误判 dirty」是 git 在 Windows 上未开 longpaths 时的路径越限行为，不是内容漂移，也不是时间戳竞态。
- **溢出点可算**：升级冒烟把整个 Runtime 仓复制进临时根，再以 `consumer-<name>` 为名克隆消费仓夹具。最长的一条归档证据路径为 155 字符（`.../08-验收/runs/20260830T1114Z-runtime-safety/outputs/webcoding-spec-runtime-check.json`），临时根前缀加 `consumer-webcoding-spec` 加 `.delivery-spec-runtime` 后正好把它推到 260。本轮三次连跑复现为 2 过 1 败，失败侧恒为 consumer 序号 1（即 `webcoding-spec`，前缀最长的那个），与算得的溢出点一致。
- **两个 git 调用点的处理不一致**：`openspec/tools/openspec-upgrade.ts` 的 `git()` 在 win32 上已固定加 `-c core.longpaths=true`；`openspec/tools/runtime-entry.ts` 的 `git()` 没有。冒烟里做检出的是前者（写得进去），做 `status --porcelain` 判 dirty 的是后者（读不出来）——一写一读用了两套路径能力，正是误判的直接机制。
- **失败原因当前不可追溯**：`consumerSmoke` 拿到 `runtimeCheck.stderr` 但不写进 upgrade report，报告里只留 `runtimeStatus: 1`。这就是为什么这条刺被当成「偶发噪音」登记了这么久——报告不告诉人为什么失败。
- **`018` 已实证**：把受管投影里的 `openspec/tools/runtime-entry.ts` 单独放进一个没有 `runtime-manifest.json` 的目录树并调用，稳定报 `Runtime 源仓缺少 runtime-manifest.json`。机理见该条目；代码侧确认 `sourceRootFromScript()` 在 `resolveBinding()` 的第一行被无条件调用，消费仓回落分支根本没有机会执行。
- **`018` 的放大面已量得**：九个 `.omp/commands/opsx-*.md` 中，有 17 条真实命令行写死 `<planningHome.root>/openspec/tools/runtime-entry.ts` 形态（分布在 apply 4、archive 5、continue 4、new 1、sync 1、verify 2），在消费仓里逐字照抄即命中上一条的失败；另有每文件一条统一前言注释同时列出消费仓形态与源仓形态，前言本身写法正确。（该条目原记「19 处」，本轮实测为 17 处，差额记在未知节。）
- **`016` / `017` 的盲区在代码侧确认**：`runtime-entry.ts` 的 `verifyLinks()` 只比对工作树 `treeDigest`，既不查 `git check-ignore`，也不查 index 里的文件模式。
- **消费仓侧的 runtime-check 本来就强依赖 git**：同一函数链里已有 `git config -f .gitmodules`、`git ls-tree HEAD`、`git rev-parse HEAD`、`git status --porcelain` 四处硬调用，任一失败即 fail-closed。故 `016` / `017` 两条目里悬着的「无 git 消费场景如何降级」这个前置疑问，事实上不存在——消费仓形态下没有无 git 的合法路径。
- **`009` 的现状**：仓内 `.gitattributes` 仍只有一行 `*.json text eol=lf`，未覆盖 `.md` / `.ts`；本机 `core.autocrlf` 为 `true`。受管投影校验之所以仍成立，全靠 `runtime-entry.ts` 的 `treeDigest()` 里那一次 `normalizeEol()`。
- **死代码实测清单**（逐文件对导入标识符做全文回扫，去掉导入语句本身后计数为零者）：`bootstrap.ts` 的 `statSync`、`basename`、`sha256Buffer`；`intake-control.ts` 的 `requiredOption`；`public-candidate.ts` 的 `readdirSync`。另有三个**全仓零调用的导出函数**：`runtime-lib.ts` 的 `findUp`、`gitCommit`、`ensureInside`（在 `openspec/tools/` 与 `test/` 两处全文检索均无第二处引用）。
- **DEP0190 每次都在**：本条目自己的 `intake init` 调用即在 JSON 输出后打出该警告。来源是 `runtime-entry.ts` 用 `shell: process.platform === "win32"` 调 `openspec --version`。
- **CI 只跑 ubuntu**：`.github/workflows/ci.yml` 的 `runs-on` 是 `ubuntu-latest`，故 `009` / `010` / `011` / `012` 四条 Windows 刺在 CI 上永远不可见，只咬维护者本地。

### 未知与假设

- `010` 为何是 2 过 1 败而不是恒败：算得的溢出点正好落在 260 这个边界值上，本应确定失败。残留猜想是 Windows 上 git 的 fscache 或索引 stat 缓存使某些跑次绕过了越限的 lstat。触发条件与阈值已实证，此项不影响修法选择，故不再深挖。
- `018` 的命令行处数与该条目原记的 19 处对不上（本轮量得 17 处）。差额可能来自计数口径（是否把前言注释、是否把跨行续行计入）。不影响两条路线的取舍。
- `012` 的 EPERM 归因仍是猜测（反病毒或索引器短暂持锁），本轮未复现、未取证。若按「清理加有限退避重试」处置，该假设无须先证实即可缓解症状；若要根因处置则必须先取证。
- `009` 的 `.gitattributes` 扩展是否会惊动存量：把 `.md` / `.ts` 钉成 `eol=lf` 后，`core.autocrlf=true` 的工作树会在下一次 git 触碰时整批重写行尾，可能产生一次大面积的形式化 diff。本轮未做影响面测算。

### 证据

- 受控路径探针：在临时根按 250 / 255 / 258 / 259 / 260 / 261 / 265 / 270 八档构造总长，`git status --porcelain` 在 260 起报 `M`、加 longpaths 后恒净。
- 升级冒烟三次连跑：2 过 1 败，失败侧 `runtimeStatus` 为 `[0, 1, 0]`。
- 投影入口探针：孤立副本调用稳定报「Runtime 源仓缺少 runtime-manifest.json」。
- 全量合同测试一次通过（79/79），说明九类刺都不在现有断言的覆盖面上——这本身是缺口证据。
- 源码：`openspec/tools/runtime-entry.ts`、`openspec/tools/openspec-upgrade.ts`、`openspec/tools/runtime-lib.ts`、`test/openspec-upgrade.test.ts`、`.omp/commands/`、`.gitattributes`、`.github/workflows/ci.yml`。
- 台账：`INT-20260831-009` / `010` / `011` / `012` / `016` / `017` / `018` 与 `INT-20260831-007` 的 Disposition 段。

### 开放问题（不进本批次修复面，等维护者门口顺带裁）

1. **消费仓 agent-system 的两处工作树残留**。实测：`profiles/` 并非未跟踪目录，它已在版本控制内（五个文件在册），只是 `profiles/general/manifest.json` 有一处未提交修改（18 行新增）；真正未跟踪的是 `tools/sk/`，内含一个 README 与一个约 94 MiB 的 `sk.exe`。去留取舍与本 Runtime 的合同无关，属消费仓自身治理，故只登记不处置。附一句判断供参考：近 100 MiB 的二进制入库会逼近平台单文件上限并永久留在历史里，若要保留宜走 ignore 加外部分发而非直接提交。
2. **两仓 main 分支保护规则不一致**。实测差异比原以为的一条更大：本仓 `enforce_admins` 为 false、**没有任何 required status check**、要求 1 个审阅批准；agent-system `enforce_admins` 为 true、有五个必过 check（strict）、要求 0 个审阅批准。即：立法者本仓对自己的 CI 不设硬门，被治理的消费仓反而设了。是否统一、往哪边统一，属仓库治理裁决，本批次不动。

## Options

### 候选处置

批次层面（是否成批）：

- **A｜整批立项为一个 Change**（推荐）：九类刺共享同一套测试与同一条投影分发链，合并处置只付一次验收与归档开销；`010` 与 `011` 同源，本就必须同批。代价是单个 Change 的改动面偏宽，Review 需按刺分组。
- **B｜拆成三个 Change**（Windows 环境族 / 投影分发族 / 清扫族）：每个 Change 更聚焦，但要付三次完整交付仪式，且 `010`+`011` 与 `009` 的行尾话题会被切开。
- **C｜按 light-change 快车道逐条修**：最省仪式，但路由表已判定 `tool-code` 必走完整档，此路不通——不是取舍问题，是门禁问题。

刺层面的修法候选（详细比较留给 Change 的方案提案，此处只记方向）：

- `010`+`011`：给 `runtime-entry.ts` 的 git 调用补 longpaths（治读侧误判）／给归档证据定路径长度预算并缩名（治长度本身）／两者都做。另可把 `runtimeCheck.stderr` 写进 upgrade report（治不可追溯）。
- `009`：`.gitattributes` 扩展到 `.md` / `.ts`（缩小 CRLF 产生面）／把「摘要必须做行尾归一化」从实现细节升格为 spec 显式要求（保护既有成立路径）／两者都做。
- `016`：消费指南加检查项（靠人）／`runtime-check` 跑 `git check-ignore` 断言（靠机器）。
- `017`：`runtime-check` 增加「受管投影在 index 中的模式不得为 120000」断言。
- `018`：回落 `findConsumerRoot()` 让投影副本可作入口（恢复软链时代行为）／声明投影副本非入口并把 17 处命令行统一改成消费仓形态路径（收缩合同）。两条方向相反，须先裁定位。
- `012`：临时目录清理加有限退避重试。
- DEP0190：去掉 `shell: true`，改用平台相应的可执行名直调。
- 死代码：删除上列未用导入与三个零调用导出。

## Disposition

决定：promote
理由：分析线五阶段已跑完，decision 站处置为 build。批次内九类刺的证据、修法候选与优先级已成形，其中 `010` 的成因由本轮受控探针实证推翻了原登记的竞态归因，修法因此从「加重试」改为「治路径能力与路径长度」，这一改判本身就说明该批次值得正式立项而不是继续按噪音挂着。
下一步：立项为 Change `fix-thorn-batch`，交付档位 delivery-change（路由表按 `tool-code` 判定）。本轮止于方案提案起草，不实施修复；`018` 的两条路线、`.gitattributes` 是否扩展、`010`/`011` 的修法组合三项作为方案门的可裁项摆给维护者。上列两个开放问题随方案门顺带请裁。

## History

- 2026-09-01T05:06:44.829Z captured
- 2026-09-01T05:14:58.140Z promoted to fix-thorn-batch（交付档位 delivery-change，改动对象 tool-code）
- 2026-09-01 changeObject 由 tool-code 更正为 governance-contract（Claude 代笔记录）。实施期发现：裁定 #3 要求把冒烟失败原因写进升级报告，报告新增字段必须同步 `openspec/contracts/openspec-upgrade-report.schema.json`，该路径按路由表属治理合同档（序 30），高于原声明 tool-code（序 20）。路由表规定的处置就是「修正条目的 changeObject 声明」，并明文禁止「缩小改动面以迁就声明」。两档要求的分析 profile 同为 requirement-analysis，已完成的分析线对新档位同样满足，交付档位仍为 delivery-change，立项门结论不变。详见 fix-thorn-batch 的 `05-改造方案/改造方案.md` 决策日志 D-05。
