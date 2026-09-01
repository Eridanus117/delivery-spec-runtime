#!/usr/bin/env -S node --experimental-strip-types
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  atomicWriteJson, exactKeys, fail, integer, now, object, parseArgs, readJson, requiredOption,
  sha256File, sha256Paths, stringArray, text, withFileLock,
} from "./runtime-lib.ts";
import { requireAcceptance, requireReadiness, requireReview } from "./delivery-lifecycle.ts";

// 本仓只有 delivery 一种模式。rehearsal 演练模式已随 change-mode.json 一并退场
// （全历史零实例）；默认值在这里显式写死，不再从文件解析。
// 将来若需要演练模式，须重新立法而非恢复旧文件。
const mode = "delivery" as const;
type TaskStateName = "planned" | "implemented_unverified" | "blocked_external" | "verified";
type ChangeInfo = { schemaVersion: 1; displayName: string };
type Approval = { digest: string; decision: "approved" | "rejected"; approvedBy: string; approvedAt: string; migrationSource: string | null };
type ApprovalState = { schemaVersion: 1; artifacts: Record<string, Approval> };
type Task = { id: string; state: TaskStateName; deliverables: string[]; verification: string[]; evidence: string[]; blocker: string | null };
type TaskState = { schemaVersion: 1; tasks: Task[] };

