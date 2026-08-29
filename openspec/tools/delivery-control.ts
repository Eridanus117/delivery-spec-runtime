#!/usr/bin/env -S node --experimental-strip-types
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  atomicWriteJson,
  exactKeys,
  fail,
  integer,
  now,
  object,
  parseArgs,
  readJson,
  requiredOption,
  sha256File,
  type JsonObject,
  stringArray,
  text,
  withFileLock,
} from "./runtime-lib.ts";

type Mode = "delivery" | "rehearsal";
type ApprovalStatus = "pending" | "approved" | "rejected";
type TaskStatus = "pending" | "in_progress" | "blocked_external" | "completed" | "abandoned";

type ChangeInfo = {
  schemaVersion: 1;
  slug: string;
  displayName: string;
  mode: Mode;
  repositoryRole: "work" | "private";
  schema: "delivery-change";
  createdAt: string;
};
type Approval = { status: ApprovalStatus; updatedAt: string; actor?: string; evidence?: string; artifactSha256?: string };
type ApprovalState = { schemaVersion: 1; changeSlug: string; revision: number; approvals: Record<string, Approval> };
type Task = { id: string; phase: string; title: string; status: TaskStatus; dependsOn: string[]; verification?: string; note?: string };
type TaskState = { schemaVersion: 1; changeSlug: string; revision: number; updatedAt: string; tasks: Task[] };

const approvalGates = ["requirements", "changePlan", "testPlan", "stage", "release", "archive"] as const;
const artifactByGate: Record<string, string | undefined> = {
  requirements: "02-需求理解/index.md",
  changePlan: "05-改造方案/change-plan.md",
  testPlan: "06-测试方案/test-plan.md",
};

function controlDir(changeRoot: string): string {
  return join(changeRoot, ".delivery");
}
function infoPath(changeRoot: string): string { return join(controlDir(changeRoot), "change-info.json"); }
function approvalsPath(changeRoot: string): string { return join(controlDir(changeRoot), "artifact-approvals.json"); }
function tasksPath(changeRoot: string): string { return join(controlDir(changeRoot), "task-state.json"); }
function sourcesPath(changeRoot: string): string { return join(controlDir(changeRoot), "sources.json"); }
function lockPath(changeRoot: string): string { return join(controlDir(changeRoot), "control.lock"); }

function parseInfo(path: string): ChangeInfo {
  const value = object(readJson(path), "change-info");
  exactKeys(value, ["schemaVersion", "slug", "displayName", "mode", "repositoryRole", "schema", "createdAt"], ["schemaVersion", "slug", "displayName", "mode", "repositoryRole", "schema", "createdAt"], "change-info");
  if (integer(value.schemaVersion, "change-info.schemaVersion") !== 1) fail("change-info.schemaVersion 仅支持 1");
  const mode = text(value.mode, "change-info.mode");
  if (mode !== "delivery" && mode !== "rehearsal") fail("change-info.mode 非法");
  const role = text(value.repositoryRole, "change-info.repositoryRole");
  if (role !== "work" && role !== "private") fail("change-info.repositoryRole 非法");
  if (text(value.schema, "change-info.schema") !== "delivery-change") fail("change-info.schema 必须是 delivery-change");
  return { schemaVersion: 1, slug: text(value.slug, "change-info.slug"), displayName: text(value.displayName, "change-info.displayName"), mode, repositoryRole: role, schema: "delivery-change", createdAt: text(value.createdAt, "change-info.createdAt") };
}

function parseApproval(value: unknown, label: string): Approval {
  const item = object(value, label);
  exactKeys(item, ["status", "updatedAt", "actor", "evidence", "artifactSha256"], ["status", "updatedAt"], label);
  const status = text(item.status, `${label}.status`);
  if (!(["pending", "approved", "rejected"] as string[]).includes(status)) fail(`${label}.status 非法`);
  const result: Approval = { status: status as ApprovalStatus, updatedAt: text(item.updatedAt, `${label}.updatedAt`) };
  for (const key of ["actor", "evidence", "artifactSha256"] as const) if (item[key] !== undefined) result[key] = text(item[key], `${label}.${key}`);
  return result;
}

