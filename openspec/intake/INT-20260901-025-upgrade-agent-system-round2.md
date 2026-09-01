---
schemaVersion: 1
id: INT-20260901-025-upgrade-agent-system-round2
state: closed
phase: capture
source: maintainer-direction
capturedAt: 2026-09-01
promotedTo: null
changeObject: ledger-only
---

# Intake

## 原始问题

维护者发起（2026-09-01「开工」）：把消费仓 agent-system 升级到 Runtime 最新 main（e6d3637，含 PR #20 修复的十项环境问题），并顺带清掉消费仓侧两笔积压的收尾工作。本条目记录的全部动作都发生在消费仓 agent-system 那一侧，Runtime 自身的合同、工具和文档一行不改。

## Triage

范围：消费仓 agent-system 的一次 Runtime 版本升级（子模块钉住的版本从 a49af0f 前推到 e6d3637），外加两笔一直没做完的收尾：给 `.gitignore` 补一条不提交 `tools/sk/` 的规则；删掉那台机器 `.git/info/exclude` 里一行会吞掉分发文件的 `.claude/skills/`。全部动作在消费仓一侧，Runtime 的合同、工具、文档一行不改。

影响：这是本轮修复批次（Runtime 的 PR #20）在真实消费仓上的第一次落地检验，重点看两件事。其一，`openspec/tools/runtime-entry.ts` 这份分发副本本次内容真的变了——上游让这份副本自己也能被直接调用，不再只能用子模块里的原件，所以升级不是换个版本号那么简单。其二，上游新增的三道检查里，第一道就是「分发过来的文件被消费仓或本机的忽略规则吃掉」，而这台机器上恰好有一条这样的规则（即上面第二笔收尾），这次升级正是它第一次面对新检查。

判断：按消费指南「更新 Runtime gitlink」与「修复受管投影」两节的既有步骤执行，不自创流程；以 `runtime-check` 退出码 0 作为唯一通过判据。两笔收尾与升级放在同一个分支、拆成两个提交，走 PR 合入，等分支保护要求的五项检查全绿再合并。维护者已授权本单完整执行到合并。

## Evidence

### 已知事实

- 升级前：消费仓 main 在 ecba7a7，子模块钉住 a49af0f；四份分发内容共 23 个文件。
- 升级后：子模块钉住 e6d3637，四份分发内容共 22 个文件（交付文档模板里 `business-current.md` 与 `technical-current.md` 合并成一份 `current-state.md`，因此少一个）。
- 四份分发内容及其文件数：`.omp/commands/` 9 个、`openspec/schemas/delivery-change/` 11 个、`openspec/tools/runtime-entry.ts` 1 个、`.claude/skills/delivery-pilot/` 1 个。
- 环境：Node v25.2.1（合同要求不低于 22.6.0），OpenSpec 1.11.0（合同要求正好 1.11.0），均满足。消费仓仍是 Windows、`core.symlinks=false`、`core.autocrlf=true`。
- 消费仓 PR #23 合并后 main 落在 c58766b，远端分支已删除，本地 main 已同步。
- 挂了很久的本地分支 `Eridanus117/ignore-tools-sk`（提交 20d9b94）已删除。核对过它只改 `.gitignore` 一个文件，同一条规则已并入本次 PR；`git diff` 拿它跟新 main 比时出现的 marketplace.json 版本号差异，是这个分支基于旧 main 造成的假象，不是它自己的改动。

### 未知与假设

- 只在这一台 Windows 机器上验证过。类 Unix 环境（符号链接可用）下的同一路径未实测。
- 没有做「新克隆一份重跑」的实测，用的是逐文件哈希比对加换行归一化推理代替。
- 上游 PR #20 新增的另外两道检查（Windows 上文件被错记成符号链接、归档路径超长）本次没有被触发，因此只验证了它们不误报，没验证它们真能拦住问题。

### 证据

命令都在消费仓根目录执行：

1. 先删本机 `.git/info/exclude` 末行的 `.claude/skills/`，再用 `git check-ignore` 确认这条规则确实没了（退出码 1，即没有任何路径被忽略）。这一步必须在生成分发副本之前做，否则新文件会在本机被静默忽略。
2. `git submodule update --init --recursive` 后，在子模块里 `fetch` 并 `checkout e6d3637`；`git status --porcelain` 为空，子模块干净。
3. 跑 `runtime-link.ts apply --asset-root .`，退出码 0，返回四条摘要：
   - `.omp/commands` = sha256 86ac3302a6377161…
   - `openspec/schemas/delivery-change` = sha256 39368133911ed8ef…
   - `openspec/tools/runtime-entry.ts` = sha256 b1e1e52a2f51cd5d…
   - `.claude/skills/delivery-pilot` = sha256 0487c4ed458cffb8…
