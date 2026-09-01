import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createArtifactTree, runTool, runtimeRoot } from "./helpers.ts";

const artifactFiles: Record<string, string> = {
  "01-原始需求/原始需求索引.md": "raw\n", "02-需求理解/需求理解.md": "requirements\n", "03-现状/现状.md": "current\n",
  "05-改造方案/方案提案.md": "# 方案提案\n## 候选 A：简单\n## 候选 B：严格\n## Trade-off 矩阵\n## 推荐\n## 未决问题\n",
  "05-改造方案/方案决策.md": "# 方案决策\n- 状态：APPROVED\n- 选择：B\n- 决策人：tester\n- 决策时间：2026-08-30\n## 接受的后果\n## 拒绝方案\n",
  "05-改造方案/改造方案.md": "plan\n", "06-测试方案/测试方案.md": "tests\n",
  "07-实施任务/实施任务.md": "# 实施任务\n- [ ] 1.1 [planned] 完成演示\n- [ ] 9.9 [planned] 已删除任务\n  - 交付物：obsolete\n",
};
const artifacts = ["raw-requirements", "specs", "current-state", "solution-proposal", "solution-decision", "change-plan", "test-plan", "tasks"];
test("严格来源、批准失效、任务状态和投影合同", () => {
  const root = mkdtempSync(join(tmpdir(), "delivery-control-"));
  try {
    const change = join(root, "openspec/changes/demo-change"); createArtifactTree(change);
    for (const [path, body] of Object.entries(artifactFiles)) writeFileSync(join(change, path), body);
    let result = runTool("delivery-control.ts", ["init", "--change-root", change, "--slug", "demo-change", "--display-name", "演示变更", "--mode", "delivery"]); assert.equal(result.status, 0, result.stderr);
    // VC-022：change-sources 概念已移除，两个子命令都变成未知命令，且不产出该文件。
    const sourcesFile = join(root, "sources.json"); writeFileSync(sourcesFile, JSON.stringify({ schemaVersion: 1, sources: [{ id: "request", kind: "user", authority: 1, locator: "current-session", adapter: "builtin:user" }] }));
    for (const args of [["sources", "inspect"], ["sources", "write", "--file", sourcesFile]]) {
      result = runTool("delivery-control.ts", [args[0], args[1], "--change-root", change, ...args.slice(2)]);
      assert.notEqual(result.status, 0); assert.match(result.stderr, /未知delivery-control命令/);
    }
    assert.equal(existsSync(join(change, "change-sources.json")), false);
    const taskImport = join(root, "tasks.json"); writeFileSync(taskImport, JSON.stringify({ schemaVersion: 1, tasks: [{ id: "1.1", state: "planned", deliverables: ["src/demo.ts"], verification: ["node --test demo.test.ts"], evidence: [], blocker: null }] }));
    result = runTool("delivery-control.ts", ["task", "write", "--change-root", change, "--file", taskImport]); assert.equal(result.status, 0, result.stderr);
    result = runTool("delivery-control.ts", ["task", "render", "--change-root", change]); assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(readFileSync(join(change, "07-实施任务/实施任务.md"), "utf8"), /9\.9|已删除任务|obsolete/);
    for (const artifact of artifacts) { result = runTool("delivery-control.ts", ["approval", "set", "--change-root", change, "--artifact", artifact, "--decision", "approved", "--approved-by", "tester"]); assert.equal(result.status, 0, result.stderr); }
    result = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "apply"]); assert.equal(result.status, 0, result.stderr);
    result = runTool("delivery-control.ts", ["task", "set", "--change-root", change, "--id", "1.1", "--state", "verified"]); assert.notEqual(result.status, 0); assert.match(result.stderr, /缺少 evidence/);
    // VC-026：evidence 四类负向全部 fail closed，且 task-state.json 逐字节不变。
    mkdirSync(join(change, "08-验收"), { recursive: true });
    writeFileSync(join(change, "08-验收/empty.tap"), "");
    const taskStateBefore = readFileSync(join(change, "task-state.json"), "utf8");
    const negatives: Array<[string, RegExp]> = [
      ["08-验收/missing.tap", /evidence 不存在/],
      ["08-验收/empty.tap", /evidence 必须是非空文件/],
      [join(root, "outside.tap"), /不接受绝对路径/],
      ["../outside.tap", /不得使用 \.\. 越界/],
    ];
    for (const [evidence, pattern] of negatives) {
      result = runTool("delivery-control.ts", ["task", "set", "--change-root", change, "--id", "1.1", "--state", "verified", "--evidence", evidence]);
      assert.notEqual(result.status, 0, `应当拒绝: ${evidence}`); assert.match(result.stderr, pattern);
      assert.equal(readFileSync(join(change, "task-state.json"), "utf8"), taskStateBefore, `拒绝后不得写入: ${evidence}`);
    }
    // REV-011：Change 目录内指向仓外的软链不得充当证据（词法校验挡不住，需 realpath）。
    const outside = join(root, "outside-evidence.tap");
    writeFileSync(outside, "outside\n");
    let symlinked = true;
    try { symlinkSync(outside, join(change, "08-验收/escape.tap")); } catch { symlinked = false; }
    if (symlinked) {
      result = runTool("delivery-control.ts", ["task", "set", "--change-root", change, "--id", "1.1", "--state", "verified", "--evidence", "08-验收/escape.tap"]);
      assert.notEqual(result.status, 0, "软链逃逸的证据应被拒绝");
      assert.match(result.stderr, /软链逃逸 Change 目录/);
      assert.equal(readFileSync(join(change, "task-state.json"), "utf8"), taskStateBefore);
    }

    // VC-025：Change 内存在的非空证据文件被接受。
    writeFileSync(join(change, "08-验收/control.tap"), "ok\n");
    result = runTool("delivery-control.ts", ["task", "set", "--change-root", change, "--id", "1.1", "--state", "verified", "--evidence", "08-验收/control.tap"]); assert.equal(result.status, 0, result.stderr);
    result = runTool("delivery-control.ts", ["task", "render", "--change-root", change]); assert.equal(result.status, 0, result.stderr);
    result = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "acceptance"]); assert.notEqual(result.status, 0); assert.match(result.stderr, /tasks 批准状态为 stale/);
    result = runTool("delivery-control.ts", ["approval", "set", "--change-root", change, "--artifact", "tasks", "--decision", "approved", "--approved-by", "tester"]); assert.equal(result.status, 0, result.stderr);
    result = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "acceptance"]); assert.notEqual(result.status, 0); assert.match(result.stderr, /implementation-review/);
    // VC-024：update snapshot / diagnose 两个命令随 .delivery-update-snapshot.json 概念一并移除。
    const updatePaths = join(root, "update-paths.json"); writeFileSync(updatePaths, JSON.stringify(["05-改造方案/改造方案.md"]));
    for (const args of [["update", "snapshot", "--paths-file", updatePaths], ["update", "diagnose"]]) {
      result = runTool("delivery-control.ts", [args[0], args[1], "--change-root", change, ...args.slice(2)]);
      assert.notEqual(result.status, 0); assert.match(result.stderr, /未知delivery-control命令/);
    }
    assert.equal(existsSync(join(change, ".delivery-update-snapshot.json")), false);
    // 批准新鲜度不依赖 snapshot：工件事后改动仍然直接使批准 stale。
    writeFileSync(join(change, "05-改造方案/改造方案.md"), "changed plan\n"); result = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "apply"]); assert.notEqual(result.status, 0); assert.match(result.stderr, /change-plan 批准状态为 stale/);
    const infoPath = join(change, "change-info.json"); const info = JSON.parse(readFileSync(infoPath, "utf8")); info.unknown = true; writeFileSync(infoPath, JSON.stringify(info)); result = runTool("delivery-control.ts", ["inspect", "--change-root", change]); assert.notEqual(result.status, 0); assert.match(result.stderr, /未知字段 unknown/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("VC-024 change-mode 概念移除后 guard 行为与不存在时一致", () => {
  const root = mkdtempSync(join(tmpdir(), "delivery-control-mode-"));
  try {
    const change = join(root, "openspec/changes/demo-change"); createArtifactTree(change);
    for (const [path, body] of Object.entries(artifactFiles)) writeFileSync(join(change, path), body);
    let result = runTool("delivery-control.ts", ["init", "--change-root", change, "--slug", "demo-change", "--display-name", "演示变更", "--mode", "delivery"]);
    assert.equal(result.status, 0, result.stderr);
    // init 不再产出 change-mode.json，rehearsal 被显式拒绝。
    assert.equal(existsSync(join(change, "change-mode.json")), false);
    const rehearsal = join(root, "openspec/changes/rehearsal-change"); createArtifactTree(rehearsal);
    result = runTool("delivery-control.ts", ["init", "--change-root", rehearsal, "--slug", "rehearsal-change", "--display-name", "演练", "--mode", "rehearsal"]);
    assert.notEqual(result.status, 0); assert.match(result.stderr, /rehearsal .*已随 change-mode\.json 一并移除/);

    const taskImport = join(root, "tasks.json");
    writeFileSync(taskImport, JSON.stringify({ schemaVersion: 1, tasks: [{ id: "1.1", state: "planned", deliverables: ["src/demo.ts"], verification: ["node --test"], evidence: [], blocker: null }] }));
    assert.equal(runTool("delivery-control.ts", ["task", "write", "--change-root", change, "--file", taskImport]).status, 0);
    assert.equal(runTool("delivery-control.ts", ["task", "render", "--change-root", change]).status, 0);
    for (const artifact of artifacts) assert.equal(runTool("delivery-control.ts", ["approval", "set", "--change-root", change, "--artifact", artifact, "--decision", "approved", "--approved-by", "tester"]).status, 0);

    // 基线：无 change-mode.json 时 apply 放行、mode 报 delivery。
    const before = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "apply"]);
    assert.equal(before.status, 0, before.stderr);
    assert.equal(JSON.parse(before.stdout).mode, "delivery");

    // 构造一个 rehearsal 的 change-mode.json：该文件不再被解析，guard 行为与不存在时逐字节一致。
    writeFileSync(join(change, "change-mode.json"), JSON.stringify({ schemaVersion: 1, mode: "rehearsal", reason: "r", approvedBy: "a", approvedAt: "2026-08-30T00:00:00Z" }));
    const after = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "apply"]);
    assert.equal(after.status, before.status);
    assert.equal(after.stdout, before.stdout);
    // 连内容非法的 change-mode.json 也不会影响 guard——因为根本不读它。
    writeFileSync(join(change, "change-mode.json"), "{ not json");
    const broken = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "apply"]);
    assert.equal(broken.status, before.status);
    assert.equal(broken.stdout, before.stdout);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("REV-002 声明与事实交叉校验：声明低档而实际触碰高档路径即 fail-closed", () => {
  const repo = mkdtempSync(join(tmpdir(), "delivery-scope-"));
  const sh = (args: string[]) => { const r = spawnSync("git", args, { cwd: repo, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  try {
    sh(["init", "-q", "-b", "master"]); sh(["config", "user.email", "t@example.com"]); sh(["config", "user.name", "t"]);
    // 显式打开 core.quotepath（git 的出厂默认）：开发机常把它设成 false，会掩盖
    // 「非 ASCII 路径被返回为 C 转义串」这类缺陷。本仓的工件目录全是中文名，
    // 必须按出厂默认取证，否则这条用例对该整类缺陷免疫。
    sh(["config", "core.quotepath", "true"]);
    // 先落一个基线提交：Change 目录必须出现在「已有提交历史之上」的后续提交里，
    // 否则首次触碰该目录的提交就是根提交，diff 区间为空，同样对该类缺陷免疫。
    writeFileSync(join(repo, "base.txt"), "base\n", "utf8");
    sh(["add", "."]); sh(["commit", "-qm", "base"]);
    // 一条登记时自称「只改说明面」的 intake 条目。
    mkdirSync(join(repo, "openspec/intake"), { recursive: true });
    writeFileSync(join(repo, "openspec/intake/INT-20260901-050-doc.md"), "---\nschemaVersion: 1\nid: INT-20260901-050-doc\nstate: promoted\nphase: capture\nsource: synthetic\ncapturedAt: 2026-09-01\npromotedTo: demo-change\nchangeObject: doc-expression\n---\n\n# Intake\n", "utf8");
    const change = join(repo, "openspec/changes/demo-change"); createArtifactTree(change);
    for (const [path, body] of Object.entries(artifactFiles)) writeFileSync(join(change, path), body);
    writeFileSync(join(change, "01-原始需求/原始需求索引.md"), "# 原始需求索引\n- Intake 来源：openspec/intake/INT-20260901-050-doc.md\n", "utf8");
    assert.equal(runTool("delivery-control.ts", ["init", "--change-root", change, "--slug", "demo-change", "--display-name", "演示", "--mode", "delivery"]).status, 0);
    // 导入文件放仓外：它是测试脚手架，不该被当成本 Change 触碰的实现路径。
    const taskImport = join(mkdtempSync(join(tmpdir(), "delivery-scope-in-")), "tasks.json");
    writeFileSync(taskImport, JSON.stringify({ schemaVersion: 1, tasks: [{ id: "1.1", state: "planned", deliverables: ["d"], verification: ["v"], evidence: [], blocker: null }] }));
    assert.equal(runTool("delivery-control.ts", ["task", "write", "--change-root", change, "--file", taskImport]).status, 0);
    assert.equal(runTool("delivery-control.ts", ["task", "render", "--change-root", change]).status, 0);
    for (const artifact of artifacts) assert.equal(runTool("delivery-control.ts", ["approval", "set", "--change-root", change, "--artifact", artifact, "--decision", "approved", "--approved-by", "tester"]).status, 0);

    // 只碰 docs/：与声明相符，verify 放行。
    mkdirSync(join(repo, "docs"), { recursive: true });
    writeFileSync(join(repo, "docs/guide.md"), "doc\n", "utf8");
    sh(["add", "."]); sh(["commit", "-qm", "change + doc"]);
    let result = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "verify", "--runtime-root", runtimeRoot], { cwd: repo });
    assert.equal(result.status, 0, result.stderr);

    // 顺手改了工具代码：实际触碰 tool-code 档位，声明仍是 doc-expression → 必须拒绝。
    mkdirSync(join(repo, "openspec/tools"), { recursive: true });
    writeFileSync(join(repo, "openspec/tools/sneaky.ts"), "export const x = 1;\n", "utf8");
    result = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "verify", "--runtime-root", runtimeRoot], { cwd: repo });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /声明与事实不符/);
    assert.match(result.stderr, /openspec\/tools\/sneaky\.ts/);
    assert.match(result.stderr, /tool-code/);
    // 处置方式必须指向改声明补分析线，而不是缩小改动面。
    assert.match(result.stderr, /修正条目的 changeObject 声明/);

    // 治理合同路径同样被抓。
    rmSync(join(repo, "openspec/tools/sneaky.ts"));
    mkdirSync(join(repo, "openspec/contracts"), { recursive: true });
    writeFileSync(join(repo, "openspec/contracts/new.schema.json"), "{}\n", "utf8");
    result = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "verify", "--runtime-root", runtimeRoot], { cwd: repo });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /governance-contract/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
