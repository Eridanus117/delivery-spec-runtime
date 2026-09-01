import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runTool, runtimeRoot, removeOptions } from "./helpers.ts";

function root(): string { return mkdtempSync(join(tmpdir(), "delivery-intake-")); }
function file(rootPath: string): string { return join(rootPath, "openspec/intake/INT-20260830-001-test.md"); }
function complete(rootPath: string): void {
  mkdirSync(join(rootPath, "openspec/intake"), { recursive: true });
  writeFileSync(file(rootPath), `---\nschemaVersion: 1\nid: INT-20260830-001-test\nstate: captured\nphase: capture\nsource: synthetic\ncapturedAt: 2026-08-30\npromotedTo: null\n---\n\n# Intake\n\n## 原始问题\n\nsynthetic issue\n\n## Triage\n\n范围：synthetic\n影响：synthetic\n判断：continue\n\n## Evidence\n\n### 已知事实\n\nfact\n\n### 未知与假设\n\nunknown\n\n### 证据\n\nsynthetic evidence\n\n## Options\n\n### 候选处置\n\nuse-existing\n\n## Disposition\n\n决定：promote\n理由：synthetic\n下一步：synthetic\n\n## History\n\n`, "utf8");
}
function invoke(rootPath: string, args: string[]) { return runTool("intake-control.ts", ["--intake-root", rootPath, ...args]); }

const intakeId = "INT-20260830-001-test";
const intakeRelative = `openspec/intake/${intakeId}.md`;
/** 路由表测试数据内联最小集，不复制仓内 change-routing-v1.json，避免形成第二份会漂移的数据。 */
const minimalRouting = {
  schemaVersion: 1,
  routingVersion: "v1.0.0",
  unmatched: { profileId: "delivery-change", requiresAnalysis: true, analysisProfileId: "requirement-analysis", rank: 99, reason: "未匹配取最重档" },
  routes: [
    { changeObject: "tool-code", displayName: "工具代码", description: "改工具行为", profileId: "delivery-change", requiresAnalysis: true, analysisProfileId: "requirement-analysis", rank: 20, pathPrefixes: ["openspec/tools/", "test/"], reason: "门禁执行体" },
    { changeObject: "doc-expression", displayName: "文档表达", description: "只改说明面", profileId: "light-change", requiresAnalysis: false, rank: 10, pathPrefixes: ["docs/"], reason: "零风险" },
    { changeObject: "ledger-only", displayName: "纯事项记录", description: "只改事项记录条目", profileId: "light-change", requiresAnalysis: false, rank: 0, promotable: false, pathPrefixes: ["openspec/intake/"], reason: "自指循环" },
  ],
};
function makeRuntimeRoot(routing: unknown = minimalRouting): string {
  const runtimePath = mkdtempSync(join(tmpdir(), "delivery-routing-"));
  mkdirSync(join(runtimePath, "openspec/profiles"), { recursive: true });
  writeFileSync(join(runtimePath, "openspec/profiles/change-routing-v1.json"), JSON.stringify(routing), "utf8");
  return runtimePath;
}
function analysisDir(rootPath: string, id = intakeId): string { return join(rootPath, "openspec/intake/analysis", id); }

const analysisStages = ["capture", "clarify", "discover", "evaluate", "decision"];
/** requirement-analysis profile 的一份完整合法输入，用于真实跑完分析线。 */
function analysisRequest(id: string, disposition: string, completedStages: string[]): Record<string, unknown> {
  return {
    schemaVersion: 1,
    matterId: id,
    binding: { schemaVersion: 1, profileId: "requirement-analysis", profileVersion: "v1.0.0" },
    inputs: {
      request: "synthetic request",
      problemFrame: { problem: "p", goals: "g", scope: "s", constraints: "c" },
      capabilityReport: { known: "k", unknown: "u", evidence: "e", confidence: "high" },
      optionReport: { options: "o", tradeoffs: "t", investment: "i", risk: "r", reversible: "yes" },
      decisionReport: { decision: disposition, rationale: "r", risks: "x", nextStep: "n" },
      disposition,
      candidateProfileId: "delivery-change",
      analysisRounds: [{ round: 1, stage: "clarify", known: "k", unknown: "u", evidence: "e", confidence: "high", judgment: "sufficient", decision: "go" }],
    },
    judgments: { clarify: "sufficient", discover: "sufficient", evaluate: "sufficient", decision: disposition },
    completedStages,
  };
}
/**
 * 分析线产物一律由真实的 workflow-control bind/run 生成，禁止手写。
 * 手写产物会让立项门与分析线在「生产者/消费者」维度互抄——正是 VC-003 要根除的形态，
 * 且已经真的漏掉过一次生产者产出 outputs.publishedInputs.disposition、
 * 消费者却读 outputs.disposition 的端到端断链。
 */
