#!/usr/bin/env -S node --experimental-strip-types
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  atomicWriteJson, exactKeys, fail, integer, now, object, parseArgs, readJson, requiredOption,
  sha256File, sha256Paths, stringArray, text, withFileLock, type JsonObject,
} from "./runtime-lib.ts";
import { requireAcceptance, requireReadiness, requireReview } from "./delivery-lifecycle.ts";

type Mode = "delivery" | "rehearsal";
type TaskStateName = "planned" | "implemented_unverified" | "blocked_external" | "verified";
type ChangeInfo = { schemaVersion: 1; displayName: string };
type Approval = { digest: string; decision: "approved" | "rejected"; approvedBy: string; approvedAt: string; migrationSource: string | null };
type ApprovalState = { schemaVersion: 1; artifacts: Record<string, Approval> };
type Task = { id: string; state: TaskStateName; deliverables: string[]; verification: string[]; evidence: string[]; blocker: string | null };
type TaskState = { schemaVersion: 1; tasks: Task[] };

const artifactPaths: Record<string, string[]> = {
  "raw-requirements": ["01-原始需求/原始需求索引.md"],
  specs: ["specs"],
  "business-current": ["03-业务现状/业务现状.md"],
  "technical-current": ["04-技术现状/技术现状.md"],
  "solution-proposal": ["05-改造方案/方案提案.md"],
  "solution-decision": ["05-改造方案/方案决策.md"],
  "change-plan": ["05-改造方案/改造方案.md"],
  "test-plan": ["06-测试方案/000-测试方案索引.md"],
  tasks: ["07-实施任务/实施任务.md"],
};
const requiredBeforeAcceptance = Object.keys(artifactPaths);
function validateDecisionArtifacts(root: string): void {
  const proposal = readFileSync(join(root, "05-改造方案/方案提案.md"), "utf8");
  const decision = readFileSync(join(root, "05-改造方案/方案决策.md"), "utf8");
  const candidates = proposal.match(/^## 候选 [A-Z0-9]+/gm) ?? [];
  if (candidates.length < 2 || !/^## Trade-off 矩阵$/m.test(proposal) || !/^## 推荐$/m.test(proposal) || !/^## 未决问题$/m.test(proposal)) fail("solution-proposal 缺少至少两个候选、Trade-off矩阵、推荐或未决问题");
  for (const required of [/状态：APPROVED/, /选择：/, /决策人：/, /决策时间：/, /^## 接受的后果$/m, /^## 拒绝方案$/m]) if (!required.test(decision)) fail("solution-decision 缺少批准状态、选择、决策人、决策时间、接受后果或拒绝方案");
}
function infoPath(root: string): string { return join(root, "change-info.json"); }
function approvalsPath(root: string): string { return join(root, "artifact-approvals.json"); }
function tasksPath(root: string): string { return join(root, "task-state.json"); }
function sourcesPath(root: string): string { return join(root, "change-sources.json"); }
function modePath(root: string): string { return join(root, "change-mode.json"); }
function lockPath(root: string): string { return join(root, ".delivery-control.lock"); }
function updateSnapshotPath(root: string): string { return join(root, ".delivery-update-snapshot.json"); }
function taskMarkdownPath(root: string): string { return join(root, "07-实施任务/实施任务.md"); }
function slugFor(root: string): string {
  const slug = basename(root);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail(`Change目录名不是ASCII kebab-case slug: ${slug}`);
  return slug;
}
function parseInfo(path: string): ChangeInfo {
  const value = object(readJson(path), "change-info");
  exactKeys(value, ["schemaVersion", "displayName"], ["schemaVersion", "displayName"], "change-info");
  if (integer(value.schemaVersion, "change-info.schemaVersion") !== 1) fail("change-info.schemaVersion 仅支持 1");
  const displayName = text(value.displayName, "change-info.displayName");
  if (displayName !== displayName.trim()) fail("change-info.displayName 不得包含首尾空白");
  return { schemaVersion: 1, displayName };
}
function parseMode(root: string): Mode {
  if (!existsSync(modePath(root))) return "delivery";
  const value = object(readJson(modePath(root)), "change-mode");
  exactKeys(value, ["schemaVersion", "mode", "reason", "approvedBy", "approvedAt"], ["schemaVersion", "mode", "reason", "approvedBy", "approvedAt"], "change-mode");
  if (value.schemaVersion !== 1 || value.mode !== "rehearsal") fail("change-mode 只允许显式 rehearsal");
  text(value.reason, "change-mode.reason"); text(value.approvedBy, "change-mode.approvedBy"); text(value.approvedAt, "change-mode.approvedAt");
  return "rehearsal";
}
function digestPattern(value: string, label: string): string {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) fail(`${label} 不是小写SHA-256`);
  return value;
}
function artifactDigest(root: string, artifact: string): string {
  const paths = artifactPaths[artifact]; if (!paths) fail(`未知artifact: ${artifact}`);
  if (paths.length === 1 && paths[0] !== "specs") return sha256File(join(root, paths[0]));
  return sha256Paths(root, paths);
}
function parseApproval(value: unknown, label: string): Approval {
  const item = object(value, label);
  exactKeys(item, ["digest", "decision", "approvedBy", "approvedAt", "migrationSource"], ["digest", "decision", "approvedBy", "approvedAt", "migrationSource"], label);
  const decision = text(item.decision, `${label}.decision`);
  if (decision !== "approved" && decision !== "rejected") fail(`${label}.decision 非法`);
  const migrationSource = item.migrationSource === null ? null : text(item.migrationSource, `${label}.migrationSource`);
  return { digest: digestPattern(text(item.digest, `${label}.digest`), `${label}.digest`), decision, approvedBy: text(item.approvedBy, `${label}.approvedBy`), approvedAt: text(item.approvedAt, `${label}.approvedAt`), migrationSource };
}
function parseApprovals(path: string): ApprovalState {
  const value = object(readJson(path), "artifact-approvals");
  exactKeys(value, ["schemaVersion", "artifacts"], ["schemaVersion", "artifacts"], "artifact-approvals");
  if (value.schemaVersion !== 1) fail("artifact-approvals.schemaVersion 仅支持 1");
  const input = object(value.artifacts, "artifact-approvals.artifacts"); const artifacts: Record<string, Approval> = {};
  for (const [artifact, approval] of Object.entries(input)) {
    if (!(artifact in artifactPaths)) fail(`未知批准artifact: ${artifact}`);
    artifacts[artifact] = parseApproval(approval, `artifact-approvals.artifacts.${artifact}`);
  }
  return { schemaVersion: 1, artifacts };
}
function approvalStatus(root: string, state: ApprovalState, artifact: string): "pending" | "approved" | "rejected" | "stale" {
  const record = state.artifacts[artifact]; if (!record) return "pending";
  let current: string | null = null; try { current = artifactDigest(root, artifact); } catch { current = null; }
  if (current !== record.digest) return "stale";
  return record.decision;
}
function requireApproved(root: string, state: ApprovalState, artifacts: string[]): void {
  for (const artifact of artifacts) {
    const status = approvalStatus(root, state, artifact);
    if (status !== "approved") fail(`${artifact} 批准状态为 ${status}`);
  }
}
function parseTask(value: unknown, index: number): Task {
  const item = object(value, `tasks[${index}]`);
  exactKeys(item, ["id", "state", "deliverables", "verification", "evidence", "blocker"], ["id", "state", "deliverables", "verification", "evidence", "blocker"], `tasks[${index}]`);
  const state = text(item.state, `tasks[${index}].state`);
  if (!( ["planned", "implemented_unverified", "blocked_external", "verified"] as string[]).includes(state)) fail(`tasks[${index}].state 非法`);
  const deliverables = stringArray(item.deliverables, `tasks[${index}].deliverables`); const verification = stringArray(item.verification, `tasks[${index}].verification`); const evidence = stringArray(item.evidence, `tasks[${index}].evidence`);
  if (!deliverables.length || !verification.length) fail(`tasks[${index}] 缺少交付物或验证方式`);
  const blocker = item.blocker === null ? null : text(item.blocker, `tasks[${index}].blocker`);
  if (state === "verified" && evidence.length === 0) fail(`tasks[${index}] verified 缺少 evidence`);
  if (state !== "verified" && evidence.length > 0) fail(`tasks[${index}] 非verified不得保存 evidence`);
  if (state === "blocked_external" && blocker === null) fail(`tasks[${index}] blocked_external 缺少 blocker`);
  if (state !== "blocked_external" && blocker !== null) fail(`tasks[${index}] 非blocked_external不得保存 blocker`);
  return { id: text(item.id, `tasks[${index}].id`), state: state as TaskStateName, deliverables, verification, evidence, blocker };
}
function parseTasks(path: string): TaskState {
  const value = object(readJson(path), "task-state");
  exactKeys(value, ["schemaVersion", "tasks"], ["schemaVersion", "tasks"], "task-state");
  if (value.schemaVersion !== 1 || !Array.isArray(value.tasks)) fail("task-state合同非法");
  const tasks = value.tasks.map(parseTask); const ids = new Set<string>();
  for (const task of tasks) { if (ids.has(task.id)) fail(`重复 task id: ${task.id}`); ids.add(task.id); }
  return { schemaVersion: 1, tasks };
}
function parseSources(value: unknown): JsonObject {
  const root = object(value, "change-sources"); exactKeys(root, ["schemaVersion", "sources"], ["schemaVersion", "sources"], "change-sources");
  if (root.schemaVersion !== 1 || !Array.isArray(root.sources)) fail("change-sources合同非法");
  const ids = new Set<string>(); const authorities = new Set<number>();
  for (const [index, source] of root.sources.entries()) {
    const item = object(source, `sources[${index}]`); exactKeys(item, ["id", "kind", "authority", "locator", "adapter"], ["id", "kind", "authority", "locator", "adapter"], `sources[${index}]`);
    const id = text(item.id, `sources[${index}].id`); if (ids.has(id)) fail(`重复来源id: ${id}`); ids.add(id);
    text(item.kind, `sources[${index}].kind`); text(item.locator, `sources[${index}].locator`); text(item.adapter, `sources[${index}].adapter`);
    const authority = integer(item.authority, `sources[${index}].authority`); if (authority < 1 || authorities.has(authority)) fail(`来源authority非法或重复: ${authority}`); authorities.add(authority);
  }
  for (let authority = 1; authority <= authorities.size; authority += 1) if (!authorities.has(authority)) fail("来源authority必须从1连续递增");
  return root;
}
function projectionStates(root: string): Map<string, { checked: boolean; state: string }> {
  const result = new Map<string, { checked: boolean; state: string }>();
  if (!existsSync(taskMarkdownPath(root))) return result;
  for (const line of readFileSync(taskMarkdownPath(root), "utf8").split(/\r?\n/)) {
    const match = /^- \[([ xX])\]\s+(\d+\.\d+)\s+\[([^\]]+)\]/.exec(line);
    if (match) result.set(match[2], { checked: match[1].toLowerCase() === "x", state: match[3] });
  }
  return result;
}
function verifyTaskProjection(root: string, state: TaskState): void {
  const projection = projectionStates(root);
  for (const task of state.tasks) {
    const item = projection.get(task.id); if (!item || item.state !== task.state || item.checked !== (task.state === "verified")) fail(`07任务投影漂移: ${task.id}`);
  }
}
function init(root: string, options: Map<string, string>): void {
  if (existsSync(infoPath(root))) fail("Change 已初始化"); const slug = requiredOption(options, "slug"); if (slug !== slugFor(root)) fail("--slug 必须等于Change目录名");
  const mode = requiredOption(options, "mode"); if (mode !== "delivery" && mode !== "rehearsal") fail("--mode 只能是 delivery 或 rehearsal");
  const info = { schemaVersion: 1, displayName: requiredOption(options, "display-name") };
  withFileLock(lockPath(root), () => { atomicWriteJson(infoPath(root), info); atomicWriteJson(approvalsPath(root), { schemaVersion: 1, artifacts: {} }); if (mode === "rehearsal") atomicWriteJson(modePath(root), { schemaVersion: 1, mode: "rehearsal", reason: requiredOption(options, "reason"), approvedBy: requiredOption(options, "approved-by"), approvedAt: requiredOption(options, "approved-at") }); });
  parseInfo(infoPath(root)); console.log(JSON.stringify({ slug, displayName: info.displayName, mode }, null, 2));
}
function inspect(root: string): void {
  const info = parseInfo(infoPath(root)); const approvals = parseApprovals(approvalsPath(root)); const effective: Record<string, string> = {};
  for (const artifact of Object.keys(artifactPaths)) effective[artifact] = approvalStatus(root, approvals, artifact);
  const tasks = existsSync(tasksPath(root)) ? parseTasks(tasksPath(root)) : null; if (tasks && existsSync(taskMarkdownPath(root))) verifyTaskProjection(root, tasks);
  console.log(JSON.stringify({ slug: slugFor(root), displayName: info.displayName, mode: parseMode(root), approvals, effective, tasks }, null, 2));
}
function approvalSet(root: string, options: Map<string, string>): void {
  const artifact = requiredOption(options, "artifact"); const decision = requiredOption(options, "decision"); if (!(artifact in artifactPaths) || (decision !== "approved" && decision !== "rejected")) fail("批准参数非法");
  withFileLock(lockPath(root), () => { const state = parseApprovals(approvalsPath(root)); state.artifacts[artifact] = { digest: artifactDigest(root, artifact), decision, approvedBy: requiredOption(options, "approved-by"), approvedAt: now(), migrationSource: options.get("migration-source") ?? null }; atomicWriteJson(approvalsPath(root), state); console.log(JSON.stringify(state, null, 2)); });
}
function approvalsInspect(root: string): void { const state = parseApprovals(approvalsPath(root)); const effective: Record<string, string> = {}; for (const artifact of Object.keys(artifactPaths)) effective[artifact] = approvalStatus(root, state, artifact); console.log(JSON.stringify({ ...state, effective }, null, 2)); }
function taskWrite(root: string, options: Map<string, string>): void { const imported = parseTasks(requiredOption(options, "file")); parseInfo(infoPath(root)); withFileLock(lockPath(root), () => atomicWriteJson(tasksPath(root), imported)); console.log(JSON.stringify(imported, null, 2)); }
function taskSet(root: string, options: Map<string, string>): void {
  withFileLock(lockPath(root), () => { const state = parseTasks(tasksPath(root)); const task = state.tasks.find((item) => item.id === requiredOption(options, "id")); if (!task) fail("未知 task id"); const next = requiredOption(options, "state"); if (!( ["planned", "implemented_unverified", "blocked_external", "verified"] as string[]).includes(next)) fail("任务状态非法"); task.state = next as TaskStateName; task.evidence = options.has("evidence") ? [requiredOption(options, "evidence")] : []; task.blocker = options.has("blocker") ? requiredOption(options, "blocker") : null; parseTask(task, 0); atomicWriteJson(tasksPath(root), state); console.log(JSON.stringify(state, null, 2)); });
}
function renderTasks(root: string): void {
  const state = parseTasks(tasksPath(root));
  let content = "# 实现任务拆分\n\n> 状态真源：`task-state.json`。本文件由 `delivery-control.ts task render` 生成，只用于人工审阅；禁止反向解析复选框。\n";
  for (const task of state.tasks) {
    content += `\n- [${task.state === "verified" ? "x" : " "}] ${task.id} [${task.state}]\n`;
    content += `  - 交付物：${task.deliverables.join("；")}\n`;
    content += `  - 验证：${task.verification.join("；")}`;
  }
  writeFileSync(taskMarkdownPath(root), `${content.replace(/\n+$/, "")}\n`, "utf8");
  verifyTaskProjection(root, state);
  console.log(JSON.stringify({ path: taskMarkdownPath(root), tasks: state.tasks.length }, null, 2));
}
function guard(root: string, operation: string): void {
  parseInfo(infoPath(root)); const approvals = parseApprovals(approvalsPath(root)); const mode = parseMode(root);
  if (operation === "apply") { if (mode !== "delivery") fail("rehearsal 模式禁止 apply"); requireApproved(root, approvals, requiredBeforeAcceptance); validateDecisionArtifacts(root); }
  else if (operation === "acceptance") { requireApproved(root, approvals, requiredBeforeAcceptance); validateDecisionArtifacts(root); const state = parseTasks(tasksPath(root)); verifyTaskProjection(root, state); if (mode === "delivery" && state.tasks.some((task) => task.state !== "verified")) fail("delivery 验收前全部任务必须 verified"); if (mode === "delivery") requireReview(root); }
  else if (operation === "release") { guard(root, "acceptance"); if (mode === "delivery") requireAcceptance(root); else { const path = join(root, "08-验收/验收记录.md"); if (!existsSync(path) || !/^- 结论：(PARTIAL|FAIL|BLOCKED)\s*$/m.test(readFileSync(path, "utf8"))) fail("rehearsal 发布记录前需要模板格式的非PASS结论"); } }
  else if (operation === "verify") { requireApproved(root, approvals, requiredBeforeAcceptance); validateDecisionArtifacts(root); const state = parseTasks(tasksPath(root)); verifyTaskProjection(root, state); }
  else if (operation === "sync") { if (mode === "rehearsal") fail("rehearsal 模式禁止 sync"); requireAcceptance(root); }
  else if (operation === "archive") { if (mode === "rehearsal") fail("rehearsal 模式禁止 archive"); guard(root, "release"); requireReadiness(root); }
  else fail(`未知 guard operation: ${operation}`);
  console.log(JSON.stringify({ allowed: true, operation, mode }, null, 2));
}
function adapterInspect(options: Map<string, string>): void { const registry = object(readJson(requiredOption(options, "registry")), "source-adapters"); exactKeys(registry, ["schemaVersion", "adapters"], ["schemaVersion", "adapters"], "source-adapters"); if (registry.schemaVersion !== 1 || !Array.isArray(registry.adapters)) fail("source-adapters合同非法"); const ids = new Set<string>(); for (const [index, value] of registry.adapters.entries()) { const adapter = object(value, `adapters[${index}]`); exactKeys(adapter, ["id", "command", "trustDomain", "kinds"], ["id", "command", "trustDomain", "kinds"], `adapters[${index}]`); const id = text(adapter.id, `adapters[${index}].id`); if (ids.has(id)) fail(`重复adapter id: ${id}`); ids.add(id); const command = text(adapter.command, `adapters[${index}].command`); if (isAbsolute(command) || command.split(/[\\/]/).includes("..")) fail(`adapter command越界: ${command}`); const domain = text(adapter.trustDomain, `adapters[${index}].trustDomain`); if (domain !== "work" && domain !== "private") fail("adapter trustDomain非法"); stringArray(adapter.kinds, `adapters[${index}].kinds`); } console.log(JSON.stringify(registry, null, 2)); }
function updateSnapshot(root: string, options: Map<string, string>): void { const paths = readJson(requiredOption(options, "paths-file")); if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string")) fail("更新路径清单必须是字符串数组"); const files: Record<string, string> = {}; for (const value of paths as string[]) { const path = resolve(root, value); const rel = relative(root, path); if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) fail(`更新路径越出 Change: ${value}`); if (!existsSync(path)) fail(`更新路径不存在: ${value}`); files[rel.split(sep).join("/")] = sha256File(path); } const snapshot = { schemaVersion: 1, changeSlug: slugFor(root), createdAt: now(), files }; atomicWriteJson(updateSnapshotPath(root), snapshot); console.log(JSON.stringify(snapshot, null, 2)); }
function updateDiagnose(root: string): void { const snapshot = object(readJson(updateSnapshotPath(root)), "update-snapshot"); exactKeys(snapshot, ["schemaVersion", "changeSlug", "createdAt", "files"], ["schemaVersion", "changeSlug", "createdAt", "files"], "update-snapshot"); if (snapshot.schemaVersion !== 1 || snapshot.changeSlug !== slugFor(root)) fail("update-snapshot 与 Change 不一致"); const changed: Array<{ path: string; before: string; after: string | null }> = []; for (const [path, beforeValue] of Object.entries(object(snapshot.files, "update-snapshot.files"))) { const before = text(beforeValue, `files.${path}`); const current = join(root, path); const after = existsSync(current) ? sha256File(current) : null; if (after !== before) changed.push({ path, before, after }); } const approvals = parseApprovals(approvalsPath(root)); const effective: Record<string, string> = {}; for (const artifact of Object.keys(artifactPaths)) effective[artifact] = approvalStatus(root, approvals, artifact); console.log(JSON.stringify({ changed, approvals: effective }, null, 2)); }
function main(): void { const parsed = parseArgs(process.argv.slice(2)); const root = resolve(requiredOption(parsed.options, "change-root")); const [command, action] = parsed.positional; if (command === "init") init(root, parsed.options); else if (command === "inspect") inspect(root); else if (command === "approval" && action === "inspect") approvalsInspect(root); else if (command === "approval" && action === "set") approvalSet(root, parsed.options); else if (command === "task" && action === "inspect") { const state = parseTasks(tasksPath(root)); verifyTaskProjection(root, state); console.log(JSON.stringify(state, null, 2)); } else if (command === "task" && action === "write") taskWrite(root, parsed.options); else if (command === "task" && action === "set") taskSet(root, parsed.options); else if (command === "task" && action === "render") renderTasks(root); else if (command === "sources" && action === "inspect") console.log(JSON.stringify(parseSources(readJson(sourcesPath(root))), null, 2)); else if (command === "sources" && action === "write") { const sources = parseSources(readJson(requiredOption(parsed.options, "file"))); withFileLock(lockPath(root), () => atomicWriteJson(sourcesPath(root), sources)); console.log(JSON.stringify(sources, null, 2)); } else if (command === "adapter" && action === "inspect") adapterInspect(parsed.options); else if (command === "update" && action === "snapshot") updateSnapshot(root, parsed.options); else if (command === "update" && action === "diagnose") updateDiagnose(root); else if (command === "runtime-check") console.log(JSON.stringify({ allowed: true, runtime: "delivery-spec-runtime", schema: "delivery-change" }, null, 2)); else if (command === "guard") guard(root, requiredOption(parsed.options, "operation")); else fail("未知delivery-control命令"); }
try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
