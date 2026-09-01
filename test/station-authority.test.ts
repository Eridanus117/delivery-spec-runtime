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
const artifacts = ["raw-requirements", "specs", "solution-proposal", "solution-decision", "test-plan", "tasks"];
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
/**
 * 按门批准一次：批准记录第 2 版按「人真实表态一次记一条」记，一条覆盖当时的全部工件。
 * `extra` 用于已有批准之后的复签：改动了方案决策这种带语义的内容，正确出口是重新取得人工表态，
 * 而不是搭机械回填的车（REV-004）。
 */
function approve(fixture: Fixture, extra: string[] = []): void {
  const result = runTool("delivery-control.ts", ["approval", "set", "--change-root", fixture.change, "--gate", "decision", "--decision", "approved", "--approved-by", "maintainer", "--runtime-root", runtimeRoot, ...extra], { cwd: fixture.repo });
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
  write(join(change, "task-state.json"), `${JSON.stringify({ schemaVersion: 1, tasks: [{ id: "1.1", state: "verified", deliverables: ["src/app.ts"], verification: ["node --test"], evidence: ["08-验收/验收记录.md"], blocker: null, replayable: false }] }, null, 2)}\n`);
  write(join(repo, mainSpec), readFileSync(join(change, "specs/example/spec.md"), "utf8"));
  const init = runTool("delivery-control.ts", ["init", "--change-root", change, "--slug", "demo-change", "--display-name", "演示", "--mode", "delivery"], { cwd: repo });
  assert.equal(init.status, 0, init.stderr);
  const fixture: Fixture = { repo, change, baseline, reviewed: "" };
  approve(fixture);
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
/**
 * 逐站探针（T-08.3 / T-08.4，收口 INT-20260901-021 之一）。
 *
 * 旧写法的毛病是「每站抹哪个字段」由人手挑：七站里只有三站真的抹了维护者表态，另外四站直接拿
 * 完整 fixture 去跑。**那个手工选择本身就编码了答案**——挑字段的人已经知道哪几站要人表态。
 *
 * 现在改成：先把「完整 fixture 里一共有哪几处维护者表态」列成一张清单，再由每个站**认领**
 * 属于自己的那几处；跑探针时只抹该站认领的那几处。清单与认领关系分开写，并由一条对账断言
 * 保证**每一处表态都被恰好一个站认领**——落单的表态会当场被抓出来，所以不能靠「把某处表态
 * 从清单里漏掉」来蒙混。认领关系本身也不能随意搬：把「方案已批准」这处搬给别的站，
 * 那个站就会被观测成人工判断站，随即与站位定义分叉而失败。
 *
 * 另配一条活性对照：同样七站，拿**表态齐全**的 fixture 再跑一遍，全部必须放行。它证明探针
 * 确实跑到了各站的真逻辑——否则某站可能因为别的原因恒为非零，而「恒为非零」会被误读成
 * 「这一站要人表态」。
 */
type Attestation = "decision-approved" | "decision-by" | "accepted-by";
/** 完整 fixture 里一共有这几处维护者表态。对账断言会检查它们逐处都被认领。 */
const allAttestations: Attestation[] = ["decision-approved", "decision-by", "accepted-by"];
/** 每处表态在完整 fixture 里长什么样，用于对账时确认它确实存在。 */
const attestationMarkers: Record<Attestation, { where: "decision-doc" | "acceptance-input"; text: string }> = {
  "decision-approved": { where: "decision-doc", text: "- 状态：APPROVED\n" },
  "decision-by": { where: "decision-doc", text: "- 决策人：maintainer\n" },
  "accepted-by": { where: "acceptance-input", text: "acceptedBy" },
};

function writeAcceptance(fixture: Fixture, erased: Attestation[]): ReturnType<typeof runTool> {
  const path = join(fixture.change, "acceptance-input.json");
  const input: Record<string, unknown> = { schemaVersion: 1, acceptedAt: "2026-08-30T12:01:00Z" };
  if (!erased.includes("accepted-by")) input.acceptedBy = "maintainer";
  write(path, JSON.stringify(input));
  return runTool("delivery-lifecycle.ts", ["acceptance", "write", "--change-root", fixture.change, "--file", path], { cwd: fixture.repo });
}
function writeReadiness(fixture: Fixture): ReturnType<typeof runTool> {
  const path = join(fixture.change, "readiness-input.json");
  write(path, JSON.stringify({
    schemaVersion: 1,
    specSync: [{ deltaPath: deltaSpec, mainPath: mainSpec }],
    strictValidation: "PASS",
    cleanupEvidence: "openspec/changes/demo-change/08-验收/cleanup/cleanup.md",
    prStarted: false,
    migrationSource: null,
    historicalPr: null,
  }));
  return runTool("delivery-lifecycle.ts", ["readiness", "write", "--change-root", fixture.change, "--file", path], { cwd: fixture.repo });
}
/** 抹掉方案决策文档里被点名的那几处表态，抹完重签批准以刷新内容哈希——好让失败只可能来自缺表态。 */
function eraseFromDecisionDoc(fixture: Fixture, erased: Attestation[]): void {
  const targets = erased.filter((item) => attestationMarkers[item].where === "decision-doc");
  if (!targets.length) return;
  const path = join(fixture.change, "05-改造方案/方案决策.md");
  let body = readFileSync(path, "utf8");
  for (const item of targets) body = body.replace(attestationMarkers[item].text, "");
  write(path, body);
  // 抹表态是对方案决策的语义改动，所以走「重新取得表态」而不是「机械刷新」。
  approve(fixture, ["--new-attestation", "探针：抹掉该站的维护者表态后重新签发，使失败只可能来自缺表态"]);
}
const guardStatus = (fixture: Fixture, operation: string) => runTool("delivery-control.ts", ["guard", "--change-root", fixture.change, "--operation", operation], { cwd: fixture.repo }).status ?? 1;

// 每个 probe 只做两件事：声明本站认领哪几处表态，以及跑本站的真实收口命令。
// probe 内不出现任何期望布尔值。
const probes: Array<{ station: string; owns: Attestation[]; probe: (fixture: Fixture, erased: Attestation[]) => number }> = [
  { station: "proposal", owns: [], probe: (fixture) => guardStatus(fixture, "apply") },
  { station: "decision", owns: ["decision-approved", "decision-by"], probe: (fixture) => guardStatus(fixture, "apply") },
  { station: "implementation", owns: [], probe: (fixture) => guardStatus(fixture, "verify") },
  { station: "review", owns: [], probe: (fixture) => writeReview(fixture).status ?? 1 },
  {
    station: "acceptance",
    owns: ["accepted-by"],
    probe: (fixture, erased) => {
      assert.equal(writeReview(fixture).status, 0);
      return writeAcceptance(fixture, erased).status ?? 1;
    },
  },
  {
    station: "sync",
    owns: [],
    probe: (fixture) => {
      assert.equal(writeReview(fixture).status, 0);
      assert.equal(writeAcceptance(fixture, []).status, 0);
      return guardStatus(fixture, "sync");
    },
  },
  {
    station: "archive",
    owns: [],
    probe: (fixture) => {
      assert.equal(writeReview(fixture).status, 0);
      assert.equal(writeAcceptance(fixture, []).status, 0);
      return writeReadiness(fixture).status ?? 1;
    },
  },
];

/** 逐站跑真门禁。取值的唯一来源是退出码。`erase` 为真时抹掉该站认领的表态。 */
function runStations(erase: boolean): Record<string, number> {
  const result: Record<string, number> = {};
  for (const { station, owns, probe } of probes) {
    const repo = mkdtempSync(join(tmpdir(), `station-${station}-`));
    try {
      const fixture = prepare(repo);
      const erased = erase ? owns : [];
      eraseFromDecisionDoc(fixture, erased);
      result[station] = probe(fixture, erased);
    } finally {
      rmSync(repo, removeOptions);
    }
  }
  return result;
}
function observeStations(): Record<string, boolean> {
  const observed: Record<string, boolean> = {};
  for (const [station, status] of Object.entries(runStations(true))) observed[station] = status !== 0;
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
  assert.match(observationRegion, /result\[station\] = probe\(fixture, erased\)/);
  assert.match(observationRegion, /observed\[station\] = status !== 0/);
  // 每个 probe 都必须真的去跑一个门禁进程（runTool），不得凭空返回常量。
  const probeEntries = observationRegion.slice(observationRegion.indexOf("const probes:")).split(/station: "/).slice(1);
  assert.equal(probeEntries.length, stations.length);
  for (const entry of probeEntries) assert.match(entry, /guardStatus\(|write(Review|Acceptance|Readiness)\(/);
});

/**
 * T-08.1（INT-20260901-020 收口）
 *
 * 此前批准模型与站位模型各说各话：批准模型要八份工件都持人工批准才放行实施，站位模型却写着
 * 实施站是机器站；测试方案在交付站位里根本没有对应的站，却同样被索取人工表态。两份清单各说
 * 各话时，agent 按哪一份都能给自己找到依据。
 *
 * 现在唯一真源是站位定义：humanJudgment 为真的站，各自用 approvalRecord 声明表态记在哪里。
 * 本断言从两侧夹：一侧读站位定义算出应有的门，另一侧看真门禁实际认哪些门。
 */
test("T-08.1 需要人工批准的门由站位定义推导，不存在第二份清单", () => {
  const profile = JSON.parse(readFileSync(profilePath, "utf8")) as { stages: Array<{ id: string; humanJudgment: boolean; approvalRecord?: string }> };
  const humanStations = profile.stages.filter((stage) => stage.humanJudgment).map((stage) => stage.id);
  // 每个人工判断站都必须说清自己的表态记在哪；不说就等于又留了一处「按哪份清单都行」。
  for (const stage of profile.stages) {
    if (stage.humanJudgment) assert.ok(stage.approvalRecord, `人工判断站 ${stage.id} 没有声明表态记在哪`);
    else assert.equal(stage.approvalRecord, undefined, `机器站 ${stage.id} 不该声明表态落点`);
  }
  const expectedGates = profile.stages.filter((stage) => stage.approvalRecord === "artifact-approvals").map((stage) => stage.id);
  assert.ok(expectedGates.length > 0);
  // 落在别处的门也必须真的落在别处——验收门的表态在 acceptance-state.json 里，不在批准记录里。
  assert.ok(profile.stages.some((stage) => stage.approvalRecord === "acceptance-state"), "没有任何门把表态记进验收状态");
  assert.equal(humanStations.length, expectedGates.length + profile.stages.filter((stage) => stage.approvalRecord === "acceptance-state").length);

  // 真门禁那一侧：用站位定义算出来的门名去批准，必须被接受；表外的门名必须被拒绝并报出可用的门。
  const repo = mkdtempSync(join(tmpdir(), "station-gate-"));
  try {
    const fixture = prepare(repo);
    for (const gate of expectedGates) {
      const ok = runTool("delivery-control.ts", ["approval", "set", "--change-root", fixture.change, "--gate", gate, "--decision", "approved", "--approved-by", "maintainer", "--new-attestation", "用例：确认这个门名被门禁接受", "--runtime-root", runtimeRoot], { cwd: repo });
      assert.equal(ok.status, 0, `站位定义算出的门 ${gate} 竟然不被门禁接受: ${ok.stderr}`);
    }
    const bogus = runTool("delivery-control.ts", ["approval", "set", "--change-root", fixture.change, "--gate", "implementation", "--decision", "approved", "--approved-by", "maintainer", "--new-attestation", "用例：机器站不该能当人工批准门", "--runtime-root", runtimeRoot], { cwd: repo });
    assert.notEqual(bogus.status, 0, "机器站竟然可以作为人工批准门");
    assert.match(bogus.stderr, /未知的人工批准门/);
    for (const gate of expectedGates) assert.match(bogus.stderr, new RegExp(gate));
  } finally { rmSync(repo, removeOptions); }

  // 不得存在第二份清单：门的来源必须是站位定义文件本身，而不是代码里的一个字面量数组。
  const source = readFileSync(join(runtimeRoot, "openspec/tools/delivery-control.ts"), "utf8");
  assert.ok(source.includes("openspec/profiles/delivery-change-v1.json"), "门禁没有从站位定义推导门，说明真源不止一处");
  for (const gate of expectedGates) {
    // 门名只能来自站位定义：代码里不得出现针对某个门名的硬编码比较。
    assert.ok(!source.includes(`gate === "${gate}"`), `门禁代码里对门名做了硬编码比较: ${gate}`);
  }
});

/**
 * T-08.3/T-08.4 探针补强（INT-20260901-021 之一）。
 *
 * 旧写法七站里只有三站真的抹了维护者表态，另外四站直接拿完整 fixture 去跑；「每站抹哪个字段」
 * 这个手工选择本身就编码了答案。这里从两侧补上：
 *
 * - **对账**：完整 fixture 里的每一处维护者表态，都必须被恰好一个站认领。落单的表态会被抓出来，
 *   所以不能靠「把某处表态从清单里漏掉」让某个站显得不需要人表态。
 * - **活性**：表态齐全时七站必须全部放行。否则某站可能因为别的原因恒为非零，
 *   而「恒为非零」会被误读成「这一站要人表态」。
 */
test("T-08.3 每一处维护者表态都被恰好一个站认领，没有落单的", () => {
  const claimed = probes.flatMap((entry) => entry.owns);
  assert.equal(new Set(claimed).size, claimed.length, `同一处表态被多个站认领: ${claimed.join(", ")}`);
  assert.deepEqual([...claimed].sort(), [...allAttestations].sort(), "有表态没被任何站认领，或认领了清单外的表态");

  // 清单不是凭空写的：每一处都要能在完整 fixture 里找到。
  const repo = mkdtempSync(join(tmpdir(), "station-attest-"));
  try {
    const fixture = prepare(repo);
    const decisionDoc = readFileSync(join(fixture.change, "05-改造方案/方案决策.md"), "utf8");
    for (const item of allAttestations) {
      const marker = attestationMarkers[item];
      if (marker.where === "decision-doc") assert.ok(decisionDoc.includes(marker.text), `完整 fixture 里找不到这处表态: ${item}`);
      else {
        // 输入型表态：带上它写入成功，去掉它必须被拒——证明这处表态确实是被消费的。
        assert.equal(writeReview(fixture).status, 0);
        assert.equal(writeAcceptance(fixture, []).status, 0, `带表态时写入应当成功: ${item}`);
        assert.notEqual(writeAcceptance(fixture, [item]).status, 0, `去掉这处表态却仍然放行: ${item}`);
      }
    }
  } finally { rmSync(repo, removeOptions); }
});

test("T-08.4 活性对照：表态齐全时七站全部放行", () => {
  const statuses = runStations(false);
  const stations = (JSON.parse(readFileSync(profilePath, "utf8")) as { stages: Array<{ id: string }> }).stages.map((stage) => stage.id);
  assert.deepEqual(Object.keys(statuses).sort(), [...stations].sort(), "探针站位与站位定义对不上");
  for (const [station, status] of Object.entries(statuses)) {
    assert.equal(status, 0, `表态齐全时 ${station} 仍然非零——探针可能压根没跑到这一站的真逻辑，退出码来自别的原因`);
  }
});