function runAnalysis(rootPath: string, options: { id?: string; disposition?: string; stopBeforeDecision?: boolean } = {}): void {
  const id = options.id ?? intakeId;
  // 每个场景都从干净的分析目录起跑：bind 对已存在的 binding 是幂等复用，
  // 不清理会让上一场景的 binding（含其 matterId）泄漏到下一场景。
  rmSync(analysisDir(rootPath, id), removeOptions);
  const bind = runTool("workflow-control.ts", ["bind", "--runtime-root", runtimeRoot, "--asset-root", rootPath, "--intake-id", id, "--profile-id", "requirement-analysis", "--profile-version", "v1.0.0"]);
  assert.equal(bind.status, 0, bind.stderr);
  const completed = options.stopBeforeDecision ? analysisStages.slice(0, 3) : analysisStages.slice(0, 4);
  const requestPath = join(rootPath, `analysis-request-${id}.json`);
  writeFileSync(requestPath, JSON.stringify(analysisRequest(id, options.disposition ?? "build", completed)), "utf8");
  const run = runTool("workflow-control.ts", ["run", "--runtime-root", runtimeRoot, "--asset-root", rootPath, "--intake-id", id, "--request-file", requestPath]);
  // 未跑到 decision 站时 workflow 会停在人工判断门并以非零退出，这本身就是被测的负向前提。
  if (!options.stopBeforeDecision) assert.equal(run.status, 0, run.stderr);
  assert.equal(existsSync(join(analysisDir(rootPath, id), "workflow-result.json")), true, "分析线产物未生成");
}
/** 把另一条目真实跑出的产物搬到本条目目录下，构造「归属不符」。 */
function plantForeignAnalysis(rootPath: string, foreignId: string): void {
  runAnalysis(rootPath, { id: foreignId });
  const dir = analysisDir(rootPath);
  rmSync(dir, removeOptions);
  mkdirSync(dir, { recursive: true });
  for (const name of ["workflow-binding.json", "workflow-result.json"]) {
    writeFileSync(join(dir, name), readFileSync(join(analysisDir(rootPath, foreignId), name), "utf8"), "utf8");
  }
}
function corruptAnalysis(rootPath: string): void {
  const dir = analysisDir(rootPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "workflow-binding.json"), "{ not json", "utf8");
  writeFileSync(join(dir, "workflow-result.json"), "{}", "utf8");
}
/** 建一个「五小节写全、已到 disposition、目标 Change 已存在」的待 promote 条目。 */
function promoteReady(rootPath: string, changeObject?: string): string {
  complete(rootPath);
  let content = readFileSync(file(rootPath), "utf8").replace("phase: capture", "phase: disposition");
  if (changeObject) content = content.replace("promotedTo: null\n", `promotedTo: null\nchangeObject: ${changeObject}\n`);
  writeFileSync(file(rootPath), content, "utf8");
  const changeRoot = join(rootPath, "openspec/changes/target");
  mkdirSync(join(changeRoot, "01-原始需求"), { recursive: true });
  writeFileSync(join(changeRoot, "01-原始需求/原始需求索引.md"), "# 原始需求索引\n", "utf8");
  return changeRoot;
}
function promote(rootPath: string, runtimePath: string, changeRoot: string, extra: string[] = []) {
  return invoke(rootPath, ["promote", "--file", intakeRelative, "--change", "target", "--change-root", changeRoot, "--runtime-root", runtimePath, ...extra]);
}
/** fail closed 的定义：拒绝时 Intake 与目标 Change 均逐字节不变。 */
function snapshot(rootPath: string, changeRoot: string): string {
  return `${readFileSync(file(rootPath), "utf8")}\0${readFileSync(join(changeRoot, "01-原始需求/原始需求索引.md"), "utf8")}`;
}

test("VC-007/008/009/010 立项门按分析线产物 fail closed", () => {
  const rootPath = root();
  const runtimePath = makeRuntimeRoot();
  try {
    const changeRoot = promoteReady(rootPath, "tool-code");
    const before = snapshot(rootPath, changeRoot);

    // VC-008：不豁免且分析目录不存在 → 非零，错误信息列出缺失的产物名，两侧文件不变。
    const missing = promote(rootPath, runtimePath, changeRoot);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /缺少分析线产物/);
    assert.match(missing.stderr, /workflow-binding\.json/);
    assert.match(missing.stderr, /workflow-result\.json/);
    assert.equal(snapshot(rootPath, changeRoot), before);

    // VC-009：产物存在但归属另一条目 → 拒绝，不接受他项产物。产物由另一条目真实跑出后搬过来。
    plantForeignAnalysis(rootPath, "INT-20260830-999-other");
    const foreign = promote(rootPath, runtimePath, changeRoot);
    assert.notEqual(foreign.status, 0);
    assert.match(foreign.stderr, /不接受他项产物/);
    assert.equal(snapshot(rootPath, changeRoot), before);

    // VC-010：status 非 completed → 拒绝并报告实际状态。真实停在 evaluate 人工判断门。
    runAnalysis(rootPath, { stopBeforeDecision: true });
    const unfinished = promote(rootPath, runtimePath, changeRoot);
    assert.notEqual(unfinished.status, 0);
    assert.match(unfinished.stderr, /分析线未完成/);
    // 报出的必须是真实跑出的实际状态，不是占位串。
    assert.match(unfinished.stderr, /实际为 (in_progress|waiting_human_judgment|blocked)/);
    assert.equal(snapshot(rootPath, changeRoot), before);

    // VC-010：disposition 非 build → 拒绝并报告实际结论。真实跑完但结论为 defer。
    runAnalysis(rootPath, { disposition: "defer" });
    const deferred = promote(rootPath, runtimePath, changeRoot);
    assert.notEqual(deferred.status, 0);
    assert.match(deferred.stderr, /分析结论不是建造.*defer/);
    assert.equal(snapshot(rootPath, changeRoot), before);

    // 产物不可解析 → 拒绝。
    corruptAnalysis(rootPath);
    const broken = promote(rootPath, runtimePath, changeRoot);
    assert.notEqual(broken.status, 0);
    assert.match(broken.stderr, /不可解析/);
    assert.equal(snapshot(rootPath, changeRoot), before);

    // VC-007：端到端正向——产物由真实 workflow-control bind/run 生成，不是手写。
    runAnalysis(rootPath);
    const generated = JSON.parse(readFileSync(join(analysisDir(rootPath), "workflow-result.json"), "utf8"));
    assert.equal(generated.status, "completed");
    assert.equal(generated.outputs.publishedInputs.disposition, "build", "分析线真实产物的 disposition 落点变了，立项门取值点必须同步");
    const ok = promote(rootPath, runtimePath, changeRoot);
    assert.equal(ok.status, 0, ok.stderr);
    const payload = JSON.parse(ok.stdout);
    assert.equal(payload.state, "promoted");
    assert.equal(payload.promotedTo, "target");
    assert.equal(payload.routing.requiresAnalysis, true);
    assert.match(readFileSync(file(rootPath), "utf8"), /state: promoted/);
    assert.match(readFileSync(file(rootPath), "utf8"), /promotedTo: target/);
    assert.match(readFileSync(join(changeRoot, "01-原始需求/原始需求索引.md"), "utf8"), /Intake 来源：openspec\/intake\//);
  } finally { rmSync(rootPath, removeOptions); rmSync(runtimePath, removeOptions); }
});

