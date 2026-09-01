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
import { changeMustPassFiles, loadPolicy, scanBannedWords, unclassifiedFiles, verifyPlainLanguage } from "./plain-language.ts";

// 本仓只有 delivery 一种模式。rehearsal 演练模式已随 change-mode.json 一并退场
// （全历史零实例）；默认值在这里显式写死，不再从文件解析。
// 将来若需要演练模式，须重新立法而非恢复旧文件。
const mode = "delivery" as const;
type TaskStateName = "planned" | "implemented_unverified" | "blocked_external" | "verified";
type ChangeInfo = { schemaVersion: 1; displayName: string; deliverySchemaVersion: number | null };
type Approval = { digest: string; decision: "approved" | "rejected"; approvedBy: string; approvedAt: string; migrationSource: string | null };
type GateRefresh = { refreshedBy: string; refreshedAt: string; artifacts: string[]; unchanged: string[] };
type GateApproval = { decision: "approved" | "rejected"; approvedBy: string; approvedAt: string; migrationSource: string | null; artifacts: Record<string, string>; refreshes: GateRefresh[] };
type ApprovalState = { schemaVersion: 1; artifacts: Record<string, Approval>; gates?: undefined } | { schemaVersion: 2; gates: Record<string, GateApproval>; artifacts?: undefined };
type Task = { id: string; state: TaskStateName; deliverables: string[]; verification: string[]; evidence: string[]; blocker: string | null; replayable: boolean };
type TaskState = { schemaVersion: 1; tasks: Task[] };

