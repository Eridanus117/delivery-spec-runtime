import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeWorkflow, loadWorkflowProfile, parseWorkflowProfile, parseWorkflowRequest } from "../openspec/tools/workflow-core.ts";
import { runTool, runtimeRoot } from "./helpers.ts";

test("registry 提供三个 profile 且 profile 版本必须精确匹配", () => {
  const result = runTool("workflow-control.ts", ["list-profiles", "--runtime-root", runtimeRoot]);
  assert.equal(result.status, 0, result.stderr);
  const profiles = JSON.parse(result.stdout) as Array<{ profileId: string; profileVersion: string; stages: unknown[] }>;
  assert.deepEqual(profiles.map((profile) => `${profile.profileId}@${profile.profileVersion}`), ["delivery-change@v1.0.0", "light-change@v1.0.0", "requirement-analysis@v1.0.0"]);
  assert.deepEqual(profiles[2].stages[1], {
    id: "clarify",
    displayName: "澄清问题与边界",
    description: "明确真实问题、目标、范围和约束。",
    exitCondition: "问题框架完整，且人工判断为 sufficient。",
    requiredInputs: ["problemFrame"],
    humanJudgment: true,
    judgmentOptions: ["continue-analysis", "sufficient"],
    repeatOnJudgments: ["continue-analysis"],
    outputInputs: ["problemFrame", "analysisRounds"],
  });
  assert.throws(() => loadWorkflowProfile(runtimeRoot, { schemaVersion: 1, profileId: "delivery-change", profileVersion: "v9.0.0" }), /未注册 workflow profile/);
});

test("需求分析 profile 按澄清、核验、比较和决策阶段推进", () => {
  const profile = loadWorkflowProfile(runtimeRoot, { schemaVersion: 1, profileId: "requirement-analysis", profileVersion: "v1.0.0" });
  assert.deepEqual(profile.stages.map((stage) => stage.id), ["capture", "clarify", "discover", "evaluate", "decision"]);
  const request = parseWorkflowRequest({
    schemaVersion: 1,
    matterId: "analysis-matter",
    binding: { schemaVersion: 1, profileId: "requirement-analysis", profileVersion: "v1.0.0" },
    inputs: {},
    judgments: {},
  });
  let result = executeWorkflow(profile, request);
  assert.equal(result.status, "blocked");
  result = executeWorkflow(profile, { ...request, inputs: { request: "need" } });
  assert.equal(result.nextStageId, "clarify");
  assert.deepEqual(result.outputs.publishedInputs, { request: "need" });

  const captured = { ...request, inputs: { request: "need" }, completedStages: ["capture"] };
  result = executeWorkflow(profile, captured);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.outputs.missingInputs, ["problemFrame"]);

  const framed = { ...captured, inputs: { ...captured.inputs, problemFrame: { problem: "slow delivery", goals: ["reduce delay"], scope: ["workflow"], constraints: ["no Desk coupling"] } } };
  result = executeWorkflow(profile, { ...framed, judgments: { clarify: "continue-analysis" } });
  assert.equal(result.status, "in_progress");
  assert.equal(result.currentStageId, "clarify");
  assert.equal(result.nextStageId, "clarify");
  assert.deepEqual(result.outputs.completedStages, ["capture"]);

  const discovered = { ...framed, judgments: { clarify: "sufficient" }, completedStages: ["capture", "clarify"], inputs: { ...framed.inputs, capabilityReport: { known: ["workflow core"], unknown: ["consumer adoption"], evidence: ["repository inspection"], confidence: "medium" } } };
  result = executeWorkflow(profile, discovered);
  assert.equal(result.status, "waiting_human_judgment");
  result = executeWorkflow(profile, { ...discovered, judgments: { clarify: "sufficient", discover: "continue-analysis" } });
  assert.equal(result.nextStageId, "discover");
  assert.deepEqual(result.outputs.completedStages, ["capture", "clarify"]);

  const evaluated = { ...discovered, judgments: { clarify: "sufficient", discover: "sufficient" }, completedStages: ["capture", "clarify", "discover"], inputs: { ...discovered.inputs, optionReport: { options: ["extend profile", "standalone script"], tradeoffs: ["reuse", "maintenance"], investment: "bounded", risk: "low", reversible: true } } };
  result = executeWorkflow(profile, evaluated);
  assert.equal(result.status, "waiting_human_judgment");
  assert.equal(result.currentStageId, "evaluate");
  result = executeWorkflow(profile, { ...evaluated, judgments: { clarify: "sufficient", discover: "sufficient", evaluate: "sufficient" } });
  assert.equal(result.nextStageId, "decision");
  assert.deepEqual(result.outputs.completedStages, ["capture", "clarify", "discover", "evaluate"]);

  const decided = {
    ...evaluated,
    inputs: {
      ...evaluated.inputs,
      decisionReport: { decision: "build", rationale: "reuse core", risks: ["scope"], nextStep: "create Change" },
      disposition: "build",
      candidateProfileId: "light-change",
      analysisRounds: [{ round: 1, stage: "clarify", known: ["problem"], unknown: ["owner"], evidence: ["session"], confidence: "medium", judgment: "sufficient", decision: "continue" }],
    },
    judgments: { clarify: "sufficient", discover: "sufficient", evaluate: "sufficient", decision: "build" },
    completedStages: ["capture", "clarify", "discover", "evaluate"],
  };
  result = executeWorkflow(profile, decided);
  assert.equal(result.status, "completed");
  assert.deepEqual(result.outputs.publishedInputs, { problemFrame: decided.inputs.problemFrame, capabilityReport: decided.inputs.capabilityReport, optionReport: decided.inputs.optionReport, decisionReport: decided.inputs.decisionReport, disposition: "build", candidateProfileId: "light-change", analysisRounds: decided.inputs.analysisRounds });
  result = executeWorkflow(profile, { ...decided, judgments: { ...decided.judgments, decision: "unknown" } });
  assert.equal(result.status, "rejected");
  result = executeWorkflow(profile, { ...decided, completedStages: ["capture", "clarify"], judgments: { clarify: "continue-analysis" } });
  assert.equal(result.status, "rejected");
});