function parseApprovals(path: string): ApprovalState {
  const value = object(readJson(path), "approvals");
  exactKeys(value, ["schemaVersion", "changeSlug", "revision", "approvals"], ["schemaVersion", "changeSlug", "revision", "approvals"], "approvals");
  if (integer(value.schemaVersion, "approvals.schemaVersion") !== 1) fail("approvals.schemaVersion 仅支持 1");
  const map = object(value.approvals, "approvals.approvals");
  exactKeys(map, approvalGates, approvalGates, "approvals.approvals");
  const approvals: Record<string, Approval> = {};
  for (const gate of approvalGates) approvals[gate] = parseApproval(map[gate], `approvals.${gate}`);
  return { schemaVersion: 1, changeSlug: text(value.changeSlug, "approvals.changeSlug"), revision: integer(value.revision, "approvals.revision"), approvals };
}

function parseTask(value: unknown, index: number): Task {
  const item = object(value, `task[${index}]`);
  exactKeys(item, ["id", "phase", "title", "status", "dependsOn", "verification", "note"], ["id", "phase", "title", "status", "dependsOn"], `task[${index}]`);
  const status = text(item.status, `task[${index}].status`);
  if (!(["pending", "in_progress", "blocked_external", "completed", "abandoned"] as string[]).includes(status)) fail(`task[${index}].status 非法`);
  const result: Task = { id: text(item.id, `task[${index}].id`), phase: text(item.phase, `task[${index}].phase`), title: text(item.title, `task[${index}].title`), status: status as TaskStatus, dependsOn: stringArray(item.dependsOn, `task[${index}].dependsOn`) };
  if (item.verification !== undefined) result.verification = text(item.verification, `task[${index}].verification`);
  if (item.note !== undefined) result.note = text(item.note, `task[${index}].note`);
  return result;
}

function parseTasks(path: string): TaskState {
  const value = object(readJson(path), "task-state");
  exactKeys(value, ["schemaVersion", "changeSlug", "revision", "updatedAt", "tasks"], ["schemaVersion", "changeSlug", "revision", "updatedAt", "tasks"], "task-state");
  if (integer(value.schemaVersion, "task-state.schemaVersion") !== 1) fail("task-state.schemaVersion 仅支持 1");
  if (!Array.isArray(value.tasks)) fail("task-state.tasks 必须是数组");
  const tasks = value.tasks.map(parseTask);
  const ids = new Set<string>();
  for (const task of tasks) {
    if (ids.has(task.id)) fail(`重复 task id: ${task.id}`);
    ids.add(task.id);
  }
  for (const task of tasks) for (const dependency of task.dependsOn) if (!ids.has(dependency)) fail(`task ${task.id} 依赖不存在: ${dependency}`);
  const inProgress = tasks.filter((task) => task.status === "in_progress");
  if (inProgress.length > 1) fail("最多只能有一个 in_progress task");
  return { schemaVersion: 1, changeSlug: text(value.changeSlug, "task-state.changeSlug"), revision: integer(value.revision, "task-state.revision"), updatedAt: text(value.updatedAt, "task-state.updatedAt"), tasks };
}

function initialApprovals(slug: string): ApprovalState {
  const approvals: Record<string, Approval> = {};
  for (const gate of approvalGates) approvals[gate] = { status: "pending", updatedAt: now() };
  return { schemaVersion: 1, changeSlug: slug, revision: 0, approvals };
}

function inspect(changeRoot: string): void {
  const info = parseInfo(infoPath(changeRoot));
  const approvals = parseApprovals(approvalsPath(changeRoot));
  const tasks = existsSync(tasksPath(changeRoot)) ? parseTasks(tasksPath(changeRoot)) : null;
  console.log(JSON.stringify({ info, approvals, tasks }, null, 2));
}

function init(changeRoot: string, options: Map<string, string>): void {
  if (existsSync(infoPath(changeRoot))) fail("Change 已初始化");
  const mode = requiredOption(options, "mode");
  if (mode !== "delivery" && mode !== "rehearsal") fail("--mode 只能是 delivery 或 rehearsal");
  const role = requiredOption(options, "repository-role");
  if (role !== "work" && role !== "private") fail("--repository-role 只能是 work 或 private");
  const slug = requiredOption(options, "slug");
  const info: ChangeInfo = { schemaVersion: 1, slug, displayName: requiredOption(options, "display-name"), mode, repositoryRole: role, schema: "delivery-change", createdAt: now() };
  withFileLock(lockPath(changeRoot), () => {
    atomicWriteJson(infoPath(changeRoot), info);
    atomicWriteJson(approvalsPath(changeRoot), initialApprovals(slug));
  });
  console.log(JSON.stringify(info, null, 2));
}