// v6 起 business-current 与 technical-current 合并为单一 current-state。
// 存量 Change（10 个归档目录与最后一个 v5 Change）按各自版本解析，不迁移——
// 显式迁移会改写历史治理证据，代价高于收益。分界线是 change-info.json 的
// deliverySchemaVersion 显式标记，缺省即 v5。
const currentStatePath = "03-现状/现状.md";
const v6ArtifactPaths: Record<string, string[]> = {
  "raw-requirements": ["01-原始需求/原始需求索引.md"],
  specs: ["specs"],
  "current-state": [currentStatePath],
  "solution-proposal": ["05-改造方案/方案提案.md"],
  "solution-decision": ["05-改造方案/方案决策.md"],
  "change-plan": ["05-改造方案/改造方案.md"],
  "test-plan": ["06-测试方案/000-测试方案索引.md"],
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
  // 归档 Change 磁盘上的实际文件名仍是 06-测试方案/测试方案.md：main 的工件改名
  // （改为 000-测试方案索引.md）只适用于当前 schema 产出的新 Change。若把新名也写进
  // v5 表，12 个归档目录的 test-plan 批准会因文件不存在而集体转 stale。
  "test-plan": ["06-测试方案/测试方案.md"],
  tasks: ["07-实施任务/实施任务.md"],
};
// v7 起再合两份：现状并进方案提案（现状本来就是提案的事实依据），改造方案并进实施任务
// （两者同在方案决策之后产生、同是写给实施者看的）。测试方案不并——它的编号被任务表与
// 验收覆盖表逐条回引，删了会断链。合并只减少工件数，不减少任何一项校验：合并后那份文件的
// 内容哈希涵盖原来两份的全部内容。
const v7ArtifactPaths: Record<string, string[]> = {
  "raw-requirements": ["01-原始需求/原始需求索引.md"],
  specs: ["specs"],
  "solution-proposal": ["05-改造方案/方案提案.md"],
  "solution-decision": ["05-改造方案/方案决策.md"],
  "test-plan": ["06-测试方案/000-测试方案索引.md"],
  tasks: ["07-实施任务/实施任务.md"],
};
const currentDeliverySchemaVersion = 7;
function artifactPathsFor(root: string): Record<string, string[]> {
  // 优先用 change-info.json 的显式标记判版本：靠「03-现状/现状.md 是否存在」推断，
  // 会让一个新建的 v6 Change 在写出该文件之前被判成 v5，报错文案还会要求已经不存在的模板。
  // 缺省（存量 Change 与 10 个归档目录都没有该字段）按 v5 解析，不迁移。
  try {
    const value = object(readJson(infoPath(root)), "change-info");
    const declared = value.deliverySchemaVersion;
    if (typeof declared === "number") return declared >= 7 ? v7ArtifactPaths : declared >= 6 ? v6ArtifactPaths : v5ArtifactPaths;
  } catch {}
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
  exactKeys(value, ["schemaVersion", "displayName", "deliverySchemaVersion"], ["schemaVersion", "displayName"], "change-info");
  if (integer(value.schemaVersion, "change-info.schemaVersion") !== 1) fail("change-info.schemaVersion 仅支持 1");
  const displayName = text(value.displayName, "change-info.displayName");
  if (displayName !== displayName.trim()) fail("change-info.displayName 不得包含首尾空白");
  const declared = value.deliverySchemaVersion === undefined ? null : integer(value.deliverySchemaVersion, "change-info.deliverySchemaVersion");
  if (declared !== null && declared < 5) fail("change-info.deliverySchemaVersion 仅支持 5 及以上");
  return { schemaVersion: 1, displayName, deliverySchemaVersion: declared };
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
/**
 * 批准记录有两种口径，都要能读。
 *
 * 第 1 版「一份工件一条」：全仓 15 个 Change 累计 107 条记录，而维护者在三道门内说过的话
 * 合计约五十来个字、六次「同意」。一次表态被展开成八条各自签发的记录，读批准链的人就分不清
 * 「他表了八次态」和「他表了一次态、被复制成八条」——批准链的全部价值恰恰是让人一眼看出
 * 这次放行是谁按下的。
 *
 * 第 2 版「人真实表态一次记一条」：一条记录覆盖那一刻的全部工件，**但每份工件的内容哈希仍
 * 逐一记录**，所以「改了哪一份就失效、并且能点名是哪一份」的定位能力一份不丢。
 *
 * 存量按文件自己声明的版本解析，不迁移——与工件路径表同一取向。
 */
function parseGateApproval(value: unknown, label: string, root: string): GateApproval {
  const item = object(value, label);
  exactKeys(item, ["decision", "approvedBy", "approvedAt", "migrationSource", "artifacts", "refreshes"], ["decision", "approvedBy", "approvedAt", "migrationSource", "artifacts"], label);
  const decision = text(item.decision, `${label}.decision`);
  if (decision !== "approved" && decision !== "rejected") fail(`${label}.decision 非法`);
  const known = artifactPathsFor(root);
  const input = object(item.artifacts, `${label}.artifacts`);
  const artifacts: Record<string, string> = {};
  for (const [artifact, digest] of Object.entries(input)) {
    if (!(artifact in known)) fail(`${label}.artifacts 含未知工件: ${artifact}`);
    artifacts[artifact] = digestPattern(text(digest, `${label}.artifacts.${artifact}`), `${label}.artifacts.${artifact}`);
  }
  // refreshes 缺省为空数组：机械回填还没发生过的门就是这个形态，不必回写文件。
  // 每条刷新记录都要说清「谁、什么时候、刷新了哪几份」——门级批准的问责粒度就落在这里。
  const refreshes = item.refreshes === undefined ? [] : (Array.isArray(item.refreshes) ? item.refreshes : fail(`${label}.refreshes 必须是数组`)).map((entry, index) => {
    const record = object(entry, `${label}.refreshes[${index}]`);
    exactKeys(record, ["refreshedBy", "refreshedAt", "artifacts", "unchanged"], ["refreshedBy", "refreshedAt", "artifacts"], `${label}.refreshes[${index}]`);
    const names = stringArray(record.artifacts, `${label}.refreshes[${index}].artifacts`);
    if (!names.length) fail(`${label}.refreshes[${index}].artifacts 不得为空——没说清刷新了哪几份，就等于没有问责`);
    for (const name of names) if (!(name in known)) fail(`${label}.refreshes[${index}] 含未知工件: ${name}`);
    return { refreshedBy: text(record.refreshedBy, `${label}.refreshes[${index}].refreshedBy`), refreshedAt: text(record.refreshedAt, `${label}.refreshes[${index}].refreshedAt`), artifacts: names, unchanged: record.unchanged === undefined ? [] : stringArray(record.unchanged, `${label}.refreshes[${index}].unchanged`) };
  });
  return { decision, approvedBy: text(item.approvedBy, `${label}.approvedBy`), approvedAt: text(item.approvedAt, `${label}.approvedAt`), migrationSource: item.migrationSource === null ? null : text(item.migrationSource, `${label}.migrationSource`), artifacts, refreshes };
}
function parseApprovals(path: string, root: string): ApprovalState {
  const value = object(readJson(path), "artifact-approvals");
  const version = integer(value.schemaVersion, "artifact-approvals.schemaVersion");
  if (version === 2) {
    exactKeys(value, ["schemaVersion", "gates"], ["schemaVersion", "gates"], "artifact-approvals");
    const input = object(value.gates, "artifact-approvals.gates");
    const gates: Record<string, GateApproval> = {};
    for (const [gate, record] of Object.entries(input)) gates[gate] = parseGateApproval(record, `artifact-approvals.gates.${gate}`, root);
    return { schemaVersion: 2, gates };
  }
  if (version !== 1) fail("artifact-approvals.schemaVersion 仅支持 1 或 2");
  exactKeys(value, ["schemaVersion", "artifacts"], ["schemaVersion", "artifacts"], "artifact-approvals");
  const input = object(value.artifacts, "artifact-approvals.artifacts"); const artifacts: Record<string, Approval> = {};
  for (const [artifact, approval] of Object.entries(input)) {
    if (!(artifact in artifactPathsFor(root))) fail(`未知批准artifact: ${artifact}`);
    artifacts[artifact] = parseApproval(approval, `artifact-approvals.artifacts.${artifact}`);
  }
  return { schemaVersion: 1, artifacts };
}
/**
 * 单份工件的有效状态。两种口径共用同一个取值域，好让下游门禁与报错文案不必分版本写。
 * 第 2 版下，某份工件的状态取自「覆盖它的那条门批准」——覆盖不到就是 pending，
 * 哈希对不上就是 stale，于是失效时仍然点得出是哪一份变了。
 */
function approvalStatus(root: string, state: ApprovalState, artifact: string): "pending" | "approved" | "rejected" | "stale" {
  let expected: string | null = null;
  let decision: "approved" | "rejected" | null = null;
  if (state.schemaVersion === 2) {
    for (const gate of Object.values(state.gates)) {
      const digest = gate.artifacts[artifact];
      if (digest === undefined) continue;
      expected = digest;
      decision = gate.decision;
    }
  } else {
    const record = state.artifacts[artifact];
    if (record) { expected = record.digest; decision = record.decision; }
  }
  if (expected === null || decision === null) return "pending";
  let current: string | null = null; try { current = artifactDigest(root, artifact); } catch { current = null; }
  if (current !== expected) return "stale";
  return decision;
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
    // 词法越界判断挡不住软链：Change 目录内一条指向仓外的软链，路径串本身完全合法。
    // 与 delivery-lifecycle.ts 的 safeRepoFile 同标准，做 realpath 逃逸校验。
    const real = realpathSync(target);
    const realRel = relative(realpathSync(root), real);
    if (!realRel || realRel.startsWith("..") || isAbsolute(realRel)) fail(`${label} evidence 软链逃逸 Change 目录: ${item}`);
    if (!statSync(target).isFile() || statSync(target).size === 0) fail(`${label} evidence 必须是非空文件: ${item}`);
  }
}
/**
 * 任务解析。
 *
 * `replayable` 是本轮新增的字段，回答一个此前没人问过的问题：**这次验证还能不能再跑一遍？**
 * 维护者原话是「测试日志和验收证据，在 vibe coding 中意义不大……我会觉得单测其实根本不
 * 需要记录」。判据由此从「证据重不重要」换成「能不能重跑」：
 *
 *   - **可重跑**（本仓的自动化测试全属此类）→ **不许留证据路径**。要复核就当场再跑一遍；
 *     存下来的日志无法证明它对应的是当前这版代码，留着只是让人以为有据可查。
 *   - **不可重跑**（构造一次请求走一遍场景，做完就没了）→ **必须留证据**，那是唯一一次机会。
 *
 * 「记录验证过程」这个能力因此保留在通用底盘上，只是在本仓恒为关闭——这一条是未来接入
 * 公司仓时最关键的一处差异，那边的验证恰好落在「不可重跑」那一侧。
 *
 * 缺省视为可重跑，好让存量任务状态不必改写；但**新写入必须显式声明**（见 requireExplicitReplayable），
 * 免得默认值替人把「这次验证到底能不能重跑」这个判断悄悄做掉。
 */
