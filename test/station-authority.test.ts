import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createArtifactTree, runTool, runtimeRoot, removeOptions } from "./helpers.ts";

// 交付 7 站的权威定义是真门禁代码（delivery-control.ts guard + delivery-lifecycle.ts）。
// 本文件逐站构造「仅缺该站维护者表态字段」的 fixture，只经由真门禁的进程退出码判定
// 「该站是否索取人工表态」，再与 delivery-change-v1.json 的 humanJudgment 比对。
//
// 禁止事项（VC-003）：本文件不得出现第二份「哪些站需要人工判断」的清单。probe 只负责
// 「怎么抹掉该站的人工表态」和「跑哪个真命令」，不得声明该站的期望布尔值；判定值一律
// 由 status !== 0 产生。末尾的 VC-003 断言会对本文件源码做结构检查兜底。

const profilePath = join(runtimeRoot, "openspec/profiles/delivery-change-v1.json");
const proposal = "# 方案提案\n## 候选 A：简单\n## 候选 B：严格\n## Trade-off 矩阵\n## 推荐\n## 未决问题\n";
const approvedDecision = "# 方案决策\n- 状态：APPROVED\n- 选择：B\n- 决策人：maintainer\n- 决策时间：2026-08-30\n## 接受的后果\n## 拒绝方案\n";
const artifacts = ["raw-requirements", "specs", "current-state", "solution-proposal", "solution-decision", "change-plan", "test-plan", "tasks"];
const deltaSpec = "openspec/changes/demo-change/specs/example/spec.md";
const mainSpec = "openspec/specs/example/spec.md";

