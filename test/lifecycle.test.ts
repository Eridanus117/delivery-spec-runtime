import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createArtifactTree, runTool } from "./helpers.ts";

function git(root: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}
const proposal = "# 方案提案\n## 候选 A：简单\n## 候选 B：严格\n## Trade-off 矩阵\n## 推荐\n## 未决问题\n";
const decision = "# 方案决策\n- 状态：APPROVED\n- 选择：B\n- 决策人：tester\n- 决策时间：2026-08-30\n## 接受的后果\n## 拒绝方案\n";
const artifacts = ["raw-requirements", "specs", "business-current", "technical-current", "solution-proposal", "solution-decision", "change-plan", "test-plan", "tasks"];

function prepareChange(repo: string): { change: string; baseline: string; reviewed: string } {
  git(repo, ["init", "-q", "-b", "master"]); git(repo, ["config", "user.email", "test@example.com"]); git(repo, ["config", "user.name", "Test"]);
  write(join(repo, "base.txt"), "base\n"); git(repo, ["add", "."]); git(repo, ["commit", "-qm", "base"]); const baseline = git(repo, ["rev-parse", "HEAD"]);
  const change = join(repo, "openspec/changes/demo-change"); createArtifactTree(change);
  const files: Record<string, string> = {
    "01-原始需求/原始需求索引.md": "raw\n", "03-业务现状/业务现状.md": "business\n", "04-技术现状/技术现状.md": "technical\n",
    "05-改造方案/方案提案.md": proposal, "05-改造方案/方案决策.md": decision, "05-改造方案/改造方案.md": "plan\n", "06-测试方案/测试方案.md": "tests\n",
    "07-实施任务/实施任务.md": "# 实施任务\n- [x] 1.1 [verified] 完成演示\n", "specs/example/spec.md": "## ADDED Requirements\n### Requirement: Demo\n#### Scenario: Demo\n- **WHEN** x\n- **THEN** y\n",
  };
  for (const [path, content] of Object.entries(files)) write(join(change, path), content);
  write(join(change, "task-state.json"), `${JSON.stringify({ schemaVersion: 1, tasks: [{ id: "1.1", state: "verified", deliverables: ["src/app.ts"], verification: ["node --test"], evidence: ["PASS"], blocker: null }] }, null, 2)}\n`);
  let result = runTool("delivery-control.ts", ["init", "--change-root", change, "--slug", "demo-change", "--display-name", "演示", "--mode", "delivery"], { cwd: repo }); assert.equal(result.status, 0, result.stderr);
  for (const artifact of artifacts) { result = runTool("delivery-control.ts", ["approval", "set", "--change-root", change, "--artifact", artifact, "--decision", "approved", "--approved-by", "tester"], { cwd: repo }); assert.equal(result.status, 0, result.stderr); }
  write(join(repo, "src/app.ts"), "export const value = 1;\n");
  write(join(repo, "openspec/changes/another-change/notes.md"), "cross-change evidence\n");
  git(repo, ["add", "."]); git(repo, ["commit", "-qm", "implementation"]); const reviewed = git(repo, ["rev-parse", "HEAD"]);
  return { change, baseline, reviewed };
}

