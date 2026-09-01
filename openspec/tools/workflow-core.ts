import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { exactKeys, fail, object, readJson, stringArray, text } from "./runtime-lib.ts";

export type WorkflowInputContract = {
 type: "string" | "object" | "array" | "enum";
 requiredFields?: string[];
 itemRequiredFields?: string[];
 minItems?: number;
 enum?: string[];
};

export type WorkflowStage = {
 id: string;
 displayName: string;
 description: string;
 exitCondition: string;
 requiredInputs: string[];
 humanJudgment: boolean;
 judgmentOptions?: string[];
 repeatOnJudgments?: string[];
 outputInputs?: string[];
};

export type WorkflowDefinitionAuthority = {
 kind: "runtime-code";
 paths: string[];
 note: string;
};

export type WorkflowProfile = {
 schemaVersion: 1;
 profileId: string;
 profileVersion: string;
 displayName: string;
 purpose: string;
 recommendedFor: string[];
 notRecommendedFor: string[];
 handoff: string;
 definitionAuthority?: WorkflowDefinitionAuthority;
 inputContracts?: Record<string, WorkflowInputContract>;
 stages: WorkflowStage[];
};

export type WorkflowBinding = {
 schemaVersion: 1;
 profileId: string;
 profileVersion: string;
 /** 可选：该 binding 所服务的 Intake 条目 id，供立项门按条目 id 定位分析线产物。 */
 matterId?: string;
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

/** Intake 条目 id。分析线产物以它作目录名，故必须是路径安全的固定形状。 */
export const intakeIdPattern = /^INT-[0-9]{8}-[0-9]{3}-[a-z0-9][a-z0-9-]*$/;
export function assertMatterId(value: unknown, label: string): string {
  const matterId = text(value, label);
  if (!intakeIdPattern.test(matterId)) fail(`${label} 必须是 Intake 条目 id（形如 INT-YYYYMMDD-NNN-slug）: ${matterId}`);
  return matterId;
}

function assertBinding(value: unknown, label = "binding"): WorkflowBinding {
  const binding = object(value, label);
  exactKeys(binding, ["schemaVersion", "profileId", "profileVersion", "matterId"], ["schemaVersion", "profileId", "profileVersion"], label);
  if (binding.schemaVersion !== 1) fail(`${label}.schemaVersion 必须为 1`);
  return {
    schemaVersion: 1,
    profileId: assertId(binding.profileId, `${label}.profileId`),
    profileVersion: assertVersion(binding.profileVersion, `${label}.profileVersion`),
    ...(binding.matterId === undefined ? {} : { matterId: assertMatterId(binding.matterId, `${label}.matterId`) }),
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
function parseInputContract(value: unknown, key: string): WorkflowInputContract {
  const contract = object(value, `profile.inputContracts.${key}`);
  exactKeys(contract, ["type", "requiredFields", "itemRequiredFields", "minItems", "enum"], ["type"], `profile.inputContracts.${key}`);
  if (!["string", "object", "array", "enum"].includes(String(contract.type))) fail(`profile.inputContracts.${key}.type 非法`);
  const requiredFields = contract.requiredFields === undefined ? undefined : stringArray(contract.requiredFields, `profile.inputContracts.${key}.requiredFields`);
  const itemRequiredFields = contract.itemRequiredFields === undefined ? undefined : stringArray(contract.itemRequiredFields, `profile.inputContracts.${key}.itemRequiredFields`);
  const minItems = contract.minItems === undefined ? undefined : contract.minItems;
  const enumValues = contract.enum === undefined ? undefined : stringArray(contract.enum, `profile.inputContracts.${key}.enum`);
  for (const [name, values] of [["requiredFields", requiredFields], ["itemRequiredFields", itemRequiredFields], ["enum", enumValues] ] as const) {
    if (values && values.some((item) => item.length === 0)) fail(`profile.inputContracts.${key}.${name} 不得为空`);
    if (values && new Set(values).size !== values.length) fail(`profile.inputContracts.${key}.${name} 不得重复`);
  }
  if (minItems !== undefined && (!Number.isInteger(minItems) || minItems < 1)) fail(`profile.inputContracts.${key}.minItems 必须是正整数`);
  if (contract.type === "object" && itemRequiredFields) fail(`profile.inputContracts.${key}.object 不得声明 itemRequiredFields`);
  if (contract.type !== "object" && requiredFields) fail(`profile.inputContracts.${key}.${contract.type} 不得声明 requiredFields`);
  if (contract.type !== "array" && (itemRequiredFields || minItems !== undefined)) fail(`profile.inputContracts.${key}.${contract.type} 不得声明数组约束`);
  if (contract.type === "enum" && !enumValues) fail(`profile.inputContracts.${key}.enum 必须存在`);
  if (contract.type !== "enum" && enumValues) fail(`profile.inputContracts.${key}.${contract.type} 不得声明 enum`);
  return { type: contract.type as WorkflowInputContract["type"], requiredFields, itemRequiredFields, minItems, enum: enumValues };
}
function parseInputContracts(value: unknown): Record<string, WorkflowInputContract> {
  if (value === undefined) return {};
  const contracts = object(value, "workflow profile.inputContracts");
  const parsed: Record<string, WorkflowInputContract> = {};
  for (const [key, contract] of Object.entries(contracts)) {
    if (!key) fail("workflow profile.inputContracts 不得包含空键");
    parsed[key] = parseInputContract(contract, key);
  }
  return parsed;
}

function parseStage(value: unknown, index: number): WorkflowStage {
 const stage = object(value, `profile.stages[${index}]`);
 exactKeys(stage, ["id", "displayName", "description", "exitCondition", "requiredInputs", "humanJudgment", "judgmentOptions", "repeatOnJudgments", "outputInputs"], ["id", "displayName", "requiredInputs", "humanJudgment"], `profile.stages[${index}]`);
 const requiredInputs = stringArray(stage.requiredInputs, `profile.stages[${index}].requiredInputs`);
 const judgmentOptions = stage.judgmentOptions === undefined ? [] : stringArray(stage.judgmentOptions, `profile.stages[${index}].judgmentOptions`);
 const repeatOnJudgments = stage.repeatOnJudgments === undefined ? [] : stringArray(stage.repeatOnJudgments, `profile.stages[${index}].repeatOnJudgments`);
 const outputInputs = stage.outputInputs === undefined ? [] : stringArray(stage.outputInputs, `profile.stages[${index}].outputInputs`);
  if (requiredInputs.some((key) => key.length === 0)) fail(`profile.stages[${index}].requiredInputs 不得为空`);
  if (judgmentOptions.some((value) => value.length === 0)) fail(`profile.stages[${index}].judgmentOptions 不得为空`);
  if (repeatOnJudgments.some((value) => value.length === 0)) fail(`profile.stages[${index}].repeatOnJudgments 不得为空`);
  if (outputInputs.some((value) => value.length === 0)) fail(`profile.stages[${index}].outputInputs 不得为空`);
  if (new Set(requiredInputs).size !== requiredInputs.length) fail(`profile.stages[${index}].requiredInputs 不得重复`);
  if (new Set(judgmentOptions).size !== judgmentOptions.length) fail(`profile.stages[${index}].judgmentOptions 不得重复`);
  if (new Set(repeatOnJudgments).size !== repeatOnJudgments.length) fail(`profile.stages[${index}].repeatOnJudgments 不得重复`);
  if (repeatOnJudgments.some((value) => !judgmentOptions.includes(value))) fail(`profile.stages[${index}].repeatOnJudgments 必须属于 judgmentOptions`);
  if (new Set(outputInputs).size !== outputInputs.length) fail(`profile.stages[${index}].outputInputs 不得重复`);
  if (typeof stage.humanJudgment !== "boolean") fail(`profile.stages[${index}].humanJudgment 必须是布尔值`);
 const parsed: WorkflowStage = {
   id: assertId(stage.id, `profile.stages[${index}].id`),
   displayName: text(stage.displayName, `profile.stages[${index}].displayName`),
   description: stage.description === undefined ? text(stage.displayName, `profile.stages[${index}].displayName`) : text(stage.description, `profile.stages[${index}].description`),
   exitCondition: stage.exitCondition === undefined ? "阶段必需输入已提供且人工判断已完成。" : text(stage.exitCondition, `profile.stages[${index}].exitCondition`),
   requiredInputs,
   humanJudgment: stage.humanJudgment,
 };
 if (stage.judgmentOptions !== undefined) parsed.judgmentOptions = judgmentOptions;
 if (stage.repeatOnJudgments !== undefined) parsed.repeatOnJudgments = repeatOnJudgments;
 if (stage.outputInputs !== undefined) parsed.outputInputs = outputInputs;
 return parsed;
}

function parseDefinitionAuthority(value: unknown): WorkflowDefinitionAuthority | undefined {
  if (value === undefined) return undefined;
  const authority = object(value, "workflow profile.definitionAuthority");
  exactKeys(authority, ["kind", "paths", "note"], ["kind", "paths", "note"], "workflow profile.definitionAuthority");
  if (authority.kind !== "runtime-code") fail("workflow profile.definitionAuthority.kind 仅支持 runtime-code");
  const paths = stringArray(authority.paths, "workflow profile.definitionAuthority.paths");
  if (paths.length === 0) fail("workflow profile.definitionAuthority.paths 不得为空");
  for (const path of paths) {
    if (!path || path.startsWith("/") || /^[A-Za-z]:/.test(path) || path.split("/").includes("..")) fail(`workflow profile.definitionAuthority.paths 必须是仓库内相对路径: ${path}`);
  }
  if (new Set(paths).size !== paths.length) fail("workflow profile.definitionAuthority.paths 不得重复");
  return { kind: "runtime-code", paths, note: text(authority.note, "workflow profile.definitionAuthority.note") };
}

export function parseWorkflowProfile(value: unknown): WorkflowProfile {
  const profile = object(value, "workflow profile");
  exactKeys(profile, ["schemaVersion", "profileId", "profileVersion", "displayName", "purpose", "recommendedFor", "notRecommendedFor", "handoff", "definitionAuthority", "inputContracts", "stages"], ["schemaVersion", "profileId", "profileVersion", "displayName", "stages"], "workflow profile");
  if (profile.schemaVersion !== 1) fail("workflow profile.schemaVersion 必须为 1");
  const displayName = text(profile.displayName, "workflow profile.displayName");
  const recommendedFor = profile.recommendedFor === undefined ? ["未声明"] : stringArray(profile.recommendedFor, "workflow profile.recommendedFor");
  const notRecommendedFor = profile.notRecommendedFor === undefined ? ["未声明"] : stringArray(profile.notRecommendedFor, "workflow profile.notRecommendedFor");
  if (recommendedFor.length === 0 || notRecommendedFor.length === 0) fail("workflow profile 适用范围不得为空");
  if (!Array.isArray(profile.stages) || profile.stages.length === 0) fail("workflow profile.stages 必须为非空数组");
  const stages = profile.stages.map(parseStage);
  if (new Set(stages.map((stage) => stage.id)).size !== stages.length) fail("workflow profile.stages.id 不得重复");
  const inputContracts = parseInputContracts(profile.inputContracts);
  return {
    schemaVersion: 1,
    profileId: assertId(profile.profileId, "workflow profile.profileId"),
    profileVersion: assertVersion(profile.profileVersion, "workflow profile.profileVersion"),
    displayName,
    purpose: profile.purpose === undefined ? displayName : text(profile.purpose, "workflow profile.purpose"),
    recommendedFor,
    notRecommendedFor,
    handoff: profile.handoff === undefined ? "交给调用方继续处理。" : text(profile.handoff, "workflow profile.handoff"),
    definitionAuthority: parseDefinitionAuthority(profile.definitionAuthority),
    inputContracts: Object.keys(inputContracts).length > 0 ? inputContracts : undefined,
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
  const registryDir = realpathSync(dirname(registryPath));
  const resolvedProfilePath = realpathSync(profilePath);
  const rel = relative(registryDir, resolvedProfilePath);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`workflow profile 路径越出 registry 目录: ${entry.path}`);
  const profile = parseWorkflowProfile(readJson(resolvedProfilePath));
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

function publishedInputs(request: WorkflowRequest, stage: WorkflowStage): Record<string, unknown> {
 const values: Record<string, unknown> = {};
 for (const key of stage.outputInputs ?? []) {
   if (Object.hasOwn(request.inputs, key)) values[key] = request.inputs[key];
 }
 return values;
}

function stageOutputs(request: WorkflowRequest, stage: WorkflowStage, completedStages: string[]): Record<string, unknown> {
 return {
   completedStages,
   publishedInputs: publishedInputs(request, stage),
 };
}

function judgmentError(stage: WorkflowStage, request: WorkflowRequest): string | null {
 if (!stage.humanJudgment) return null;
 if (!Object.hasOwn(request.judgments, stage.id)) return `阶段 ${stage.id} 需要人工判断`;
 const judgment = request.judgments[stage.id];
 if (!judgment) return `阶段 ${stage.id} 需要人工判断`;
 if (stage.judgmentOptions && !stage.judgmentOptions.includes(judgment)) return `阶段 ${stage.id} 人工判断非法: ${judgment}`;
 return null;
}

function inputContractError(contract: WorkflowInputContract, value: unknown, label: string): string | null {
 if (contract.type === "string" && typeof value !== "string") return `${label} 必须是字符串`;
 if (contract.type === "enum" && (typeof value !== "string" || !contract.enum?.includes(value))) return `${label} 必须是声明的枚举值`;
 if (contract.type === "object") {
   if (typeof value !== "object" || value === null || Array.isArray(value)) return `${label} 必须是对象`;
   for (const field of contract.requiredFields ?? []) if (!Object.hasOwn(value, field)) return `${label} 缺少字段 ${field}`;
 }
 if (contract.type === "array") {
   if (!Array.isArray(value)) return `${label} 必须是数组`;
   if (contract.minItems !== undefined && value.length < contract.minItems) return `${label} 至少需要 ${contract.minItems} 项`;
   for (let index = 0; index < value.length; index += 1) {
     const item = value[index];
     if (typeof item !== "object" || item === null || Array.isArray(item)) return `${label}[${index}] 必须是对象`;
     for (const field of contract.itemRequiredFields ?? []) if (!Object.hasOwn(item, field)) return `${label}[${index}] 缺少字段 ${field}`;
   }
 }
 return null;
}
function stageInputError(profile: WorkflowProfile, stage: WorkflowStage, request: WorkflowRequest): { missing: string[]; invalid: string | null } {
 const missing = stage.requiredInputs.filter((key) => !Object.hasOwn(request.inputs, key));
 if (missing.length > 0) return { missing, invalid: null };
 for (const key of stage.requiredInputs) {
   const contract = profile.inputContracts?.[key];
   if (contract) {
     const error = inputContractError(contract, request.inputs[key], `阶段 ${stage.id} 输入 ${key}`);
     if (error) return { missing: [], invalid: error };
   }
 }
 return { missing: [], invalid: null };
}

export function executeWorkflow(profile: WorkflowProfile, request: WorkflowRequest): WorkflowResult {
  const completed = request.completedStages ?? [];
  for (let index = 0; index < completed.length; index += 1) {
    const stage = profile.stages[index];
    const stageId = completed[index];
    if (!stage || stage.id !== stageId) {
      return resultBase(request, profile, "rejected", null, null, `completedStages 必须是 profile 阶段的连续前缀: ${stageId}`);
    }
    const inputs = stageInputError(profile, stage, request);
    if (inputs.missing.length > 0) {
      return resultBase(request, profile, "rejected", null, null, `已完成阶段 ${stage.id} 缺少输入: ${inputs.missing.join(", ")}`);
    }
    if (inputs.invalid) return resultBase(request, profile, "rejected", null, null, inputs.invalid);
    const completedJudgment = request.judgments[stage.id];
    if (stage.repeatOnJudgments?.includes(completedJudgment)) return resultBase(request, profile, "rejected", null, null, `已完成阶段 ${stage.id} 仍要求继续分析`);
    const error = judgmentError(stage, request);
    if (error) return resultBase(request, profile, "rejected", null, null, `已完成阶段 ${error}`);
  }
  const currentIndex = completed.length;
  if (currentIndex >= profile.stages.length) {
    // 幂等重跑：全部阶段都已在 completedStages 里。完成态必须与「本轮刚推完最后一站」
    // 产出同一形状，否则同一份分析重跑一次就会把 publishedInputs 丢掉，
    // 下游按产物取值的门禁会把一份合法完成的分析判成缺字段。
    const last = profile.stages[profile.stages.length - 1];
    return resultBase(request, profile, "completed", null, null, null, stageOutputs(request, last, completed));
  }
  const current = profile.stages[currentIndex];
  const inputs = stageInputError(profile, current, request);
  const next = profile.stages[currentIndex + 1]?.id ?? null;
  if (inputs.missing.length > 0) return resultBase(request, profile, "blocked", current.id, null, `阶段 ${current.id} 缺少输入: ${inputs.missing.join(", ")}`, { missingInputs: inputs.missing, completedStages: completed });
  if (inputs.invalid) return resultBase(request, profile, "rejected", current.id, null, inputs.invalid, { completedStages: completed });
  const error = judgmentError(current, request);
  if (error) {
    const judgment = request.judgments[current.id];
    const invalid = Boolean(judgment && current.judgmentOptions && !current.judgmentOptions.includes(judgment));
    return resultBase(request, profile, invalid ? "rejected" : "waiting_human_judgment", current.id, null, error, stageOutputs(request, current, completed));
  }
  const judgment = request.judgments[current.id];
  if (current.repeatOnJudgments?.includes(judgment)) {
    return resultBase(request, profile, "in_progress", current.id, current.id, null, { ...stageOutputs(request, current, completed), repeated: true });
  }
  const advanced = [...completed, current.id];
  return resultBase(request, profile, next ? "in_progress" : "completed", current.id, next, null, { ...stageOutputs(request, current, advanced), completedStage: current.id });
}

export function readWorkflowRequest(path: string): WorkflowRequest {
  return parseWorkflowRequest(JSON.parse(readFileSync(path, "utf8")));
}
