---
schemaVersion: 1
id: INT-20260831-015-upgrade-agent-system-consumer
state: closed
phase: disposition
source: maintainer-direction
capturedAt: 2026-08-31
promotedTo: null
---

# Intake

## 原始问题

维护者发起：升级真实消费仓 agent-system 到 Runtime 最新 main，第一次真实检验软链→可校验复制迁移路径

## Triage

范围：唯一真实消费仓 agent-system 的一次 Runtime gitlink 升级（旧 gitlink 4896699 → 目标 a49af0f，即含 PR #15 人机交互层与 PR #16 软链改可校验复制的 origin/main）。只动消费仓的 submodule gitlink 与四条受管投影，不改 Runtime 合同，不 push。

影响：这是 PR #16 迁移路径的第一次真实检验。旧接入形态是 Git 符号链接（index mode 120000），消费仓 core.symlinks=false，因此三条旧投影在工作树里被降级成 39/60/61 字节的纯文本占位文件，`.omp/commands` 已不可用——软链方案在 Windows 上的病灶被真实复现。升级同时要求新增第四条投影 `.claude/skills/delivery-pilot`（PR #15 引入，父仓尚未建立），命中消费指南「升级目标 commit 的受管投影清单可能多于当前已建立投影」的 fail-closed 场景。

判断：按消费指南「更新 Runtime gitlink」+「修复受管投影」两节的既有流程执行，不自创步骤；以 runtime-check 退出码 0 作为唯一通过判据；若被 fail-closed 拒绝则如实记录、不绕过、不改合同。终态处置（promote/hold/close）留待维护者门口验收后再定。

## Evidence

### 已知事实

- 升级前：消费仓 gitlink `160000 commit 4896699085a35713b8221a1c878d60c725a47014`，submodule 未初始化；`core.symlinks=false`；`.omp/commands` 是 39 字节纯文本、`openspec/schemas/delivery-change` 61 字节、`openspec/tools/runtime-entry.ts` 60 字节，index 里三条都是 `120000`（软链 blob），工作树是降级后的占位文本。`.claude/skills/delivery-pilot` 尚不存在。
- 升级后：gitlink `160000 commit a49af0f3df0a7806c49486913050559aae0a4aeb`；submodule worktree clean；四条受管投影全部落地为普通文件；`runtime-check` 退出码 0。
- 消费仓本地 commit `1cc3f222bf7f2ca1b1c60317dca3fb411cceafe4`（未 push；`profiles/` 未触碰，仍为 untracked）。
- 环境：Node v25.2.1（合同要求 >= 22.6.0），OpenSpec 1.11.0（合同要求 == 1.11.0），均满足。

### 未知与假设

- 本次只在 Windows + `core.symlinks=false` 这一组合上验证。类 Unix 消费仓（软链可用）的迁移路径未实测，尤其是下面第 3 条发现在那种环境下才构成真正的行为回归。
- 未做「新鲜 clone 复现」实测（需重新 clone submodule）；以 blob 级比对（23/23 一致）+ EOL 归一化推理代替。

### 证据

命令序列（全部在消费仓根执行，除 intake 外）：

1. `git submodule update --init --recursive` → checked out 4896699
2. `git -C .delivery-spec-runtime fetch origin` + `checkout a49af0f...` → HEAD 落到 a49af0f，`git status --porcelain` 空
3. `node --experimental-strip-types .delivery-spec-runtime/openspec/tools/runtime-link.ts apply --asset-root .` → 未加 `--replace-managed` 即成功，返回四条 digest：
   - `.omp/commands` = sha256 fad859c8b285c3ae...
   - `openspec/schemas/delivery-change` = sha256 1762df2a7467d81f...
   - `openspec/tools/runtime-entry.ts` = sha256 25d3f3260d0978ed...
   - `.claude/skills/delivery-pilot` = sha256 9b090e6469230d15...
