#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { atomicWriteJson, fail, object, parseArgs, readJson, requiredOption } from "./runtime-lib.ts";
import {
  assertMatterId,
  executeWorkflow,
  listWorkflowProfiles,
  loadWorkflowProfile,
  parseWorkflowBinding,
  readWorkflowRequest,
  type WorkflowBinding,
  type WorkflowProfile,
  type WorkflowRequest,
  type WorkflowResult,
} from "./workflow-core.ts";

export const analysisBindingName = "workflow-binding.json";
export const analysisResultName = "workflow-result.json";

function runtimeRoot(options: Map<string, string>): string {
  return resolve(options.get("runtime-root") ?? ".");
}

/**
 * 分析线产物的落点：资产仓的 openspec/intake/analysis/<intake-id>/。
 * 目录名携带条目 id，使立项门可以按 id 直接定位，不需要第二套索引。
 * 产物属于资产仓的运行时产出，绝不能写进 Runtime submodule。
 */
function analysisDir(options: Map<string, string>, intakeId: string): string {
  const id = assertMatterId(intakeId, "--intake-id");
  const root = resolve(options.get("asset-root") ?? ".");
  if (root.split(/[\\/]/).includes(".delivery-spec-runtime")) fail("分析线产物不得写入 Runtime submodule");
  return join(root, "openspec", "intake", "analysis", id);
}

function bindingForOptions(options: Map<string, string>): WorkflowBinding {
  const intakeId = options.get("intake-id");
  return parseWorkflowBinding({
    schemaVersion: 1,
    profileId: requiredOption(options, "profile-id"),
    profileVersion: requiredOption(options, "profile-version"),
    ...(intakeId === undefined ? {} : { matterId: assertMatterId(intakeId, "--intake-id") }),
  });
}

function profileSummary(profile: WorkflowProfile): string {
  const lines = [
    `${profile.displayName} (${profile.profileId}@${profile.profileVersion})`,
    `用途: ${profile.purpose}`,
    `适用: ${profile.recommendedFor.join("；")}`,
    `不适用: ${profile.notRecommendedFor.join("；")}`,
    "阶段:",
  ];
  profile.stages.forEach((stage, index) => {
    lines.push(`  ${index + 1}. ${stage.displayName} (${stage.id})`);
    lines.push(`     输入: ${stage.requiredInputs.join("、") || "无"}`);
    lines.push(`     人工判断: ${stage.humanJudgment ? (stage.judgmentOptions?.join("、") || "需要") : "否"}`);
    lines.push(`     说明: ${stage.description}`);
    lines.push(`     退出条件: ${stage.exitCondition}`);
  });
  lines.push(`交接: ${profile.handoff}`);
  return lines.join("\n");
}

function listProfiles(options: Map<string, string>): void {
  const root = runtimeRoot(options);
  const registryPath = options.get("registry");
  const profiles = listWorkflowProfiles(root, registryPath);
  console.log(JSON.stringify(profiles.map((profile) => ({
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    displayName: profile.displayName,
    stages: profile.stages,
  })), null, 2));
}

function catalog(options: Map<string, string>): void {
  const profiles = listWorkflowProfiles(runtimeRoot(options), options.get("registry"));
  console.log(["Workflow Profiles", ...profiles.map(profileSummary)].join("\n\n"));
}

function describe(options: Map<string, string>): void {
  const binding = bindingForOptions(options);
  const profile = loadWorkflowProfile(runtimeRoot(options), binding, options.get("registry"));
  console.log(profileSummary(profile));
}

function resolveExistingChangeRoot(options: Map<string, string>): string {
  const changeRoot = resolve(requiredOption(options, "change-root"));
  if (!existsSync(changeRoot)) fail(`Change 根不存在: ${changeRoot}`);
  return changeRoot;
}

function rejectedResult(request: WorkflowRequest | null, binding: WorkflowBinding | null, reason: string): WorkflowResult {
  return {
    schemaVersion: 1,
    matterId: request?.matterId ?? "unknown",
    profileId: request?.binding.profileId ?? binding?.profileId ?? "unknown",
    profileVersion: request?.binding.profileVersion ?? binding?.profileVersion ?? "v0.0.0",
    status: "rejected",
    currentStageId: null,
    nextStageId: null,
    outputs: {},
    reason,
  };
}