test("VC-011/012/013/014 豁免与档位只能来自路由表", () => {
  const rootPath = root();
  const runtimePath = makeRuntimeRoot();
  try {
    // VC-014：命中豁免行（doc-expression）→ 无分析线产物也放行。
    const exemptRoot = promoteReady(rootPath, "doc-expression");
    const exempt = promote(rootPath, runtimePath, exemptRoot);
    assert.equal(exempt.status, 0, exempt.stderr);
    const exemptRouting = JSON.parse(exempt.stdout).routing;
    assert.equal(exemptRouting.matched, true);
    assert.equal(exemptRouting.requiresAnalysis, false);
    assert.equal(exemptRouting.profileId, "light-change");
  } finally { rmSync(rootPath, removeOptions); rmSync(runtimePath, removeOptions); }

  const unmatchedRoot = root();
  const unmatchedRuntime = makeRuntimeRoot();
  try {
    // VC-012：改动对象不在表内 → 判为 delivery-change 且不豁免，因此缺产物即被挡。
    const changeRoot = promoteReady(unmatchedRoot, "something-not-in-table");
    const result = promote(unmatchedRoot, unmatchedRuntime, changeRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /缺少分析线产物/);
    // 未声明 changeObject 的存量条目同样按未匹配处理。
    const bare = root();
    const bareRuntime = unmatchedRuntime;
    try {
      const bareChange = promoteReady(bare);
      const bareResult = promote(bare, bareRuntime, bareChange);
      assert.notEqual(bareResult.status, 0);
      assert.match(bareResult.stderr, /缺少分析线产物/);
    } finally { rmSync(bare, removeOptions); }
  } finally { rmSync(unmatchedRoot, removeOptions); rmSync(unmatchedRuntime, removeOptions); }

  const ledgerRoot = root();
  const ledgerRuntime = makeRuntimeRoot();
  try {
    // REV-002a：ledger-only 的定义自述「不产生任何 Change 目录」，与 promote 自相矛盾。
    // 它是表内最轻且豁免分析线的一档，若不单独拦截就成了绕开分析线的最短路径。
    const changeRoot = promoteReady(ledgerRoot, "ledger-only");
    const before = snapshot(ledgerRoot, changeRoot);
    const result = promote(ledgerRoot, ledgerRuntime, changeRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /声明为不可立项/);
    assert.match(result.stderr, /只能 hold 或 close/);
    assert.equal(snapshot(ledgerRoot, changeRoot), before);
  } finally { rmSync(ledgerRoot, removeOptions); rmSync(ledgerRuntime, removeOptions); }

  const selfRoot = root();
  const selfRuntime = makeRuntimeRoot();
  try {
    const changeRoot = promoteReady(selfRoot, "tool-code");
    const before = snapshot(selfRoot, changeRoot);
    // VC-011：调用方自述豁免一律拒绝，且按不豁免处理。
    for (const flag of [["--exempt", "true"], ["--waive-analysis", "true"], ["--skip-analysis", "true"]]) {
      const result = promote(selfRoot, selfRuntime, changeRoot, flag);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /不被接受.*不得自述豁免/s);
      assert.equal(snapshot(selfRoot, changeRoot), before);
    }
    // VC-013：重档位门禁已失败后请求降档 → 拒绝，保留原档位与失败原因。
    for (const flag of [["--profile-id", "light-change"], ["--delivery-tier", "light-change"], ["--downgrade", "true"]]) {
      const result = promote(selfRoot, selfRuntime, changeRoot, flag);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /不得自述豁免或为绕过门禁失败而降档/);
      assert.equal(snapshot(selfRoot, changeRoot), before);
    }
  } finally { rmSync(selfRoot, removeOptions); rmSync(selfRuntime, removeOptions); }
});