test("workflow core 按阶段返回 blocked、waiting、in_progress 和 completed", () => {
  const profile = loadWorkflowProfile(runtimeRoot, { schemaVersion: 1, profileId: "light-change", profileVersion: "v1.0.0" });
  const request = parseWorkflowRequest({ schemaVersion: 1, matterId: "synthetic-matter", binding: { schemaVersion: 1, profileId: "light-change", profileVersion: "v1.0.0" }, inputs: {}, judgments: {} });
  let result = executeWorkflow(profile, request);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.outputs.missingInputs, ["request"]);

  result = executeWorkflow(profile, { ...request, inputs: { request: "captured" } });
  assert.equal(result.status, "in_progress");
  assert.equal(result.nextStageId, "implementation");
  assert.deepEqual(result.outputs.completedStages, ["intake"]);

  result = executeWorkflow(profile, { ...request, inputs: { request: "captured", implementation: "changed" }, completedStages: ["intake"] });
  assert.equal(result.status, "in_progress");
  assert.equal(result.nextStageId, "verification");
  result = executeWorkflow(profile, { ...request, inputs: { request: "captured", implementation: "changed", verification: "checked" }, completedStages: ["intake", "implementation"] });
  assert.equal(result.status, "waiting_human_judgment");
  assert.equal(result.currentStageId, "verification");
  assert.equal(result.nextStageId, null);

  result = executeWorkflow(profile, { ...request, inputs: { request: "captured", implementation: "changed", verification: "checked" }, judgments: { verification: "owner-approved" }, completedStages: ["intake", "implementation"] });
  assert.equal(result.status, "completed");
  assert.equal(result.nextStageId, null);
  assert.deepEqual(result.outputs.completedStages, ["intake", "implementation", "verification"]);

  result = executeWorkflow(profile, { ...request, completedStages: ["unknown"] });
  assert.equal(result.status, "rejected");
});

test("workflow core 拒绝跳阶段和伪造完成阶段", () => {
  const profile = loadWorkflowProfile(runtimeRoot, { schemaVersion: 1, profileId: "light-change", profileVersion: "v1.0.0" });
  const request = parseWorkflowRequest({ schemaVersion: 1, matterId: "bypass-matter", binding: { schemaVersion: 1, profileId: "light-change", profileVersion: "v1.0.0" }, inputs: { request: "captured", implementation: "changed", verification: "checked" }, judgments: { verification: "owner-approved" } });
  let result = executeWorkflow(profile, { ...request, completedStages: ["implementation"] });
  assert.equal(result.status, "rejected");
  result = executeWorkflow(profile, { ...request, inputs: {}, judgments: {}, completedStages: ["intake", "implementation", "verification"] });
  assert.equal(result.status, "rejected");
});