type Fixture = { repo: string; change: string; baseline: string; reviewed: string };

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}
function git(root: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function approve(fixture: Fixture, artifact: string): void {
  const result = runTool("delivery-control.ts", ["approval", "set", "--change-root", fixture.change, "--artifact", artifact, "--decision", "approved", "--approved-by", "maintainer"], { cwd: fixture.repo });
  assert.equal(result.status, 0, result.stderr);
}

/** 建立一个能走到 archive 的完整最小 Change：全部工件已批准、实现已提交、验收正文已写。 */
function prepare(repo: string): Fixture {
  git(repo, ["init", "-q", "-b", "master"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test"]);
  write(join(repo, "base.txt"), "base\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "base"]);
  const baseline = git(repo, ["rev-parse", "HEAD"]);
  const change = join(repo, "openspec/changes/demo-change");
  createArtifactTree(change);
  const files: Record<string, string> = {
    "01-原始需求/原始需求索引.md": "raw\n",
    "03-现状/现状.md": "current\n",
    "05-改造方案/方案提案.md": proposal,
    "05-改造方案/方案决策.md": approvedDecision,
    "05-改造方案/改造方案.md": "plan\n",
    "06-测试方案/000-测试方案索引.md": "tests\n",
    "07-实施任务/实施任务.md": "# 实施任务\n- [x] 1.1 [verified] 完成演示\n",
    "specs/example/spec.md": "## ADDED Requirements\n### Requirement: Demo\n#### Scenario: Demo\n- **WHEN** x\n- **THEN** y\n",
    "08-验收/验收记录.md": "# 验收\n- 结论：PASS\n",
    "08-验收/cleanup/cleanup.md": "- 结论：PASS\n",
    "09-发布/发布计划.md": "# 发布计划\nrelease-not-required\n",
  };
  for (const [path, content] of Object.entries(files)) write(join(change, path), content);
  write(join(change, "task-state.json"), `${JSON.stringify({ schemaVersion: 1, tasks: [{ id: "1.1", state: "verified", deliverables: ["src/app.ts"], verification: ["node --test"], evidence: ["08-验收/验收记录.md"], blocker: null }] }, null, 2)}\n`);
  write(join(repo, mainSpec), readFileSync(join(change, "specs/example/spec.md"), "utf8"));
  const init = runTool("delivery-control.ts", ["init", "--change-root", change, "--slug", "demo-change", "--display-name", "演示", "--mode", "delivery"], { cwd: repo });
  assert.equal(init.status, 0, init.stderr);
  const fixture: Fixture = { repo, change, baseline, reviewed: "" };
  for (const artifact of artifacts) approve(fixture, artifact);
  write(join(repo, "src/app.ts"), "export const value = 1;\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "implementation"]);
  fixture.reviewed = git(repo, ["rev-parse", "HEAD"]);
  return fixture;
}

/** review 站的收口：verdict（result）由 findings 计算，输入侧没有人工裁决键。 */
function writeReview(fixture: Fixture): ReturnType<typeof runTool> {
  const input = join(fixture.change, "review-input.json");
  write(input, JSON.stringify({ schemaVersion: 1, baselineCommit: fixture.baseline, reviewedCommit: fixture.reviewed, reviewer: "agent", reviewedAt: "2026-08-30T12:00:00Z", findings: [] }));
  return runTool("delivery-lifecycle.ts", ["review", "write", "--change-root", fixture.change, "--file", input], { cwd: fixture.repo });
}
function writeAcceptance(fixture: Fixture, input: Record<string, unknown>): ReturnType<typeof runTool> {
  const path = join(fixture.change, "acceptance-input.json");
  write(path, JSON.stringify(input));
  return runTool("delivery-lifecycle.ts", ["acceptance", "write", "--change-root", fixture.change, "--file", path], { cwd: fixture.repo });
}
function writeReadiness(fixture: Fixture, extra: Record<string, unknown>): ReturnType<typeof runTool> {
  const path = join(fixture.change, "readiness-input.json");
  write(path, JSON.stringify({
    schemaVersion: 1,
    specSync: [{ deltaPath: deltaSpec, mainPath: mainSpec }],
    strictValidation: "PASS",
    cleanupEvidence: "openspec/changes/demo-change/08-验收/cleanup/cleanup.md",
    prStarted: false,
    migrationSource: null,
    historicalPr: null,
    ...extra,
  }));
  return runTool("delivery-lifecycle.ts", ["readiness", "write", "--change-root", fixture.change, "--file", path], { cwd: fixture.repo });
}

// 每个 probe：先把该站的维护者表态字段抹掉，再跑该站的真实收口命令，返回退出码。
// probe 内不出现任何期望值。
const probes: Array<{ station: string; probe: (fixture: Fixture) => number }> = [
  {
    station: "proposal",
    probe: (fixture) => runTool("delivery-control.ts", ["guard", "--change-root", fixture.change, "--operation", "apply"], { cwd: fixture.repo }).status ?? 1,
  },
  {
    station: "decision",
    probe: (fixture) => {
      // 抹掉维护者在方案决策上的表态（状态：APPROVED / 决策人），并重新批准以刷新 digest，
      // 使失败原因只可能来自「缺表态」，而不是「批准过期」。
      const path = join(fixture.change, "05-改造方案/方案决策.md");
      write(path, readFileSync(path, "utf8").replace("- 状态：APPROVED\n", "").replace("- 决策人：maintainer\n", ""));
      approve(fixture, "solution-decision");
      return runTool("delivery-control.ts", ["guard", "--change-root", fixture.change, "--operation", "apply"], { cwd: fixture.repo }).status ?? 1;
    },
  },
  {
    station: "implementation",
    probe: (fixture) => runTool("delivery-control.ts", ["guard", "--change-root", fixture.change, "--operation", "verify"], { cwd: fixture.repo }).status ?? 1,
  },
  {
    station: "review",
    probe: (fixture) => writeReview(fixture).status ?? 1,
  },
  {
    station: "acceptance",
    probe: (fixture) => {
      assert.equal(writeReview(fixture).status, 0);
      // 抹掉维护者在验收上的表态字段 acceptedBy。
      return writeAcceptance(fixture, { schemaVersion: 1, acceptedAt: "2026-08-30T12:01:00Z" }).status ?? 1;
    },
  },
  {
    station: "sync",
    probe: (fixture) => {
      assert.equal(writeReview(fixture).status, 0);
      assert.equal(writeAcceptance(fixture, { schemaVersion: 1, acceptedBy: "maintainer", acceptedAt: "2026-08-30T12:01:00Z" }).status, 0);
      return runTool("delivery-control.ts", ["guard", "--change-root", fixture.change, "--operation", "sync"], { cwd: fixture.repo }).status ?? 1;
    },
  },
  {
    station: "archive",
    probe: (fixture) => {
      assert.equal(writeReview(fixture).status, 0);
      assert.equal(writeAcceptance(fixture, { schemaVersion: 1, acceptedBy: "maintainer", acceptedAt: "2026-08-30T12:01:00Z" }).status, 0);
      // 抹掉维护者在归档上的表态字段 attestedBy。
      return writeReadiness(fixture, {}).status ?? 1;
    },
  },
];

/** 逐站跑真门禁，返回 station -> 是否索取人工表态（唯一取值来源是退出码）。 */
function observeStations(): Record<string, boolean> {
  const observed: Record<string, boolean> = {};
  for (const { station, probe } of probes) {
    const repo = mkdtempSync(join(tmpdir(), `station-${station}-`));
    try {
      observed[station] = probe(prepare(repo)) !== 0;
    } finally {
      rmSync(repo, removeOptions);
    }
  }
  return observed;
}
/** 与 profile 的 humanJudgment 逐站比对，返回不一致的站位名。 */
function mismatchedStations(observed: Record<string, boolean>, profile: { stages: Array<{ id: string; humanJudgment: boolean }> }): string[] {
  const mismatched = profile.stages.filter((stage) => observed[stage.id] !== stage.humanJudgment).map((stage) => stage.id);
  for (const station of Object.keys(observed)) if (!profile.stages.some((stage) => stage.id === station)) mismatched.push(station);
  return mismatched.sort();
}

test("VC-001/VC-002 交付站位的人工表态行为由真门禁裁定，profile 单边修改即被拒绝", () => {
  const profile = JSON.parse(readFileSync(profilePath, "utf8")) as { stages: Array<{ id: string; humanJudgment: boolean }> };
  const observed = observeStations();

  // VC-001：现状 fixture 下逐站探针结论与 profile 的 humanJudgment 全等。
  assert.equal(Object.keys(observed).length, profile.stages.length, `探针站位数与 profile 站位数不一致: ${Object.keys(observed).join(",")}`);
  assert.deepEqual(mismatchedStations(observed, profile), [], `真门禁行为与 profile humanJudgment 分叉: ${JSON.stringify(observed)}`);

  // VC-002：把 profile 的 archive 单边改回 true，一致性检查必须非零并列出不一致站位名。
  const tamperedArchive = { stages: profile.stages.map((stage) => (stage.id === "archive" ? { ...stage, humanJudgment: true } : stage)) };
  assert.deepEqual(mismatchedStations(observed, tamperedArchive), ["archive"]);
  // 另一侧单边改动同样被抓住。
  const tamperedReview = { stages: profile.stages.map((stage) => (stage.id === "review" ? { ...stage, humanJudgment: true } : stage)) };
  assert.deepEqual(mismatchedStations(observed, tamperedReview), ["review"]);
  const tamperedBoth = { stages: profile.stages.map((stage) => (["archive", "review"].includes(stage.id) ? { ...stage, humanJudgment: true } : stage)) };
  assert.deepEqual(mismatchedStations(observed, tamperedBoth), ["archive", "review"]);
  // 删站也算分叉。
  assert.deepEqual(mismatchedStations(observed, { stages: profile.stages.filter((stage) => stage.id !== "sync") }), ["sync"]);
});

test("VC-003 一致性测试不得靠两侧互抄实现", () => {
  const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const stations = (JSON.parse(readFileSync(profilePath, "utf8")) as { stages: Array<{ id: string }> }).stages.map((stage) => stage.id);

  // 取值区 = 从文件头到 mismatchedStations 之前，即「观测值是怎么来的」的全部代码。
  // 这一段里如果出现任何站位到布尔的硬编码映射，就说明结论不是跑出来的而是抄出来的。
  // （其后的 VC-002 段落刻意构造 humanJudgment 被单边改动的 profile 作为负向对照，
  //   属于被测输入而非取值来源，故不在检查范围内。）
  const observationRegion = source.slice(0, source.indexOf("/** 与 profile 的 humanJudgment 逐站比对"));

  for (const station of stations) {
    assert.doesNotMatch(observationRegion, new RegExp(`["']?${station}["']?\\s*:\\s*(true|false)\\b`), `发现硬编码的站位人工判断标记: ${station}`);
  }
  // 取值区内不得自行给 humanJudgment 赋值。
  assert.doesNotMatch(observationRegion, /humanJudgment\s*[:=]\s*(true|false)/);
  // 取值区内不得读取 profile：探针不能从被比对方反读期望值。
  assert.doesNotMatch(observationRegion.slice(observationRegion.indexOf("const probes:")), /profile/);
  // 判定值的唯一来源是真门禁的进程退出码。
  assert.match(observationRegion, /observed\[station\] = probe\(prepare\(repo\)\) !== 0/);
  // 每个 probe 都必须真的去跑一个门禁进程（runTool），不得凭空返回常量。
  const probeEntries = observationRegion.slice(observationRegion.indexOf("const probes:")).split(/station: "/).slice(1);
  assert.equal(probeEntries.length, stations.length);
  for (const entry of probeEntries) assert.match(entry, /runTool\(|write(Review|Acceptance|Readiness)\(/);
});