function parseTask(value: unknown, index: number): Task {
  const item = object(value, `tasks[${index}]`);
  exactKeys(item, ["id", "state", "deliverables", "verification", "evidence", "blocker", "replayable"], ["id", "state", "deliverables", "verification", "evidence", "blocker"], `tasks[${index}]`);
  const state = text(item.state, `tasks[${index}].state`);
  if (!( ["planned", "implemented_unverified", "blocked_external", "verified"] as string[]).includes(state)) fail(`tasks[${index}].state 非法`);
  const deliverables = stringArray(item.deliverables, `tasks[${index}].deliverables`); const verification = stringArray(item.verification, `tasks[${index}].verification`); const evidence = stringArray(item.evidence, `tasks[${index}].evidence`);
  if (!deliverables.length || !verification.length) fail(`tasks[${index}] 缺少交付物或验证方式`);
  if (item.replayable !== undefined && typeof item.replayable !== "boolean") fail(`tasks[${index}].replayable 必须是布尔值`);
  // 缺省值按实际形态推断，而不是一律当成可重跑：归档目录里的存量任务带着自然语言证据，
  // 一律按可重跑解释会让它们集体解析失败——只读兼容是硬要求，存量不迁移。
  // 推断只服务于读；新写入必须显式声明（见 requireExplicitReplayable）。
  const replayable = item.replayable === undefined ? evidence.length === 0 : (item.replayable as boolean);
  const blocker = item.blocker === null ? null : text(item.blocker, `tasks[${index}].blocker`);
  if (replayable && evidence.length > 0) fail(`tasks[${index}] 声明这次验证可以重跑，就不得保存证据路径——要复核就当场重跑，存下来的日志证明不了它对应当前这版代码`);
  if (!replayable && state === "verified" && evidence.length === 0) fail(`tasks[${index}] 声明这次验证不可重跑，verified 时必须保存证据——做完就没了，不记就永远丢了`);
  if (state !== "verified" && evidence.length > 0) fail(`tasks[${index}] 非verified不得保存 evidence`);
  if (state === "blocked_external" && blocker === null) fail(`tasks[${index}] blocked_external 缺少 blocker`);
  if (state !== "blocked_external" && blocker !== null) fail(`tasks[${index}] 非blocked_external不得保存 blocker`);
  return { id: text(item.id, `tasks[${index}].id`), state: state as TaskStateName, deliverables, verification, evidence, blocker, replayable };
}
/**
 * 新写入必须显式声明 replayable。缺省值只服务于存量任务状态的只读兼容；
 * 让新写入也吃缺省，等于把一个需要人判断的问题交给默认值回答。
 */