function invalidateChangedApprovals(changeRoot: string, state: ApprovalState): boolean {
  let changed = false;
  for (const [gate, artifact] of Object.entries(artifactByGate)) {
    const approval = state.approvals[gate];
    if (!artifact || approval.status !== "approved" || !approval.artifactSha256) continue;
    const path = join(changeRoot, artifact);
    if (!existsSync(path) || sha256File(path) !== approval.artifactSha256) {
      state.approvals[gate] = { status: "pending", updatedAt: now(), evidence: "已批准制品内容发生变化，自动失效" };
      changed = true;
    }
  }
  if (changed) state.revision += 1;
  return changed;
}

function approvalSet(changeRoot: string, options: Map<string, string>): void {
  const gate = requiredOption(options, "gate");
  if (!(approvalGates as readonly string[]).includes(gate)) fail(`未知审批门: ${gate}`);
  const status = requiredOption(options, "status");
  if (!(["pending", "approved", "rejected"] as string[]).includes(status)) fail(`审批状态非法: ${status}`);
  withFileLock(lockPath(changeRoot), () => {
    const state = parseApprovals(approvalsPath(changeRoot));
    const expected = options.get("expected-revision");
    if (expected !== undefined && Number(expected) !== state.revision) fail(`审批版本冲突: 期望 ${expected}，实际 ${state.revision}`);
    const approval: Approval = { status: status as ApprovalStatus, updatedAt: now() };
    if (options.has("actor")) approval.actor = requiredOption(options, "actor");
    if (options.has("evidence")) approval.evidence = requiredOption(options, "evidence");
    const artifact = artifactByGate[gate];
    if (status === "approved" && artifact) {
      const path = join(changeRoot, artifact);
      if (!existsSync(path)) fail(`待批准制品不存在: ${artifact}`);
      approval.artifactSha256 = sha256File(path);
    }
    state.approvals[gate] = approval;
    state.revision += 1;
    atomicWriteJson(approvalsPath(changeRoot), state);
    console.log(JSON.stringify(state, null, 2));
  });
}

function approvalsInspect(changeRoot: string): void {
  withFileLock(lockPath(changeRoot), () => {
    const state = parseApprovals(approvalsPath(changeRoot));
    if (invalidateChangedApprovals(changeRoot, state)) atomicWriteJson(approvalsPath(changeRoot), state);
    console.log(JSON.stringify(state, null, 2));
  });
}

function taskWrite(changeRoot: string, options: Map<string, string>): void {
  const imported = parseTasks(requiredOption(options, "file"));
  const info = parseInfo(infoPath(changeRoot));
  if (imported.changeSlug !== info.slug) fail("task-state.changeSlug 与 Change 不一致");
  withFileLock(lockPath(changeRoot), () => atomicWriteJson(tasksPath(changeRoot), imported));
  console.log(JSON.stringify(imported, null, 2));
}

function taskSet(changeRoot: string, options: Map<string, string>): void {
  withFileLock(lockPath(changeRoot), () => {
    const state = parseTasks(tasksPath(changeRoot));
    const expected = Number(requiredOption(options, "expected-revision"));
    if (expected !== state.revision) fail(`任务版本冲突: 期望 ${expected}，实际 ${state.revision}`);
    const id = requiredOption(options, "id");
    const task = state.tasks.find((candidate) => candidate.id === id);
    if (!task) fail(`未知 task id: ${id}`);
    const status = requiredOption(options, "status");
    if (!(["pending", "in_progress", "blocked_external", "completed", "abandoned"] as string[]).includes(status)) fail(`任务状态非法: ${status}`);
    if ((status === "in_progress" || status === "completed") && task.dependsOn.some((dependency) => state.tasks.find((candidate) => candidate.id === dependency)?.status !== "completed")) fail(`task ${id} 的依赖尚未完成`);
    if (status === "in_progress" && state.tasks.some((candidate) => candidate.id !== id && candidate.status === "in_progress")) fail("已有 in_progress task");
    task.status = status as TaskStatus;
    if (options.has("note")) task.note = requiredOption(options, "note");
    state.revision += 1;
    state.updatedAt = now();
    atomicWriteJson(tasksPath(changeRoot), state);
    console.log(JSON.stringify(state, null, 2));
  });
}