test("VC-021 存量 intake 清单确定且不受并站影响", () => {
  // 只读回归：直接扫仓内 19+ 条存量条目，不修改任何未由本次运行创建的对象。
  const first = runTool("intake-control.ts", ["list", "--intake-root", runtimeRoot]);
  assert.equal(first.status, 0, first.stderr);
  const second = runTool("intake-control.ts", ["list", "--intake-root", runtimeRoot]);
  assert.equal(second.status, 0, second.stderr);
  // 重复执行逐字节一致。
  assert.equal(first.stdout, second.stdout);
  const payload = JSON.parse(first.stdout);
  assert.equal(payload.scannedPath, "openspec/intake");
  assert.ok(payload.entries.length >= 19, `存量条目数异常: ${payload.entries.length}`);
  // 全部 current：并站没有把任何存量条目判成 legacy 或 invalid。
  const notCurrent = payload.entries.filter((entry: { classification: string }) => entry.classification !== "current");
  assert.deepEqual(notCurrent, []);
  // duplicateIds 为空。
  assert.deepEqual(payload.duplicateIds, []);
  // 存量条目允许持有已移除的 triaged 与各种 phase，读出来不报错。
  assert.equal(payload.entries.every((entry: { state: string }) => ["captured", "triaged", "held", "promoted", "closed"].includes(entry.state)), true);
  // 不落盘任何清单文件。
  assert.equal(existsSync(join(runtimeRoot, "openspec/intake/inventory.json")), false);
});

test("仓内路由表满足立项门的结构不变量", () => {
  const routing = JSON.parse(readFileSync(join(runtimeRoot, "openspec/profiles/change-routing-v1.json"), "utf8"));
  assert.equal(routing.schemaVersion, 1);
  // 未匹配必须取最重档且不豁免。
  assert.equal(routing.unmatched.profileId, "delivery-change");
  assert.equal(routing.unmatched.requiresAnalysis, true);
  // 首版至少各含一条「必走分析线」与一条「豁免」的行。
  assert.ok(routing.routes.some((route: { requiresAnalysis: boolean }) => route.requiresAnalysis === true));
  assert.ok(routing.routes.some((route: { requiresAnalysis: boolean }) => route.requiresAnalysis === false));
  // 改动对象不得重复，且每行都要写明理由。
  const objects = routing.routes.map((route: { changeObject: string }) => route.changeObject);
  assert.equal(new Set(objects).size, objects.length);
  for (const route of routing.routes) assert.ok(route.reason.length > 0);
  // 豁免行只允许出现在不碰机器可读约束的类别上。
  for (const route of routing.routes) if (!route.requiresAnalysis) assert.ok(["doc-expression", "ledger-only"].includes(route.changeObject), `豁免行超出允许范围: ${route.changeObject}`);
  // REV-002：每行必须声明档位序与路径前缀，交叉校验才有判据；rank 必须严格小于 unmatched。
  const ranks = new Set<number>();
  for (const route of routing.routes) {
    assert.equal(Number.isInteger(route.rank), true, `${route.changeObject} 缺少整数 rank`);
    assert.ok(route.rank < routing.unmatched.rank, `${route.changeObject} 的 rank 必须严格小于 unmatched.rank`);
    assert.equal(ranks.has(route.rank), false, `档位序重复: ${route.rank}`);
    ranks.add(route.rank);
    assert.ok(Array.isArray(route.pathPrefixes) && route.pathPrefixes.length > 0, `${route.changeObject} 缺少 pathPrefixes`);
  }
  // 两个必走分析线的重档位必须覆盖本仓的门禁执行体与合同目录，否则交叉校验形同虚设。
  const heavy = routing.routes.filter((route: { requiresAnalysis: boolean }) => route.requiresAnalysis).flatMap((route: { pathPrefixes: string[] }) => route.pathPrefixes);
  for (const prefix of ["openspec/tools/", "openspec/contracts/", "openspec/profiles/", "openspec/schemas/", "test/"]) {
    assert.ok(heavy.includes(prefix), `必走分析线的档位未覆盖关键路径: ${prefix}`);
  }
  // ledger-only 的定义自述不产生 Change，必须显式声明不可立项。
  const ledger = routing.routes.find((route: { changeObject: string }) => route.changeObject === "ledger-only");
  assert.equal(ledger.promotable, false, "ledger-only 必须声明 promotable: false");
});

/**
 * 曾经的四处路径空白（`.gitattributes`、`.github/`、`openspec/specs/`、`openspec/changes/archive/`）
 * 一律落在「未匹配」上，于是这条流水线自己最后两站的收尾动作会被自己的越档校验拦住。
 *
 * 本组断言刻意只钉不变量，不钉某一时刻的取值：不断言「长期规范目录的 rank 等于 15」，
 * 而是断言它与另外两档的相对位置。理由是取值是记账，相对位置背后才有真不变量——
 * 「快车道碰不到长期规范」和「走完整流程的档位不会被自己的收尾动作拦住」这两条，
 * 才是这次修表要保住的东西。行为侧的负向与正向对照在 control.test.ts 的 REV-002 用例里。
 */