4. 提交前试跑 `runtime-check` → 按设计 fail-closed：`运行时 gitlink 漂移: expected=4896699... actual=a49af0f...`。与消费指南「不接受只存在于工作树的 gitlink」一致，属预期行为，不是缺陷。
5. 提交后 `runtime-check --change-root .` → `{"allowed": true, "runtime": "delivery-spec-runtime", "schema": "delivery-change"}`，退出码 0。**PASS**
6. Smoke：`.omp/commands/` 9 个 opsx-*.md（91921 字节）、`openspec/schemas/delivery-change/` 12 个文件（19665 字节）、`openspec/tools/runtime-entry.ts` 11627 字节、`.claude/skills/delivery-pilot/SKILL.md` 4104 字节；抽查 opsx-apply.md、SKILL.md、schema.yaml 头部内容正确可读且非空。
7. blob 级比对：消费仓 index 中 23 个受管文件的 blob 哈希与 pinned submodule 的 `git ls-files -s` 输出**逐一相同**（仅排序不同）。

#### 坑 1：消费仓自身的 ignore 规则吞掉受管投影（已处置）

`apply` 成功后 `git status` 只显示 `D .omp/commands`，新文件不见。`git check-ignore -v` 定位到消费仓 `.gitignore:23` 的 `.omp/commands/opsx-*.md`（旧注释：「OpenSpec CLI-generated client projections」）。软链时代该目录是软链、真实字节不在父仓工作树，规则无害；换成复制分发后，这条规则会让四分之一的受管投影提交不进去，他人 clone 出来即投影缺失、`runtime-check` fail-closed。

处置：删除该行并补中文注释说明「该路径现在是 runtime-manifest 声明的受管投影，必须跟踪」。这是消费仓自己的策略修正，未改 Runtime 合同。

另有本机 `.git/info/exclude` 末行 `.claude/skills/`，挡住新增的第四条投影。该文件是机器本地状态、不入版本库，用 `git add -f` 一次性纳入即可，未改动该文件。

启示：受管投影从软链改成真实文件后，会第一次真正暴露在消费仓的 ignore 规则面前。消费指南「更新 Runtime gitlink」一节没有提示这一步，建议补一句「升级后确认四条投影未被父仓 ignore 规则或本地 exclude 吞掉」。

启示补充（评审复核）：`.gitignore:23` 那条已被删除，属一次性修复；但 `.git/info/exclude` 末行的 `.claude/skills/` **规则本身仍在**，本次只是用 `git add -f` 绕过了它这一次，规则没有被移除（该文件是本机状态、不入版本库，也无法通过提交修掉）。这构成复发风险：今后任何一次 `runtime-link apply` 若向 `.claude/skills/` 下复制新增的 skill 文件，这些文件会在本机被 `git status` 静默忽略、不进提交，而 `runtime-check` 只查工作树摘要、本机照样 PASS；坏账要等到他机 clone 后因投影缺文件 fail-closed 才暴露。这不是 `.gitignore` 一次修好就完事的问题，而是「消费仓 ignore 面必须被主动断言」的持续需求，故单列为 INT-20260831-016。

#### 坑 2：git 把复制后的文件仍按 120000 软链模式入库（已处置，Windows 特有）

首次 `git add openspec/tools/runtime-entry.ts` 后，`git ls-files -s` 显示模式仍是 `120000`，而 blob 大小 11445 字节——git 在 `core.symlinks=false` 下把整份脚本源码当成了「软链目标字符串」写进索引。原因：该路径在旧 index 里是软链条目且路径类型仍是「文件」，git 沿用了旧模式；另外两条因为从文件变成了目录，被迫走 delete+add 才侥幸得到正确的 100644。

后果严重性：`runtime-check` 只查文件系统摘要、不查 index 模式，所以这个坏条目**能通过校验**。但任何软链可用的机器 clone 出来会得到一个指向 11 KB 乱码路径的软链，投影直接不可用。