function renderTasks(changeRoot: string): void {
  const state = parseTasks(tasksPath(changeRoot));
  const lines = ["# 实施任务", "", `> 机器真源：\`.delivery/task-state.json\`，revision ${state.revision}。本文件只用于人工审阅。`, ""];
  let phase = "";
  for (const task of state.tasks) {
    if (task.phase !== phase) {
      phase = task.phase;
      lines.push(`## ${phase}`, "");
    }
    const checked = task.status === "completed" ? "x" : " ";
    lines.push(`- [${checked}] ${task.id} [${task.status}] ${task.title}`);
    if (task.verification) lines.push(`  - 验证：${task.verification}`);
    if (task.note) lines.push(`  - 说明：${task.note}`);
  }
  const path = join(changeRoot, "07-实施任务", "tasks.md");
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ path, revision: state.revision }, null, 2));
}

function guard(changeRoot: string, operation: string): void {
  const info = parseInfo(infoPath(changeRoot));
  const approvals = parseApprovals(approvalsPath(changeRoot));
  if (invalidateChangedApprovals(changeRoot, approvals)) atomicWriteJson(approvalsPath(changeRoot), approvals);
  if (operation === "apply") {
    if (info.mode !== "delivery") fail("rehearsal 模式禁止 apply");
    for (const gate of ["requirements", "changePlan", "testPlan"]) if (approvals.approvals[gate].status !== "approved") fail(`${gate} 尚未批准`);
  } else if (operation === "acceptance") {
    const tasks = parseTasks(tasksPath(changeRoot));
    if (info.mode === "delivery" && tasks.tasks.some((task) => task.status !== "completed")) fail("delivery 验收前全部任务必须 completed");
  } else if (operation === "release") {
    const acceptance = join(changeRoot, "08-验收", "acceptance.md");
    if (info.mode === "delivery" && (!existsSync(acceptance) || !/^结论:\s*PASS\s*$/m.test(readFileSync(acceptance, "utf8")))) fail("delivery 发布前需要严格 PASS");
    if (info.mode === "delivery" && approvals.approvals.release.status !== "approved") fail("release 尚未批准");
  } else if (operation === "archive") {
    guard(changeRoot, "release");
    if (approvals.approvals.archive.status !== "approved") fail("archive 尚未批准");
    const release = join(changeRoot, "09-发布", "release-plan.md");
    if (!existsSync(release) || !/(release-id\s*:|release-not-required)/.test(readFileSync(release, "utf8"))) fail("缺少成功 release-id 或 release-not-required");
  } else fail(`未知 guard operation: ${operation}`);
  console.log(JSON.stringify({ allowed: true, operation, mode: info.mode }, null, 2));
}

function parseSources(value: unknown): JsonObject {
  const parsed = object(value, "sources");
  exactKeys(parsed, ["schemaVersion", "changeSlug", "sources"], ["schemaVersion", "changeSlug", "sources"], "sources");
  if (integer(parsed.schemaVersion, "sources.schemaVersion") !== 1) fail("sources.schemaVersion 仅支持 1");
  if (!Array.isArray(parsed.sources)) fail("sources.sources 必须是数组");
  for (const [index, source] of parsed.sources.entries()) {
    const item = object(source, `sources[${index}]`);
    exactKeys(item, ["id", "kind", "location", "observedAt", "sha256", "completeness"], ["id", "kind", "location", "observedAt", "completeness"], `sources[${index}]`);
    text(item.id, `sources[${index}].id`); text(item.kind, `sources[${index}].kind`); text(item.location, `sources[${index}].location`); text(item.observedAt, `sources[${index}].observedAt`); text(item.completeness, `sources[${index}].completeness`);
    if (item.sha256 !== undefined) text(item.sha256, `sources[${index}].sha256`);
  }
  return parsed;
}
function sourcesInspect(changeRoot: string): void {
  console.log(JSON.stringify(parseSources(readJson(sourcesPath(changeRoot))), null, 2));
}
function sourcesWrite(changeRoot: string, options: Map<string, string>): void {
  const imported = parseSources(readJson(requiredOption(options, "file")));
  const info = parseInfo(infoPath(changeRoot));
  if (imported.changeSlug !== info.slug) fail("sources.changeSlug 与 Change 不一致");
  withFileLock(lockPath(changeRoot), () => atomicWriteJson(sourcesPath(changeRoot), imported));
  console.log(JSON.stringify(imported, null, 2));
}