function requireExplicitReplayable(path: string): void {
  const value = object(readJson(path), "task-state");
  if (!Array.isArray(value.tasks)) return;
  const missing = (value.tasks as unknown[]).map((item, index) => (item && typeof item === "object" && "replayable" in (item as Record<string, unknown>) ? null : index)).filter((index) => index !== null);
  if (missing.length) fail(`task-state 写入必须为每个任务显式声明 replayable（这次验证能不能再跑一遍）：缺失于 tasks[${missing.join("], tasks[")}]`);
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
  // 新建 Change 一律显式标记为当前 schema 版本，使版本判别不再依赖目录形状推断。
  const info = { schemaVersion: 1, displayName: requiredOption(options, "display-name"), deliverySchemaVersion: currentDeliverySchemaVersion };
  withFileLock(lockPath(root), () => { atomicWriteJson(infoPath(root), info); atomicWriteJson(approvalsPath(root), { schemaVersion: 2, gates: {} }); });
  parseInfo(infoPath(root)); console.log(JSON.stringify({ slug, displayName: info.displayName, mode }, null, 2));
}
function inspect(root: string): void {
  const info = parseInfo(infoPath(root)); const approvals = parseApprovals(approvalsPath(root), root); const effective: Record<string, string> = {};
  for (const artifact of Object.keys(artifactPathsFor(root))) effective[artifact] = approvalStatus(root, approvals, artifact);
  const tasks = existsSync(tasksPath(root)) ? parseTasks(tasksPath(root)) : null; if (tasks && existsSync(taskMarkdownPath(root))) verifyTaskProjection(root, tasks);
  console.log(JSON.stringify({ slug: slugFor(root), displayName: info.displayName, mode, approvals, effective, tasks }, null, 2));
}
/**
 * 需要人工批准的门，由站位定义推导，不另立第二份清单（INT-20260901-020）。
 *
 * 此前批准模型与站位模型各说各话：批准模型要八份工件都持人工批准才放行实施，站位模型却写着
 * 实施站是机器站；测试方案在交付站位里根本没有对应的站，却同样被索取人工表态。两份清单各说
 * 各话时，agent 按哪一份都能给自己找到依据，门禁就失去了确定性。
 *
 * 现在唯一真源是 profile 里 `humanJudgment` 为真的那些站，每站再用 `approvalRecord` 声明它的
 * 表态记在哪个文件里。落在 artifact-approvals 的那些站就是本文件要求的门；验收门的表态落在
 * acceptance-state.json，不在这里重复索取。
 */
