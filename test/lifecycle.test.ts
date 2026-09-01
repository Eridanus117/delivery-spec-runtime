import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createArtifactTree, runTool, runtimeRoot, removeOptions } from "./helpers.ts";
import { sha256File } from "../openspec/tools/runtime-lib.ts";

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

function prepareChange(repo: string): { change: string; baseline: string; reviewed: string } {
  git(repo, ["init", "-q", "-b", "master"]); git(repo, ["config", "user.email", "test@example.com"]); git(repo, ["config", "user.name", "Test"]);
  write(join(repo, "base.txt"), "base\n"); git(repo, ["add", "."]); git(repo, ["commit", "-qm", "base"]); const baseline = git(repo, ["rev-parse", "HEAD"]);
  const change = join(repo, "openspec/changes/demo-change"); createArtifactTree(change);
  const files: Record<string, string> = {
    // 第 7 版结构：现状并进方案提案、改造方案并进实施任务，所以这里不再单独造那两份。
    "01-原始需求/原始需求索引.md": "raw\n",
    "05-改造方案/方案提案.md": proposal, "05-改造方案/方案决策.md": decision, "06-测试方案/000-测试方案索引.md": "tests\n",
    "07-实施任务/实施任务.md": "# 实施任务\n- [x] 1.1 [verified] 完成演示\n", "specs/example/spec.md": "## ADDED Requirements\n### Requirement: Demo\n#### Scenario: Demo\n- **WHEN** x\n- **THEN** y\n",
  };
  for (const [path, content] of Object.entries(files)) write(join(change, path), content);
  write(join(change, "task-state.json"), `${JSON.stringify({ schemaVersion: 1, tasks: [{ id: "1.1", state: "verified", deliverables: ["src/app.ts"], verification: ["node --test"], evidence: ["PASS"], blocker: null, replayable: false }] }, null, 2)}\n`);
  // 说人话关在归档前的门禁上生效，所以这个能走到归档的样本必须带审读记录。
  // 审读记录绑被审文件的内容哈希（审完再改就过期），所以哈希按实际文件现算，不写死。
  // 它同时是这道关的正向对照：记录齐备、没有挂着的意见时，归档照常放行。
  write(join(change, "08-验收/验收记录.md"), "# 验收\n- 结论：PASS\n");
  const reviewTargets = ["01-原始需求/原始需求索引.md", "05-改造方案/方案提案.md", "05-改造方案/方案决策.md", "06-测试方案/000-测试方案索引.md", "specs/example/spec.md", "08-验收/验收记录.md"];
  write(join(change, "readability-review.json"), `${JSON.stringify({
    schemaVersion: 1,
    reviews: reviewTargets.map((target) => ({ target, digest: sha256File(join(change, target)), reviewedAt: "2026-08-30T11:00:00Z", reviewer: "无本仓上下文的空白会话", findings: [] })),
  }, null, 2)}`);
  let result = runTool("delivery-control.ts", ["init", "--change-root", change, "--slug", "demo-change", "--display-name", "演示", "--mode", "delivery"], { cwd: repo }); assert.equal(result.status, 0, result.stderr);
  result = runTool("delivery-control.ts", ["approval", "set", "--change-root", change, "--gate", "decision", "--decision", "approved", "--approved-by", "tester", "--runtime-root", runtimeRoot], { cwd: repo }); assert.equal(result.status, 0, result.stderr);
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
  } finally { rmSync(repo, removeOptions); }
});