test("路由表必须给流水线自己会碰的四处路径定档，且档位序保住两条不变量", () => {
  const routing = JSON.parse(readFileSync(join(runtimeRoot, "openspec/profiles/change-routing-v1.json"), "utf8"));
  type Route = { changeObject: string; rank: number; pathPrefixes: string[]; promotable?: boolean };
  const routes: Route[] = routing.routes;
  /** 与 delivery-control 的交叉校验同口径：命中多条前缀时取最重的一条。 */
  const classify = (path: string): Route | null => {
    let best: Route | null = null;
    for (const route of routes) for (const prefix of route.pathPrefixes) {
      if ((path === prefix || path.startsWith(prefix)) && (!best || route.rank > best.rank)) best = route;
    }
    return best;
  };
  for (const path of [".gitattributes", ".github/workflows/ci.yml", "openspec/specs/x/spec.md", "openspec/changes/archive/2026-01-01-x/y.md"]) {
    assert.ok(classify(path), `路径仍未定档，会按未匹配取最重档并误挡：${path}`);
  }
  const rankOf = (changeObject: string) => routes.find((route) => route.changeObject === changeObject)?.rank ?? assert.fail(`路由表缺少 ${changeObject}`);
  const specsRank = classify("openspec/specs/x/spec.md")!.rank;
  const archiveRank = classify("openspec/changes/archive/2026-01-01-x/y.md")!.rank;
  for (const [name, rank] of [["长期规范目录", specsRank], ["归档目录", archiveRank]] as const) {
    // 不变量一：快车道的两档碰不到它们——否则一次「只改说明面」的快改就能重写长期规范或改写历史证据。
    assert.ok(rank > rankOf("doc-expression"), `${name}的档位序必须严格高于文档表达`);
    assert.ok(rank > rankOf("ledger-only"), `${name}的档位序必须严格高于纯事项记录`);
    // 不变量二：走完整流程的两档做收尾动作时不会被自己拦住——这正是本次修表要消除的误挡。
    assert.ok(rank <= rankOf("tool-code"), `${name}的档位序不得高于工具代码，否则工具代码档做规范同步与归档会被自己拦住`);
  }
  // 这一档只用于给路径定档，不是任何事项的「改动对象」，因此不可立项。
  const pipeline = routes.find((route) => route.changeObject === "pipeline-output");
  assert.ok(pipeline, "路由表缺少 pipeline-output");
  assert.equal(pipeline!.promotable, false, "pipeline-output 必须声明 promotable: false");
  // CI 配置是门禁在远端的执行体，必须落在需要完整流程的档位上，不能被快车道改。
  assert.ok(classify(".github/workflows/ci.yml")!.rank >= rankOf("tool-code"), ".github/ 的档位序不得低于工具代码");
  // 行尾属性决定全仓字节形态，所有按字节比对的检查都以它为前提，必须落在最重档。
  assert.equal(classify(".gitattributes")!.changeObject, "governance-contract");
});

test("Intake init and inspect create the contract", () => {
  const rootPath = root();
  try {
    const init = invoke(rootPath, ["init", "--id", "INT-20260830-001-test", "--source", "synthetic", "--issue", "synthetic issue"]);
    assert.equal(init.status, 0, init.stderr);
    const inspected = invoke(rootPath, ["inspect", "--file", "openspec/intake/INT-20260830-001-test.md"]);
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.deepEqual(JSON.parse(inspected.stdout).state, "captured");
    assert.equal(JSON.parse(inspected.stdout).phase, "capture");
  } finally { rmSync(rootPath, removeOptions); }
});

test("VC-017 中间站已合并，advance 一律非零且不写盘", () => {
  const rootPath = root();
  try {
    complete(rootPath);
    const before = readFileSync(file(rootPath), "utf8");
    for (const target of ["triage", "evidence", "options"]) {
      const result = invoke(rootPath, ["advance", "--file", intakeRelative, "--to", target]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /已随登记并站移除/);
      assert.match(result.stderr, new RegExp(target));
      // 文件内容与 frontmatter 逐字节不变。
      assert.equal(readFileSync(file(rootPath), "utf8"), before);
    }
    // 不带 --to 的旧式调用同样非零。
    const bare = invoke(rootPath, ["advance", "--file", intakeRelative]);
    assert.notEqual(bare.status, 0);
    assert.match(bare.stderr, /promote、hold 或 close/);
    assert.equal(readFileSync(file(rootPath), "utf8"), before);
  } finally { rmSync(rootPath, removeOptions); }
});