function updateSnapshot(changeRoot: string, options: Map<string, string>): void {
  const paths = readJson(requiredOption(options, "paths-file"));
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string")) fail("更新路径清单必须是字符串数组");
  const files: Record<string, string> = {};
  for (const value of paths as string[]) {
    const path = resolve(changeRoot, value);
    const rel = relative(changeRoot, path);
    if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) fail(`更新路径越出 Change: ${value}`);
    if (!existsSync(path)) fail(`更新路径不存在: ${value}`);
    files[rel.split(sep).join("/")] = sha256File(path);
  }
  const snapshot = { schemaVersion: 1, changeSlug: parseInfo(infoPath(changeRoot)).slug, createdAt: now(), files };
  atomicWriteJson(join(controlDir(changeRoot), "update-snapshot.json"), snapshot);
  console.log(JSON.stringify(snapshot, null, 2));
}

function updateDiagnose(changeRoot: string): void {
  const snapshot = object(readJson(join(controlDir(changeRoot), "update-snapshot.json")), "update-snapshot");
  exactKeys(snapshot, ["schemaVersion", "changeSlug", "createdAt", "files"], ["schemaVersion", "changeSlug", "createdAt", "files"], "update-snapshot");
  if (snapshot.schemaVersion !== 1 || snapshot.changeSlug !== parseInfo(infoPath(changeRoot)).slug) fail("update-snapshot 与 Change 不一致");
  const files = object(snapshot.files, "update-snapshot.files");
  const changed: Array<{ path: string; before: string; after: string | null }> = [];
  for (const [path, beforeValue] of Object.entries(files)) {
    const before = text(beforeValue, `update-snapshot.files.${path}`);
    const current = join(changeRoot, path);
    const after = existsSync(current) ? sha256File(current) : null;
    if (after !== before) changed.push({ path, before, after });
  }
  const approvals = parseApprovals(approvalsPath(changeRoot));
  if (invalidateChangedApprovals(changeRoot, approvals)) atomicWriteJson(approvalsPath(changeRoot), approvals);
  console.log(JSON.stringify({ changed, approvalRevision: approvals.revision, approvals: approvals.approvals }, null, 2));
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));
  const changeRoot = resolve(requiredOption(parsed.options, "change-root"));
  const [command, action] = parsed.positional;
  if (command === "init") init(changeRoot, parsed.options);
  else if (command === "inspect") inspect(changeRoot);
  else if (command === "approval" && action === "inspect") approvalsInspect(changeRoot);
  else if (command === "approval" && action === "set") approvalSet(changeRoot, parsed.options);
  else if (command === "task" && action === "inspect") console.log(JSON.stringify(parseTasks(tasksPath(changeRoot)), null, 2));
  else if (command === "task" && action === "write") taskWrite(changeRoot, parsed.options);
  else if (command === "task" && action === "set") taskSet(changeRoot, parsed.options);
  else if (command === "task" && action === "render") renderTasks(changeRoot);
  else if (command === "sources" && action === "inspect") sourcesInspect(changeRoot);
  else if (command === "sources" && action === "write") sourcesWrite(changeRoot, parsed.options);
  else if (command === "update" && action === "snapshot") updateSnapshot(changeRoot, parsed.options);
  else if (command === "update" && action === "diagnose") updateDiagnose(changeRoot);
  else if (command === "runtime-check") console.log(JSON.stringify({ allowed: true, runtime: "delivery-spec-runtime", schema: "delivery-change" }, null, 2));
  else if (command === "guard") guard(changeRoot, requiredOption(parsed.options, "operation"));
  else fail("用法: delivery-control.ts <runtime-check|init|inspect|approval inspect|approval set|task inspect|task write|task set|task render|sources inspect|sources write|update snapshot|update diagnose|guard> --change-root <dir>");
}

try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