test("workflow core 不把继承属性当作输入", () => {
  const profile = parseWorkflowProfile({ schemaVersion: 1, profileId: "prototype-check", profileVersion: "v1.0.0", displayName: "Prototype Check", stages: [{ id: "intake", displayName: "Intake", requiredInputs: ["toString"], humanJudgment: false }] });
  const request = parseWorkflowRequest({ schemaVersion: 1, matterId: "prototype-matter", binding: { schemaVersion: 1, profileId: "prototype-check", profileVersion: "v1.0.0" }, inputs: {}, judgments: {} });
  assert.equal(executeWorkflow(profile, request).status, "blocked");
  const judgmentProfile = parseWorkflowProfile({ schemaVersion: 1, profileId: "judgment-prototype-check", profileVersion: "v1.0.0", displayName: "Judgment Prototype Check", stages: [{ id: "constructor", displayName: "Judgment", requiredInputs: [], humanJudgment: true }] });
  const judgmentRequest = parseWorkflowRequest({ schemaVersion: 1, matterId: "judgment-prototype-matter", binding: { schemaVersion: 1, profileId: "judgment-prototype-check", profileVersion: "v1.0.0" }, inputs: {}, judgments: {} });
  assert.equal(executeWorkflow(judgmentProfile, judgmentRequest).status, "waiting_human_judgment");
  assert.throws(() => parseWorkflowProfile({ schemaVersion: 1, profileId: "demo", profileVersion: "v1.0.0", displayName: "Demo", stages: [{ id: "one", displayName: "One", requiredInputs: ["request", "request"], humanJudgment: false }] }), /requiredInputs 不得重复/);
});

test("profile 合同拒绝重复阶段和未知字段", () => {
  assert.throws(() => parseWorkflowProfile({ schemaVersion: 1, profileId: "demo", profileVersion: "v1.0.0", displayName: "Demo", stages: [{ id: "one", displayName: "One", requiredInputs: [], humanJudgment: false }, { id: "one", displayName: "Again", requiredInputs: [], humanJudgment: false }] }), /stages.id 不得重复/);
  assert.throws(() => parseWorkflowProfile({ schemaVersion: 1, profileId: "demo", profileVersion: "v1.0.0", displayName: "Demo", extra: true, stages: [{ id: "one", displayName: "One", requiredInputs: [], humanJudgment: false }] }), /未知字段 extra/);
  assert.throws(() => parseWorkflowProfile({ schemaVersion: 1, profileId: "demo", profileVersion: "v1.0.0", displayName: "Demo", stages: [{ id: "one", displayName: "One", requiredInputs: [], humanJudgment: true, judgmentOptions: [""] }] }), /judgmentOptions 不得为空/);
  assert.throws(() => parseWorkflowProfile({ schemaVersion: 1, profileId: "demo", profileVersion: "v1.0.0", displayName: "Demo", stages: [{ id: "one", displayName: "One", requiredInputs: [], humanJudgment: true, judgmentOptions: ["ok"], repeatOnJudgments: [""] }] }), /repeatOnJudgments 不得为空/);
  assert.throws(() => parseWorkflowProfile({ schemaVersion: 1, profileId: "demo", profileVersion: "v1.0.0", displayName: "Demo", stages: [{ id: "one", displayName: "One", requiredInputs: [], humanJudgment: false, outputInputs: [""] }] }), /outputInputs 不得为空/);
  assert.throws(() => parseWorkflowProfile({ schemaVersion: 1, profileId: "demo", profileVersion: "v1.0.0", displayName: "Demo", stages: [{ id: "one", displayName: "One", requiredInputs: [""], humanJudgment: false }] }), /requiredInputs 不得为空/);
});