处置：`git rm --cached` + 重新 `git add` 得到 100644 与正确 blob（66ac26de…，与 submodule 内同名 blob 完全一致），再 `git update-index --chmod=+x` 对齐 submodule 侧的 100755。amend 后四条投影共 23 个条目中 22 个 100644、1 个 100755，无 120000 残留。

启示：这是「软链改复制」迁移里 Windows 特有的静默陷阱，而现有 `runtime-check` 检不出来。候选加固：`runtime-check` 在消费仓侧顺带断言受管投影在 index 中的模式不是 120000。

#### 坑 3：受管投影里的 runtime-entry.ts 副本已不能作为入口被调用（未处置，需维护者裁决）

`node --experimental-strip-types openspec/tools/runtime-entry.ts runtime-check --change-root .` → 退出码 1，报 `Runtime 源仓缺少 runtime-manifest.json`。

机理：`sourceRootFromScript()` 用脚本自身位置向上两级找 `runtime-manifest.json`。软链时代 Node 默认解析软链，`import.meta.url` 落在 submodule 内的真实路径，向上两级正好是 submodule 根，能找到 manifest；换成真实副本后，向上两级变成消费仓根，那里没有 manifest，于是 fail。

影响面：消费指南全篇都用 `.delivery-spec-runtime/openspec/tools/runtime-entry.ts` 调用，所以文档路径不受影响；但投影出来的 `.omp/commands/opsx-*.md` 里有 28 处写成 `<planningHome.root>/openspec/tools/runtime-entry.ts`（虽然文件头注明了「消费仓」与「源仓自用」两种形态，正文步骤仍统一用了源仓形态）。在软链可用的类 Unix 消费仓上，这条路径原本是能用的，PR #16 之后不能用了——属行为回归。在本机（软链已降级为文本占位）该路径本来就不可用，所以没有额外损失。

影响面细分（评审复核补充，按 a49af0f 实测计数）：上述 28 处并非等价危害，需拆成两类。

- 9 处是每个 `opsx-*.md` 第 8 行的文件头注释 `# Runtime 源仓自用：<planningHome.root>/openspec/tools/runtime-entry.ts`——它是形态标注，不会被照抄执行，危害为零。
- 剩余 19 处是正文步骤里的真实命令行（`node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" …`），会被 agent 照抄执行，是真正的踩坑面。分布在 7 个文件：`opsx-archive.md` 5 处、`opsx-apply.md` 4 处、`opsx-continue.md` 4 处、`opsx-update.md` 2 处、`opsx-verify.md` 2 处、`opsx-new.md` 1 处、`opsx-sync.md` 1 处；`opsx-explore.md` 与 `opsx-propose.md` 只有文件头注释、无正文命令行。

（计数订正：验收讨论中一度记为「分布在 8 个文件」，实测为 7 个文件；19 处这一数字核对无误。）

未处置。候选方向：要么让 `sourceRootFromScript()` 在向上两级找不到 manifest 时回落到 `findConsumerRoot()`；要么把 `openspec/tools/runtime-entry.ts` 这条投影的定位讲清楚（如果它只是给 IDE 或人看的引用副本、不作为入口，就该在文档里明说，并把 opsx 命令正文统一改成消费仓形态路径）。

#### 坑 4：CRLF 三方不一致，靠 treeDigest 的 EOL 归一化才没炸（无需处置，但值得记账）

- Runtime 仓 a49af0f 中**存在** `.gitattributes`，但内容只有一行 `*.json text eol=lf`，未覆盖 `.md` / `.ts`。因此受管投影里的 Markdown 与 TypeScript 不受 EOL 约束，submodule 在本机 `core.autocrlf=true` 下检出为 CRLF（`opsx-apply.md` 含 186 个 CR 字节）。（修订说明：本条早前记为「Runtime 仓没有 `.gitattributes`」，系事实错误，已按 a49af0f 实际内容更正。）
- `runtime-link.ts` 是字节复制，所以消费仓工作树副本同样 186 个 CR 字节。
- 消费仓 `.gitattributes` 钉 `* text=auto eol=lf`，`git add` 时告警 “CRLF will be replaced by LF”，入库 blob 0 个 CR 字节。

