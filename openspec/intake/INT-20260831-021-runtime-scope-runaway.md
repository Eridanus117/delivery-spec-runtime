---
schemaVersion: 1
id: INT-20260831-021-runtime-scope-runaway
state: triaged
phase: triage
source: maintainer-session-2026-08-31
capturedAt: 2026-08-31
promotedTo: null
---

# Intake

## 原始问题

维护者判断仓库已偏离初衷：本想要工作中沉淀资产 + Vibe Coding 轻量需求分析，两天内长成 381 文件的自治理平台，无任何真实消费方

## Triage

范围：仓库整体方向，不是某个具体功能缺陷。
影响：继续按现有模式演进，每次会话都会产出新的治理子系统，而两个原始目标（资产沉淀、轻量需求分析）始终没有被真实使用验证。
判断：等主人裁决方向，裁决前冻结新子系统。

## Evidence

### 已知事实

- 原始目标只有两个：①Agent 干活时沉淀主人关心的资产；②Vibe Coding 场景下轻量回答「这个诉求值不值得做」。
- 全部 58 个 commit 集中在 2026-08-30/31 两天，产出 381 个文件、约 2900 行 TS 工具、约 1440 行测试、22 份 JSON contract。
- 无任何真实消费方：没有一个项目仓以 submodule 接入，没有一条真实需求走过 `requirement-analysis@v1.0.0`。
- 仓库用自己的九层重流程治理自己的每次演进（见 `openspec/changes/archive/` 8 个归档 Change），全部 6 条既有 intake 均关于 Runtime 自身。
- INT-20260830-006 已记录过同一失败模式：一次流程咨询被扩大成完整归档 Change，「实际工作范围明显大于所需的最小范围」。
- `requirement-analysis-v1` 要求 problemFrame/capabilityReport/optionReport/decisionReport/analysisRounds（每轮 8 个必填字段）加多道人工门，对 Vibe Coding 场景比被分析的事情本身还重。
- desk 立项流程（分析循环 + 门B）已经覆盖「诉求值不值得做」这个问题，且明确「任何时候不使用 workflow」。

### 未知与假设

- 工作语境的重流水线是否真的需要机器强制（schema 校验、fail-closed 检查），还是模板约定即可——未被真实工作需求验证。
- 假设：失控机制是「Agent + 自治理流程仓 + 无外部消费方」的正反馈——最显眼的可做工作永远是完善流程，而流程又放大每次改动的产物量。

### 证据

- `git log --format='%ad'`：55 commit 于 2026-08-30，3 commit 于 2026-08-31。
- `git ls-files | wc -l` = 381；`wc -l openspec/tools/*.ts` ≈ 2863；`wc -l test/*.ts` ≈ 1440。
- `openspec/contracts/` 含 metrics-event、workflow-registry、openspec-upgrade 等 22 份 schema，均无仓外使用者。

## Options

### 候选处置

- A. 冻结自治理循环 + 拉动式验证：Runtime 自身改动降级为普通 commit/PR；本周挑一个真实项目接入或挑一条真实 Vibe Coding 痒点手写一页分析，用真实摩擦决定下一步保留什么。轻量需求分析回归 desk 门B，Runtime 不另造。
- B. 激进裁剪：保留 delivery-change schema 与 commands 渲染这条主干，砍掉或归档 metrics、并发实验、profile registry 版本强制、受控 OpenSpec 升级、Runtime 自身 intake 盘点。
- C. 整仓打 tag 封存，回到 desk 重新过门B，从真实需求重启。

## Disposition

决定：
理由：
下一步：

## History

- 2026-08-31T23:09:35.435Z captured
