# openspec-upgrade smoke 偶发失败：基线对照证据

复现方式：在临时 LF 克隆（core.autocrlf=false, core.symlinks=true）checkout 指定 commit 后，
反复执行 `node --experimental-strip-types --test test/openspec-upgrade.test.ts`。

| Commit | 轮次 | 结果 |
|---|---|---|
| 51829cc（基线，实现之前） | 5 | 3 过 2 败（run3、run5 失败） |
| b19f1a5（实现之后） | 3 | 2 过 1 败（run2 失败） |

失败签名两侧一致：第二个合成消费仓（webcoding-spec）smoke 的 runtime-check 返回 1，
stderr 为「运行时 submodule 包含未提交修改」，脏文件为 2026-08-30 归档 Change 的证据 JSON——
git racy status 竞态，与本 Change 实现内容无关。完整失败日志见同目录（已脱敏本机用户路径，
以 `<home>` 代替）。登记：`openspec/intake/INT-20260831-010-upgrade-smoke-flaky-status.md`。