test("Acceptance与Archive Readiness取代Markdown关键词并支持受控reopen", () => {
  const repo = mkdtempSync(join(tmpdir(), "delivery-lifecycle-archive-"));
  try {
    const { change, baseline, reviewed } = prepareChange(repo);
    const reviewInput = join(change, "review-input.json"); write(reviewInput, JSON.stringify({ schemaVersion: 1, baselineCommit: baseline, reviewedCommit: reviewed, reviewer: "reviewer", reviewedAt: "2026-08-30T12:00:00Z", findings: [] }));
    let result = runTool("delivery-lifecycle.ts", ["review", "write", "--change-root", change, "--file", reviewInput], { cwd: repo }); assert.equal(result.status, 0, result.stderr);
    write(join(change, "08-验收/验收记录.md"), "# 验收\n- 结论：PASS\n"); write(join(change, "08-验收/cleanup/cleanup.md"), "- 结论：PASS\n");
    const earlyAcceptanceInput = join(change, "acceptance-early.json"); write(earlyAcceptanceInput, JSON.stringify({ schemaVersion: 1, acceptedBy: "maintainer", acceptedAt: "2026-08-30T11:59:00Z" }));
    result = runTool("delivery-lifecycle.ts", ["acceptance", "write", "--change-root", change, "--file", earlyAcceptanceInput], { cwd: repo }); assert.notEqual(result.status, 0); assert.match(result.stderr, /acceptedAt.*reviewedAt/);
    const acceptanceInput = join(change, "acceptance-input.json"); write(acceptanceInput, JSON.stringify({ schemaVersion: 1, acceptedBy: "maintainer", acceptedAt: "2026-08-30T12:01:00Z" }));
    result = runTool("delivery-lifecycle.ts", ["acceptance", "write", "--change-root", change, "--file", acceptanceInput], { cwd: repo }); assert.equal(result.status, 0, result.stderr);
    const taskStatePath = join(change, "task-state.json"); const originalTaskState = readFileSync(taskStatePath, "utf8");
    write(taskStatePath, originalTaskState.replace("\"PASS\"", "\"PASS-drift\""));
    result = runTool("delivery-lifecycle.ts", ["acceptance", "inspect", "--change-root", change], { cwd: repo }); assert.notEqual(result.status, 0); assert.match(result.stderr, /stale/);
    write(taskStatePath, originalTaskState);
    write(join(change, "09-发布/发布计划.md"), "# 发布计划\nrelease-not-required\n");
    result = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "archive"], { cwd: repo }); assert.notEqual(result.status, 0); assert.match(result.stderr, /archive-readiness/);
    const delta = "openspec/changes/demo-change/specs/example/spec.md"; const main = "openspec/specs/example/spec.md"; write(join(repo, main), readFileSync(join(repo, delta), "utf8"));
    // 规范同步把增量合进了仓级长期规范，那份文件因此也落进仓级必过清单——补一条审读记录。
    // 这正是 repoMustPass 真接进门禁之后的新要求：本次改动碰过的仓级必过文件，同样要过这道关。
    const reviewFile = join(change, "readability-review.json");
    const reviewState = JSON.parse(readFileSync(reviewFile, "utf8")) as { reviews: Array<Record<string, unknown>> };
    reviewState.reviews.push({ target: main, digest: sha256File(join(repo, main)), reviewedAt: "2026-08-30T11:00:00Z", reviewer: "无本仓上下文的空白会话", findings: [] });
    write(reviewFile, JSON.stringify(reviewState, null, 2));
    const readinessInput = join(change, "readiness-input.json"); write(readinessInput, JSON.stringify({ schemaVersion: 1, specSync: [{ deltaPath: delta, mainPath: main }], strictValidation: "PASS", cleanupEvidence: "openspec/changes/demo-change/08-验收/cleanup/cleanup.md", prStarted: false, migrationSource: null, historicalPr: null }));
    write(join(change, "08-验收/cleanup/cleanup.md"), "- 结论：FAIL\n");
    result = runTool("delivery-lifecycle.ts", ["readiness", "write", "--change-root", change, "--file", readinessInput], { cwd: repo }); assert.notEqual(result.status, 0); assert.match(result.stderr, /cleanupEvidence.*PASS/);
    write(join(change, "08-验收/cleanup/cleanup.md"), "- 结论：PASS\n");
    // VC-004：归档不再索取第二次人工表态——readiness-input 不接受 attestedBy / attestedAt 两键。
    for (const key of ["attestedBy", "attestedAt"]) {
      const attestedInput = join(change, `readiness-${key}.json`);
      write(attestedInput, JSON.stringify({ ...JSON.parse(readFileSync(readinessInput, "utf8")), [key]: key === "attestedBy" ? "maintainer" : "2026-08-30T12:02:00Z" }));
      result = runTool("delivery-lifecycle.ts", ["readiness", "write", "--change-root", change, "--file", attestedInput], { cwd: repo });
      assert.notEqual(result.status, 0); assert.match(result.stderr, new RegExp(`readiness-input 存在未知字段 ${key}`));
    }
    result = runTool("delivery-lifecycle.ts", ["readiness", "write", "--change-root", change, "--file", readinessInput], { cwd: repo }); assert.equal(result.status, 0, result.stderr);
    // VC-004：attestedBy 派生自 acceptance-state.acceptedBy，attestedAt 取写入时刻且晚于 acceptedAt。
    const readinessState = JSON.parse(readFileSync(join(change, "archive-readiness.json"), "utf8"));
    const acceptanceState = JSON.parse(readFileSync(join(change, "acceptance-state.json"), "utf8"));
    assert.equal(readinessState.attestedBy, acceptanceState.acceptedBy);
    assert.ok(Date.parse(readinessState.attestedAt) > Date.parse(acceptanceState.acceptedAt));
    result = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "archive"], { cwd: repo }); assert.equal(result.status, 0, result.stderr);
    // VC-005：门禁条目一项不减——五种破坏情形 archive guard 全部非零。
    const releasePlanPath = join(change, "09-发布/发布计划.md"); const releasePlanOriginal = readFileSync(releasePlanPath, "utf8");
    write(releasePlanPath, `${releasePlanOriginal}事后追加\n`);
    result = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "archive"], { cwd: repo }); assert.notEqual(result.status, 0); assert.match(result.stderr, /release plan stale/);
    write(releasePlanPath, releasePlanOriginal);
    const prStartedInput = join(change, "readiness-pr-started.json");
    write(prStartedInput, JSON.stringify({ ...JSON.parse(readFileSync(readinessInput, "utf8")), prStarted: true }));
    result = runTool("delivery-lifecycle.ts", ["readiness", "write", "--change-root", change, "--file", prStartedInput], { cwd: repo }); assert.notEqual(result.status, 0); assert.match(result.stderr, /prStarted=false/);
    result = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "archive"], { cwd: repo }); assert.equal(result.status, 0, result.stderr);
    write(join(repo, main), "drift\n"); result = runTool("delivery-lifecycle.ts", ["readiness", "inspect", "--change-root", change], { cwd: repo }); assert.notEqual(result.status, 0); assert.match(result.stderr, /spec sync stale/); write(join(repo, main), readFileSync(join(repo, delta), "utf8"));
    git(repo, ["add", "."]); git(repo, ["commit", "-qm", "lifecycle evidence"]);
    const archiveRoot = join(repo, "openspec/changes/archive"); mkdirSync(archiveRoot, { recursive: true }); const archived = join(archiveRoot, "2026-08-30-demo-change"); renameSync(change, archived); git(repo, ["add", "."]); git(repo, ["commit", "-qm", "archive"]);
    const target = join(repo, "openspec/changes/demo-change"); result = runTool("delivery-lifecycle.ts", ["reopen", "--change-root", archived, "--target-root", target, "--reason", "PR要求行为变化", "--reopened-by", "maintainer", "--reopened-at", "2026-08-30T12:03:00Z"], { cwd: repo }); assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(target, "implementation-review.json")), false); assert.equal(existsSync(join(target, "acceptance-state.json")), false); assert.equal(existsSync(join(target, "archive-readiness.json")), false);
    const task = JSON.parse(readFileSync(join(target, "task-state.json"), "utf8")).tasks[0]; assert.equal(task.state, "implemented_unverified"); // VC-006：reopen 后既不写 reopen-state.json，也不再复制 lifecycle-history 快照目录。
    assert.equal(existsSync(join(target, "reopen-state.json")), false);
    assert.equal(existsSync(join(target, "lifecycle-history")), false);
  } finally { rmSync(repo, removeOptions); }
});