4. 逐文件哈希比对：消费仓索引里这 22 个文件的 blob 哈希，与子模块内同名文件的 blob 哈希逐一相同，22 对 22 全等。
5. 文件模式检查：22 个条目里 21 个普通文件、1 个可执行文件，没有一个被错记成符号链接（上一次升级踩过这个坑）。
6. `runtime-check --change-root .` 退出码 0。用子模块里的原件跑一次、用消费仓里的分发副本跑一次，结果一致——**后者以前会报「找不到清单文件」，这是上游本次修复在真实消费仓上的直接验证**。
7. 合并后在 main 上复跑 `runtime-check`，退出码 0。

关于两笔收尾：

- `tools/sk/` 从来没有被提交过（它的旧内容早在提交 29894b9 里迁到了 `packages/sk/`），所以加忽略规则不影响任何已跟踪文件，也不影响 CI。规则命中的是本机编译出来的约 94 MiB 的 `sk.exe`。
- `.git/info/exclude` 是本机文件、不进版本库，所以这笔改动既不在 PR 的文件列表里，也无法由 CI 验证，已在 PR 正文里写明留痕。上一次升级（INT-20260831-015 的坑 1）是用 `git add -f` 一次性绕过这条规则、规则本身没动，本次是真删掉了。

关于 PR 文字的一次预检（照信号12 的做法做的第一次实践）：PR 正文写完后先交给一个完全没有上下文的空白会话当陌生读者读，它挑出了十几处看不懂的地方，主要是三类——没解释的专有名词（`.delivery-spec-runtime`、`openspec`、`sk`、`runtime-check`）、只给数字不给内容（「十个问题」「三道检查」「四份副本」与验证段的「22 个条目」对不上）、以及代词指代不清和「符号链接」话题凭空出现。按这些意见整段重写后才发布：补了一段背景交代四份分发内容分别是什么、共 22 个文件，把「三道检查」逐条写出来，说明了 `sk.exe` 是什么、从哪里获取，并交代了为什么要专门查符号链接。**这次预检确实抓到了自我审查抓不到的问题，值得作为该做法可行性的第一份证据。**

## Options

### 候选处置

本条目记录的是一次消费仓侧的升级操作，不产生 Runtime Change，因此终态只有「关闭」一个合理选项。

- `promote` 不适用：全部动作在消费仓，Runtime 合同未改，没有可关联的 Change；而且本条目声明的改动对象是 `ledger-only`，按路由表它本来就不可立项。
- `hold` 不适用：升级已完成、PR 已合并、检查已通过，没有悬而未决的本体工作。

本次升级没有挖出新的待办。上一次升级留下的两个坑，本次的表现是：坑 1（消费仓忽略规则吞掉分发文件，已单列为 INT-20260831-016）的本机部分这次真删掉了，但那条条目要解决的是「忽略规则这一面必须被主动断言」的持续问题，不因本次删除而关闭；坑 3（分发副本不能直接调用，INT-20260831-018）已由上游 PR #20 修复并在本次实测确认。

## Disposition

决定：close。
理由：升级已完成并通过验证——子模块钉到 e6d3637，22 个分发文件逐一哈希对上，`runtime-check` 在分支上和合并后的 main 上都是退出码 0，消费仓 PR #23 的五项必需检查全绿后以 rebase 方式合并。两笔收尾同批完成：`tools/sk/` 的忽略规则已进版本库，本机 `.git/info/exclude` 里那行 `.claude/skills/` 已删除并在 PR 正文留痕，旧的本地分支已删。本单是消费仓侧的一次性操作、无对应 Runtime Change，故 close 而非 promote。
下一步：无遗留待办。INT-20260831-016（消费仓忽略规则这一面需要被持续断言）不随本条目关闭，仍在排队；本次按信号12 做的「陌生读者预检」有效性证据已记入本条目证据段，供 INT-20260901-023 重设计时取用。

## History

- 2026-09-01T14:11:41.866Z captured
- 2026-09-01T14:21:33.726Z close: 升级已完成并验证通过：消费仓 agent-system 的子模块钉到 e6d3637，22 个分发文件逐一哈希对上，runtime-check 在分支和合并后的 main 上都是退出码 0；PR #23 五项必需检查全绿后以 rebase 合并。两笔收尾同批做完——tools/sk 的忽略规则已入库，本机 .git/info/exclude 里那行 .claude/skills/ 已删除并在 PR 正文留痕，旧本地分支已删。本单全部动作在消费仓侧、无对应 Runtime Change，故 close。
