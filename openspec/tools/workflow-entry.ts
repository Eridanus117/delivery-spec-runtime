#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { atomicWriteJson, fail, parseArgs, requiredOption } from "./runtime-lib.ts";
import {
  executeWorkflow,
  loadWorkflowProfile,
  parseWorkflowBinding,
  readWorkflowRequest,
  type WorkflowBinding,
  type WorkflowProfile,
  type WorkflowRequest,
  type WorkflowResult,
} from "./workflow-core.ts";


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

function executeUntilAttentionGate(profile: WorkflowProfile, request: WorkflowRequest): WorkflowResult {
  let currentRequest = request;
  for (;;) {
    const result = executeWorkflow(profile, currentRequest);
    if (result.status !== "in_progress" || !result.nextStageId || result.currentStageId === result.nextStageId) return result;
    const completedStages = result.outputs.completedStages;
    if (!Array.isArray(completedStages) || completedStages.some((stage) => typeof stage !== "string")) return result;
    currentRequest = { ...currentRequest, completedStages };
  }
}

function run(options: Map<string, string>): void {
  const input = resolve(requiredOption(options, "input"));

  let request: WorkflowRequest | null = null;
  let binding: WorkflowBinding | null = null;
  let result: WorkflowResult;
  try {
    request = readWorkflowRequest(input);
    binding = parseWorkflowBinding(request.binding);
    const runtimeRoot = resolve(options.get("runtime-root") ?? resolve(fileURLToPath(new URL("../..", import.meta.url))));
    const profile = loadWorkflowProfile(runtimeRoot, binding, options.get("registry"));
    result = executeUntilAttentionGate(profile, request);
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
  if (positional[0] === "run") return run(options);
  fail("workflow-entry 命令必须是 run");
}

try {
  main();
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