// v6 起 business-current 与 technical-current 合并为单一 current-state。
// 存量 Change（10 个归档目录与最后一个 v5 Change）按各自版本解析，不迁移——
// 显式迁移会改写历史治理证据，代价高于收益。分界线是 Change 的目录形状本身：
// 有 03-现状/现状.md 即 v6，否则按 v5 解析。
const currentStatePath = "03-现状/现状.md";
const v6ArtifactPaths: Record<string, string[]> = {
  "raw-requirements": ["01-原始需求/原始需求索引.md"],
  specs: ["specs"],
  "current-state": [currentStatePath],
  "solution-proposal": ["05-改造方案/方案提案.md"],
  "solution-decision": ["05-改造方案/方案决策.md"],
  "change-plan": ["05-改造方案/改造方案.md"],
  "test-plan": ["06-测试方案/测试方案.md"],
  tasks: ["07-实施任务/实施任务.md"],
};
const v5ArtifactPaths: Record<string, string[]> = {
  "raw-requirements": ["01-原始需求/原始需求索引.md"],
  specs: ["specs"],
  "business-current": ["03-业务现状/业务现状.md"],
  "technical-current": ["04-技术现状/技术现状.md"],
  "solution-proposal": ["05-改造方案/方案提案.md"],
  "solution-decision": ["05-改造方案/方案决策.md"],
  "change-plan": ["05-改造方案/改造方案.md"],
  "test-plan": ["06-测试方案/测试方案.md"],
  tasks: ["07-实施任务/实施任务.md"],
};
function artifactPathsFor(root: string): Record<string, string[]> {
  return existsSync(join(root, currentStatePath)) ? v6ArtifactPaths : v5ArtifactPaths;
}
/** 门禁清单永远等于该 Change 结构下的全部工件：合并只减少工件数，不减少任何一项校验。 */
function requiredBeforeAcceptanceFor(root: string): string[] { return Object.keys(artifactPathsFor(root)); }
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
function lockPath(root: string): string { return join(root, ".delivery-control.lock"); }
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
function digestPattern(value: string, label: string): string {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) fail(`${label} 不是小写SHA-256`);
  return value;
}
function artifactDigest(root: string, artifact: string): string {
  const paths = artifactPathsFor(root)[artifact]; if (!paths) fail(`未知artifact: ${artifact}`);
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
function parseApprovals(path: string, root: string): ApprovalState {
  const value = object(readJson(path), "artifact-approvals");
  exactKeys(value, ["schemaVersion", "artifacts"], ["schemaVersion", "artifacts"], "artifact-approvals");
  if (value.schemaVersion !== 1) fail("artifact-approvals.schemaVersion 仅支持 1");
  const input = object(value.artifacts, "artifact-approvals.artifacts"); const artifacts: Record<string, Approval> = {};
  for (const [artifact, approval] of Object.entries(input)) {
    if (!(artifact in artifactPathsFor(root))) fail(`未知批准artifact: ${artifact}`);
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
/**
 * 任务证据必须机器可校验：按 Change 内相对路径解析，存在且内容非空。
 * 绝对路径与 `..` 越界一律 fail closed 且不写入任何状态——证据指到 Change 外面就等于没有证据，
 * 归档后没人能凭它复核。只作用于 active Change 的写入路径，不回溯归档目录。
 */
function validateEvidence(root: string, evidence: string[], label: string): void {
  for (const item of evidence) {
    if (isAbsolute(item) || /^[A-Za-z]:/.test(item)) fail(`${label} evidence 必须是 Change 内相对路径，不接受绝对路径: ${item}`);
    if (item.split(/[\\/]/).includes("..")) fail(`${label} evidence 不得使用 .. 越界: ${item}`);
    const target = resolve(root, item);
    const rel = relative(root, target);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) fail(`${label} evidence 越出 Change 目录: ${item}`);
    if (!existsSync(target)) fail(`${label} evidence 不存在: ${item}`);
    if (!statSync(target).isFile() || statSync(target).size === 0) fail(`${label} evidence 必须是非空文件: ${item}`);
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
  const requestedMode = options.get("mode") ?? mode; if (requestedMode !== mode) fail(`--mode 只能是 ${mode}：rehearsal 演练模式已随 change-mode.json 一并移除，如需演练模式须重新立法`);
  const info = { schemaVersion: 1, displayName: requiredOption(options, "display-name") };
  withFileLock(lockPath(root), () => { atomicWriteJson(infoPath(root), info); atomicWriteJson(approvalsPath(root), { schemaVersion: 1, artifacts: {} }); });
  parseInfo(infoPath(root)); console.log(JSON.stringify({ slug, displayName: info.displayName, mode }, null, 2));
}
function inspect(root: string): void {
  const info = parseInfo(infoPath(root)); const approvals = parseApprovals(approvalsPath(root), root); const effective: Record<string, string> = {};
  for (const artifact of Object.keys(artifactPathsFor(root))) effective[artifact] = approvalStatus(root, approvals, artifact);
  const tasks = existsSync(tasksPath(root)) ? parseTasks(tasksPath(root)) : null; if (tasks && existsSync(taskMarkdownPath(root))) verifyTaskProjection(root, tasks);
  console.log(JSON.stringify({ slug: slugFor(root), displayName: info.displayName, mode, approvals, effective, tasks }, null, 2));
}
function approvalSet(root: string, options: Map<string, string>): void {
  const artifact = requiredOption(options, "artifact"); const decision = requiredOption(options, "decision"); if (!(artifact in artifactPathsFor(root)) || (decision !== "approved" && decision !== "rejected")) fail("批准参数非法");
  withFileLock(lockPath(root), () => { const state = parseApprovals(approvalsPath(root), root); state.artifacts[artifact] = { digest: artifactDigest(root, artifact), decision, approvedBy: requiredOption(options, "approved-by"), approvedAt: now(), migrationSource: options.get("migration-source") ?? null }; atomicWriteJson(approvalsPath(root), state); console.log(JSON.stringify(state, null, 2)); });
}
function approvalsInspect(root: string): void { const state = parseApprovals(approvalsPath(root), root); const effective: Record<string, string> = {}; for (const artifact of Object.keys(artifactPathsFor(root))) effective[artifact] = approvalStatus(root, state, artifact); console.log(JSON.stringify({ ...state, effective }, null, 2)); }
function taskWrite(root: string, options: Map<string, string>): void { const imported = parseTasks(requiredOption(options, "file")); parseInfo(infoPath(root)); for (const task of imported.tasks) validateEvidence(root, task.evidence, `tasks[${task.id}]`); withFileLock(lockPath(root), () => atomicWriteJson(tasksPath(root), imported)); console.log(JSON.stringify(imported, null, 2)); }
function taskSet(root: string, options: Map<string, string>): void {
  withFileLock(lockPath(root), () => { const state = parseTasks(tasksPath(root)); const task = state.tasks.find((item) => item.id === requiredOption(options, "id")); if (!task) fail("未知 task id"); const next = requiredOption(options, "state"); if (!( ["planned", "implemented_unverified", "blocked_external", "verified"] as string[]).includes(next)) fail("任务状态非法"); task.state = next as TaskStateName; task.evidence = options.has("evidence") ? [requiredOption(options, "evidence")] : []; task.blocker = options.has("blocker") ? requiredOption(options, "blocker") : null; parseTask(task, 0); validateEvidence(root, task.evidence, `tasks[${task.id}]`); atomicWriteJson(tasksPath(root), state); console.log(JSON.stringify(state, null, 2)); });
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
// ---- 声明与事实的交叉校验（REV-002）--------------------------------------
// 登记时声明的 changeObject 是自报字段。只查表不核对，等于把豁免开关交回给调用方。
// 这里按路由表的路径前缀表把「实际 git diff 触碰的路径」归类，与声明的档位序对照：
// 声明低档而实际触碰高档路径，一律 fail-closed。
type RoutingRoute = { changeObject: string; rank: number; pathPrefixes: string[] };
type RoutingTable = { unmatchedRank: number; routes: RoutingRoute[] };

function runtimeRootFor(options: Map<string, string>): string {
  const explicit = options.get("runtime-root");
  if (explicit) return resolve(explicit);
  // 未显式给出时用工具自身位置定位 Runtime 源根，保证路由表总能被找到。
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}
function loadRoutingTable(runtimeRoot: string): RoutingTable | null {
  const path = join(runtimeRoot, "openspec/profiles/change-routing-v1.json");
  if (!existsSync(path)) return null;
  const value = object(readJson(path), "change-routing");
  const unmatched = object(value.unmatched, "change-routing.unmatched");
  if (!Array.isArray(value.routes)) fail("change-routing.routes 合同非法");
  return {
    unmatchedRank: integer(unmatched.rank, "change-routing.unmatched.rank"),
    routes: (value.routes as unknown[]).map((item, index) => {
      const route = object(item, `routes[${index}]`);
      return {
        changeObject: text(route.changeObject, `routes[${index}].changeObject`),
        rank: integer(route.rank, `routes[${index}].rank`),
        pathPrefixes: stringArray(route.pathPrefixes, `routes[${index}].pathPrefixes`),
      };
    }),
  };
}
function git(repo: string, args: string[]): string | null {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  return result.status === 0 ? result.stdout : null;
}
/** 从 01 索引的 `- Intake 来源：` 行回溯登记时声明的 changeObject，取其中最重的一档。 */
function declaredRoute(root: string, table: RoutingTable): RoutingRoute | null {
  const index = join(root, "01-原始需求/原始需求索引.md");
  if (!existsSync(index)) return null;
  const assetRoot = resolve(root, "../../..");
  let heaviest: RoutingRoute | null = null;
  for (const line of readFileSync(index, "utf8").split(/\r?\n/)) {
    const match = /^- Intake 来源：(.+?)\s*$/.exec(line);
    if (!match) continue;
    const intakePath = join(assetRoot, match[1]);
    if (!existsSync(intakePath)) continue;
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(intakePath, "utf8"));
    const declared = frontmatter && /^changeObject:\s*(\S+)\s*$/m.exec(frontmatter[1]);
    if (!declared) return null; // 有来源却未声明 → 等同未匹配（最重档），不构成降档
    const route = table.routes.find((item) => item.changeObject === declared[1]);
    if (!route) return null; // 声明了表外类别 → 未匹配即最重档
    if (!heaviest || route.rank > heaviest.rank) heaviest = route;
  }
  return heaviest;
}
/** 本 Change 实际触碰的实现路径（排除 Change 目录自身与长期 spec 之外的一切都算）。 */
function touchedPaths(repo: string, root: string): string[] | null {
  const changeRel = relative(repo, realpathSync(root)).split(sep).join("/");
  const firstTouch = git(repo, ["log", "--format=%H", "--reverse", "--", changeRel]);
  const collected = new Set<string>();
  const add = (output: string | null) => {
    if (!output) return;
    for (const path of output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) collected.add(path.split("\\").join("/"));
  };
  const firstCommit = firstTouch?.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)[0];
  if (firstCommit) {
    const parent = git(repo, ["rev-parse", "--verify", `${firstCommit}^`]);
    const from = parent ? parent.trim() : firstCommit;
    add(git(repo, ["diff", "--name-only", from, "HEAD"]));
  } else if (!firstTouch) {
    return null; // git 不可用或不是仓库：没有事实可核对
  }
  add(git(repo, ["diff", "--name-only", "HEAD"]));
  add(git(repo, ["ls-files", "--others", "--exclude-standard"]));
  // Change 目录自身是治理产物，不是被声明档位约束的实现改动。
  return [...collected].filter((path) => path !== changeRel && !path.startsWith(`${changeRel}/`)).sort();
}
function verifyDeclaredScope(root: string, options: Map<string, string>): void {
  const table = loadRoutingTable(runtimeRootFor(options));
  if (!table) return;
  const declared = declaredRoute(root, table);
  // 未声明、声明表外类别、或多来源中最重的一档已是最重档 → 不可能构成降档，无需核对。
  if (!declared || declared.rank >= table.unmatchedRank) return;
  const repoOutput = git(root, ["rev-parse", "--show-toplevel"]);
  if (!repoOutput) return;
  const repo = realpathSync(repoOutput.trim());
  const paths = touchedPaths(repo, root);
  if (paths === null) return;
  const violations: string[] = [];
  for (const path of paths) {
    let best: RoutingRoute | null = null;
    for (const route of table.routes) {
      for (const prefix of route.pathPrefixes) {
        if (path === prefix || path.startsWith(prefix)) { if (!best || prefix.length > 0) best = best && best.rank >= route.rank ? best : route; }
      }
    }
    const rank = best ? best.rank : table.unmatchedRank;
    if (rank > declared.rank) violations.push(`${path}（归类 ${best ? best.changeObject : "未匹配"}，档位序 ${rank}）`);
  }
  if (violations.length) {
    fail(`声明与事实不符：条目登记时声明的改动对象为 ${declared.changeObject}（档位序 ${declared.rank}），但实际触碰了更重档位的路径：\n  ${violations.slice(0, 20).join("\n  ")}${violations.length > 20 ? `\n  …共 ${violations.length} 条` : ""}\n处置方式是修正条目的 changeObject 声明并补走该档位要求的分析线，不是缩小改动面以迁就声明。`);
  }
}
// ---------------------------------------------------------------------------

function guard(root: string, operation: string, options: Map<string, string> = new Map()): void {
  parseInfo(infoPath(root)); const approvals = parseApprovals(approvalsPath(root), root); const requiredBeforeAcceptance = requiredBeforeAcceptanceFor(root);
  if (operation === "apply") { requireApproved(root, approvals, requiredBeforeAcceptance); validateDecisionArtifacts(root); }
  else if (operation === "acceptance") { requireApproved(root, approvals, requiredBeforeAcceptance); validateDecisionArtifacts(root); const state = parseTasks(tasksPath(root)); verifyTaskProjection(root, state); if (state.tasks.some((task) => task.state !== "verified")) fail("验收前全部任务必须 verified"); requireReview(root); }
  else if (operation === "release") { guard(root, "acceptance", options); requireAcceptance(root); }
  else if (operation === "verify") { requireApproved(root, approvals, requiredBeforeAcceptance); validateDecisionArtifacts(root); const state = parseTasks(tasksPath(root)); verifyTaskProjection(root, state); verifyDeclaredScope(root, options); }
  else if (operation === "sync") { requireAcceptance(root); }
  else if (operation === "archive") { guard(root, "release", options); requireReadiness(root); }
  else fail(`未知 guard operation: ${operation}`);
  console.log(JSON.stringify({ allowed: true, operation, mode }, null, 2));
}
function adapterInspect(options: Map<string, string>): void { const registry = object(readJson(requiredOption(options, "registry")), "source-adapters"); exactKeys(registry, ["schemaVersion", "adapters"], ["schemaVersion", "adapters"], "source-adapters"); if (registry.schemaVersion !== 1 || !Array.isArray(registry.adapters)) fail("source-adapters合同非法"); const ids = new Set<string>(); for (const [index, value] of registry.adapters.entries()) { const adapter = object(value, `adapters[${index}]`); exactKeys(adapter, ["id", "command", "trustDomain", "kinds"], ["id", "command", "trustDomain", "kinds"], `adapters[${index}]`); const id = text(adapter.id, `adapters[${index}].id`); if (ids.has(id)) fail(`重复adapter id: ${id}`); ids.add(id); const command = text(adapter.command, `adapters[${index}].command`); if (isAbsolute(command) || command.split(/[\\/]/).includes("..")) fail(`adapter command越界: ${command}`); const domain = text(adapter.trustDomain, `adapters[${index}].trustDomain`); if (domain !== "work" && domain !== "private") fail("adapter trustDomain非法"); stringArray(adapter.kinds, `adapters[${index}].kinds`); } console.log(JSON.stringify(registry, null, 2)); }
function main(): void { const parsed = parseArgs(process.argv.slice(2)); const root = resolve(requiredOption(parsed.options, "change-root")); const [command, action] = parsed.positional; if (command === "init") init(root, parsed.options); else if (command === "inspect") inspect(root); else if (command === "approval" && action === "inspect") approvalsInspect(root); else if (command === "approval" && action === "set") approvalSet(root, parsed.options); else if (command === "task" && action === "inspect") { const state = parseTasks(tasksPath(root)); verifyTaskProjection(root, state); console.log(JSON.stringify(state, null, 2)); } else if (command === "task" && action === "write") taskWrite(root, parsed.options); else if (command === "task" && action === "set") taskSet(root, parsed.options); else if (command === "task" && action === "render") renderTasks(root); else if (command === "adapter" && action === "inspect") adapterInspect(parsed.options); else if (command === "runtime-check") console.log(JSON.stringify({ allowed: true, runtime: "delivery-spec-runtime", schema: "delivery-change" }, null, 2)); else if (command === "guard") guard(root, requiredOption(parsed.options, "operation"), parsed.options); else fail("未知delivery-control命令"); }
try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
