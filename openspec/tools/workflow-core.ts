import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { exactKeys, fail, object, readJson, stringArray, text } from "./runtime-lib.ts";

export type WorkflowStage = {
  id: string;
  displayName: string;
  requiredInputs: string[];
  humanJudgment: boolean;
};

export type WorkflowProfile = {
  schemaVersion: 1;
  profileId: string;
  profileVersion: string;
  displayName: string;
  stages: WorkflowStage[];
};

export type WorkflowBinding = {
  schemaVersion: 1;
  profileId: string;
  profileVersion: string;
};

export type WorkflowRequest = {
  schemaVersion: 1;
  matterId: string;
  binding: WorkflowBinding;
  inputs: Record<string, unknown>;
  judgments: Record<string, string>;
  completedStages?: string[];
};

export type WorkflowResult = {
  schemaVersion: 1;
  matterId: string;
  profileId: string;
  profileVersion: string;
  status: "in_progress" | "completed" | "blocked" | "waiting_human_judgment" | "rejected";
  currentStageId: string | null;
  nextStageId: string | null;
  outputs: Record<string, unknown>;
  reason: string | null;
};

type RegistryEntry = {
  profileId: string;
  profileVersion: string;
  path: string;
};

type WorkflowRegistry = {
  schemaVersion: 1;
  profiles: RegistryEntry[];
};

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern = /^v[0-9]+\.[0-9]+(?:\.[0-9]+)?$/;

function assertId(value: unknown, label: string): string {
  const id = text(value, label);
  if (!idPattern.test(id)) fail(`${label} 格式非法`);
  return id;
}

function assertVersion(value: unknown, label: string): string {
  const version = text(value, label);
  if (!versionPattern.test(version)) fail(`${label} 格式非法`);
  return version;
}

function assertBinding(value: unknown, label = "binding"): WorkflowBinding {
  const binding = object(value, label);
  exactKeys(binding, ["schemaVersion", "profileId", "profileVersion"], ["schemaVersion", "profileId", "profileVersion"], label);
  if (binding.schemaVersion !== 1) fail(`${label}.schemaVersion 必须为 1`);
  return {
    schemaVersion: 1,
    profileId: assertId(binding.profileId, `${label}.profileId`),
    profileVersion: assertVersion(binding.profileVersion, `${label}.profileVersion`),
  };
}

export function parseWorkflowBinding(value: unknown, label = "binding"): WorkflowBinding {
  return assertBinding(value, label);
}

export function parseWorkflowRequest(value: unknown): WorkflowRequest {
  const request = object(value, "workflow request");
  exactKeys(request, ["schemaVersion", "matterId", "binding", "inputs", "judgments", "completedStages"], ["schemaVersion", "matterId", "binding", "inputs", "judgments"], "workflow request");
  if (request.schemaVersion !== 1) fail("workflow request.schemaVersion 必须为 1");
  const inputs = object(request.inputs, "workflow request.inputs");
  const judgments = object(request.judgments, "workflow request.judgments");
  for (const [key, value] of Object.entries(judgments)) text(value, `workflow request.judgments.${key}`);
  const completedStages = request.completedStages === undefined ? undefined : stringArray(request.completedStages, "workflow request.completedStages");
  if (completedStages && new Set(completedStages).size !== completedStages.length) fail("workflow request.completedStages 不得重复");
  return {
    schemaVersion: 1,
    matterId: text(request.matterId, "workflow request.matterId"),
    binding: assertBinding(request.binding),
    inputs,
    judgments: judgments as Record<string, string>,
    completedStages,
  };
}

function parseStage(value: unknown, index: number): WorkflowStage {
  const stage = object(value, `profile.stages[${index}]`);
  exactKeys(stage, ["id", "displayName", "requiredInputs", "humanJudgment"], ["id", "displayName", "requiredInputs", "humanJudgment"], `profile.stages[${index}]`);
  const requiredInputs = stringArray(stage.requiredInputs, `profile.stages[${index}].requiredInputs`);
  if (new Set(requiredInputs).size !== requiredInputs.length) fail(`profile.stages[${index}].requiredInputs 不得重复`);
  if (typeof stage.humanJudgment !== "boolean") fail(`profile.stages[${index}].humanJudgment 必须是布尔值`);
  return {
    id: assertId(stage.id, `profile.stages[${index}].id`),
    displayName: text(stage.displayName, `profile.stages[${index}].displayName`),
    requiredInputs,
    humanJudgment: stage.humanJudgment,
  };
}

export function parseWorkflowProfile(value: unknown): WorkflowProfile {
  const profile = object(value, "workflow profile");
  exactKeys(profile, ["schemaVersion", "profileId", "profileVersion", "displayName", "stages"], ["schemaVersion", "profileId", "profileVersion", "displayName", "stages"], "workflow profile");
  if (profile.schemaVersion !== 1) fail("workflow profile.schemaVersion 必须为 1");
  if (!Array.isArray(profile.stages) || profile.stages.length === 0) fail("workflow profile.stages 必须为非空数组");
  const stages = profile.stages.map(parseStage);
  if (new Set(stages.map((stage) => stage.id)).size !== stages.length) fail("workflow profile.stages.id 不得重复");
  return {
    schemaVersion: 1,
    profileId: assertId(profile.profileId, "workflow profile.profileId"),
    profileVersion: assertVersion(profile.profileVersion, "workflow profile.profileVersion"),
    displayName: text(profile.displayName, "workflow profile.displayName"),
    stages,
  };
}

