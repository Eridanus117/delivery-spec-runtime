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
    stages: profile.stages.map((stage) => stage.id),
  })), null, 2));
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
  const request = readWorkflowRequest(resolve(requiredOption(options, "request-file")));
  let result;
  try {
    const profile = loadWorkflowProfile(runtimeRoot(options), request.binding, options.get("registry"));
    result = executeWorkflow(profile, request);
  } catch (error) {
    result = {
      schemaVersion: 1 as const,
      matterId: request.matterId,
      profileId: request.binding.profileId,
      profileVersion: request.binding.profileVersion,
      status: "rejected" as const,
      currentStageId: null,
      nextStageId: null,
      outputs: {},
      reason: (error as Error).message,
    };
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