function approvalGatesFor(options: Map<string, string>): string[] {
  const path = join(runtimeRootFor(options), "openspec/profiles/delivery-change-v1.json");
  if (!existsSync(path)) fail("交付站位定义不存在，无法推导需要人工批准的门");
  const profile = object(readJson(path), "delivery-change profile");
  if (!Array.isArray(profile.stages)) fail("交付站位定义非法：stages 不是数组");
  const gates: string[] = [];
  for (const [index, value] of (profile.stages as unknown[]).entries()) {
    const stage = object(value, `stages[${index}]`);
    if (stage.humanJudgment !== true) {
      if (stage.approvalRecord !== undefined) fail(`stages[${index}] 不是人工判断站，却声明了表态落点`);
      continue;
    }
    const record = text(stage.approvalRecord, `stages[${index}].approvalRecord`);
    if (record === "artifact-approvals") gates.push(text(stage.id, `stages[${index}].id`));
    else if (record !== "acceptance-state") fail(`stages[${index}].approvalRecord 取值非法: ${record}`);
  }
  if (!gates.length) fail("交付站位定义里没有任何一个门把表态记进 artifact-approvals");
  return gates;
}
/**
 * 批准写入。三条路径，靠参数区分，谁也不能悄悄变成谁。
 *
 * 一、**首签**（这一门还没有任何记录）：`--gate <站位id> --decision approved --approved-by <表态形态>`。
 *     一次覆盖当时的全部工件，逐份记内容哈希。
 *
 * 二、**机械回填后的刷新**（这一门已有批准）：必须显式声明**这次刷新了哪几份文件**
 *     （`--refreshed-artifact a,b`）。机器把「实际发生变化的那批工件」与「声明的那批」对照，
 *     **声明之外还有文件变了就拒绝**。理由是独立评审实测出来的一条链路：门级批准原先是整体覆写，
 *     于是「回填任务状态」这种每次 `task render` 都会发生的机械改动，可以顺带把一处被篡改的方案决策
 *     一起重新祝福——八份工件全回到 approved，门禁放行，篡改毫无提示。逐份问责堵的就是这条通道：
 *     搭车的那一份会被点名。刷新只改被声明的那几份的哈希，**首次表态的人与时间原样保留**，
 *     刷新记录追加到 refreshes 里，不覆写历史。
 *
 * 三、**重新取得人工表态**（内容有语义改动，必须重新过人）：`--new-attestation`。它会覆写表态人与
 *     时间、重算全部哈希、清空刷新记录——因为这是一次全新的表态，不是回填。它的值是「为什么需要
 *     重新过人」的一句说明，会记进批准记录：读批准链的人不仅看得出表态时间变了，还看得出为什么变。
 */