test("VC-031/VC-032 不得削弱项：Review 自算与 Acceptance 四 digest 新鲜度", () => {
  const repo = mkdtempSync(join(tmpdir(), "delivery-lifecycle-strict-"));
  try {
    const { change, baseline, reviewed } = prepareChange(repo);

    // VC-031-1：reviewedPaths 由代码自算，输入侧根本不接受该键（手工缩小被拒）。
    const shrunk = join(change, "review-shrunk.json");
    write(shrunk, JSON.stringify({ schemaVersion: 1, baselineCommit: baseline, reviewedCommit: reviewed, reviewer: "r", reviewedAt: "2026-08-30T12:00:00Z", findings: [], reviewedPaths: [] }));
    let result = runTool("delivery-lifecycle.ts", ["review", "write", "--change-root", change, "--file", shrunk], { cwd: repo });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /review-input 存在未知字段 reviewedPaths/);
    // result 同样不接受手工指定，裁决由 findings 计算。
    const forced = join(change, "review-forced.json");
    write(forced, JSON.stringify({ schemaVersion: 1, baselineCommit: baseline, reviewedCommit: reviewed, reviewer: "r", reviewedAt: "2026-08-30T12:00:00Z", findings: [], result: "PASS" }));
    result = runTool("delivery-lifecycle.ts", ["review", "write", "--change-root", change, "--file", forced], { cwd: repo });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /review-input 存在未知字段 result/);

    // VC-031-2：baseline 必须是 reviewedCommit 的祖先。
    const badBaseline = join(change, "review-bad-baseline.json");
    write(badBaseline, JSON.stringify({ schemaVersion: 1, baselineCommit: reviewed, reviewedCommit: baseline, reviewer: "r", reviewedAt: "2026-08-30T12:00:00Z", findings: [] }));
    result = runTool("delivery-lifecycle.ts", ["review", "write", "--change-root", change, "--file", badBaseline], { cwd: repo });
    assert.notEqual(result.status, 0);

    // VC-031-3：写入前实现路径必须 clean。
    write(join(repo, "src/app.ts"), "export const value = 99;\n");
    const input = join(change, "review-input.json");
    write(input, JSON.stringify({ schemaVersion: 1, baselineCommit: baseline, reviewedCommit: reviewed, reviewer: "r", reviewedAt: "2026-08-30T12:00:00Z", findings: [] }));
    result = runTool("delivery-lifecycle.ts", ["review", "write", "--change-root", change, "--file", input], { cwd: repo });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Review写入前实现路径必须clean/);
    git(repo, ["checkout", "--", "src/app.ts"]);

    // VC-031-4：OPEN finding 自动判 FAIL，且 FAIL 的 review 不能放行 acceptance guard。
    const openInput = join(change, "review-open.json");
    write(openInput, JSON.stringify({ schemaVersion: 1, baselineCommit: baseline, reviewedCommit: reviewed, reviewer: "r", reviewedAt: "2026-08-30T12:00:00Z", findings: [{ id: "REV-001", severity: "HIGH", path: "src/app.ts", line: 1, summary: "风险", status: "OPEN", resolution: null }] }));
    result = runTool("delivery-lifecycle.ts", ["review", "write", "--change-root", change, "--file", openInput], { cwd: repo });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(join(change, "implementation-review.json"), "utf8")).result, "FAIL");
    result = runTool("delivery-lifecycle.ts", ["review", "inspect", "--change-root", change], { cwd: repo });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /未PASS或存在OPEN finding/);

    // 恢复为 PASS 的 review，再验 acceptance 的四个 digest。
    result = runTool("delivery-lifecycle.ts", ["review", "write", "--change-root", change, "--file", input], { cwd: repo });
    assert.equal(result.status, 0, result.stderr);
    write(join(change, "08-验收/验收记录.md"), "# 验收\n- 结论：PASS\n");
    const acceptanceInput = join(change, "acceptance-input.json");
    write(acceptanceInput, JSON.stringify({ schemaVersion: 1, acceptedBy: "maintainer", acceptedAt: "2026-08-30T12:01:00Z" }));
    assert.equal(runTool("delivery-lifecycle.ts", ["acceptance", "write", "--change-root", change, "--file", acceptanceInput], { cwd: repo }).status, 0);
    assert.equal(runTool("delivery-lifecycle.ts", ["acceptance", "inspect", "--change-root", change], { cwd: repo }).status, 0);

    // VC-032：四个 digest 任一对应工件事后改动即 stale。
    const targets: Array<[string, string]> = [
      ["implementation-review.json", "reviewDigest"],
      ["task-state.json", "taskStateDigest"],
      ["08-验收/验收记录.md", "acceptanceDigest"],
    ];
    for (const [file, label] of targets) {
      const path = join(change, file);
      const original = readFileSync(path, "utf8");
      write(path, `${original}\n<!-- drift -->\n`);
      const inspected = runTool("delivery-lifecycle.ts", ["acceptance", "inspect", "--change-root", change], { cwd: repo });
      assert.notEqual(inspected.status, 0, `${label} 事后改动未被判 stale`);
      write(path, original);
    }
    // 第四个 digest：implementationCommit 绑定——新提交后 review 立即 stale，acceptance 随之失效。
    write(join(repo, "src/app.ts"), "export const value = 2;\n");
    git(repo, ["add", "."]); git(repo, ["commit", "-qm", "post-acceptance drift"]);
    const drifted = runTool("delivery-lifecycle.ts", ["acceptance", "inspect", "--change-root", change], { cwd: repo });
    assert.notEqual(drifted.status, 0); assert.match(drifted.stderr, /stale/);
  } finally { rmSync(repo, removeOptions); }
});

