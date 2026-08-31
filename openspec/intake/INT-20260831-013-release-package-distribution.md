---
schemaVersion: 1
id: INT-20260831-013-release-package-distribution
state: promoted
phase: disposition
source: maintainer-direction
capturedAt: 2026-08-31
promotedTo: replace-symlinks-with-verified-copies
---

# Intake

## 原始问题

维护者提出：Runtime 向消费仓的分发不应继续使用 submodule + 受管软链，应改为 Release 包方式（版本化制品 + 完整性锁，消费仓获得普通文件）。动因证据：2026-08-31 会话实测的 Windows 软链痛点（core.symlinks 依赖、CRLF 检出纠缠、深路径克隆超限 INT-011、升级需重跑 apply）。注意：此方向推翻既有『禁止复制投影与第二套 lock』裁决（AGENTS.md），等于以包版本+哈希锁替换 gitlink 锁，防漂移需新的完整性合同承接；与『PR 合入 → Release → 消费仓升级』流水线衔接。待维护者发起后走完整分析与方案比较。

## Triage

范围：Runtime → 消费仓的分发与版本锁定机制（submodule + 四条受管软链的整套或部分替换）；不含 opsx 命令内容、workflow/intake 合同本身。
影响：全部消费仓的接入与升级路径；runtime-link/runtime-check 合同；AGENTS.md 既有「禁止复制投影与第二套 lock」裁决；CI 与升级评估工具中依赖 submodule/软链的环节。
判断：continue（维护者已发起，2026-08-31）

## Evidence

### 已知事实

- Windows 软链痛点当日实测四项：`core.symlinks` 依赖；CRLF 检出与字节级校验纠缠（INT-009）；归档证据深路径克隆超限（INT-011）；消费仓升级 gitlink 后须重跑 `runtime-link.ts apply` 否则 fail-closed。
- 软链/submodule 耦合面（grep 实测）：5 个工具（runtime-link、runtime-entry、bootstrap、delivery-lifecycle、openspec-upgrade）、6 个测试文件、5 篇 docs + README + AGENTS.md、2 个命令源文件。替换是宽改动，不是局部换轮子。
- CI 在 ubuntu 运行，软链无痛；痛点集中在维护者的 Windows 本地环境与 Windows 消费仓。
- 分发物本体全为普通文本文件（命令 md、schema、TS 工具、JSON 合同、skill md），无编译步骤，天然可打包可复制。
- 仓库已有 `public-candidate.ts`（允许清单复制 + 秘密扫描），是「从仓库产出干净制品」的现成雏形。
- 既有裁决冲突：AGENTS.md 第 5 条禁止复制投影与第二套 commit/hash lock，立论基础是「gitlink 是唯一锁、复制必漂移」；本方向若成立需在同一 Change 中正式修订该条，并以新的完整性校验承接防漂移。
- 上一 Change（human-interaction）刚新增第四条软链；若本方向落地，该链与其余三条同批被替换，无沉没成本问题（skill 资产本身不变，只换送达方式）。

### 未知与假设

- 消费仓的真实数量与形态（本机哪些仓在用、各自 git 环境），决定迁移成本。
- 完整性合同的新形态：版本 + 制品树哈希锁定到什么粒度；升级评估工具（consumer smoke）如何随之改写。
- 发布自动化落点：GitHub Release（CI 打包上传）还是 npm；与「PR 合入 → Release」节奏的衔接细节。
- OMP 载体从 `.omp/commands` 软链改为普通目录后，其命令加载是否完全无感（假设：是，纯文件读取）。

### 证据

- 2026-08-31 会话实测记录与 INT-009/010/011/012 四条环境类台账。
- `runtime-link.ts`、`runtime-entry.ts` verifyLinks、`.github/workflows/ci.yml`、`public-candidate.ts` 源码。
- AGENTS.md 第 5 条原文；`runtime-manifest.json` links 合同。

## Options

### 候选处置

- A（整体替换·Release 制品）：CI 在合并后打 tag 并发布制品（含全树哈希清单）；消费仓以「版本 + 哈希锁文件」引用，安装/升级命令下载展开为普通文件；submodule 与软链整套退役。收益最大（无 git 深度耦合、无软链），改动面与迁移成本也最大。
- B（npm 包分发）：同 A 但走 npm 生态，完整性由 package-lock 承载。语义标准，但为一个私域工作流引入 npm 发布链路，且消费仓未必都是 npm 项目。
- C（渐进·保留 gitlink 为唯一锁，软链改复制校验）：`runtime-link.ts apply` 从建软链改为复制文件，`runtime-check` 以哈希对照 pinned submodule 校验复制物防漂移。杀掉全部软链痛点，不引入第二套锁（与既有裁决冲突最小），无需发布自动化；submodule 本身的痛点（初始化、深路径）保留。可作为 A 的第一阶段。
- D（不做）：维持现状，痛点由 agent 代驾吸收。

## Disposition

决定：promote
理由：维护者门1批准两阶段路线（先复制校验替换软链，后评估 Release 制品整体替换）。
下一步：第一阶段由 Change replace-symlinks-with-verified-copies 交付；第二阶段视其验证结果另立 Change。

## History

- 2026-08-31T19:30:28.006Z captured
- 2026-08-31T19:36:17.556Z advanced to triage
- 2026-08-31T19:36:18.263Z advanced to evidence
- 2026-08-31T19:36:19.002Z advanced to options
- 2026-08-31T19:49:09.612Z advanced to disposition
- 2026-08-31T19:49:10.290Z promoted to replace-symlinks-with-verified-copies
