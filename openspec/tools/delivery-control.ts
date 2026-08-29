#!/usr/bin/env -S node --experimental-strip-types
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
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
  sha256Paths,
  type JsonObject,
  stringArray,
  text,
  withFileLock,
} from "./runtime-lib.ts";

type Mode = "delivery" | "rehearsal";
type ApprovalStatus = "pending" | "approved" | "rejected";
type TaskStatus = "planned" | "implemented_unverified" | "blocked_external" | "verified";

type ChangeInfo = {
  schemaVersion: 1;
  displayName: string;
};
type ChangeMode = { schemaVersion: 1; mode: "rehearsal"; reason: string; approvedBy: string; approvedAt: string };
type Approval = { status: ApprovalStatus; updatedAt: string; actor?: string; evidence?: string; artifactSha256?: string };
type ApprovalState = { schemaVersion: 1; changeSlug: string; revision: number; approvals: Record<string, Approval> };
type Task = { id: string; phase: string; title: string; status: TaskStatus; dependsOn: string[]; deliverable: string; verification: string; evidence?: string; blocker?: string; note?: string };
type TaskState = { schemaVersion: 1; changeSlug: string; revision: number; updatedAt: string; tasks: Task[] };

const approvalGates = ["requirements", "changePlan", "testPlan", "stage", "release", "archive"] as const;
const artifactByGate: Record<string, string[] | undefined> = {
  requirements: ["02-需求理解/需求理解.md", "specs"],
  changePlan: ["05-改造方案/改造方案.md"],
  testPlan: ["06-测试方案/测试方案.md"],
};
function artifactDigest(changeRoot: string, paths: string[]): string {
  return sha256Paths(changeRoot, paths);
}

function lockPath(changeRoot: string): string { return join(changeRoot, ".delivery-control.lock"); }
function infoPath(changeRoot: string): string { return join(changeRoot, "change-info.json"); }
function approvalsPath(changeRoot: string): string { return join(changeRoot, "artifact-approvals.json"); }
function tasksPath(changeRoot: string): string { return join(changeRoot, "task-state.json"); }
function sourcesPath(changeRoot: string): string { return join(changeRoot, "change-sources.json"); }
function modePath(changeRoot: string): string { return join(changeRoot, "change-mode.json"); }
function updateSnapshotPath(changeRoot: string): string { return join(changeRoot, ".delivery-update-snapshot.json"); }

function parseInfo(path: string): ChangeInfo {
  const value = object(readJson(path), "change-info");
  exactKeys(value, ["schemaVersion", "displayName"], ["schemaVersion", "displayName"], "change-info");
  if (integer(value.schemaVersion, "change-info.schemaVersion") !== 1) fail("change-info.schemaVersion 仅支持 1");
  return { schemaVersion: 1, displayName: text(value.displayName, "change-info.displayName") };
}
function parseMode(changeRoot: string): Mode {
  if (!existsSync(modePath(changeRoot))) return "delivery";
  const value = object(readJson(modePath(changeRoot)), "change-mode");
  exactKeys(value, ["schemaVersion", "mode", "reason", "approvedBy", "approvedAt"], ["schemaVersion", "mode", "reason", "approvedBy", "approvedAt"], "change-mode");
  if (value.schemaVersion !== 1 || value.mode !== "rehearsal") fail("change-mode 只允许显式 rehearsal");
  text(value.reason, "change-mode.reason"); text(value.approvedBy, "change-mode.approvedBy"); text(value.approvedAt, "change-mode.approvedAt");
  return "rehearsal";
}
function slugFor(changeRoot: string): string {
  const slug = basename(changeRoot);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail(`Change目录名不是ASCII kebab-case slug: ${slug}`);
  return slug;
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
  exactKeys(item, ["id", "phase", "title", "status", "dependsOn", "deliverable", "verification", "evidence", "blocker", "note"], ["id", "phase", "title", "status", "dependsOn", "deliverable", "verification"], `task[${index}]`);
  const status = text(item.status, `task[${index}].status`);
  if (!(["planned", "implemented_unverified", "blocked_external", "verified"] as string[]).includes(status)) fail(`task[${index}].status 非法`);
  const result: Task = { id: text(item.id, `task[${index}].id`), phase: text(item.phase, `task[${index}].phase`), title: text(item.title, `task[${index}].title`), status: status as TaskStatus, dependsOn: stringArray(item.dependsOn, `task[${index}].dependsOn`), deliverable: text(item.deliverable, `task[${index}].deliverable`), verification: text(item.verification, `task[${index}].verification`) };
  if (item.evidence !== undefined) result.evidence = text(item.evidence, `task[${index}].evidence`);
  if (item.blocker !== undefined) result.blocker = text(item.blocker, `task[${index}].blocker`);
  if (item.note !== undefined) result.note = text(item.note, `task[${index}].note`);
  if (status === "verified" && !result.evidence) fail(`task[${index}] verified 缺少 evidence`);
  if (status === "blocked_external" && !result.blocker) fail(`task[${index}] blocked_external 缺少 blocker`);
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
  // 并发写由 revision 和排他锁控制；四种业务状态不承载会话级执行锁。
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
  console.log(JSON.stringify({ slug: slugFor(changeRoot), displayName: info.displayName, mode: parseMode(changeRoot), approvals, tasks }, null, 2));
}