于是三方字节形态各不相同：submodule 工作树 CRLF、消费仓工作树 CRLF、消费仓 index LF。新鲜 clone 后消费仓工作树会变成 LF，而 submodule 源仍是 CRLF，两侧字节直接不等。`runtime-check` 之所以仍能 PASS，完全依赖 `treeDigest()` 里的 `normalizeEol()`（CRLF→LF 后再哈希）。换句话说：PR #16 的 EOL 归一化不是锦上添花，而是这条迁移路径在 Windows 上成立的前提。与 INT-20260831-009 的 CRLF 主题同源，建议在 spec 里把「摘要必须做 EOL 归一化」写成显式要求而非实现细节。

## Options

### 候选处置

本条目自身是一次消费仓侧的升级操作，不产生 Runtime Change，因此本体只有「关闭」一个合理终态。真正需要裁决的是升级过程中挖出的衍生问题，已按「一根刺一个条目」拆出，不在本条目内合并处理：

- INT-20260831-016-consumer-ignore-swallows-projections（坑 1 的持续形态：消费仓 ignore 面吞受管投影）
- INT-20260831-017-runtime-check-misses-symlink-mode-index-entry（坑 2：runtime-check 查不出 index 里的 120000 坏账）
- INT-20260831-018-projected-runtime-entry-not-invocable（坑 3：投影副本 runtime-entry.ts 不可作为入口调用）
- 坑 4（CRLF 三方不一致）不另开条目，作为实测证据并入既有的 INT-20260831-009-windows-crlf-render-drift。

被排除的选项：`promote` 不适用——本单全部动作发生在消费仓 agent-system 侧，Runtime 合同未改、无对应 Change 可关联；`hold` 不适用——升级已完成并通过验收，没有悬而未决的本体工作。

## Disposition

决定：close。
理由：升级已完成并经独立评审与维护者验收——消费仓 gitlink 落到 a49af0f、四条受管投影全部以可校验复制形态落地、`runtime-check` 退出码 0，独立评审七条声明全部核实通过，维护者于 2026-08-31 验收门口表态「同意」。本单是消费仓侧的一次性升级操作，未改 Runtime 合同、无对应 Runtime Change，故走 close 而非 promote。
下一步：升级过程中挖出的四根刺已全部另行落账，不随本条目关闭而丢失——新登记 INT-20260831-016-consumer-ignore-swallows-projections、INT-20260831-017-runtime-check-misses-symlink-mode-index-entry、INT-20260831-018-projected-runtime-entry-not-invocable，三条均停在 capture 等统一 triage；坑 4 的 CRLF 实测证据已增补进 INT-20260831-009-windows-crlf-render-drift。消费仓本地 commit 1cc3f22 保持未 push，是否推送由维护者另行决定。

## History

- 2026-08-31T21:46:27.283Z captured
- 2026-08-31T21:46:44.853Z advanced to triage
- 2026-08-31T21:52:01.432Z advanced to evidence
- 2026-08-31T22:09:54.404Z advanced to options
- 2026-08-31T22:09:55.021Z advanced to disposition
- 2026-08-31T22:10:02.773Z close: 升级已完成并经独立评审与维护者验收（2026-08-31 门口同意）：gitlink 落到 a49af0f、四条受管投影以可校验复制形态落地、runtime-check 退出码 0，评审七条声明全部核实通过。本单为消费仓侧操作、无对应 Runtime Change 故 close 而非 promote。衍生问题已拆分登记为 INT-20260831-016-consumer-ignore-swallows-projections、INT-20260831-017-runtime-check-misses-symlink-mode-index-entry、INT-20260831-018-projected-runtime-entry-not-invocable，CRLF 证据并入 INT-20260831-009-windows-crlf-render-drift。