function parseRefreshedArtifacts(options: Map<string, string>, known: string[]): string[] {
  const raw = requiredOption(options, "refreshed-artifact");
  const declared = raw.split(",").map((item) => item.trim()).filter(Boolean);
  if (!declared.length) fail("--refreshed-artifact 不得为空");
  const unknown = declared.filter((item) => !known.includes(item));
  if (unknown.length) fail(`--refreshed-artifact 含未知工件: ${unknown.join("、")}`);
  const duplicated = declared.filter((item, index) => declared.indexOf(item) !== index);
  if (duplicated.length) fail(`--refreshed-artifact 有重复项: ${[...new Set(duplicated)].join("、")}`);
  return declared;
}
function currentDigests(root: string, required: string[]): Record<string, string> {
  const artifacts: Record<string, string> = {};
  const missing: string[] = [];
  for (const artifact of required) {
    try { artifacts[artifact] = artifactDigest(root, artifact); } catch { missing.push(artifact); }
  }
  if (missing.length) fail(`这一门的批准必须覆盖当时的全部工件，下列工件还不存在或读不出内容：\n  ${missing.join("\n  ")}`);
  return artifacts;
}
function approvalSet(root: string, options: Map<string, string>): void {
  withFileLock(lockPath(root), () => {
    const state = parseApprovals(approvalsPath(root), root);
    if (state.schemaVersion === 2) {
      const gates = approvalGatesFor(options);
      const gate = options.get("gate") ?? (gates.length === 1 ? gates[0] : fail(`存在多个需要人工批准的门，必须用 --gate 指定其一: ${gates.join("、")}`));
      if (!gates.includes(gate)) fail(`未知的人工批准门 ${gate}；站位定义里落在批准记录上的门只有: ${gates.join("、")}`);
      if (options.has("artifact")) fail("--artifact 不再被接受：批准按人真实表态的次数记，一次表态一条记录，覆盖当时的全部工件");
      const required = Object.keys(artifactPathsFor(root));
      const existing = state.gates[gate];
      // 这个标志带值，值是「为什么要重新过人」的说明——一次新的人工表态总该说得出理由。
      const newAttestation = options.get("new-attestation") ?? null;
      if (existing && newAttestation === null) {
        // 路径二：机械回填后的刷新。逐份问责，声明之外的变化一律拒绝。
        if (options.has("decision") && options.get("decision") !== existing.decision) fail("刷新不得改变这一门的结论；结论要变就是一次新的人工表态，请用 --new-attestation");
        const declared = parseRefreshedArtifacts(options, required);
        const current = currentDigests(root, required);
        const changed = required.filter((artifact) => current[artifact] !== existing.artifacts[artifact]);
        const undeclared = changed.filter((artifact) => !declared.includes(artifact));
        if (undeclared.length) {
          fail(`刷新被拒绝：声明只刷新了 ${declared.join("、")}，但下列工件的内容也变了——\n  ${undeclared.join("\n  ")}\n机械回填不得顺带重新祝福别的工件。若这些改动确有语义，必须重新取得维护者表态（--new-attestation）；若只是漏声明，把它们加进 --refreshed-artifact 再来一次。`);
        }
        const unchanged = declared.filter((artifact) => !changed.includes(artifact));
        const artifacts = { ...existing.artifacts };
        for (const artifact of declared) artifacts[artifact] = current[artifact];
        const refreshes = [...existing.refreshes, {
          refreshedBy: requiredOption(options, "approved-by"),
          refreshedAt: now(),
          artifacts: declared,
          // 声明了却没变的也如实记下来：它不是错误，但读记录的人有权知道这次刷新实际动了什么。
          unchanged,
        }];
        state.gates[gate] = { ...existing, artifacts, refreshes };
        atomicWriteJson(approvalsPath(root), state);
        console.log(JSON.stringify({ gate, refreshed: declared, unchanged, attestationPreserved: { approvedBy: existing.approvedBy, approvedAt: existing.approvedAt } }, null, 2));
        return;
      }
      const decision = requiredOption(options, "decision");
      if (decision !== "approved" && decision !== "rejected") fail("批准参数非法");
      if (!existing && newAttestation !== null) fail("--new-attestation 只用于这一门已有批准、且内容有语义改动需要重新过人的情形；首签不必声明它");
      const attestationNote = newAttestation === null ? (options.get("migration-source") ?? null) : `重新取得表态：${newAttestation}`;
      state.gates[gate] = { decision, approvedBy: requiredOption(options, "approved-by"), approvedAt: now(), migrationSource: attestationNote, artifacts: currentDigests(root, required), refreshes: [] };
      atomicWriteJson(approvalsPath(root), state);
      console.log(JSON.stringify(state, null, 2));
      return;
    }
    const decision = requiredOption(options, "decision");
    if (decision !== "approved" && decision !== "rejected") fail("批准参数非法");
    const artifact = requiredOption(options, "artifact");
    if (!(artifact in artifactPathsFor(root))) fail("批准参数非法");
    state.artifacts[artifact] = { digest: artifactDigest(root, artifact), decision, approvedBy: requiredOption(options, "approved-by"), approvedAt: now(), migrationSource: options.get("migration-source") ?? null };
    atomicWriteJson(approvalsPath(root), state);
    console.log(JSON.stringify(state, null, 2));
  });
}
function approvalsInspect(root: string, options: Map<string, string>): void {
  const state = parseApprovals(approvalsPath(root), root);
  const effective: Record<string, string> = {};
  for (const artifact of Object.keys(artifactPathsFor(root))) effective[artifact] = approvalStatus(root, state, artifact);
  console.log(JSON.stringify({ ...state, effective }, null, 2));
}
function taskWrite(root: string, options: Map<string, string>): void { const file = requiredOption(options, "file"); requireExplicitReplayable(file); const imported = parseTasks(file); parseInfo(infoPath(root)); for (const task of imported.tasks) validateEvidence(root, task.evidence, `tasks[${task.id}]`); withFileLock(lockPath(root), () => atomicWriteJson(tasksPath(root), imported)); console.log(JSON.stringify(imported, null, 2)); }
function taskSet(root: string, options: Map<string, string>): void {
  withFileLock(lockPath(root), () => { const state = parseTasks(tasksPath(root)); const task = state.tasks.find((item) => item.id === requiredOption(options, "id")); if (!task) fail("未知 task id"); const next = requiredOption(options, "state"); if (!( ["planned", "implemented_unverified", "blocked_external", "verified"] as string[]).includes(next)) fail("任务状态非法"); task.state = next as TaskStateName; task.evidence = options.has("evidence") ? [requiredOption(options, "evidence")] : []; task.blocker = options.has("blocker") ? requiredOption(options, "blocker") : null; parseTask(task, 0); validateEvidence(root, task.evidence, `tasks[${task.id}]`); atomicWriteJson(tasksPath(root), state); console.log(JSON.stringify(state, null, 2)); });
}
/**
 * 任务清单渲染。
 *
 * 第 7 版起「实施切片、迁移与回滚」并进了这份文件，而那一节是人写的、不参与渲染。
 * 所以渲染不再整份覆盖：以 `## 任务清单` 这一行为界，界线以上原样保留，界线以下重新生成。
 * 文件里没有这条界线时（存量 Change 都没有）行为与从前逐字节一致——整份覆盖。
 *
 * 状态真源仍然只有 task-state.json 一处；这里保留的是人写的说明，不是状态。
 */