test("Review绑定完整实现范围并在实现漂移时失效", () => {
  const repo = mkdtempSync(join(tmpdir(), "delivery-lifecycle-review-"));
  try {
    const { change, baseline, reviewed } = prepareChange(repo);
    const input = join(change, "review-input.json"); write(input, `${JSON.stringify({ schemaVersion: 1, baselineCommit: baseline, reviewedCommit: reviewed, reviewer: "reviewer", reviewedAt: "2026-08-30T12:00:00Z", findings: [] }, null, 2)}\n`);
    let result = runTool("delivery-lifecycle.ts", ["review", "write", "--change-root", change, "--file", input], { cwd: repo }); assert.equal(result.status, 0, result.stderr);
    const review = JSON.parse(readFileSync(join(change, "implementation-review.json"), "utf8")); assert.deepEqual(review.reviewedPaths.map((item: { path: string }) => item.path), ["openspec/changes/another-change/notes.md", "src/app.ts"]); assert.equal(review.result, "PASS");
    result = runTool("delivery-lifecycle.ts", ["review", "inspect", "--change-root", change], { cwd: repo }); assert.equal(result.status, 0, result.stderr);
    write(join(repo, "src/app.ts"), "export const value = 2;\n"); result = runTool("delivery-lifecycle.ts", ["review", "inspect", "--change-root", change], { cwd: repo }); assert.notEqual(result.status, 0); assert.match(result.stderr, /stale/);
    git(repo, ["checkout", "--", "src/app.ts"]);
    const openInput = join(change, "review-open.json"); write(openInput, `${JSON.stringify({ schemaVersion: 1, baselineCommit: baseline, reviewedCommit: reviewed, reviewer: "reviewer", reviewedAt: "2026-08-30T12:00:00Z", findings: [{ id: "REV-001", severity: "HIGH", path: "src/app.ts", line: 1, summary: "风险", status: "OPEN", resolution: null }] }, null, 2)}\n`);
    result = runTool("delivery-lifecycle.ts", ["review", "write", "--change-root", change, "--file", openInput], { cwd: repo }); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(readFileSync(join(change, "implementation-review.json"), "utf8")).result, "FAIL");
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test("Acceptance与Archive Readiness取代Markdown关键词并支持受控reopen", () => {
  const repo = mkdtempSync(join(tmpdir(), "delivery-lifecycle-archive-"));
  try {
    const { change, baseline, reviewed } = prepareChange(repo);
    const reviewInput = join(change, "review-input.json"); write(reviewInput, JSON.stringify({ schemaVersion: 1, baselineCommit: baseline, reviewedCommit: reviewed, reviewer: "reviewer", reviewedAt: "2026-08-30T12:00:00Z", findings: [] }));
    let result = runTool("delivery-lifecycle.ts", ["review", "write", "--change-root", change, "--file", reviewInput], { cwd: repo }); assert.equal(result.status, 0, result.stderr);
    write(join(change, "08-验收/验收记录.md"), "# 验收\n结论: PASS\n"); write(join(change, "08-验收/cleanup/cleanup.md"), "结论: PASS\n");
    const acceptanceInput = join(change, "acceptance-input.json"); write(acceptanceInput, JSON.stringify({ schemaVersion: 1, acceptedBy: "maintainer", acceptedAt: "2026-08-30T12:01:00Z" }));
    result = runTool("delivery-lifecycle.ts", ["acceptance", "write", "--change-root", change, "--file", acceptanceInput], { cwd: repo }); assert.equal(result.status, 0, result.stderr);
    const taskStatePath = join(change, "task-state.json"); const originalTaskState = readFileSync(taskStatePath, "utf8");
    write(taskStatePath, originalTaskState.replace("\"PASS\"", "\"PASS-drift\""));
    result = runTool("delivery-lifecycle.ts", ["acceptance", "inspect", "--change-root", change], { cwd: repo }); assert.notEqual(result.status, 0); assert.match(result.stderr, /stale/);
    write(taskStatePath, originalTaskState);
    write(join(change, "09-发布/发布计划.md"), "# 发布计划\nrelease-not-required\n");
    result = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "archive"], { cwd: repo }); assert.notEqual(result.status, 0); assert.match(result.stderr, /archive-readiness/);
    const delta = "openspec/changes/demo-change/specs/example/spec.md"; const main = "openspec/specs/example/spec.md"; write(join(repo, main), readFileSync(join(repo, delta), "utf8"));
    const readinessInput = join(change, "readiness-input.json"); write(readinessInput, JSON.stringify({ schemaVersion: 1, specSync: [{ deltaPath: delta, mainPath: main }], strictValidation: "PASS", cleanupEvidence: "openspec/changes/demo-change/08-验收/cleanup/cleanup.md", prStarted: false, migrationSource: null, historicalPr: null, attestedBy: "maintainer", attestedAt: "2026-08-30T12:02:00Z" }));
    result = runTool("delivery-lifecycle.ts", ["readiness", "write", "--change-root", change, "--file", readinessInput], { cwd: repo }); assert.equal(result.status, 0, result.stderr);
    result = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "archive"], { cwd: repo }); assert.equal(result.status, 0, result.stderr);
    write(join(repo, main), "drift\n"); result = runTool("delivery-lifecycle.ts", ["readiness", "inspect", "--change-root", change], { cwd: repo }); assert.notEqual(result.status, 0); assert.match(result.stderr, /spec sync stale/); write(join(repo, main), readFileSync(join(repo, delta), "utf8"));
    git(repo, ["add", "."]); git(repo, ["commit", "-qm", "lifecycle evidence"]);
    const archiveRoot = join(repo, "openspec/changes/archive"); mkdirSync(archiveRoot, { recursive: true }); const archived = join(archiveRoot, "2026-08-30-demo-change"); renameSync(change, archived); git(repo, ["add", "."]); git(repo, ["commit", "-qm", "archive"]);
    const target = join(repo, "openspec/changes/demo-change"); result = runTool("delivery-lifecycle.ts", ["reopen", "--change-root", archived, "--target-root", target, "--reason", "PR要求行为变化", "--reopened-by", "maintainer", "--reopened-at", "2026-08-30T12:03:00Z"], { cwd: repo }); assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(target, "implementation-review.json")), false); assert.equal(existsSync(join(target, "acceptance-state.json")), false); assert.equal(existsSync(join(target, "archive-readiness.json")), false);
    const task = JSON.parse(readFileSync(join(target, "task-state.json"), "utf8")).tasks[0]; assert.equal(task.state, "implemented_unverified"); assert.equal(existsSync(join(target, "lifecycle-history/2026-08-30T12-03-00Z/implementation-review.json")), true);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