test("VC-016/019 一次处置即从 captured 到终态，reopen 回到 captured", () => {
  const rootPath = root();
  try {
    // VC-016：五小节写全后，captured 状态直接 hold，不要求任何前置 advance。
    complete(rootPath);
    assert.match(readFileSync(file(rootPath), "utf8"), /state: captured/);
    const held = invoke(rootPath, ["hold", "--file", intakeRelative, "--reason", "wait for evidence"]);
    assert.equal(held.status, 0, held.stderr);
    assert.equal(JSON.parse(held.stdout).state, "held");
    // 已处置的条目不能再被重复处置。
    const again = invoke(rootPath, ["close", "--file", intakeRelative, "--reason", "double disposition"]);
    assert.notEqual(again.status, 0);
    assert.match(again.stderr, /已处置/);

    // VC-019：reopen 回到 captured，且保留原 hold 理由与 History。
    const reopened = invoke(rootPath, ["reopen", "--file", intakeRelative, "--reason", "evidence arrived"]);
    assert.equal(reopened.status, 0, reopened.stderr);
    assert.equal(JSON.parse(reopened.stdout).state, "captured");
    const content = readFileSync(file(rootPath), "utf8");
    assert.match(content, /state: captured/);
    assert.match(content, /hold: wait for evidence/);
    assert.match(content, /reopened: evidence arrived/);
    // phase 是只读兼容字段：处置与 reopen 都不再写它。
    assert.match(content, /phase: capture/);

    // 一次 close 同样直接从 captured 到终态。
    const closed = invoke(rootPath, ["close", "--file", intakeRelative, "--reason", "not needed"]);
    assert.equal(closed.status, 0, closed.stderr);
    assert.equal(JSON.parse(closed.stdout).state, "closed");
  } finally { rmSync(rootPath, removeOptions); }
});