function init(changeRoot: string, options: Map<string, string>): void {
  if (existsSync(infoPath(changeRoot))) fail("Change 已初始化");
  const mode = requiredOption(options, "mode");
  if (mode !== "delivery" && mode !== "rehearsal") fail("--mode 只能是 delivery 或 rehearsal");
  const slug = requiredOption(options, "slug");
  if (slug !== slugFor(changeRoot)) fail("--slug 必须等于Change目录名");
  const info: ChangeInfo = { schemaVersion: 1, displayName: requiredOption(options, "display-name") };
  withFileLock(lockPath(changeRoot), () => {
    atomicWriteJson(infoPath(changeRoot), info);
    atomicWriteJson(approvalsPath(changeRoot), initialApprovals(slug));
    if (mode === "rehearsal") {
      const rehearsal: ChangeMode = { schemaVersion: 1, mode: "rehearsal", reason: requiredOption(options, "reason"), approvedBy: requiredOption(options, "approved-by"), approvedAt: requiredOption(options, "approved-at") };
      atomicWriteJson(modePath(changeRoot), rehearsal);
    }
  });
  console.log(JSON.stringify({ slug, displayName: info.displayName, mode }, null, 2));
}

function invalidateChangedApprovals(changeRoot: string, state: ApprovalState): boolean {
  let changed = false;
  for (const [gate, artifactPaths] of Object.entries(artifactByGate)) {
    const approval = state.approvals[gate];
    if (!artifactPaths || approval.status !== "approved" || !approval.artifactSha256) continue;
    let current: string | null = null;
    try { current = artifactDigest(changeRoot, artifactPaths); } catch { current = null; }
    if (current !== approval.artifactSha256) {
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
    const artifactPaths = artifactByGate[gate];
    if (status === "approved" && artifactPaths) {
      approval.artifactSha256 = artifactDigest(changeRoot, artifactPaths);
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
  parseInfo(infoPath(changeRoot));
  if (imported.changeSlug !== slugFor(changeRoot)) fail("task-state.changeSlug 与 Change 不一致");
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
    if (!(["planned", "implemented_unverified", "blocked_external", "verified"] as string[]).includes(status)) fail(`任务状态非法: ${status}`);
    if ((status === "implemented_unverified" || status === "verified") && task.dependsOn.some((dependency) => state.tasks.find((candidate) => candidate.id === dependency)?.status !== "verified")) fail(`task ${id} 的依赖尚未验证`);
    task.status = status as TaskStatus;
    if (options.has("evidence")) task.evidence = requiredOption(options, "evidence");
    if (options.has("blocker")) task.blocker = requiredOption(options, "blocker");
    if (options.has("note")) task.note = requiredOption(options, "note");
    if (task.status === "verified" && !task.evidence) fail(`task ${id} verified 缺少 evidence`);
    if (task.status === "blocked_external" && !task.blocker) fail(`task ${id} blocked_external 缺少 blocker`);
    state.revision += 1;
    state.updatedAt = now();
    atomicWriteJson(tasksPath(changeRoot), state);
    console.log(JSON.stringify(state, null, 2));
  });
}

function renderTasks(changeRoot: string): void {
  const state = parseTasks(tasksPath(changeRoot));
  const lines = ["# 实施任务", "", `> 机器真源：\`task-state.json\`，revision ${state.revision}。本文件只用于人工审阅。`, ""];
  let phase = "";
  for (const task of state.tasks) {
    if (task.phase !== phase) {
      phase = task.phase;
      lines.push(`## ${phase}`, "");
    }
    const checked = task.status === "verified" ? "x" : " ";
    lines.push(`- [${checked}] ${task.id} [${task.status}] ${task.title}`);
    lines.push(`  - 交付物：${task.deliverable}`);
    lines.push(`  - 验证：${task.verification}`);
    if (task.evidence) lines.push(`  - 证据：${task.evidence}`);
    if (task.blocker) lines.push(`  - blocker：${task.blocker}`);
    if (task.note) lines.push(`  - 说明：${task.note}`);
  }
  const path = join(changeRoot, "07-实施任务", "实施任务.md");
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ path, revision: state.revision }, null, 2));
}

