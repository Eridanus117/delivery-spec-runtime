---
schemaVersion: 1
id: INT-20260901-021-review-blindspots-and-probe-strength
state: captured
phase: capture
source: implementation-review-findings
capturedAt: 2026-09-01
promotedTo: null
changeObject: governance-contract
---

# Intake

## 原始问题

两处审查盲区与一处探针强度不足，合并登记，留待下次复盘一并裁。

一、一致性合同测试的判别力部分来自一份隐式的第二清单（复审 REV-012）

test/station-authority.test.ts 的七个探针里，只有 decision / acceptance / archive 三站真的抹掉了该站的人工表态字段；proposal / implementation / review / sync 四站什么都不抹，直接跑一条已经全部批准的 happy path。因此这四站被观测为 false 的根据是「完整 fixture 能通过」，而不是「该站不索取人工表态」。

更根本的问题：「每站抹掉哪个字段」这一手工选择本身就编码了与 humanJudgment 等价的信息。VC-003 只禁止显式的站位到布尔的硬编码映射，抓不到这种形态——清单从「值」的形态变成了「探针构造」的形态。

复审已验证篡改检测确实有效（把 profile 的 sync 单边改成 true 后测试失败并报出分叉，改回即复绿），故这是强度不足而非失效，不阻塞本单。

可能的加强方向（未裁决）：为四个机器站也构造真实的负向对照，例如证明它们的收口命令在输入侧根本不接受任何人工裁决键（review-input 传 result 即报未知字段，这条已在 VC-031 中被断言，可以复用为站位判据）。

二、review 自算范围对长期 spec 是盲的（复审 REV-007 的附带发现）

delivery-lifecycle.ts 的 isLifecyclePath 把 openspec/specs/** 与 Change 目录一并排除在 reviewedPaths 之外。其原意是「生命周期产物不算实现改动」，但副作用是：实施提交里对长期 spec 的直接写入，review 站结构性地看不到。

本单已按 REV-007 把对长期 spec 的直接写入改为走 delta，但机制上的盲区仍在——下一次仍可能有人在实施阶段直接改 openspec/specs/ 而不被 review 发现。

可能的处置方向（未裁决）：把 openspec/specs/** 从 isLifecyclePath 中摘出，只保留 Change 目录自身；或增设一条独立断言，要求实施提交对 openspec/specs/ 的改动必须为空。前者会改变 review 自算范围（属于「不得削弱项」的邻接面，需谨慎）；后者是加法，风险更低。

三、触发时机

按 AGENTS.md 预置的复盘触发点，强制版分析线跑满 2 单后的复盘一并裁决这三项。

## Triage

范围：
影响：
判断：

## Evidence

### 已知事实

### 未知与假设

### 证据

## Options

### 候选处置

## Disposition

决定：
理由：
下一步：

## History

- 2026-09-01T03:09:17.310Z captured