test("VC-015 分析线产物落在资产仓并可按 intake id 定位", () => {
  const asset = mkdtempSync(join(tmpdir(), "workflow-analysis-"));
  try {
    const intakeId = "INT-20260901-021-analysis-locatable";
    const analysisDir = join(asset, "openspec/intake/analysis", intakeId);
    const requestFile = join(asset, "request.json");

    // 缺产物时必须明确报告缺失，而不是静默返回空。
    const missing = runTool("workflow-control.ts", ["inspect", "--runtime-root", runtimeRoot, "--asset-root", asset, "--intake-id", intakeId]);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /缺少分析线产物/);
    assert.deepEqual(JSON.parse(missing.stdout), { intakeId, found: false, missing: ["workflow-binding.json", "workflow-result.json"] });

    // bind --intake-id 把 binding 写到 openspec/intake/analysis/<id>/，并带上 matterId。
    const bind = runTool("workflow-control.ts", ["bind", "--runtime-root", runtimeRoot, "--asset-root", asset, "--intake-id", intakeId, "--profile-id", "requirement-analysis", "--profile-version", "v1.0.0"]);
    assert.equal(bind.status, 0, bind.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(analysisDir, "workflow-binding.json"), "utf8")), { schemaVersion: 1, profileId: "requirement-analysis", profileVersion: "v1.0.0", matterId: intakeId });

    // run --intake-id 把 result 写到同一目录。
    writeFileSync(requestFile, JSON.stringify({ schemaVersion: 1, matterId: intakeId, binding: { schemaVersion: 1, profileId: "requirement-analysis", profileVersion: "v1.0.0" }, inputs: { request: "captured" }, judgments: {} }));
    const run = runTool("workflow-control.ts", ["run", "--runtime-root", runtimeRoot, "--asset-root", asset, "--intake-id", intakeId, "--request-file", requestFile]);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(readFileSync(join(analysisDir, "workflow-result.json"), "utf8")).matterId, intakeId);

    // 产物齐备后按 intake id 查询可同时取回 binding 与 result。
    const found = runTool("workflow-control.ts", ["inspect", "--runtime-root", runtimeRoot, "--asset-root", asset, "--intake-id", intakeId]);
    assert.equal(found.status, 0, found.stderr);
    const payload = JSON.parse(found.stdout);
    assert.equal(payload.found, true);
    assert.deepEqual(payload.missing, []);
    assert.equal(payload.binding.matterId, intakeId);
    assert.equal(payload.result.matterId, intakeId);

    // 归属不符的 request 被拒绝：目录名、binding.matterId 与 request.matterId 必须三者一致。
    writeFileSync(requestFile, JSON.stringify({ schemaVersion: 1, matterId: "INT-20260901-022-other-item", binding: { schemaVersion: 1, profileId: "requirement-analysis", profileVersion: "v1.0.0" }, inputs: { request: "captured" }, judgments: {} }));
    const foreign = runTool("workflow-control.ts", ["run", "--runtime-root", runtimeRoot, "--asset-root", asset, "--intake-id", intakeId, "--request-file", requestFile]);
    assert.notEqual(foreign.status, 0);
    assert.match(readFileSync(join(analysisDir, "workflow-result.json"), "utf8"), /matterId .* 与 --intake-id .* 不一致/);

    // 产物不得写入 Runtime submodule。
    const submodule = join(asset, ".delivery-spec-runtime");
    mkdirSync(submodule, { recursive: true });
    const intoRuntime = runTool("workflow-control.ts", ["bind", "--runtime-root", runtimeRoot, "--asset-root", submodule, "--intake-id", intakeId, "--profile-id", "requirement-analysis", "--profile-version", "v1.0.0"]);
    assert.notEqual(intoRuntime.status, 0);
    assert.match(intoRuntime.stderr, /不得写入 Runtime submodule/);

    // --intake-id 与 --change-root 互斥：分析线发生在立项之前，此时尚无 Change。
    const both = runTool("workflow-control.ts", ["bind", "--runtime-root", runtimeRoot, "--asset-root", asset, "--intake-id", intakeId, "--change-root", asset, "--profile-id", "requirement-analysis", "--profile-version", "v1.0.0"]);
    assert.notEqual(both.status, 0);
    assert.match(both.stderr, /不能同时使用/);
  } finally { rmSync(asset, { recursive: true, force: true }); }
});