function parseRegistry(value: unknown): WorkflowRegistry {
  const registry = object(value, "workflow registry");
  exactKeys(registry, ["schemaVersion", "profiles"], ["schemaVersion", "profiles"], "workflow registry");
  if (registry.schemaVersion !== 1) fail("workflow registry.schemaVersion 必须为 1");
  if (!Array.isArray(registry.profiles) || registry.profiles.length === 0) fail("workflow registry.profiles 必须为非空数组");
  const profiles = registry.profiles.map((value, index) => {
    const entry = object(value, `workflow registry.profiles[${index}]`);
    exactKeys(entry, ["profileId", "profileVersion", "path"], ["profileId", "profileVersion", "path"], `workflow registry.profiles[${index}]`);
    return {
      profileId: assertId(entry.profileId, `workflow registry.profiles[${index}].profileId`),
      profileVersion: assertVersion(entry.profileVersion, `workflow registry.profiles[${index}].profileVersion`),
      path: text(entry.path, `workflow registry.profiles[${index}].path`),
    };
  });
  const keys = profiles.map((entry) => `${entry.profileId}@${entry.profileVersion}`);
  if (new Set(keys).size !== keys.length) fail("workflow registry 不得重复 profileId/profileVersion");
  return { schemaVersion: 1, profiles };
}

function defaultRegistryPath(runtimeRoot: string): string {
  return join(runtimeRoot, "openspec", "profiles", "registry.json");
}

function resolveRegistryProfilePath(registryPath: string, profilePath: string): string {
  if (isAbsolute(profilePath)) fail(`profile path 不得为绝对路径: ${profilePath}`);
  const registryDir = resolve(dirname(registryPath));
  const candidate = resolve(registryDir, profilePath);
  const rel = relative(registryDir, candidate);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`profile path 越出 registry 目录: ${profilePath}`);
  return candidate;
}

export function loadWorkflowProfile(runtimeRoot: string, binding: WorkflowBinding, registryPath = defaultRegistryPath(runtimeRoot)): WorkflowProfile {
  const registry = parseRegistry(readJson(registryPath));
  const entry = registry.profiles.find((item) => item.profileId === binding.profileId && item.profileVersion === binding.profileVersion);
  if (!entry) fail(`未注册 workflow profile: ${binding.profileId}@${binding.profileVersion}`);
  const profilePath = resolveRegistryProfilePath(registryPath, entry.path);
  if (!existsSync(profilePath)) fail(`workflow profile 文件不存在: ${profilePath}`);
  const profile = parseWorkflowProfile(readJson(profilePath));
  if (profile.profileId !== entry.profileId || profile.profileVersion !== entry.profileVersion) fail(`workflow profile 身份与 registry 不一致: ${entry.path}`);
  return profile;
}

export function listWorkflowProfiles(runtimeRoot: string, registryPath = defaultRegistryPath(runtimeRoot)): WorkflowProfile[] {
  const registry = parseRegistry(readJson(registryPath));
  return registry.profiles.map((entry) => loadWorkflowProfile(runtimeRoot, { schemaVersion: 1, profileId: entry.profileId, profileVersion: entry.profileVersion }, registryPath));
}

function resultBase(request: WorkflowRequest, profile: WorkflowProfile, status: WorkflowResult["status"], currentStageId: string | null, nextStageId: string | null, reason: string | null, outputs: Record<string, unknown> = {}): WorkflowResult {
  return {
    schemaVersion: 1,
    matterId: request.matterId,
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    status,
    currentStageId,
    nextStageId,
    outputs,
    reason,
  };
}

export function executeWorkflow(profile: WorkflowProfile, request: WorkflowRequest): WorkflowResult {
  const stageIds = new Set(profile.stages.map((stage) => stage.id));
  const completed = request.completedStages ?? [];
  for (const stageId of completed) if (!stageIds.has(stageId)) return resultBase(request, profile, "rejected", null, null, `completedStages 包含未知阶段: ${stageId}`);
  const completedSet = new Set(completed);
  const currentIndex = profile.stages.findIndex((stage) => !completedSet.has(stage.id));
  if (currentIndex < 0) return resultBase(request, profile, "completed", null, null, null, { completedStages: completed });
  const current = profile.stages[currentIndex];
  const missing = current.requiredInputs.filter((key) => !(key in request.inputs));
  const next = profile.stages[currentIndex + 1]?.id ?? null;
  if (missing.length > 0) return resultBase(request, profile, "blocked", current.id, null, `阶段 ${current.id} 缺少输入: ${missing.join(", ")}`, { missingInputs: missing, completedStages: completed });
  if (current.humanJudgment && !request.judgments[current.id]) return resultBase(request, profile, "waiting_human_judgment", current.id, null, `阶段 ${current.id} 需要人工判断`, { completedStages: completed });
  const advanced = [...completed, current.id];
  return resultBase(request, profile, next ? "in_progress" : "completed", current.id, next, null, { completedStages: advanced, completedStage: current.id });
}

export function readWorkflowRequest(path: string): WorkflowRequest {
  return parseWorkflowRequest(JSON.parse(readFileSync(path, "utf8")));
}
