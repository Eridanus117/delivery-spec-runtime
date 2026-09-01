import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createArtifactTree, runTool } from "./helpers.ts";

const artifactFiles: Record<string, string> = {
  "01-原始需求/原始需求索引.md": "raw\n", "02-需求理解/需求理解.md": "requirements\n", "03-业务现状/业务现状.md": "business\n",
  "04-技术现状/技术现状.md": "technical\n",
  "05-改造方案/方案提案.md": "# 方案提案\n## 候选 A：简单\n## 候选 B：严格\n## Trade-off 矩阵\n## 推荐\n## 未决问题\n",
  "05-改造方案/方案决策.md": "# 方案决策\n- 状态：APPROVED\n- 选择：B\n- 决策人：tester\n- 决策时间：2026-08-30\n## 接受的后果\n## 拒绝方案\n",
  "05-改造方案/改造方案.md": "plan\n", "06-测试方案/测试方案.md": "tests\n",
  "07-实施任务/实施任务.md": "# 实施任务\n- [ ] 1.1 [planned] 完成演示\n- [ ] 9.9 [planned] 已删除任务\n  - 交付物：obsolete\n",
};
const artifacts = ["raw-requirements", "specs", "business-current", "technical-current", "solution-proposal", "solution-decision", "change-plan", "test-plan", "tasks"];
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
    result = runTool("delivery-control.ts", ["task", "set", "--change-root", change, "--id", "1.1", "--state", "verified", "--evidence", "test-output/control.tap"]); assert.equal(result.status, 0, result.stderr);
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
