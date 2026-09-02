---
schemaVersion: 1
id: INT-20260901-027-bootstrap-disposition
state: captured
phase: capture
source: review-finding
capturedAt: 2026-09-01
promotedTo: null
changeObject: tool-code
---

# Intake

## 原始问题

bootstrap.ts 是为单一历史 slug 写的一次性导入工具，固定产出第 6 版工件结构，而当前结构已是第 7 版。它的产出自洽、不与第 7 版冲突、也不会被误判（独立评审实测走完 dry-run、stage、activate、rollback 全流程确认），但那个 slug 在本仓既不在在途目录也不在归档目录，也就是说这套工具至今没有任何已知的使用。二选一：取消（连同它的测试一并删），还是给它升版（并补一条第 6 版到第 7 版的迁移）。

## Triage

范围：openspec/tools/bootstrap.ts 与 test/bootstrap.test.ts 的去留。
不含：任何其它工具的版本跟进（本单已把它们都带到第 7 版）。
影响：取消则少 429 行代码与一份测试；升版则要改目录映射、版本声明，并补一条第 6 版到第 7 版的迁移路径。
判断：continue——两条路都清楚，只差一次裁断；本单已按「冻结」处置，在文件头写明它固定产出第 6 版、导入后需另行升版。

## Evidence

### 已知事实

- 独立评审实测走完 dry-run、stage、activate、rollback 全流程：产出的 Change 自洽，显式声明第 6 版，
  落地文件与第 6 版路径表逐项匹配，状态合同校验通过，不与第 7 版冲突，也不会被误判。
- 它为之而写的那个历史 slug（`optimize-logistics-change-review-workflow`）在本仓既不在在途目录也不在归档目录。
- 「精简工件与说人话」那一单按评审建议不在本单返工，只冻结并加注，处置留给本条。

### 未知与假设

### 证据

## Options

### 候选处置

## Disposition

决定：已登记，等待裁断。
理由：它今天不出错，所以不紧急；但它是三代结构并存里唯一一处「产出旧结构」的工具，长期挂着会变成陷阱。
下一步：维护者二选一——取消，或升版并补迁移路径。

## History

- 2026-09-01T19:56:35.862Z captured
