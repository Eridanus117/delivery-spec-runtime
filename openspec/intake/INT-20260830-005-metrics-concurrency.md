---
schemaVersion: 1
id: INT-20260830-005-metrics-concurrency
state: captured
phase: capture
source: runtime-maintainer-session
capturedAt: 2026-08-30
promotedTo: null
---

# Intake

## 原始问题

建立并发效率指标基线后再提升 Agent 并发度

## Triage

范围：Runtime 仓库的本地脱敏指标、Agent 并发度和交付效率
影响：没有基线时提高并发无法区分吞吐收益、排队、冲突、返工和 CI 成本
判断：continue

## Evidence

### 已知事实

- `INT-20260830-004` 已定义决策价值、采用漏斗、首次价值时间、阶段耗时、WIP、冲突、返工和审计可信度等指标。
- 第一版边界限定为脱敏元数据，不建设远程 telemetry。
- 当前没有一般 workflow 采集器、统一基线、看板或并发阈值。
- CI 只验证 Runtime 完整性和测试结果，不衡量有效决策率或 Agent 冲突率。

### 未知与假设

- 当前实际并发度、各阶段 WIP 和排队等待时间未知。
- 首次有用产出、决策完成率、冲突率和返工率尚无统计基线。
- 增加一个并发槽位是否改善吞吐且不提高返工，尚未验证。
- 指标存储应留在本地私有工作区，不能写入公共 Runtime 业务资产。

### 证据

- `openspec/intake/INT-20260830-004-runtime-metrics-and-options.md`
- `openspec/intake/README.md`
- `openspec/specs/intake-workflow/spec.md`
- `docs/maintainer-guide.md`

## Options

### 候选处置

- 建立本地低频脱敏事件协议，先记录当前并发基线，再增加一个并发槽位做对照。
- 直接提高并发：实施最快，但无法判断收益，也无法及时发现冲突和返工。
- 建设远程 telemetry：信息更完整，但隐私、账号安全和维护成本过高，当前不选。

## 后续待办

- [ ] 定义最小脱敏事件协议和事件枚举
- [ ] 选择本地指标存储位置并写入保留/清理规则
- [ ] 确定吞吐、时间、WIP、冲突、返工和质量门禁的计算口径
- [ ] 记录当前并发度的一轮基线
- [ ] 增加一个并发槽位并记录对照数据
- [ ] 根据数据设置 WIP 上限、停止条件和回滚条件
- [ ] 评估是否提升为 Runtime 正式 Change

## Disposition

决定：
理由：
下一步：

## History

- 2026-08-30T23:55:34.386Z captured