function bindChange(options: Map<string, string>): void {
  const intakeId = options.get("intake-id");
  if (intakeId !== undefined && options.has("change-root")) fail("--intake-id 与 --change-root 不能同时使用：分析线发生在立项之前，此时尚无 Change");
  const bindingPath = intakeId === undefined
    ? join(resolveExistingChangeRoot(options), "workflow-binding.json")
    : join(analysisDir(options, intakeId), analysisBindingName);
  const binding = bindingForOptions(options);
  const registryPath = options.get("registry");
  loadWorkflowProfile(runtimeRoot(options), binding, registryPath);
  if (existsSync(bindingPath)) {
    const current = parseWorkflowBinding(readJson(bindingPath), "existing workflow binding");
    if (current.profileId !== binding.profileId || current.profileVersion !== binding.profileVersion) {
      fail(`Change 已绑定 ${current.profileId}@${current.profileVersion}，拒绝静默切换`);
    }
    console.log(JSON.stringify(current, null, 2));
    return;
  }
  atomicWriteJson(bindingPath, binding);
  console.log(JSON.stringify(binding, null, 2));
}

function runWorkflow(options: Map<string, string>): void {
  const intakeId = options.get("intake-id");
  let request: WorkflowRequest | null = null;
  let binding: WorkflowBinding | null = null;
  let result: WorkflowResult;
  let analysisRoot: string | null = null;
  try {
    if (intakeId !== undefined && options.has("change-root")) fail("--intake-id 与 --change-root 不能同时使用：分析线发生在立项之前，此时尚无 Change");
    analysisRoot = intakeId === undefined ? null : analysisDir(options, intakeId);
    const bindingPath = analysisRoot === null
      ? join(resolveExistingChangeRoot(options), "workflow-binding.json")
      : join(analysisRoot, analysisBindingName);
    const boundProfile = parseWorkflowBinding(readJson(bindingPath), analysisRoot === null ? "Change workflow binding" : "分析线 workflow binding");
    binding = boundProfile;
    const parsedRequest = readWorkflowRequest(resolve(requiredOption(options, "request-file")));
    request = parsedRequest;
    if (parsedRequest.binding.profileId !== boundProfile.profileId || parsedRequest.binding.profileVersion !== boundProfile.profileVersion) {
      fail(`workflow request binding ${parsedRequest.binding.profileId}@${parsedRequest.binding.profileVersion} 与 binding ${boundProfile.profileId}@${boundProfile.profileVersion} 不一致`);
    }
    // 分析线产物必须双向携带条目 id：目录名、binding.matterId 与 request.matterId 三者一致，
    // 否则立项门就可能拿另一条目的分析结果放行本条目。
    if (intakeId !== undefined) {
      if (boundProfile.matterId !== intakeId) fail(`分析线 binding 的 matterId ${boundProfile.matterId ?? "(缺失)"} 与 --intake-id ${intakeId} 不一致`);
      if (parsedRequest.matterId !== intakeId) fail(`workflow request 的 matterId ${parsedRequest.matterId} 与 --intake-id ${intakeId} 不一致`);
    }
    const profile = loadWorkflowProfile(runtimeRoot(options), boundProfile, options.get("registry"));
    result = executeWorkflow(profile, parsedRequest);
  } catch (error) {
    result = rejectedResult(request, binding, (error as Error).message);
  }
  const output = options.get("output-file");
  if (analysisRoot !== null) atomicWriteJson(join(analysisRoot, analysisResultName), result);
  if (output) atomicWriteJson(resolve(output), result);
  else console.log(JSON.stringify(result, null, 2));
  if (result.status !== "in_progress" && result.status !== "completed") process.exitCode = 1;
}

/** VC-015：以 intake id 查询分析线产物，返回 binding 与 result，缺失时明确报告而不静默返回空。 */
function inspectAnalysis(options: Map<string, string>): void {
  const intakeId = requiredOption(options, "intake-id");
  const dir = analysisDir(options, intakeId);
  const bindingPath = join(dir, analysisBindingName);
  const resultPath = join(dir, analysisResultName);
  const missing: string[] = [];
  if (!existsSync(bindingPath)) missing.push(analysisBindingName);
  if (!existsSync(resultPath)) missing.push(analysisResultName);
  if (missing.length) {
    console.log(JSON.stringify({ intakeId, found: false, missing }, null, 2));
    fail(`Intake ${intakeId} 缺少分析线产物: ${missing.join("、")}`);
  }
  console.log(JSON.stringify({
    intakeId,
    found: true,
    missing: [],
    binding: parseWorkflowBinding(readJson(bindingPath), "分析线 workflow binding"),
    result: object(readJson(resultPath), "分析线 workflow result"),
  }, null, 2));
}

function main(): void {
  const { positional, options } = parseArgs(process.argv.slice(2));
  const command = positional[0];
  if (command === "list-profiles") return listProfiles(options);
  if (command === "catalog") return catalog(options);
  if (command === "describe") return describe(options);
  if (command === "bind") return bindChange(options);
  if (command === "run") return runWorkflow(options);
  if (command === "inspect") return inspectAnalysis(options);
  fail("workflow-control 命令必须是 list-profiles、catalog、describe、bind、run 或 inspect");
}

try {
  main();
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
