import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeWorkflow, loadWorkflowProfile, parseWorkflowProfile, parseWorkflowRequest } from "../openspec/tools/workflow-core.ts";
import { runTool, runtimeRoot } from "./helpers.ts";

test("registry 提供两个 profile 且 profile 版本必须精确匹配", () => {
  const result = runTool("workflow-control.ts", ["list-profiles", "--runtime-root", runtimeRoot]);
  assert.equal(result.status, 0, result.stderr);
  const profiles = JSON.parse(result.stdout) as Array<{ profileId: string; profileVersion: string }>;
  assert.deepEqual(profiles.map((profile) => `${profile.profileId}@${profile.profileVersion}`), ["delivery-change@v1.0.0", "light-change@v1.0.0"]);
  assert.throws(() => loadWorkflowProfile(runtimeRoot, { schemaVersion: 1, profileId: "delivery-change", profileVersion: "v9.0.0" }), /未注册 workflow profile/);
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

test("profile 合同拒绝重复阶段和未知字段", () => {
  assert.throws(() => parseWorkflowProfile({ schemaVersion: 1, profileId: "demo", profileVersion: "v1.0.0", displayName: "Demo", stages: [{ id: "one", displayName: "One", requiredInputs: [], humanJudgment: false }, { id: "one", displayName: "Again", requiredInputs: [], humanJudgment: false }] }), /stages.id 不得重复/);
  assert.throws(() => parseWorkflowProfile({ schemaVersion: 1, profileId: "demo", profileVersion: "v1.0.0", displayName: "Demo", extra: true, stages: [{ id: "one", displayName: "One", requiredInputs: [], humanJudgment: false }] }), /未知字段 extra/);
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
    const run = runTool("workflow-control.ts", ["run", "--runtime-root", runtimeRoot, "--request-file", requestFile, "--output-file", outputFile]);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(readFileSync(outputFile, "utf8")).status, "in_progress");
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
  for (const path of ["openspec/contracts/workflow-binding.schema.json", "openspec/contracts/workflow-request.schema.json", "openspec/contracts/workflow-result.schema.json", "openspec/profiles/registry.json", "openspec/tools/workflow-core.ts", "openspec/tools/workflow-control.ts"]) {
    assert.equal(allowlist.paths.includes(path), true, path);
    assert.equal(existsSync(join(runtimeRoot, path)), true, path);
  }
});