test("workflow CLI 固定 Change binding 并拒绝静默切换", () => {
  const root = mkdtempSync(join(tmpdir(), "workflow-cli-"));
  try {
    const change = join(root, "change");
    mkdirSync(change, { recursive: true });
    const requestFile = join(root, "request.json");
    const outputFile = join(root, "result.json");
    const bind = runTool("workflow-control.ts", ["bind", "--runtime-root", runtimeRoot, "--change-root", change, "--profile-id", "light-change", "--profile-version", "v1.0.0"]);
    assert.equal(bind.status, 0, bind.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(change, "workflow-binding.json"), "utf8")), { schemaVersion: 1, profileId: "light-change", profileVersion: "v1.0.0" });
    const switchAttempt = runTool("workflow-control.ts", ["bind", "--runtime-root", runtimeRoot, "--change-root", change, "--profile-id", "delivery-change", "--profile-version", "v1.0.0"]);
    assert.notEqual(switchAttempt.status, 0);
    assert.match(switchAttempt.stderr, /拒绝静默切换/);

    writeFileSync(requestFile, JSON.stringify({ schemaVersion: 1, matterId: "cli-matter", binding: { schemaVersion: 1, profileId: "light-change", profileVersion: "v1.0.0" }, inputs: { request: "captured" }, judgments: {} }));
    const run = runTool("workflow-control.ts", ["run", "--runtime-root", runtimeRoot, "--change-root", change, "--request-file", requestFile, "--output-file", outputFile]);
    assert.equal(run.status, 0, JSON.stringify({ error: run.error?.message, signal: run.signal, stderr: run.stderr, stdout: run.stdout, output: existsSync(outputFile) ? readFileSync(outputFile, "utf8") : null }));
    assert.equal(JSON.parse(readFileSync(outputFile, "utf8")).status, "in_progress");

    writeFileSync(requestFile, JSON.stringify({ schemaVersion: 1, matterId: "wrong-binding", binding: { schemaVersion: 1, profileId: "delivery-change", profileVersion: "v1.0.0" }, inputs: {}, judgments: {} }));
    const mismatch = runTool("workflow-control.ts", ["run", "--runtime-root", runtimeRoot, "--change-root", change, "--request-file", requestFile, "--output-file", outputFile]);
    assert.notEqual(mismatch.status, 0);
    assert.equal(JSON.parse(readFileSync(outputFile, "utf8")).status, "rejected");

    writeFileSync(requestFile, "{");
    const malformed = runTool("workflow-control.ts", ["run", "--runtime-root", runtimeRoot, "--change-root", change, "--request-file", requestFile]);
    assert.notEqual(malformed.status, 0);
    assert.equal(JSON.parse(malformed.stdout).status, "rejected");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("standalone workflow entry 自推进到人工门并返回可恢复结果", () => {
  const root = mkdtempSync(join(tmpdir(), "workflow-entry-"));
  try {
    const requestFile = join(root, "request.json");
    const outputFile = join(root, "result.json");
    writeFileSync(requestFile, JSON.stringify({
      schemaVersion: 1,
      matterId: "standalone-matter",
      binding: { schemaVersion: 1, profileId: "light-change", profileVersion: "v1.0.0" },
      inputs: { request: "captured", implementation: "changed", verification: "checked" },
      judgments: {},
    }));
    const advanced = runTool("workflow-entry.ts", ["run", "--runtime-root", runtimeRoot, "--input", requestFile, "--output-file", outputFile]);
    assert.notEqual(advanced.status, 0);
    assert.deepEqual(JSON.parse(readFileSync(outputFile, "utf8")), {
      schemaVersion: 1,
      matterId: "standalone-matter",
      profileId: "light-change",
      profileVersion: "v1.0.0",
      status: "waiting_human_judgment",
      currentStageId: "verification",
      nextStageId: null,
      outputs: { completedStages: ["intake", "implementation"], publishedInputs: {} },
      reason: "阶段 verification 需要人工判断",
    });

    writeFileSync(requestFile, JSON.stringify({
      schemaVersion: 1,
      matterId: "standalone-matter",
      binding: { schemaVersion: 1, profileId: "light-change", profileVersion: "v1.0.0" },
      inputs: { request: "captured", implementation: "changed", verification: "checked" },
      judgments: {},
      completedStages: ["intake", "implementation"],
    }));
    const waiting = runTool("workflow-entry.ts", ["run", "--runtime-root", runtimeRoot, "--input", requestFile, "--output-file", outputFile]);
    assert.notEqual(waiting.status, 0);
    assert.equal(JSON.parse(readFileSync(outputFile, "utf8")).status, "waiting_human_judgment");
    writeFileSync(requestFile, JSON.stringify({
      schemaVersion: 1,
      matterId: "standalone-matter",
      binding: { schemaVersion: 1, profileId: "light-change", profileVersion: "v1.0.0" },
      inputs: { request: "captured", implementation: "changed", verification: "checked" },
      judgments: { verification: "owner-approved" },
      completedStages: ["intake", "implementation"],
    }));
    const completed = runTool("workflow-entry.ts", ["run", "--runtime-root", runtimeRoot, "--input", requestFile, "--output-file", outputFile]);
    assert.equal(completed.status, 0, completed.stderr);
    assert.equal(JSON.parse(readFileSync(outputFile, "utf8")).status, "completed");
    const stdoutRun = runTool("workflow-entry.ts", ["run", "--runtime-root", runtimeRoot, "--input", requestFile]);
    assert.equal(stdoutRun.status, 0, stdoutRun.stderr);
    assert.equal(JSON.parse(stdoutRun.stdout).status, "completed");

    writeFileSync(requestFile, "{");
    const malformed = runTool("workflow-entry.ts", ["run", "--runtime-root", runtimeRoot, "--input", requestFile, "--output-file", outputFile]);
    assert.notEqual(malformed.status, 0);
    assert.equal(JSON.parse(readFileSync(outputFile, "utf8")).status, "rejected");

    const previous = readFileSync(outputFile, "utf8");
    const missing = runTool("workflow-entry.ts", ["run", "--runtime-root", runtimeRoot, "--output-file", outputFile]);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /缺少 --input/);
    assert.equal(readFileSync(outputFile, "utf8"), previous);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime-entry 暴露 workflow 命令且保持入口校验", () => {
  const result = runTool("runtime-entry.ts", ["workflow", "list-profiles"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /light-change/);
});
test("公开候选清单包含 workflow runtime 资产", () => {
  const allowlist = JSON.parse(readFileSync(join(runtimeRoot, "public-allowlist.json"), "utf8")) as { paths: string[] };
  for (const path of ["openspec/contracts/workflow-binding.schema.json", "openspec/contracts/workflow-request.schema.json", "openspec/contracts/workflow-result.schema.json", "openspec/profiles/registry.json", "openspec/tools/workflow-core.ts", "openspec/tools/workflow-control.ts", "openspec/tools/workflow-entry.ts"]) {
    assert.equal(allowlist.paths.includes(path), true, path);
    assert.equal(existsSync(join(runtimeRoot, path)), true, path);
  }
});
test("workflow catalog 和 describe 输出 Profile 用途、阶段与交接", () => {
  const catalog = runTool("workflow-control.ts", ["catalog", "--runtime-root", runtimeRoot]);
  assert.equal(catalog.status, 0, catalog.stderr);
  assert.match(catalog.stdout, /Requirement Analysis \(requirement-analysis@v1\.0\.0\)/);
  assert.match(catalog.stdout, /阶段:\n[\s\S]*捕获需求陈述 \(capture\)/);
  assert.match(catalog.stdout, /交接:/);

  const describe = runTool("workflow-control.ts", ["describe", "--runtime-root", runtimeRoot, "--profile-id", "light-change", "--profile-version", "v1.0.0"]);
  assert.equal(describe.status, 0, describe.stderr);
  assert.match(describe.stdout, /^Lightweight Change \(light-change@v1\.0\.0\)/);
  assert.doesNotMatch(describe.stdout, /Delivery Change/);

  const unknown = runTool("workflow-control.ts", ["describe", "--runtime-root", runtimeRoot, "--profile-id", "missing-profile", "--profile-version", "v1.0.0"]);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /未注册 workflow profile/);
});

test("需求分析输入合同拒绝占位报告和空分析轮次", () => {
  const profile = loadWorkflowProfile(runtimeRoot, { schemaVersion: 1, profileId: "requirement-analysis", profileVersion: "v1.0.0" });
  const request = parseWorkflowRequest({
    schemaVersion: 1,
    matterId: "contract-matter",
    binding: { schemaVersion: 1, profileId: "requirement-analysis", profileVersion: "v1.0.0" },
    inputs: {
      request: "need",
      problemFrame: { problem: "p", goals: ["g"], scope: ["s"], constraints: ["c"] },
      capabilityReport: { known: ["k"], unknown: ["u"], evidence: ["e"], confidence: "medium" },
      optionReport: { options: ["a"], tradeoffs: ["t"], investment: "small", risk: "low", reversible: true },
      decisionReport: { decision: "build", rationale: "r", risks: [], nextStep: "n" },
      disposition: "build",
      analysisRounds: [],
    },
    judgments: { clarify: "sufficient", discover: "sufficient", evaluate: "sufficient", decision: "build" },
    completedStages: ["capture", "clarify", "discover", "evaluate"],
  });
  const result = executeWorkflow(profile, request);
  assert.equal(result.status, "rejected");
  assert.match(result.reason ?? "", /至少需要 1 项/);

  const malformed = executeWorkflow(profile, {
    ...request,
    inputs: { ...request.inputs, analysisRounds: [{ round: 1 }] },
  });
  assert.equal(malformed.status, "rejected");
  assert.match(malformed.reason ?? "", /缺少字段 stage/);
});