const taskListHeading = "## 任务清单";
function renderTasks(root: string): void {
  const state = parseTasks(tasksPath(root));
  let list = "";
  for (const task of state.tasks) {
    list += `\n- [${task.state === "verified" ? "x" : " "}] ${task.id} [${task.state}]\n`;
    list += `  - 交付物：${task.deliverables.join("；")}\n`;
    list += `  - 验证：${task.verification.join("；")}`;
  }
  const existing = existsSync(taskMarkdownPath(root)) ? readFileSync(taskMarkdownPath(root), "utf8") : "";
  const boundary = existing.indexOf(taskListHeading);
  const content = boundary >= 0
    ? `${existing.slice(0, boundary)}${taskListHeading}\n${list.replace(/\n+$/, "")}\n`
    : `# 实现任务拆分\n\n> 状态真源：\`task-state.json\`。本文件由 \`delivery-control.ts task render\` 生成，只用于人工审阅；禁止反向解析复选框。\n${list.replace(/\n+$/, "")}\n`;
  writeFileSync(taskMarkdownPath(root), content, "utf8");
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
/**
 * 路径一律走 `-z` + NUL 分隔解析，与 delivery-lifecycle.ts 的 implementationPaths 同范式。
 * 不能用 `--name-only` 的按行输出：git 出厂默认 `core.quotepath=true`，非 ASCII 路径会被
 * 返回成带引号的 C 转义串（`"...\345\256\236..."`），本仓的工件目录全是中文名，
 * 于是「排除 Change 目录自身」的前缀过滤会对它们整类失效。
 */
function gitPaths(repo: string, args: string[]): string[] | null {
  const output = git(repo, args);
  if (output === null) return null;
  return output.split("\0").filter(Boolean).map((path) => path.split("\\").join("/"));
}
function touchedPaths(repo: string, root: string): string[] | null {
  const changeRel = relative(repo, realpathSync(root)).split(sep).join("/");
  const firstTouch = git(repo, ["log", "--format=%H", "--reverse", "--", changeRel]);
  const collected = new Set<string>();
  const add = (paths: string[] | null) => { for (const path of paths ?? []) collected.add(path); };
  const firstCommit = firstTouch?.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)[0];
  if (firstCommit) {
    const parent = git(repo, ["rev-parse", "--verify", `${firstCommit}^`]);
    const from = parent ? parent.trim() : firstCommit;
    add(gitPaths(repo, ["diff", "--name-only", "-z", from, "HEAD"]));
  } else if (!firstTouch) {
    return null; // git 不可用或不是仓库：没有事实可核对
  }
  add(gitPaths(repo, ["diff", "--name-only", "-z", "HEAD"]));
  add(gitPaths(repo, ["ls-files", "--others", "--exclude-standard", "-z"]));
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
  // 说人话关的关口设在归档之前：本仓的「发出」就是开 PR，而 PR 在归档之后才创建。
  // 放在验收门之前会拦住验收记录自己（它要先写出来才能被审读），放在归档之后就来不及了。
  else if (operation === "release") { guard(root, "acceptance", options); requireAcceptance(root); verifyPlainLanguage(root, runtimeRootFor(options)); }
  else if (operation === "verify") { requireApproved(root, approvals, requiredBeforeAcceptance); validateDecisionArtifacts(root); const state = parseTasks(tasksPath(root)); verifyTaskProjection(root, state); verifyDeclaredScope(root, options); }
  else if (operation === "sync") { requireAcceptance(root); }
  else if (operation === "archive") { guard(root, "release", options); requireReadiness(root); }
  else fail(`未知 guard operation: ${operation}`);
  console.log(JSON.stringify({ allowed: true, operation, mode }, null, 2));
}
function adapterInspect(options: Map<string, string>): void { const registry = object(readJson(requiredOption(options, "registry")), "source-adapters"); exactKeys(registry, ["schemaVersion", "adapters"], ["schemaVersion", "adapters"], "source-adapters"); if (registry.schemaVersion !== 1 || !Array.isArray(registry.adapters)) fail("source-adapters合同非法"); const ids = new Set<string>(); for (const [index, value] of registry.adapters.entries()) { const adapter = object(value, `adapters[${index}]`); exactKeys(adapter, ["id", "command", "trustDomain", "kinds"], ["id", "command", "trustDomain", "kinds"], `adapters[${index}]`); const id = text(adapter.id, `adapters[${index}].id`); if (ids.has(id)) fail(`重复adapter id: ${id}`); ids.add(id); const command = text(adapter.command, `adapters[${index}].command`); if (isAbsolute(command) || command.split(/[\\/]/).includes("..")) fail(`adapter command越界: ${command}`); const domain = text(adapter.trustDomain, `adapters[${index}].trustDomain`); if (domain !== "work" && domain !== "private") fail("adapter trustDomain非法"); stringArray(adapter.kinds, `adapters[${index}].kinds`); } console.log(JSON.stringify(registry, null, 2)); }
/**
 * 说人话关的命令行入口。放在这里而不是 plain-language.ts 里，是因为那份文件是库模块——
 * 入口模块不得导出需要被断言的纯判据函数，判据和入口必须分开住。
 *
 * `check` 跑完整判定（必过文件都有审读记录、没有挂着的意见、没有禁词）；
 * `scan` 只扫禁词，用于 PR 正文这类没有落盘位置、机器扫不到的文字：把草稿写成文件喂进来。
 */
