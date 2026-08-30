#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { atomicWriteJson, fail, object, parseArgs, readJson, requiredOption } from "./runtime-lib.ts";
import {
  executeWorkflow,
  listWorkflowProfiles,
  loadWorkflowProfile,
  parseWorkflowBinding,
  readWorkflowRequest,
  type WorkflowBinding,
  type WorkflowRequest,
  type WorkflowResult,
} from "./workflow-core.ts";

function runtimeRoot(options: Map<string, string>): string {
  return resolve(options.get("runtime-root") ?? ".");
}

function bindingForOptions(options: Map<string, string>): WorkflowBinding {
  return parseWorkflowBinding({
    schemaVersion: 1,
    profileId: requiredOption(options, "profile-id"),
    profileVersion: requiredOption(options, "profile-version"),
  });
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
  const changeRoot = resolve(requiredOption(options, "change-root"));
  if (!existsSync(changeRoot)) fail(`Change 根不存在: ${changeRoot}`);
  const bindingPath = join(changeRoot, "workflow-binding.json");
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
  let request: WorkflowRequest | null = null;
  let binding: WorkflowBinding | null = null;
  let result: WorkflowResult;
  try {
    const changeRoot = resolve(requiredOption(options, "change-root"));
    const changeBinding = parseWorkflowBinding(readJson(join(changeRoot, "workflow-binding.json")), "Change workflow binding");
    binding = changeBinding;
    const parsedRequest = readWorkflowRequest(resolve(requiredOption(options, "request-file")));
    request = parsedRequest;
    if (parsedRequest.binding.profileId !== changeBinding.profileId || parsedRequest.binding.profileVersion !== changeBinding.profileVersion) {
      fail(`workflow request binding ${parsedRequest.binding.profileId}@${parsedRequest.binding.profileVersion} 与 Change binding ${changeBinding.profileId}@${changeBinding.profileVersion} 不一致`);
    }
    const profile = loadWorkflowProfile(runtimeRoot(options), changeBinding, options.get("registry"));
    result = executeWorkflow(profile, parsedRequest);
  } catch (error) {
    result = rejectedResult(request, binding, (error as Error).message);
  }
  const output = options.get("output-file");
  if (output) atomicWriteJson(resolve(output), result);
  else console.log(JSON.stringify(result, null, 2));
  if (result.status !== "in_progress" && result.status !== "completed") process.exitCode = 1;
}

function main(): void {
  const { positional, options } = parseArgs(process.argv.slice(2));
  const command = positional[0];
  if (command === "list-profiles") return listProfiles(options);
  if (command === "bind") return bindChange(options);
  if (command === "run") return runWorkflow(options);
  fail("workflow-control 命令必须是 list-profiles、bind 或 run");
}

try {
  main();
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