function guard(changeRoot: string, operation: string): void {
  const info = parseInfo(infoPath(changeRoot));
  const approvals = parseApprovals(approvalsPath(changeRoot));
  const mode = parseMode(changeRoot);
  if (invalidateChangedApprovals(changeRoot, approvals)) atomicWriteJson(approvalsPath(changeRoot), approvals);
  if (operation === "apply") {
    if (mode !== "delivery") fail("rehearsal 模式禁止 apply");
    for (const gate of ["requirements", "changePlan", "testPlan"]) if (approvals.approvals[gate].status !== "approved") fail(`${gate} 尚未批准`);
  } else if (operation === "acceptance") {
    const tasks = parseTasks(tasksPath(changeRoot));
    if (mode === "delivery" && tasks.tasks.some((task) => task.status !== "verified")) fail("delivery 验收前全部任务必须 verified");
  } else if (operation === "release") {
    guard(changeRoot, "acceptance");
    const acceptance = join(changeRoot, "08-验收", "验收记录.md");
    if (mode === "delivery" && (!existsSync(acceptance) || !/^结论:\s*PASS\s*$/m.test(readFileSync(acceptance, "utf8")))) fail("delivery 发布前需要严格 PASS");
    if (mode === "rehearsal" && (!existsSync(acceptance) || !/^结论:\s*(PARTIAL|FAIL|BLOCKED)\s*$/m.test(readFileSync(acceptance, "utf8")))) fail("rehearsal 发布记录前需要非PASS验收结论");
    if (mode === "delivery" && approvals.approvals.release.status !== "approved") fail("release 尚未批准");
  } else if (operation === "archive") {
    if (mode === "rehearsal") fail("rehearsal 模式禁止 archive");
    guard(changeRoot, "release");
    if (approvals.approvals.archive.status !== "approved") fail("archive 尚未批准");
    const release = join(changeRoot, "09-发布", "发布计划.md");
    if (!existsSync(release) || !/(release-id\s*:|release-not-required)/.test(readFileSync(release, "utf8"))) fail("缺少成功 release-id 或 release-not-required");
  } else fail(`未知 guard operation: ${operation}`);
  console.log(JSON.stringify({ allowed: true, operation, mode }, null, 2));
}