/**
 * T-04（INT-20260901-021 之二）
 *
 * 长期规范目录此前被整体排除在「实现改动」之外，于是实施提交里绕过增量链路直接写长期规范时，
 * 评审在结构上看不见——上一单真的发生过一次，46 行长期规范被直接写入。
 * 修法要分两种情形：实施区间里的直接改动必须进评审范围；评审之后由规范同步站写的不算漂移。
 */
test("T-04.1/T-04.2 实施提交里直接改长期规范时评审看得见，同步站事后写入不算漂移", () => {
  const repo = mkdtempSync(join(tmpdir(), "delivery-review-specs-"));
  try {
    const { change, baseline } = prepareChange(repo);
    // 在实施提交之后，再补一笔「绕过增量链路直接写长期规范」的改动，并提交。
    write(join(repo, "openspec/specs/example/spec.md"), "## ADDED Requirements\n### Requirement: 直接写进来的\n#### Scenario: X\n- **WHEN** a\n- **THEN** b\n");
    git(repo, ["add", "."]); git(repo, ["commit", "-qm", "sneak long-term spec into implementation"]);
    const reviewed = git(repo, ["rev-parse", "HEAD"]);

    const input = join(change, "review-input.json");
    write(input, JSON.stringify({ schemaVersion: 1, baselineCommit: baseline, reviewedCommit: reviewed, reviewer: "reviewer", reviewedAt: "2026-09-01T12:00:00Z", findings: [] }));
    const result = runTool("delivery-lifecycle.ts", ["review", "write", "--change-root", change, "--file", input], { cwd: repo });
    assert.equal(result.status, 0, result.stderr);
    const review = JSON.parse(readFileSync(join(change, "implementation-review.json"), "utf8")) as { reviewedPaths: Array<{ path: string }> };
    const paths = review.reviewedPaths.map((item) => item.path);
    // T-04.1：直接写进长期规范的那一笔必须出现在被审路径里。
    assert.ok(paths.includes("openspec/specs/example/spec.md"), `长期规范的直接改动没有进评审范围: ${paths.join(", ")}`);
    // T-04.2：Change 目录自身仍然被排除——它是治理产物，不是实现改动。
    assert.ok(!paths.some((path) => path.startsWith("openspec/changes/demo-change/")), `Change 目录自身不该进评审范围: ${paths.join(", ")}`);

    // 评审之后规范同步站再写长期规范，不得让已完成的评审失效——那是流程自己的收尾动作，
    // 它的完整性由归档就绪记录里的增量与主规范哈希对绑定另行守住。
    write(join(repo, "openspec/specs/example/spec.md"), "## ADDED Requirements\n### Requirement: 同步站合入的\n#### Scenario: X\n- **WHEN** a\n- **THEN** b\n");
    const afterSync = runTool("delivery-lifecycle.ts", ["review", "inspect", "--change-root", change], { cwd: repo });
    assert.equal(afterSync.status, 0, `同步站写长期规范后评审被误判为过期: ${afterSync.stderr}`);

    // T-04.2：把规范同步**提交**掉再查，同样不得让评审过期。两侧判据必须一致——
    // 只排除工作树那一侧，「先提交同步、再跑归档门禁」这条顺序就会拿到一句不该出现的过期。
    git(repo, ["add", "openspec/specs"]);
    git(repo, ["commit", "-qm", "spec sync"]);
    const afterCommit = runTool("delivery-lifecycle.ts", ["review", "inspect", "--change-root", change], { cwd: repo });
    assert.equal(afterCommit.status, 0, `提交规范同步后评审被误判为过期: ${afterCommit.stderr}`);

    // 但改实现代码仍然让评审过期——放行同步站不得把漂移检查一并放开。
    write(join(repo, "src/app.ts"), "export const value = 99;\n");
    const drifted = runTool("delivery-lifecycle.ts", ["review", "inspect", "--change-root", change], { cwd: repo });
    assert.notEqual(drifted.status, 0);
    assert.match(drifted.stderr, /stale/);
  } finally { rmSync(repo, removeOptions); }
});