test("VC-020 处置时一次性校验五小节并逐项报缺", () => {
  const rootPath = root();
  try {
    complete(rootPath);
    // 同时抹掉 Evidence 与 Disposition 两节的内容。
    const stripped = readFileSync(file(rootPath), "utf8")
      .replace(/## Evidence\n[\s\S]*?(?=\n## Options)/, "## Evidence\n")
      .replace(/## Disposition\n[\s\S]*?(?=\n## History)/, "## Disposition\n");
    writeFileSync(file(rootPath), stripped, "utf8");
    const before = readFileSync(file(rootPath), "utf8");
    const result = invoke(rootPath, ["hold", "--file", intakeRelative, "--reason", "try"]);
    assert.notEqual(result.status, 0);
    // 一次拒绝返回两项缺失，而不是只报第一项。
    assert.match(result.stderr, /Evidence/);
    assert.match(result.stderr, /Disposition/);
    assert.doesNotMatch(result.stderr, /Triage/);
    assert.equal(readFileSync(file(rootPath), "utf8"), before);
  } finally { rmSync(rootPath, removeOptions); }
});

test("VC-018 新写入只产生四元枚举，存量 triaged 仍可读", () => {
  const rootPath = root();
  try {
    complete(rootPath);
    // 存量样本：state 为已移除的 triaged，list 与 inspect 都不得报错。
    const legacy = join(rootPath, "openspec/intake/INT-20260830-002-legacy-triaged.md");
    writeFileSync(legacy, "---\nschemaVersion: 1\nid: INT-20260830-002-legacy-triaged\nstate: triaged\nphase: triage\nsource: synthetic\ncapturedAt: 2026-08-30\npromotedTo: null\n---\n\n# Intake\n", "utf8");
    const inspected = invoke(rootPath, ["inspect", "--file", "openspec/intake/INT-20260830-002-legacy-triaged.md"]);
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.equal(JSON.parse(inspected.stdout).state, "triaged");
    const listed = invoke(rootPath, ["list"]);
    assert.equal(listed.status, 0, listed.stderr);
    const entries = JSON.parse(listed.stdout).entries;
    assert.equal(entries.length, 2);
    assert.equal(entries.every((entry: { classification: string }) => entry.classification === "current"), true);

    // 新写入只会产生四元枚举中的值。
    const held = invoke(rootPath, ["hold", "--file", intakeRelative, "--reason", "r"]);
    assert.equal(held.status, 0, held.stderr);
    const reopened = invoke(rootPath, ["reopen", "--file", intakeRelative, "--reason", "r"]);
    assert.equal(reopened.status, 0, reopened.stderr);
    for (const path of [file(rootPath)]) {
      const states = [...readFileSync(path, "utf8").matchAll(/^state: (\w+)$/gm)].map((match) => match[1]);
      assert.equal(states.every((state) => ["captured", "promoted", "held", "closed"].includes(state)), true, `新写入产生了四元枚举之外的 state: ${states.join(",")}`);
    }
  } finally { rmSync(rootPath, removeOptions); }
});

test("Intake rejects sensitive content and unsafe promote target", () => {
  const rootPath = root();
  try {
    const unsafe = invoke(rootPath, ["init", "--id", "INT-20260830-001-test", "--source", "synthetic", "--issue", "token: secret-value"]);
    assert.notEqual(unsafe.status, 0);
    complete(rootPath);
    const result = invoke(rootPath, ["promote", "--file", "openspec/intake/INT-20260830-001-test.md", "--change", "target", "--change-root", join(tmpdir(), "target")]);
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(join(tmpdir(), "target", "01-原始需求", "原始需求索引.md")), false);
  } finally { rmSync(rootPath, removeOptions); }
});

test("Intake inventory 稳定列出 current、legacy、invalid 并报告重复 ID", () => {
  const rootPath = root();
  try {
    const intakePath = join(rootPath, "openspec/intake");
    mkdirSync(intakePath, { recursive: true });
    writeFileSync(join(intakePath, "INT-20260830-001-current.md"), "---\nschemaVersion: 1\nid: INT-20260830-001-current\nstate: captured\nphase: capture\nsource: synthetic\ncapturedAt: 2026-08-30\npromotedTo: null\n---\n", "utf8");
    writeFileSync(join(intakePath, "INT-20260830-003-a.md"), "---\nid: INT-20260830-003\nstatus: captured\nsource: synthetic\ncapturedAt: 2026-08-30\npromotedTo: null\n---\n", "utf8");
    writeFileSync(join(intakePath, "INT-20260830-003-b.md"), "---\nid: INT-20260830-003\nstatus: captured\nsource: synthetic\ncapturedAt: 2026-08-30\npromotedTo: null\n---\n", "utf8");
    writeFileSync(join(intakePath, "INT-20260830-004-legacy.md"), "---\nid: INT-20260830-004\nstatus: captured\nsource: synthetic\ncapturedAt: 2026-08-30\npromotedTo: null\n---\n", "utf8");
    writeFileSync(join(intakePath, "INT-20260830-005-invalid.md"), "not frontmatter\n", "utf8");

    const result = invoke(rootPath, ["list"]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      entries: Array<{ file: string; id: string | null; classification: string; missingFields: string[] }>;
      duplicateIds: Array<{ id: string; files: string[] }>;
    };
    assert.deepEqual(report.entries.map((entry) => entry.file), [
      "openspec/intake/INT-20260830-001-current.md",
      "openspec/intake/INT-20260830-003-a.md",
      "openspec/intake/INT-20260830-003-b.md",
      "openspec/intake/INT-20260830-004-legacy.md",
      "openspec/intake/INT-20260830-005-invalid.md",
    ]);
    assert.equal(report.entries[0].classification, "current");
    assert.equal(report.entries[1].classification, "legacy");
    assert.equal(report.entries[4].classification, "invalid");
    assert.deepEqual(report.duplicateIds, [{
      id: "INT-20260830-003",
      files: ["openspec/intake/INT-20260830-003-a.md", "openspec/intake/INT-20260830-003-b.md"],
    }]);
  } finally {
    rmSync(rootPath, removeOptions);
  }
});

test("legacy Intake inspect 返回迁移缺口且保持文件不变", () => {
  const rootPath = root();
  try {
    const legacyFile = join(rootPath, "openspec/intake/INT-20260830-004-legacy.md");
    mkdirSync(join(rootPath, "openspec/intake"), { recursive: true });
    writeFileSync(legacyFile, "---\nid: INT-20260830-004\nstatus: captured\nsource: synthetic\ncapturedAt: 2026-08-30\npromotedTo: null\n---\n\n# Legacy\n", "utf8");
    const before = readFileSync(legacyFile, "utf8");
    const inspected = invoke(rootPath, ["inspect", "--file", "openspec/intake/INT-20260830-004-legacy.md"]);
    assert.equal(inspected.status, 0, inspected.stderr);
    const report = JSON.parse(inspected.stdout) as { legacy: boolean; missingFields: string[]; migration: string };
    assert.equal(report.legacy, true);
    assert.deepEqual(report.missingFields, ["schemaVersion", "state", "phase", "id"]);
    assert.match(report.migration, /不自动修改/);
    assert.equal(readFileSync(legacyFile, "utf8"), before);
  } finally {
    rmSync(rootPath, removeOptions);
  }
});

test("REV-006 路由表的 analysisProfileId 真正生效", () => {
  const rootPath = root();
  const runtimePath = makeRuntimeRoot();
  try {
    const changeRoot = promoteReady(rootPath, "tool-code");
    const before = snapshot(rootPath, changeRoot);
    // 用另一个 profile 跑出的分析线产物不算数：路由表声明该改动对象的分析须由
    // requirement-analysis 产出，绑 light-change 跑出来的 result 必须被拒。
    rmSync(analysisDir(rootPath), removeOptions);
    assert.equal(runTool("workflow-control.ts", ["bind", "--runtime-root", runtimeRoot, "--asset-root", rootPath, "--intake-id", intakeId, "--profile-id", "light-change", "--profile-version", "v1.0.0"]).status, 0);
    const wrongRequest = join(rootPath, "wrong-profile-request.json");
    writeFileSync(wrongRequest, JSON.stringify({ schemaVersion: 1, matterId: intakeId, binding: { schemaVersion: 1, profileId: "light-change", profileVersion: "v1.0.0" }, inputs: { intake: "x", implementation: "y", verification: "z" }, judgments: { verification: "accept" }, completedStages: ["intake", "implementation"] }), "utf8");
    runTool("workflow-control.ts", ["run", "--runtime-root", runtimeRoot, "--asset-root", rootPath, "--intake-id", intakeId, "--request-file", wrongRequest]);
    const wrong = promote(rootPath, runtimePath, changeRoot);
    assert.notEqual(wrong.status, 0);
    assert.match(wrong.stderr, /路由表要求该改动对象的分析必须由 requirement-analysis 产出/);
    assert.equal(snapshot(rootPath, changeRoot), before);

    // 换回正确 profile 后放行，且交付档位被写进条目 History 留痕（不再只回显 stdout）。
    runAnalysis(rootPath);
    const ok = promote(rootPath, runtimePath, changeRoot);
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(JSON.parse(ok.stdout).routing.analysisProfileId, "requirement-analysis");
    assert.match(readFileSync(file(rootPath), "utf8"), /promoted to target（交付档位 delivery-change，改动对象 tool-code）/);
  } finally { rmSync(rootPath, removeOptions); rmSync(runtimePath, removeOptions); }
});

/**
 * T-03（本 Change 立项时真实撞到的两处）
 *
 * 其一，敏感内容检查把网址整类当成本机盘符路径拦掉了：说明文件要求「存在 Issue 时记录
 * 其网址」，而机器根本不让写。其二，立项门自称「写入任何状态之前完成全部判定，任一
 * 不满足即两侧文件逐字节不变」，实际却是先给目标 Change 追加来源行、再校验条目内容。
 */
function makeChangeTarget(rootPath: string, slug: string, body = "# 原始需求索引\n"): string {
  const changeRoot = join(rootPath, "openspec/changes", slug);
  mkdirSync(join(changeRoot, "01-原始需求"), { recursive: true });
  writeFileSync(join(changeRoot, "01-原始需求/原始需求索引.md"), body, "utf8");
  return changeRoot;
}
function writeIntake(rootPath: string, changeObject: string, extra: string): void {
  complete(rootPath);
  const current = readFileSync(file(rootPath), "utf8");
  writeFileSync(file(rootPath), current.replace("promotedTo: null\n", `promotedTo: null\nchangeObject: ${changeObject}\n`).replace("## History\n", `${extra}\n## History\n`), "utf8");
}

test("T-03.2/T-03.3/T-03.4 敏感内容检查放行网址，仍然拦住本机盘符路径", () => {
  const rootPath = root();
  try {
    // T-03.2：网址能存进事项记录了。协议名至少两个字母，盘符只有一个，判据是「冒号左边那个
    // 字母的左边还是不是字母」——这是结构判据，不需要维护一张协议名白名单。
    const withUrl = invoke(rootPath, ["init", "--id", "INT-20260830-010-url", "--source", "synthetic", "--issue", "详见 https://example.com/issues/1 与 http://example.org/x"]);
    assert.equal(withUrl.status, 0, withUrl.stderr);
    assert.match(readFileSync(join(rootPath, "openspec/intake/INT-20260830-010-url.md"), "utf8"), /https:\/\/example\.com/);

    // T-03.3：本机盘符绝对路径仍然被拦，且错误文案点名命中的是哪条规则。
    for (const bad of ["见 C:/Workspace/x", "见 D:\\临时\\y"]) {
      const blocked = invoke(rootPath, ["init", "--id", "INT-20260830-011-drive", "--source", "synthetic", "--issue", bad]);
      assert.notEqual(blocked.status, 0, `未拦住: ${bad}`);
      assert.match(blocked.stderr, /本机盘符绝对路径/);
    }

    // T-03.4：网址与盘符同时出现时仍然拒绝——放行网址不得连带把盘符也放开。
    const mixed = invoke(rootPath, ["init", "--id", "INT-20260830-012-mixed", "--source", "synthetic", "--issue", "https://example.com 以及 E:/local"]);
    assert.notEqual(mixed.status, 0);
    assert.match(mixed.stderr, /本机盘符绝对路径/);

    // 其余几条敏感规则一条不减。
    const secret = invoke(rootPath, ["init", "--id", "INT-20260830-013-secret", "--source", "synthetic", "--issue", "token: abc"]);
    assert.notEqual(secret.status, 0);
    assert.match(secret.stderr, /凭据键值/);
  } finally { rmSync(rootPath, removeOptions); }
});

test("T-03.1 立项门因内容检查拒绝时，两侧文件逐字节不变", () => {
  const rootPath = root();
  const runtimePath = makeRuntimeRoot();
  try {
    // doc-expression 不需要分析线，于是唯一会失败的判定就是内容检查——这样才测得到「顺序」，
    // 而不是被更早的某个判定挡住。
    writeIntake(rootPath, "doc-expression", "\n本机路径 F:/leak 写进了正文。\n");
    const changeRoot = makeChangeTarget(rootPath, "target");
    const changeFile = join(changeRoot, "01-原始需求/原始需求索引.md");
    const intakeBefore = readFileSync(file(rootPath), "utf8");
    const changeBefore = readFileSync(changeFile, "utf8");

    const blocked = invoke(rootPath, ["promote", "--file", intakeRelative, "--change", "target", "--change-root", changeRoot, "--runtime-root", runtimePath]);
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /本机盘符绝对路径/);
    // 关键断言：**两侧**都没有被写。此前失败的正是目标 Change 这一侧。
    assert.equal(readFileSync(changeFile, "utf8"), changeBefore, "立项被拒，目标 Change 却被写入了半截来源行");
    assert.equal(readFileSync(file(rootPath), "utf8"), intakeBefore, "立项被拒，条目文件却被改动了");

    // 正向对照：把违规内容去掉之后，同一条立项应当成功，且这次两侧都被写。
    writeFileSync(file(rootPath), intakeBefore.replace("本机路径 F:/leak 写进了正文。", "正文已经改成人话。"), "utf8");
    const allowed = invoke(rootPath, ["promote", "--file", intakeRelative, "--change", "target", "--change-root", changeRoot, "--runtime-root", runtimePath]);
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.match(readFileSync(changeFile, "utf8"), /- Intake 来源：/);
    assert.match(readFileSync(file(rootPath), "utf8"), /state: promoted/);
  } finally { rmSync(rootPath, removeOptions); rmSync(runtimePath, removeOptions); }
});