function parseSources(value: unknown): JsonObject {
  const parsed = object(value, "sources");
  exactKeys(parsed, ["schemaVersion", "changeSlug", "sources"], ["schemaVersion", "changeSlug", "sources"], "sources");
  if (integer(parsed.schemaVersion, "sources.schemaVersion") !== 1) fail("sources.schemaVersion 仅支持 1");
  if (!Array.isArray(parsed.sources)) fail("sources.sources 必须是数组");
  const ids = new Set<string>();
  for (const [index, source] of parsed.sources.entries()) {
    const item = object(source, `sources[${index}]`);
    exactKeys(item, ["id", "kind", "location", "observedAt", "sha256", "completeness"], ["id", "kind", "location", "observedAt", "completeness"], `sources[${index}]`);
    const id = text(item.id, `sources[${index}].id`);
    if (ids.has(id)) fail(`重复来源id: ${id}`);
    ids.add(id);
    text(item.kind, `sources[${index}].kind`); text(item.location, `sources[${index}].location`); text(item.observedAt, `sources[${index}].observedAt`); text(item.completeness, `sources[${index}].completeness`);
    if (item.sha256 !== undefined) text(item.sha256, `sources[${index}].sha256`);
  }
  return parsed;
}
function sourcesInspect(changeRoot: string): void {
  console.log(JSON.stringify(parseSources(readJson(sourcesPath(changeRoot))), null, 2));
}
function sourcesWrite(changeRoot: string, options: Map<string, string>): void {
  const imported = parseSources(readJson(requiredOption(options, "file")));
  parseInfo(infoPath(changeRoot));
  if (imported.changeSlug !== slugFor(changeRoot)) fail("sources.changeSlug 与 Change 不一致");
  withFileLock(lockPath(changeRoot), () => atomicWriteJson(sourcesPath(changeRoot), imported));
  console.log(JSON.stringify(imported, null, 2));
}

function adapterInspect(options: Map<string, string>): void {
  const registry = object(readJson(requiredOption(options, "registry")), "source-adapters");
  exactKeys(registry, ["schemaVersion", "adapters"], ["schemaVersion", "adapters"], "source-adapters");
  if (registry.schemaVersion !== 1 || !Array.isArray(registry.adapters)) fail("source-adapters合同非法");
  const ids = new Set<string>();
  for (const [index, value] of registry.adapters.entries()) {
    const adapter = object(value, `adapters[${index}]`);
    exactKeys(adapter, ["id", "command", "trustDomain", "kinds"], ["id", "command", "trustDomain", "kinds"], `adapters[${index}]`);
    const id = text(adapter.id, `adapters[${index}].id`);
    if (ids.has(id)) fail(`重复adapter id: ${id}`);
    ids.add(id);
    const command = text(adapter.command, `adapters[${index}].command`);
    if (isAbsolute(command) || command.split(/[\\/\\\\]/).includes("..")) fail(`adapter command越界: ${command}`);
    const trustDomain = text(adapter.trustDomain, `adapters[${index}].trustDomain`);
    if (trustDomain !== "work" && trustDomain !== "private") fail(`adapter trustDomain非法: ${trustDomain}`);
    stringArray(adapter.kinds, `adapters[${index}].kinds`);
  }
  console.log(JSON.stringify(registry, null, 2));
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
  const snapshot = { schemaVersion: 1, changeSlug: slugFor(changeRoot), createdAt: now(), files };
  atomicWriteJson(updateSnapshotPath(changeRoot), snapshot);
  console.log(JSON.stringify(snapshot, null, 2));
}

function updateDiagnose(changeRoot: string): void {
  const snapshot = object(readJson(updateSnapshotPath(changeRoot)), "update-snapshot");
  exactKeys(snapshot, ["schemaVersion", "changeSlug", "createdAt", "files"], ["schemaVersion", "changeSlug", "createdAt", "files"], "update-snapshot");
  if (snapshot.schemaVersion !== 1 || snapshot.changeSlug !== slugFor(changeRoot)) fail("update-snapshot 与 Change 不一致");
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
  else if (command === "adapter" && action === "inspect") adapterInspect(parsed.options);
  else fail("用法: delivery-control.ts <runtime-check|init|inspect|approval inspect|approval set|task inspect|task write|task set|task render|sources inspect|sources write|adapter inspect|update snapshot|update diagnose|guard> --change-root <dir>");
}
try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