function plainLanguage(root: string, options: Map<string, string>, action: string | undefined): void {
  const runtime = runtimeRootFor(options);
  if (action === undefined || action === "check") {
    const result = verifyPlainLanguage(root, runtime);
    console.log(JSON.stringify({ allowed: true, ...result }, null, 2));
    return;
  }
  if (action === "scan") {
    const policy = loadPolicy(runtime);
    const file = requiredOption(options, "file");
    const target = resolve(file);
    if (!existsSync(target)) fail(`待扫描文件不存在: ${file}`);
    const hits = scanBannedWords(dirname(target), [basename(target)], policy);
    if (hits.length) fail(`人读文字里出现了禁词：\n  ${hits.map((hit) => `${file}:${hit.line} 「${hit.word}」→ 改用「${hit.replacement}」`).join("\n  ")}`);
    console.log(JSON.stringify({ allowed: true, file, bannedWords: policy.bannedWords.map((item) => item.word) }, null, 2));
    return;
  }
  if (action === "inspect") {
    const policy = loadPolicy(runtime);
    console.log(JSON.stringify({ policyVersion: policy.policyVersion, mustPassInChange: changeMustPassFiles(root, policy), unclassifiedInChange: unclassifiedFiles(root, policy), repoMustPass: policy.repoMustPass, manualMustPass: policy.manualMustPass, exempt: policy.exempt, bannedWords: policy.bannedWords }, null, 2));
    return;
  }
  fail("plain-language 的动作必须是 check、scan 或 inspect");
}
function main(): void { const parsed = parseArgs(process.argv.slice(2)); const root = resolve(requiredOption(parsed.options, "change-root")); const [command, action] = parsed.positional; if (command === "init") init(root, parsed.options); else if (command === "plain-language") plainLanguage(root, parsed.options, action); else if (command === "inspect") inspect(root); else if (command === "approval" && action === "inspect") approvalsInspect(root, parsed.options); else if (command === "approval" && action === "set") approvalSet(root, parsed.options); else if (command === "task" && action === "inspect") { const state = parseTasks(tasksPath(root)); verifyTaskProjection(root, state); console.log(JSON.stringify(state, null, 2)); } else if (command === "task" && action === "write") taskWrite(root, parsed.options); else if (command === "task" && action === "set") taskSet(root, parsed.options); else if (command === "task" && action === "render") renderTasks(root); else if (command === "adapter" && action === "inspect") adapterInspect(parsed.options); else if (command === "runtime-check") console.log(JSON.stringify({ allowed: true, runtime: "delivery-spec-runtime", schema: "delivery-change" }, null, 2)); else if (command === "guard") guard(root, requiredOption(parsed.options, "operation"), parsed.options); else fail("未知delivery-control命令"); }
try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
