---
schemaVersion: 1
id: INT-20260831-009-windows-crlf-render-drift
state: captured
phase: capture
source: maintainer-session
capturedAt: 2026-08-31
promotedTo: null
---

# Intake

## 原始问题

Windows autocrlf=true 检出环境下，.omp 渲染物与源文件被转为 CRLF，render-commands check 的字节级比较报九个 Commands 全部漂移，连带 command-renderer 与 openspec-upgrade 共 3 项测试在本地失败；HEAD 的 LF 克隆中全部通过，属检出环境问题而非内容漂移。候选处置：仓库 .gitattributes 强制相关路径 eol=lf，或 check 做行尾归一化比较。

## Triage

范围：
影响：
判断：

## Evidence

### 已知事实

### 未知与假设

### 证据

#### 2026-08-31 补充：CRLF 三方不一致实测（来源 INT-015 升级实测）

来源：INT-20260831-015-upgrade-agent-system-consumer，在真实消费仓 agent-system 升级到 Runtime a49af0f 时实测。该条目已 close，此处保留其与本主题同源的证据。

同一份受管投影文件在三个位置的字节形态各不相同：

- submodule 工作树：CRLF。Runtime 仓 a49af0f 的 `.gitattributes` 只有一行 `*.json text eol=lf`，未覆盖 `.md` / `.ts`，故 submodule 在 `core.autocrlf=true` 的机器上检出为 CRLF（`opsx-apply.md` 实测 186 个 CR 字节）。
- 消费仓工作树：CRLF。`runtime-link.ts` 走字节复制，原样带过来，同样 186 个 CR 字节。
- 消费仓 index：LF。消费仓自身 `.gitattributes` 钉了 `* text=auto eol=lf`，`git add` 时告警 “CRLF will be replaced by LF”，入库 blob 0 个 CR 字节。
- 由上一条推得：新鲜 clone 后消费仓工作树会是 LF，而 submodule 源仍是 CRLF，两侧字节直接不等。（此腿为推理，非实测——INT-015 未做重新 clone 复现，以 23/23 blob 级比对加 EOL 归一化推理代替。）

关键结论：软链改可校验复制后，比对的两端分别落在「submodule 工作树」和「消费仓工作树/index」，而这两端在 Windows 上字节必然不等。`runtime-check` 之所以仍能 PASS，完全依赖 `treeDigest()` 里的 `normalizeEol()`（CRLF 归一为 LF 后再哈希）。也就是说，EOL 归一化不是实现上的锦上添花，而是整条迁移路径在 Windows 上得以成立的前提——一旦被当作实现细节重构掉，受管投影分发在 Windows 消费仓上会直接失效。

## Options

### 候选处置

- （原始记录）仓库 `.gitattributes` 强制相关路径 `eol=lf`，或 check 做行尾归一化比较。
- 2026-08-31 补充（来源 INT-015 升级实测）：把「摘要必须做 EOL 归一化」从 `treeDigest()` 的实现细节升格为 spec 里的显式行为要求，使其不可被无意重构掉；并考虑把 Runtime 仓 `.gitattributes` 从当前仅 `*.json` 扩展到覆盖 `.md` / `.ts`，从源头减少 CRLF 进入受管投影的机会。两者互补——前者保证校验在既有 CRLF 面前仍成立，后者缩小 CRLF 的产生面。

## Disposition

决定：
理由：
下一步：

## History

- 2026-08-31T18:16:52.741Z captured
